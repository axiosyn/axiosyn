// Video Merger engine worker. Runs FFmpeg (ffmpeg.wasm core, GPL-2.0-or-later) inside the
// visitor's browser. Nothing here talks to a network except loading the engine files.
// The message loop is adapted from ffmpeg.wasm's own worker (MIT, (c) Jerome Wu), with
// three additions: clips are mounted read-only straight from the visitor's files (WORKERFS, so
// they are never copied into memory), the result is read back in chunks, and the output file
// can reserve its memory up front so it is not re-copied every time it grows.

let core = null;
let FS = null;
let reserve = null; // { name, bytes }

function patchMemfs() {
  const MEMFS = FS.filesystems.MEMFS;
  const grow = MEMFS.expandFileStorage;
  MEMFS.expandFileStorage = function (node, newCapacity) {
    const prev = node.contents ? node.contents.length : 0;
    if (reserve && node.name === reserve.name && prev < reserve.bytes && newCapacity <= reserve.bytes) {
      const old = node.contents;
      node.contents = new Uint8Array(reserve.bytes);
      if (old && node.usedBytes > 0) node.contents.set(old.subarray(0, node.usedBytes), 0);
      return;
    }
    return grow.call(this, node, newCapacity);
  };
}

const ops = {
  async load({ coreURL, wasmURL }) {
    if (core) return false;
    const mod = await import(coreURL);
    core = await mod.default({
      mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL: "" }))}`,
    });
    FS = core.FS;
    core.setLogger((d) => self.postMessage({ type: "log", data: d }));
    core.setProgress(() => {});
    patchMemfs();
    return true;
  },
  exec({ args }) {
    core.setTimeout(-1);
    core.exec(...args);
    const ret = core.ret;
    core.reset();
    return ret;
  },
  ffprobe({ args }) {
    core.setTimeout(-1);
    core.ffprobe(...args);
    const ret = core.ret;
    core.reset();
    return ret;
  },
  mount({ dir, name, blob }) {
    FS.mkdir(dir);
    FS.mount(FS.filesystems.WORKERFS, { blobs: [{ name, data: blob }] }, dir);
    return true;
  },
  unmount({ dir }) {
    try { FS.unmount(dir); } catch (_) {}
    try { FS.rmdir(dir); } catch (_) {}
    return true;
  },
  mkdir({ dir }) {
    try { FS.mkdir(dir); } catch (_) {}
    return true;
  },
  writeText({ path, text }) {
    FS.writeFile(path, text);
    return true;
  },
  readText({ path }) {
    return FS.readFile(path, { encoding: "utf8" });
  },
  size({ path }) {
    try { return FS.stat(path).size; } catch (_) { return -1; }
  },
  readChunk({ path, offset, length }) {
    const st = FS.open(path, "r");
    try {
      const buf = new Uint8Array(length);
      const n = FS.read(st, buf, 0, length, offset);
      return n === length ? buf : buf.slice(0, n);
    } finally {
      FS.close(st);
    }
  },
  unlink({ path }) {
    try { FS.unlink(path); } catch (_) {}
    return true;
  },
  reserve({ name, bytes }) {
    reserve = name ? { name, bytes } : null;
    return true;
  },
};

self.onmessage = async ({ data: { id, op, data } }) => {
  try {
    if (op !== "load" && !core) throw new Error("engine not loaded");
    const fn = ops[op];
    if (!fn) throw new Error("unknown operation " + op);
    const out = await fn(data || {});
    const trans = out instanceof Uint8Array ? [out.buffer] : [];
    self.postMessage({ id, type: "ok", data: out }, trans);
  } catch (e) {
    self.postMessage({ id, type: "error", data: String((e && e.message) || e) });
  }
};
