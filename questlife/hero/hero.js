// Hero page logic — see the comment in index.html. Loaded as an external
// module so the page's CSP can forbid inline scripts entirely.
const SUPABASE_URL = 'https://coylddziizqojknzpjao.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7-_pCXElbb49PbaIDl3daQ_ey0pdHVY';

// Mirrors PartsAvatar: hold open, then play the closing/opening frames.
const BLINK_SEQ = [1, 2, 1, 0];
const FRAME_MS = 70;
const HOLD_MS = 2600;
const COIN_FPS = 12;   // PlusBadge

const $ = (id) => document.getElementById(id);
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);

async function fetchShare(code) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_hero_share`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_code: code }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data && data.ok ? data : null;
}

// Look keys come from the database, so only ever use them to look up the
// manifest's OWN keys (no prototype names like "__proto__"/"constructor").
const charOf = (chars, key) =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(chars, key) ? chars[key] : null;
const slotSrc = (chars, key, slot) => charOf(chars, key)?.layers.find((l) => l.slot === slot)?.src;

function preload(srcs) {
  return Promise.all(srcs.map((src) => new Promise((resolve) => {
    const im = new Image(); im.onload = im.onerror = resolve; im.src = src;
  })));
}

async function render(share, manifest) {
  const { chars } = manifest;
  const look = share.look;
  const base = look && charOf(chars, look.base);
  if (!base) return false;

  // Same override rules as loadoutOverrides(): Head + Sword from donors,
  // face frames from the face donor (falling back to the base's own layer).
  const overrides = {};
  const head = slotSrc(chars, look.head, 'Head');
  if (head) overrides['Head'] = head;
  const sword = slotSrc(chars, look.weapon, 'Sword');
  if (sword) overrides['Sword'] = sword;
  const faceChar = charOf(chars, look.face);
  const faces = faceChar?.faces?.length ? faceChar.faces : null;

  const stage = $('stage');
  let faceImg = null;
  const srcs = [];
  for (const layer of base.layers) {
    const isFace = layer.slot.toLowerCase().startsWith('face');
    let src = overrides[layer.slot] ?? layer.src;
    if (isFace && faces) src = faces[0];
    const img = document.createElement('img');
    img.alt = '';
    img.src = src;
    stage.appendChild(img);
    srcs.push(src);
    if (isFace && faces) faceImg = img;
  }
  if (faces) srcs.push(...faces);
  await preload(srcs);

  if (faceImg && faces.length >= 2) {
    const hold = () => setTimeout(() => {
      let i = 0;
      const step = () => {
        faceImg.src = faces[BLINK_SEQ[i]] ?? faces[0];
        i += 1;
        if (i < BLINK_SEQ.length) setTimeout(step, FRAME_MS); else hold();
      };
      step();
    }, HOLD_MS + Math.random() * 1400);
    hold();
  }

  // textContent, never innerHTML: the name is player-chosen text.
  $('name').textContent = String(share.name ?? '');
  $('stage').setAttribute('aria-label', `${$('name').textContent}'s QuestLife hero`);
  document.title = `${$('name').textContent} — QuestLife Hero`;

  if (share.plus === true) {
    const coin = $('coin');
    await preload(manifest.plus);
    let f = 0;
    coin.src = manifest.plus[0];
    setInterval(() => { f = (f + 1) % manifest.plus.length; coin.src = manifest.plus[f]; }, 1000 / COIN_FPS);
    show('coin');
  }
  return true;
}

async function main() {
  const code = new URLSearchParams(location.search).get('c');
  let ok = false;
  if (code && /^[0-9a-f]{6,32}$/i.test(code)) {
    try {
      const [share, manifest] = await Promise.all([
        fetchShare(code),
        fetch('parts.json').then((r) => r.json()),
      ]);
      if (share) ok = await render(share, manifest);
    } catch { ok = false; }
  }
  show('loading', false);
  show(ok ? 'hero' : 'missing');
}

main();
