// Video Merger: joins clips end to end inside the visitor's browser with FFmpeg (WebAssembly).
// Same rules as the desktop version: stream copy when every clip matches (bit-exact, seconds),
// otherwise one re-encode at the best specs present, done per clip and then joined by copy.
import { Engine, engineIsCached, WASM_BYTES } from "./engine/engine.js";

const MAX_BYTES = 2 * 1024 ** 3; // 2 GB for all clips in one merge together
const MAX_CLIPS = 50;
const CHUNK = 32 * 1024 ** 2;

const KEEP_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi", ".ts",
  ".flv", ".wmv", ".mpg", ".mpeg", ".m2ts"]);
const MP4_V = new Set(["h264", "hevc", "av1", "mpeg4", "mjpeg", "vp9"]);
const MP4_A = new Set(["aac", "mp3", "ac3", "eac3", "alac", "opus"]);
const MIME = { ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".mkv": "video/x-matroska",
  ".webm": "video/webm", ".avi": "video/x-msvideo", ".ts": "video/mp2t", ".m2ts": "video/mp2t",
  ".flv": "video/x-flv", ".wmv": "video/x-ms-wmv", ".mpg": "video/mpeg", ".mpeg": "video/mpeg" };

const $ = (s) => document.querySelector(s);
const S = { clips: [], busy: false, result: null };
const cards = new Map();
let engine = null;
let engineState = "idle"; // idle | loading | ready | error
let seq = 0, dragUid = null, logTail = [], onProgressLine = null;

/* ------------------------------------------------------------------ helpers -- */
function fmtSize(b) {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB"]; let i = 0; b = +b;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(b < 10 && i > 0 ? 2 : b < 100 && i > 0 ? 1 : 0) + " " + u[i];
}
function fmtTime(s) {
  s = Math.max(0, Math.round(+s || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0");
}
function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function ratio(t, d = 0) {
  if (t == null || t === "") return d;
  t = String(t);
  if (t.includes("/")) { const [a, b] = t.split("/").map(Number); return b ? a / b : d; }
  const v = Number(t); return isFinite(v) ? v : d;
}
const extOf = (name) => { const m = /\.[A-Za-z0-9]{1,6}$/.exec(name || ""); return m ? m[0].toLowerCase() : ""; };
const ready = () => S.clips.filter((c) => c.state === "ready");
const totalBytes = () => S.clips.filter((c) => c.state !== "error").reduce((t, c) => t + c.size, 0);

/* ------------------------------------------------------------------- engine -- */
function setEngineUI(text, frac, cls) {
  const box = $("#engine");
  box.className = "engine " + (cls || "");
  $("#engine-text").innerHTML = text;
  $("#engine-bar").style.width = frac == null ? "0" : Math.round(frac * 100) + "%";
  $("#engine-bar").parentElement.classList.toggle("hide", frac == null);
}

async function showEngineIdle() {
  if (engineState !== "idle") return;
  setEngineUI(await engineIsCached()
    ? "<b>Video engine</b> saved in this browser. It starts when you add a clip."
    : "<b>Video engine</b> not downloaded yet. It downloads (about " + Math.round(WASM_BYTES / 1e6) +
      " MB) when you add your first clip.", null, "");
}

function ensureEngine() {
  if (engine && engineState === "ready") return Promise.resolve(engine);
  if (engine && engineState === "loading") return engine.ready;
  engine = new Engine();
  engine.onLog = (d) => {
    const line = d.message || "";
    if (d.type === "stdout") { if (onProgressLine) onProgressLine(line); return; }
    if (!line || /^Aborted\(\)/.test(line)) return;
    logTail.push(line);
    if (logTail.length > 40) logTail.shift();
  };
  engineState = "loading";
  setEngineUI("<b>Video engine</b> getting ready…", 0, "busy");
  const p = engine.load((got, total, cached) => {
    if (cached) setEngineUI("<b>Video engine</b> starting from this browser's storage…", 1, "busy");
    else setEngineUI("<b>Video engine</b> downloading, " + fmtSize(got) + " of " + fmtSize(total) +
      ". This happens once; your browser keeps it for next time.", got / total, "busy");
  }).then(async () => {
    await engine.call("mkdir", { dir: "/w" });
    engineState = "ready";
    setEngineUI("<b>Video engine</b> ready. It runs on this device; nothing is uploaded.", null, "ok");
    return engine;
  }).catch((e) => {
    engineState = "error";
    engine = null;
    setEngineUI("<b>Video engine</b> could not start: " + esc(e.message) +
      ". Check your connection and reload the page.", null, "bad");
    throw e;
  });
  return p;
}

async function mountClip(clip) {
  if (clip.mounted) return;
  await engine.call("mount", { dir: clip.dir, name: "v" + (extOf(clip.name) || ".mp4"), blob: clip.file });
  clip.mounted = true;
}
const clipPath = (c) => c.dir + "/v" + (extOf(c.name) || ".mp4");

/* -------------------------------------------------------------------- probe -- */
let probeChain = Promise.resolve();
function queueProbe(clip) {
  probeChain = probeChain.then(() => probe(clip)).catch(() => {});
}

async function probe(clip) {
  if (!S.clips.includes(clip)) return;
  clip.state = "reading"; refreshCard(clip);
  try {
    await ensureEngine();
    await mountClip(clip);
    await engine.call("unlink", { path: "/w/probe.json" });
    logTail = [];
    await engine.call("ffprobe", { args: ["-v", "error", "-show_format", "-show_streams", "-of", "json",
      "-o", "/w/probe.json", clipPath(clip)] });
    let data = null;
    try { data = JSON.parse(await engine.call("readText", { path: "/w/probe.json" })); } catch (_) { data = null; }
    if (!data || !data.streams) {
      const why = logTail.map((l) => l.replace(/^\[[^\]]+\]\s*/, "").replace(clipPath(clip), "")).find((l) => l.trim());
      throw new Error("this file could not be read as a video" + (why ? " (" + why.slice(0, 140) + ")" : ""));
    }
    clip.info = infoFrom(data);
    clip.state = "ready";
  } catch (e) {
    clip.state = "error";
    clip.error = e.message || String(e);
  }
  cards.delete(clip.uid);
  render();
}

function infoFrom(data) {
  const streams = data.streams || [], fmt = data.format || {};
  const v = streams.find((s) => s.codec_type === "video" && !(s.disposition && s.disposition.attached_pic));
  const a = streams.find((s) => s.codec_type === "audio");
  if (!v) throw new Error("there is no video in this file");
  const fps = ratio(v.avg_frame_rate) || ratio(v.r_frame_rate) || 30;
  let rot = 0;
  for (const sd of v.side_data_list || []) if ("rotation" in sd) rot = parseInt(sd.rotation, 10) || 0;
  if (!rot && v.tags && v.tags.rotate) rot = parseInt(v.tags.rotate, 10) || 0;
  const i = {
    duration: ratio(fmt.duration) || ratio(v.duration) || 0,
    container: (fmt.format_name || "").split(",")[0],
    vcodec: v.codec_name || "", profile: v.profile || "",
    width: +v.width || 0, height: +v.height || 0, pix_fmt: v.pix_fmt || "",
    fps: Math.round(fps * 10000) / 10000, sar: v.sample_aspect_ratio || "1:1", rotation: rot,
    has_audio: !!a, acodec: (a && a.codec_name) || "",
    sample_rate: +(a && a.sample_rate) || 0, channels: +(a && a.channels) || 0,
  };
  const swap = Math.abs(rot) === 90 || Math.abs(rot) === 270;
  i.display_w = swap ? i.height : i.width;
  i.display_h = swap ? i.width : i.height;
  return i;
}

/* ------------------------------------------------------------- merge rules -- */
function spread(infos, label, f) {
  const vals = infos.map(f);
  if (new Set(vals).size <= 1) return null;
  const seen = [];
  vals.forEach((v, n) => { if (!seen.some((s) => s[1] === v)) seen.push([n + 1, v]); });
  return label + ": " + seen.slice(0, 4).map((s) => "clip " + s[0] + " " + s[1]).join(", ") + (seen.length > 4 ? ", …" : "");
}
function mismatches(infos) {
  const bad = [];
  [["video codec", (i) => i.vcodec || "?"], ["resolution", (i) => i.width + "×" + i.height],
   ["pixel format", (i) => i.pix_fmt || "?"], ["frame rate", (i) => i.fps.toFixed(2) + " fps"],
   ["pixel aspect ratio", (i) => i.sar || "?"], ["rotation", (i) => i.rotation + "°"]]
    .forEach(([l, f]) => { const r = spread(infos, l, f); if (r) bad.push(r); });
  if (new Set(infos.map((i) => i.has_audio)).size > 1) {
    bad.push("sound: clip " + infos.map((i, n) => (i.has_audio ? null : n + 1)).filter(Boolean).join(", ") + " has none");
  } else if (infos[0].has_audio) {
    [["audio codec", (i) => i.acodec || "?"], ["sample rate", (i) => i.sample_rate + " Hz"],
     ["channel count", (i) => String(i.channels)]]
      .forEach(([l, f]) => { const r = spread(infos, l, f); if (r) bad.push(r); });
  }
  return bad;
}
function copyExt(clips) {
  const exts = new Set(clips.map((c) => extOf(c.name)));
  const first = clips[0].info;
  if (exts.size === 1) { const e = [...exts][0]; if (KEEP_EXT.has(e)) return e; }
  if (MP4_V.has(first.vcodec) && (!first.has_audio || MP4_A.has(first.acodec))) return ".mp4";
  return ".mkv";
}
function target(infos) {
  const big = infos.reduce((a, b) => (a.display_w * a.display_h >= b.display_w * b.display_h ? a : b));
  const w = Math.max(2, big.display_w - (big.display_w % 2));
  const h = Math.max(2, big.display_h - (big.display_h % 2));
  const fps = Math.min(Math.max(...infos.map((i) => i.fps)) || 30, 120);
  let sr = Math.max(...infos.map((i) => i.sample_rate)) || 48000;
  if (![44100, 48000, 96000].includes(sr)) sr = 48000;
  const ch = Math.max(...infos.map((i) => i.channels)) || 2;
  const layout = ch <= 1 ? "mono" : ch <= 2 ? "stereo" : ch <= 6 ? "5.1" : "7.1";
  return { w, h, fps, sr, layout, sound: infos.some((i) => i.has_audio) };
}
function makePlan() {
  const ok = ready();
  const infos = ok.map((c) => c.info);
  const reasons = mismatches(infos);
  const forced = $("#force").checked && !reasons.length;
  const encode = reasons.length > 0 || forced;
  const ext = encode ? ".mp4" : copyExt(ok);
  const av1 = encode && infos.some((i) => i.vcodec === "av1");
  const stem = (ok[0].name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 40)) || "video";
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  const name = stem + "_merged_" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + ext;
  return { ok, infos, reasons, forced, encode, ext, av1, name, t: encode ? target(infos) : null,
    total: infos.reduce((t, i) => t + i.duration, 0) };
}

/* ----------------------------------------------------------------- adding -- */
const picker = $("#picker");
function openPicker() { if (S.busy) return; picker.value = ""; picker.click(); }
$("#addbtn").onclick = openPicker;
picker.addEventListener("change", () => addFiles(picker.files));

function addFiles(files) {
  if (S.busy) return;
  const list = Array.from(files || []).filter((f) => f && f.size);
  if (!list.length) return;
  const room = MAX_CLIPS - S.clips.length;
  if (room <= 0) { alert("That is the limit of " + MAX_CLIPS + " clips in one merge."); return; }
  if (list.length > room) { alert("Only " + room + " more clip(s) fit in this merge; the rest were skipped."); list.length = room; }
  clearResult();
  for (const f of list) {
    const uid = "c" + (++seq);
    const clip = { uid, dir: "/" + uid, name: f.name, file: f, size: f.size, state: "waiting",
      info: null, url: URL.createObjectURL(f), mounted: false };
    S.clips.push(clip);
    queueProbe(clip);
  }
  render();
}

async function removeClip(uid) {
  if (S.busy) return;
  const i = S.clips.findIndex((c) => c.uid === uid);
  if (i < 0) return;
  const c = S.clips[i];
  S.clips.splice(i, 1);
  cards.delete(uid);
  if (c.url) URL.revokeObjectURL(c.url);
  clearResult();
  render();
  if (c.mounted && engine && engineState === "ready") { try { await engine.call("unmount", { dir: c.dir }); } catch (_) {} }
}
function move(uid, delta) {
  if (S.busy) return;
  const i = S.clips.findIndex((c) => c.uid === uid), j = i + delta;
  if (i < 0 || j < 0 || j >= S.clips.length) return;
  [S.clips[i], S.clips[j]] = [S.clips[j], S.clips[i]];
  clearResult();
  render();
}
$("#clear").onclick = () => { S.clips.slice().forEach((c) => removeClip(c.uid)); };

/* ---------------------------------------------------------------- rendering -- */
function buildCard(clip) {
  const el = document.createElement("div");
  el.className = "clip";
  el.draggable = true;
  el.dataset.uid = clip.uid;
  let inner = '<div class="top"><span class="grip" title="Drag to reorder">⠿</span><span class="num"></span>' +
    '<button class="tool mv-up" title="Move earlier" aria-label="Move earlier">←</button>' +
    '<button class="tool mv-dn" title="Move later" aria-label="Move later">→</button>' +
    '<button class="tool del" title="Remove" aria-label="Remove">×</button></div>';
  if (clip.state === "ready") {
    const i = clip.info;
    const audio = i.has_audio ? esc(i.acodec) + " · " + (i.channels === 1 ? "mono" : i.channels === 2 ? "stereo" : i.channels + " ch")
      : '<span class="warn">none</span>';
    inner += '<video src="' + clip.url + '#t=0.1" controls preload="metadata" playsinline muted></video>' +
      '<div class="fname">' + esc(clip.name) + "</div>" +
      '<div class="meta"><span>Length</span><b>' + fmtTime(i.duration) + "</b>" +
      "<span>Video</span><b>" + i.display_w + "×" + i.display_h + " · " + i.fps.toFixed(2) + " fps · " + esc(i.vcodec) + "</b>" +
      "<span>Sound</span><b>" + audio + "</b><span>Size</span><b>" + fmtSize(clip.size) + "</b></div>";
  } else if (clip.state === "error") {
    inner += '<div class="fname">' + esc(clip.name) + '</div><div class="note bad" style="margin-top:auto">' + esc(clip.error) + "</div>";
  } else {
    inner += '<div class="fname">' + esc(clip.name) + '</div><div class="note reading" style="margin-top:auto">' +
      (clip.state === "reading" ? "Reading the file…" : "Waiting for the video engine…") + "</div>";
  }
  el.innerHTML = inner;
  el.querySelector(".del").onclick = () => removeClip(clip.uid);
  el.querySelector(".mv-up").onclick = () => move(clip.uid, -1);
  el.querySelector(".mv-dn").onclick = () => move(clip.uid, 1);
  el.addEventListener("dragstart", (ev) => {
    if (S.busy) { ev.preventDefault(); return; }
    dragUid = clip.uid; el.classList.add("ghost");
    ev.dataTransfer.effectAllowed = "move";
    try { ev.dataTransfer.setData("text/plain", clip.uid); } catch (_) {}
  });
  el.addEventListener("dragend", () => {
    dragUid = null; el.classList.remove("ghost");
    document.querySelectorAll(".clip.over").forEach((n) => n.classList.remove("over"));
  });
  el.addEventListener("dragover", (ev) => { if (!dragUid || dragUid === clip.uid) return; ev.preventDefault(); el.classList.add("over"); });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", (ev) => {
    el.classList.remove("over");
    if (!dragUid || dragUid === clip.uid) return;
    ev.preventDefault(); ev.stopPropagation();
    const from = S.clips.findIndex((c) => c.uid === dragUid), to = S.clips.findIndex((c) => c.uid === clip.uid);
    if (from < 0 || to < 0) return;
    const [m] = S.clips.splice(from, 1);
    S.clips.splice(to, 0, m);
    clearResult();
    render();
  });
  return el;
}
function refreshCard(clip) { cards.delete(clip.uid); render(); }

const addTile = document.createElement("button");
addTile.className = "add";
addTile.type = "button";
addTile.innerHTML = '<span class="plus">+</span><strong>Add clips</strong><span>drop video files here, or click to choose</span>';
addTile.onclick = openPicker;

function render() {
  const frag = document.createDocumentFragment();
  let n = 0;
  S.clips.forEach((clip, idx) => {
    let node = cards.get(clip.uid);
    if (!node) { node = buildCard(clip); cards.set(clip.uid, node); }
    const num = node.querySelector(".num");
    const broken = clip.state === "error";
    num.textContent = broken ? "Can't be used" : "Clip " + (++n);
    num.classList.toggle("bad", broken);
    node.querySelector(".mv-up").disabled = S.busy || idx === 0;
    node.querySelector(".mv-dn").disabled = S.busy || idx === S.clips.length - 1;
    node.querySelector(".del").disabled = S.busy;
    frag.appendChild(node);
  });
  if (!S.busy) frag.appendChild(addTile);
  $("#clips").replaceChildren(frag);

  const ok = ready();
  const pending = S.clips.some((c) => c.state === "waiting" || c.state === "reading");
  const bytes = totalBytes();
  const over = bytes > MAX_BYTES;
  $("#size-text").innerHTML = S.clips.length
    ? "<b>" + fmtSize(bytes) + "</b> of 2 GB" + (ok.length ? " · " + ok.length + " clip" + (ok.length === 1 ? "" : "s") +
      " · " + fmtTime(ok.reduce((t, c) => t + c.info.duration, 0)) + " total" : "")
    : "No clips yet";
  $("#size-bar").style.width = Math.min(100, bytes / MAX_BYTES * 100) + "%";
  $("#size").classList.toggle("over", over);
  $("#over").classList.toggle("hide", !over);
  $("#clear").disabled = !S.clips.length || S.busy;
  $("#addbtn").disabled = S.busy;
  const plan = ok.length >= 2 && !pending ? makePlan() : null;
  $("#go").disabled = !plan || over || S.busy || (plan && plan.av1) || engineState !== "ready";
  showPlan(plan, pending);
}

function showPlan(plan, pending) {
  const box = $("#plan");
  if (!plan || S.busy || S.result) { box.classList.add("hide"); return; }
  const { ok, infos, reasons, forced, t } = plan;
  let html = '<p class="order">' + ok.map((c, n) => "<b>" + (n + 1) + ".</b> " + esc(c.name)).join(" <i>→</i> ") +
    "</p><p class=\"note\">Total length <b>" + fmtTime(plan.total) + "</b>, saved as <b>" + esc(plan.ext.slice(1).toUpperCase()) + "</b>.</p>";
  if (!plan.encode) {
    html += '<p><span class="pill ok">No re-encode</span></p><p class="note">All ' + ok.length + " clips match, so their " +
      "video and sound are copied straight through. The result is bit-for-bit the same as the originals and is ready in seconds, " +
      "however long the clips are.</p>";
    const profs = infos.map((i) => i.profile).filter(Boolean);
    if (profs.length === infos.length && new Set(profs).size > 1) {
      html += '<p class="note">The clips use different ' + esc((infos[0].vcodec || "").toUpperCase()) + " profiles (" +
        esc([...new Set(profs)].join(", ")) + "). The copy is still exact; if a player stutters at a join, tick “re-encode anyway” below.</p>";
    }
  } else {
    html += '<p><span class="pill warn">' + (forced ? "Re-encode (you asked for it)" : "Re-encode needed") + "</span></p>";
    if (!forced) html += '<p class="note">The clips differ, so they have to be re-encoded to share one video track:</p><ul class="note">' +
      reasons.map((r) => "<li>" + esc(r) + "</li>").join("") + "</ul>";
    html += '<p class="note">Everything is encoded once at the best specs present: <b>' + t.w + "×" + t.h + " at " +
      t.fps.toFixed(2).replace(/\.00$/, "") + " fps</b>, H.264 at CRF 17 (visually near-lossless)" +
      (t.sound ? ", sound as AAC 256 kbit/s" : "") + ". Smaller clips are scaled up and letterboxed if their shape differs, never cropped.</p>" +
      '<p class="note slow">A browser encodes far slower than a desktop app: expect several minutes per minute of HD video. ' +
      "Keep this tab open and in front while it works.</p>";
    if (plan.av1) html += '<p class="note bad">One or more clips are AV1. This engine can join AV1 clips only when they all match, ' +
      "so they can't be part of a re-encode. Remove the AV1 clips or the ones that differ from them.</p>";
  }
  $("#plan-body").innerHTML = html;
  box.classList.remove("hide");
}
$("#force").addEventListener("change", () => render());

/* ---------------------------------------------------------- drop onto page -- */
const zone = $("#clips");
["dragenter", "dragover"].forEach((e) => zone.addEventListener(e, (ev) => {
  if (dragUid || S.busy) return;
  ev.preventDefault(); zone.classList.add("drag");
}));
zone.addEventListener("dragleave", (ev) => { if (ev.target === zone) zone.classList.remove("drag"); });
zone.addEventListener("drop", (ev) => {
  zone.classList.remove("drag");
  if (dragUid) return;
  ev.preventDefault();
  if (ev.dataTransfer.files && ev.dataTransfer.files.length) addFiles(ev.dataTransfer.files);
});
window.addEventListener("dragover", (ev) => ev.preventDefault());
window.addEventListener("drop", (ev) => ev.preventDefault());

/* -------------------------------------------------------------------- merge -- */
function clearResult() {
  if (S.result && S.result.url) URL.revokeObjectURL(S.result.url);
  S.result = null;
  $("#done").classList.add("hide");
  $("#fail").classList.add("hide");
}

function setProgress(pct, title, note) {
  $("#pct").textContent = Math.floor(pct) + "%";
  $("#pbar").style.width = pct + "%";
  if (title != null) $("#prog-title").textContent = title;
  if (note != null) $("#prog-note").innerHTML = note;
}

async function run(step, grand, base, label) {
  const dur = step.dur || 0.001;
  onProgressLine = (line) => {
    const m = /^out_time_us=(\d+)/.exec(line);
    if (!m) return;
    const secs = Math.min(+m[1] / 1e6, dur);
    setProgress(Math.min(99, (base + secs) / grand * 100), null,
      "<b>" + esc(label) + "</b> · " + fmtTime(secs) + " of " + fmtTime(dur));
  };
  logTail = [];
  const rc = await engine.call("exec", { args: step.args });
  onProgressLine = null;
  if (rc !== 0) throw new Error((logTail.slice(-12).join("\n") || "FFmpeg stopped with code " + rc));
}

async function clearStore() {
  try {
    const root = await navigator.storage.getDirectory();
    const names = [];
    for await (const name of root.keys()) if (name.startsWith("merged-")) names.push(name);
    for (const n of names) await root.removeEntry(n);
  } catch (_) { /* no private storage in this browser */ }
}

async function readOut(out, size, plan, handle) {
  const note = (what, done) => setProgress(99, null, what + ", " + fmtSize(Math.min(size, done)) + " of " + fmtSize(size) + ".");
  const pump = async (write, what) => {
    for (let off = 0; off < size; off += CHUNK) {
      const chunk = await engine.call("readChunk", { path: out, offset: off, length: Math.min(CHUNK, size - off) });
      await write(chunk);
      note(what, off + CHUNK);
    }
  };
  if (handle) {
    const w = await handle.createWritable();
    try { await pump((c) => w.write(c), "Writing the file"); await w.close(); }
    catch (e) { try { await w.abort(); } catch (_) {} throw e; }
    return null;
  }
  let fh = null, w = null;
  try {
    await clearStore();
    const root = await navigator.storage.getDirectory();
    fh = await root.getFileHandle("merged-" + Date.now() + plan.ext, { create: true });
    w = await fh.createWritable();
    await pump((c) => w.write(c), "Preparing the download");
    await w.close();
    const file = await fh.getFile();
    return URL.createObjectURL(new File([file], plan.name, { type: MIME[plan.ext] || "video/mp4" }));
  } catch (e) {
    if (w) { try { await w.abort(); } catch (_) {} }
    await clearStore();
  }
  const parts = [];
  await pump((c) => { parts.push(c); }, "Preparing the download");
  return URL.createObjectURL(new Blob(parts, { type: MIME[plan.ext] || "video/mp4" }));
}

function listText(paths) { return paths.map((p) => "file '" + p.replace(/'/g, "'\\''") + "'").join("\n") + "\n"; }

$("#go").onclick = async () => {
  if (S.busy) return;
  const plan = makePlan();
  if (plan.ok.length < 2 || plan.av1 || totalBytes() > MAX_BYTES) return;

  // Ask where to save first (Chrome, Edge): the result is then written straight to disk.
  let handle = null;
  if (window.showSaveFilePicker && $("#direct").checked) {
    try {
      handle = await window.showSaveFilePicker({ suggestedName: plan.name,
        types: [{ description: "Video", accept: { [MIME[plan.ext] || "video/mp4"]: [plan.ext] } }] });
    } catch (e) {
      if (e && e.name === "AbortError") return;
      handle = null;
    }
  }

  S.busy = true;
  clearResult();
  render();
  $("#prog").classList.remove("hide");
  $("#stop").disabled = false;
  setProgress(0, plan.encode ? "Re-encoding " + plan.ok.length + " clips…" : "Joining " + plan.ok.length + " clips…", "Starting…");
  const scratch = [];
  const out = "/w/merged" + plan.ext;
  try {
    await ensureEngine();
    for (const c of plan.ok) await mountClip(c);
    await engine.call("unlink", { path: out });
    const steps = [];
    if (!plan.encode) {
      await engine.call("writeText", { path: "/w/list.txt", text: listText(plan.ok.map(clipPath)) });
      const args = ["-hide_banner", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-fflags", "+genpts", "-i", "/w/list.txt",
        "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy"];
      if ([".mp4", ".m4v", ".mov"].includes(plan.ext)) args.push("-movflags", "+faststart");
      args.push("-progress", "pipe:1", "-nostats", out);
      steps.push({ args, dur: plan.total, label: "Copying the streams" });
      await engine.call("reserve", { name: "merged" + plan.ext, bytes: Math.ceil(totalBytes() * 1.01) + 4 * 1024 * 1024 });
    } else {
      const t = plan.t;
      const vf = "scale=" + t.w + ":" + t.h + ":force_original_aspect_ratio=decrease:flags=lanczos,pad=" + t.w + ":" + t.h +
        ":(ow-iw)/2:(oh-ih)/2,setsar=1,fps=" + t.fps.toFixed(5) + ",format=yuv420p";
      const af = "aresample=" + t.sr + ",aformat=sample_fmts=s32:sample_rates=" + t.sr + ":channel_layouts=" + t.layout;
      plan.ok.forEach((c, idx) => {
        const part = "/w/part" + String(idx).padStart(3, "0") + ".mkv";
        const args = ["-hide_banner", "-nostdin", "-y", "-i", clipPath(c)];
        let maps = ["-map", "0:v:0"];
        if (t.sound) {
          if (c.info.has_audio) maps.push("-map", "0:a:0");
          else { args.push("-f", "lavfi", "-t", Math.max(c.info.duration, 0.1).toFixed(3), "-i", "anullsrc=channel_layout=" + t.layout + ":sample_rate=" + t.sr); maps.push("-map", "1:a:0"); }
        }
        args.push(...maps, "-vf", vf);
        if (t.sound) args.push("-af", af, "-c:a", "flac"); else args.push("-an");
        args.push("-c:v", "libx264", "-crf", "17", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-progress", "pipe:1", "-nostats", part);
        steps.push({ args, dur: c.info.duration, label: "Encoding clip " + (idx + 1) + " of " + plan.ok.length });
        scratch.push(part);
      });
      const join = ["-hide_banner", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-fflags", "+genpts", "-i", "/w/list.txt",
        "-map", "0:v:0"];
      if (t.sound) join.push("-map", "0:a:0", "-c:a", "aac", "-b:a", "256k");
      join.push("-c:v", "copy", "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", out);
      steps.push({ args: join, dur: plan.total * 0.15, label: "Joining the clips", join: true });
    }

    const grand = steps.reduce((a, s) => a + (s.dur || 0), 0) || 1;
    let base = 0;
    for (const step of steps) {
      if (step.join) {
        await engine.call("writeText", { path: "/w/list.txt", text: listText(scratch) });
        let partBytes = 0;
        for (const p of scratch) partBytes += Math.max(0, await engine.call("size", { path: p }));
        await engine.call("reserve", { name: "merged" + plan.ext, bytes: Math.ceil(partBytes * 1.02) + 4 * 1024 * 1024 });
      }
      await run(step, grand, base, step.label);
      base += step.dur || 0;
      if (step.join) for (const p of scratch) await engine.call("unlink", { path: p });
    }

    const size = await engine.call("size", { path: out });
    if (size <= 0) throw new Error(logTail.slice(-12).join("\n") || "FFmpeg produced no output");

    let info = null;
    try {
      await engine.call("unlink", { path: "/w/probe.json" });
      await engine.call("ffprobe", { args: ["-v", "error", "-show_format", "-show_streams", "-of", "json", "-o", "/w/probe.json", out] });
      info = infoFrom(JSON.parse(await engine.call("readText", { path: "/w/probe.json" })));
    } catch (_) { info = null; }

    // Read the result out in chunks: straight to disk when a save location was picked, otherwise into the
    // browser's private storage on disk (so even a 2 GB file never has to sit in memory twice), and only
    // as a last resort into memory.
    setProgress(99, "Saving…", handle ? "Writing the file to the place you picked." : "Preparing the download.");
    const url = await readOut(out, size, plan, handle);
    await engine.call("unlink", { path: out });
    await engine.call("reserve", { name: null });
    S.result = { url, name: handle ? handle.name : plan.name, size, info, plan, saved: !!handle };
    S.busy = false;
    $("#prog").classList.add("hide");
    showDone();
  } catch (e) {
    S.busy = false;
    $("#prog").classList.add("hide");
    try { if (engine && engineState === "ready") { for (const p of scratch) await engine.call("unlink", { path: p }); await engine.call("unlink", { path: out }); await engine.call("reserve", { name: null }); } } catch (_) {}
    if (e && e.message === "stopped") { render(); return; }
    showFail(e);
  }
  render();
};

$("#stop").onclick = () => {
  if (!S.busy || !engine) return;
  $("#stop").disabled = true;
  engine.terminate();
  engine = null;
  engineState = "idle";
  S.clips.forEach((c) => { c.mounted = false; });
  ensureEngine().then(() => render()).catch(() => {});
};

function showDone() {
  const r = S.result, i = r.info || {}, p = r.plan;
  $("#done-body").innerHTML =
    '<p><span class="pill ' + (p.encode ? "warn" : "ok") + '">' + (p.encode ? "Re-encoded at the best source quality" : "No re-encode, original quality kept") + "</span></p>" +
    '<div class="meta wide"><span>Clips</span><b>' + p.ok.length + "</b><span>Length</span><b>" + fmtTime(i.duration || p.total) + "</b>" +
    "<span>Video</span><b>" + (i.display_w || "?") + "×" + (i.display_h || "?") + " · " + (i.fps ? i.fps.toFixed(2) : "?") + " fps · " + esc(i.vcodec || "") + "</b>" +
    "<span>Sound</span><b>" + (i.has_audio ? esc(i.acodec) + " · " + (i.channels === 1 ? "mono" : i.channels === 2 ? "stereo" : i.channels + " ch") : "none") + "</b>" +
    "<span>Size</span><b>" + fmtSize(r.size) + "</b><span>File</span><b>" + esc(r.name) + "</b></div>" +
    (r.saved ? '<p class="note">Saved to the place you picked.</p>'
      : '<div class="row"><a class="btn primary" id="dl" href="' + r.url + '" download="' + esc(r.name) + '">Download the merged video</a></div>') +
    '<div class="row"><button class="btn" id="again" type="button">Start a new merge</button></div>';
  $("#done").classList.remove("hide");
  $("#again").onclick = () => { clearResult(); clearStore(); S.clips.slice().forEach((c) => removeClip(c.uid)); };
  $("#done").scrollIntoView({ behavior: "smooth", block: "center" });
}

function showFail(e) {
  let msg = (e && e.message) || String(e);
  if (/memory|allocation|RangeError|out of bounds/i.test(msg)) msg = "This device ran out of memory for a merge this big. Try fewer or smaller clips, or a computer.\n\n" + msg;
  $("#fail-body").textContent = msg;
  $("#fail").classList.remove("hide");
  $("#fail").scrollIntoView({ behavior: "smooth", block: "center" });
}

/* --------------------------------------------------------------------- start -- */
if (!window.showSaveFilePicker) $("#direct-row").classList.add("hide");
if (typeof WebAssembly !== "object" || typeof Worker !== "function") {
  setEngineUI("<b>This browser can't run the video engine.</b> Try a recent Chrome, Edge, Firefox or Safari.", null, "bad");
  engineState = "error";
} else {
  showEngineIdle();
  clearStore(); // a finished video from an earlier visit is no longer needed
}
window.addEventListener("beforeunload", (ev) => { if (S.busy) { ev.preventDefault(); ev.returnValue = ""; } });
render();
