// QuestLife landing page (index.html). Heroes are drawn from the shared-hero
// page's parts (hero/parts.json), stacked like the app's PartsAvatar.
const PARTS = '/questlife/hero/';
const IMG = '/questlife/img/';
const $ = (id) => document.getElementById(id);
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Mirrors PartsAvatar's blink: hold open, then close and open again.
const BLINK_SEQ = [1, 2, 1, 0];

// Showcase heroes (parts key, name in the game).
const SHOWCASE = [
  ['male3', 'Arcane Master', 1], ['rose_maid', 'Rose Maid', 12], ['FrostKnight', 'Frost Knight', 11],
  ['cozy_kitten', 'Cozy Kitten', 9], ['Medieval_King', 'Medieval King', 15], ['ember_adept', 'Ember Adept', 13],
  ['Vampire', 'Vampire', 16], ['alley_ace', 'Alley Ace', 10], ['reaper2', 'Soul Reaper', 14],
  ['fem2', 'Valkyrie', 9], ['minautor2', 'Minotaur', 10], ['Wanderer', 'The Wanderer', 14],
];

// Long Road regions in walking order (img/regions/r<n>.jpg).
const REGIONS = [[1, 'Lakeside'], [9, 'Autumn Grove'], [10, 'Desert Canyon'], [11, 'Snowy Village'],
  [12, 'Blossom Garden'], [13, 'Volcanic Lands'], [14, 'Sky Islands'], [15, 'Castle Courtyard'], [16, 'Aurora Peak']];

// Companions: id, name, perk, what it does (src/constants/pets.ts).
const PETS = [["sporo", "Sporo", "Steady Shell", "+8% XP from focus sessions"], ["brawn", "Brawn", "Vanguard", "+6 coins on Hard quests, +12 on Epic"], ["vesper", "Vesper", "Night Forager", "25% chance for a bonus coin drop on quests"], ["wisp", "Wisp", "Lucky Wrappings", "+5% potion-drop chance from chests"], ["pyra", "Pyra", "Deep Burn", "+15% XP from focus sessions of 25+ min"], ["cinder", "Cinder", "Dungeon Warden", "+15% XP & coins from dungeon clears"], ["scorch", "Scorch", "Hoarder's Grace", "Forgives one missed day per week"], ["croak", "Sir Croak", "Daily Champion", "+25% XP & coins from the daily pop quest"], ["bubbles", "Bubbles", "Bubble Calm", "+9% XP from focus sessions"], ["moss", "Moss", "Slow & Steady", "+16% XP from focus sessions of 25+ min"], ["bandit", "Bandit", "Loyal Push", "+7 coins on Hard quests, +14 on Epic"], ["crowley", "Crowley", "Shiny Finder", "28% chance for a bonus coin drop on quests"], ["toadie", "Toadie", "Spore Brew", "+6% potion-drop chance from chests"], ["gale", "Gale", "Sky Scout", "+16% XP & coins from dungeon clears"], ["pip", "Pip", "Ready Pack", "+28% XP & coins from the daily pop quest"], ["hoot", "Hoot", "Night Study", "+10% XP from focus sessions"], ["rubi", "Rubi", "Dragon's Hoard", "+8 coins on Hard quests, +16 on Epic"], ["sunny", "Sunny", "Golden Luck", "30% chance for a bonus coin drop on quests"], ["flicker", "Flicker", "Spirit Charm", "+7% potion-drop chance from chests"], ["blaze", "Blaze", "Kindled Fury", "+18% XP & coins from dungeon clears"], ["kumo", "Kumo", "Shrine Blessing", "+30% XP & coins from the daily pop quest"], ["shard", "Shard", "Clear Mind", "+12% XP from focus sessions"], ["lumen", "Lumen", "Lamplight Vigil", "+20% XP from focus sessions of 25+ min"], ["ash", "Ash", "Dark Hoard", "+9 coins on Hard quests, +18 on Epic"], ["koi", "Koi", "River's Fortune", "35% chance for a bonus coin drop on quests"], ["nyx", "Nyx", "Moonlit Fortune", "+8% potion-drop chance from chests"], ["umbra", "Umbra", "Shadowstep", "+20% XP & coins from dungeon clears"], ["boo", "Boo", "Haunting Cheer", "+35% XP & coins from the daily pop quest"]];

const el = (tag, cls, attrs = {}) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/* ---------- Heroes ---------- */
let manifest = null;
const blinkers = new Set();

/** Draw a hero's layers into `box` (a .hero-sprite). Head + face share a group so a walk can turn them. */
function drawHero(box, key, { unarmed = false } = {}) {
  const c = manifest?.chars?.[key];
  if (!c) return;
  box.replaceChildren();
  let head = null;
  let face = null;
  for (const layer of c.layers) {
    if (unarmed && ['Sword', 'Weapon', 'Shield'].includes(layer.slot)) continue;
    const img = el('img', 'part', { src: PARTS + layer.src, alt: '', draggable: 'false' });
    if (layer.slot === 'Sword' || layer.slot === 'Weapon') img.classList.add('weapon');
    if (layer.slot === 'Body Front') img.classList.add('arm');
    if (layer.slot === 'Head' || layer.slot.startsWith('Face')) {
      if (!head) { head = el('div', 'head'); box.append(head); }
      head.append(img);
      if (layer.slot.startsWith('Face')) face = img;
    } else {
      box.append(img);
    }
  }
  box._faces = c.faces?.length ? c.faces.map((f) => PARTS + f) : null;
  box._face = face;
  if (box._faces) box._faces.forEach((f) => { new Image().src = f; });
  blinkers.add(box);
}

// One clock blinks every hero on the page, each on its own rhythm.
function startBlinking() {
  if (calm) return;
  for (const box of blinkers) box._next = performance.now() + 1500 + Math.random() * 3000;
  setInterval(() => {
    const now = performance.now();
    for (const box of blinkers) {
      if (!box._faces || !box._face || now < box._next) continue;
      box._next = now + 2600 + Math.random() * 1400;
      BLINK_SEQ.forEach((f, i) => setTimeout(() => { if (box._faces) box._face.src = box._faces[f]; }, i * 70));
    }
  }, 120);
}

/* ---------- 1. The demo ---------- */
function setupDemo() {
  const hero = $('demo-hero');
  drawHero(hero, 'rose_maid');
  const quests = [...document.querySelectorAll('.quest')];
  const fill = $('xp-fill');
  const xpText = $('xp-text');
  const lvl = $('lvl');
  const START_XP = 40;
  let xp = START_XP;
  let level = 4;
  const STAT_COLOR = { str: '#FF6B6B', int: '#8F89FF', vit: '#4ECDC4' };

  const show = () => { fill.style.width = `${Math.min(xp, 100)}%`; xpText.textContent = `${Math.min(xp, 100)} / 100`; };

  const float = (text, cls, color) => {
    const f = el('span', `floater ${cls}`);
    f.textContent = text;
    if (color) f.style.setProperty('--c', color);
    $('floaters').append(f);
    setTimeout(() => f.remove(), 1800);
  };

  const sparks = () => {
    const stage = $('demo-stage');
    for (let i = 0; i < 26; i++) {
      const s = el('span', 'spark');
      const a = (i / 26) * Math.PI * 2;
      const r = 90 + Math.random() * 90;
      s.style.left = '50%'; s.style.top = '45%';
      s.style.setProperty('--dx', `${Math.cos(a) * r}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * r}px`);
      stage.append(s);
      setTimeout(() => s.remove(), 1300);
    }
  };

  const levelUp = () => {
    level += 1;
    lvl.textContent = String(level);
    lvl.classList.remove('pop'); void lvl.offsetWidth; lvl.classList.add('pop');
    $('levelup').classList.remove('show'); void $('levelup').offsetWidth; $('levelup').classList.add('show');
    hero.classList.remove('jump'); void hero.offsetWidth; hero.classList.add('jump');
    sparks();
    // Level 5 unlocks Autumn Grove in the game, so the world changes with it.
    const next = $('demo-region-next');
    next.style.backgroundImage = `url(${IMG}regions/r9.jpg)`;
    next.style.opacity = '1';
    setTimeout(() => {
      xp -= 100;
      fill.style.transition = 'none'; fill.style.width = '0%'; void fill.offsetWidth; fill.style.transition = '';
      show();
    }, 900);
  };

  quests.forEach((q) => q.addEventListener('click', () => {
    if (q.classList.contains('done')) return;
    q.classList.add('done');
    q.setAttribute('aria-pressed', 'true');
    xp += Number(q.dataset.xp);
    float(`+${q.dataset.xp} XP`, '');
    float(`+1 ${q.dataset.stat.toUpperCase()}`, 'stat', STAT_COLOR[q.dataset.stat]);
    show();
    if (xp >= 100) setTimeout(levelUp, 650);
    if (quests.every((x) => x.classList.contains('done'))) setTimeout(() => { $('again').hidden = false; }, 2400);
  }));

  $('again').addEventListener('click', () => {
    xp = START_XP; level = 4; lvl.textContent = '4';
    quests.forEach((q) => { q.classList.remove('done'); q.removeAttribute('aria-pressed'); });
    $('demo-region-next').style.opacity = '0';
    $('again').hidden = true;
    show();
  });
  show();
}

/* ---------- 3. The Long Road ---------- */
function setupRoad() {
  const track = $('road-track');
  // Two copies so the strip loops without a seam.
  for (let copy = 0; copy < 2; copy++) {
    for (const [n, name] of REGIONS) {
      const fig = el('figure');
      fig.style.backgroundImage = `url(${IMG}regions/r${n}.jpg)`;
      const cap = el('figcaption');
      cap.textContent = name;
      fig.append(cap);
      track.append(fig);
    }
  }
  drawHero($('road-hero'), 'Wanderer');
}

/* ---------- 7. Showcase ---------- */
function setupShowcase() {
  const hero = $('sc-hero');
  const dots = $('sc-dots');
  let i = 0;
  let timer = null;
  const go = (n, user) => {
    i = (n + SHOWCASE.length) % SHOWCASE.length;
    const [key, name, bg] = SHOWCASE[i];
    drawHero(hero, key);
    hero.classList.remove('swap'); void hero.offsetWidth; hero.classList.add('swap');
    hero.setAttribute('aria-label', name);
    $('sc-name').textContent = name;
    // Cross-fade the backdrop.
    const cur = $('sc-region');
    const nxt = $('sc-region-next');
    nxt.style.backgroundImage = `url(${IMG}regions/r${bg}.jpg)`;
    nxt.style.opacity = '1';
    setTimeout(() => { cur.style.backgroundImage = nxt.style.backgroundImage; nxt.style.transition = 'none'; nxt.style.opacity = '0'; void nxt.offsetWidth; nxt.style.transition = ''; }, 1250);
    [...dots.children].forEach((d, j) => d.setAttribute('aria-current', String(j === i)));
    if (user) { clearInterval(timer); timer = null; }
  };
  SHOWCASE.forEach(([, name], j) => {
    const d = el('button', '', { 'aria-label': name });
    d.addEventListener('click', () => go(j, true));
    dots.append(d);
  });
  $('sc-region').style.backgroundImage = `url(${IMG}regions/r1.jpg)`;
  $('sc-prev').addEventListener('click', () => go(i - 1, true));
  $('sc-next').addEventListener('click', () => go(i + 1, true));
  go(0);
  if (!calm) timer = setInterval(() => go(i + 1), 3200);
}

/* ---------- 8. Companions ---------- */
// A taste, not the catalogue: a few to meet, a row of silhouettes to wonder about.
const PETS_SHOWN = ['kumo', 'sunny', 'pip', 'rubi', 'bubbles', 'flicker', 'hoot'];
const PETS_HIDDEN = ['koi', 'nyx', 'umbra', 'boo', 'shard', 'blaze', 'gale'];

function setupPets() {
  const grid = $('pet-grid');
  const card = $('pet-card');
  const byId = Object.fromEntries(PETS.map((p) => [p[0], p]));
  const say = (name, line1, line2) => {
    card.replaceChildren();
    const b = el('b'); b.textContent = name;
    const s = el('span'); s.textContent = line2;
    card.append(b, line1, el('br'), s);
  };
  const press = (btn) => {
    grid.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    btn.setAttribute('aria-pressed', 'true');
  };
  const tile = (id, j, hidden) => {
    const p = byId[id];
    const btn = el('button', `reveal${hidden ? ' hidden-pet' : ''}`, {
      'aria-label': hidden ? 'A companion still to find' : p[1],
      'aria-pressed': String(id === 'kumo'),
    });
    btn.style.transitionDelay = `${(j % 7) * 0.04}s`;
    btn.append(el('img', '', { src: `${IMG}pets/${id}.webp`, alt: '', loading: 'lazy', width: '180', height: '180' }));
    btn.addEventListener('click', () => {
      press(btn);
      if (hidden) say('???', '', `One of ${PETS.length - PETS_SHOWN.length} companions waiting to be found in the game.`);
      else say(p[1], ` · ${p[2]}`, p[3]);
    });
    grid.append(btn);
  };
  PETS_SHOWN.forEach((id, j) => tile(id, j, false));
  PETS_HIDDEN.forEach((id, j) => tile(id, j, true));
  const more = el('p', 'pet-more reveal');
  more.textContent = `+ ${PETS.length - PETS_SHOWN.length - PETS_HIDDEN.length} more you'll only see in the game`;
  grid.after(more);
}

/* ---------- Dungeon + final line-up ---------- */
function setupExtras() {
  drawHero($('duel-hero'), 'FrostKnight');
  // The closing crowd: heroes only, weapons put away.
  const line = $('lineup');
  const cast = ['sailor_cadet', 'fem1', 'thornwood_scout', 'Medieval_King', 'rose_maid', 'male3', 'cozy_kitten', 'apprentice-fem', 'ember_adept', 'alley_ace', 'Pirate'];
  for (const key of cast) {
    const h = el('div', 'hero-sprite');
    drawHero(h, key, { unarmed: true });
    line.append(h);
  }
}

/* ---------- Scroll ---------- */
function setupScroll() {
  const nav = $('nav');
  const onScroll = () => nav.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach((n) => io.observe(n));
}

async function main() {
  setupPets();
  setupScroll();
  try {
    manifest = await fetch(PARTS + 'parts.json').then((r) => r.json());
  } catch {
    manifest = null;
  }
  setupDemo();
  setupRoad();
  setupShowcase();
  setupExtras();
  startBlinking();
}

main();
