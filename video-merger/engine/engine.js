// Main-thread side of the Video Merger engine: starts the worker, downloads the engine once
// (kept in the browser's Cache Storage afterwards) and turns worker messages into promises.

export const ENGINE_VERSION = "0.12.10";
export const WASM_BYTES = 32232419; // size of ffmpeg-core.wasm, used for the download bar
const CACHE = "axiosyn-video-engine-" + ENGINE_VERSION;

const here = (p) => new URL(p, import.meta.url).href;

async function wasmBlobURL(onProgress) {
  const url = here("./ffmpeg-core.wasm");
  let cache = null;
  try {
    cache = await caches.open(CACHE);
    for (const k of await caches.keys()) {
      if (k.startsWith("axiosyn-video-engine-") && k !== CACHE) caches.delete(k);
    }
  } catch (_) { cache = null; }

  let blob = null;
  if (cache) {
    try {
      const hit = await cache.match(url);
      if (hit) blob = await hit.blob();
    } catch (_) { blob = null; }
  }
  if (blob && blob.size === WASM_BYTES) {
    onProgress && onProgress(WASM_BYTES, WASM_BYTES, true);
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error("the video engine could not be downloaded (HTTP " + res.status + ")");
    const parts = [];
    let got = 0;
    if (res.body && res.body.getReader) {
      const rd = res.body.getReader();
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        onProgress && onProgress(Math.min(got, WASM_BYTES), WASM_BYTES, false);
      }
    } else {
      parts.push(new Uint8Array(await res.arrayBuffer()));
    }
    blob = new Blob(parts, { type: "application/wasm" });
    if (cache) {
      try {
        await cache.put(url, new Response(blob, { headers: { "Content-Type": "application/wasm" } }));
      } catch (_) { /* storage full or blocked: it still works, it just downloads next time */ }
    }
  }
  return URL.createObjectURL(new Blob([blob], { type: "application/wasm" }));
}

export async function engineIsCached() {
  try {
    const cache = await caches.open(CACHE);
    return !!(await cache.match(here("./ffmpeg-core.wasm")));
  } catch (_) {
    return false;
  }
}

export class Engine {
  constructor() {
    this.worker = null;
    this.seq = 0;
    this.pending = new Map();
    this.onLog = null;
    this.ready = null;
  }

  load(onProgress) {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const wasmURL = await wasmBlobURL(onProgress);
      this.worker = new Worker(here("./worker.js"), { type: "module" });
      this.worker.onmessage = ({ data }) => {
        if (data.type === "log") { this.onLog && this.onLog(data.data); return; }
        const p = this.pending.get(data.id);
        if (!p) return;
        this.pending.delete(data.id);
        if (data.type === "ok") p.resolve(data.data);
        else p.reject(new Error(data.data));
      };
      this.worker.onerror = (e) => {
        const err = new Error(e.message || "the video engine stopped");
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
      };
      await this.call("load", { coreURL: here("./ffmpeg-core.js"), wasmURL });
      return true;
    })();
    this.ready.catch(() => { this.ready = null; });
    return this.ready;
  }

  call(op, data, transfer) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, op, data }, transfer || []);
    });
  }

  // Stops whatever is running right now (FFmpeg cannot be interrupted any other way).
  terminate() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    this.ready = null;
    const err = new Error("stopped");
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }
}
