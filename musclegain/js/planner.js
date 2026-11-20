/* Plan generators: calories and macros, weekly training program, 7-day meal plan, grocery list.
   Pure functions of the questionnaire answers. No DOM access, so this file also runs in Node for tests. */
(function (root) {
  const MG = root.MG;
  const P = (MG.planner = {});

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const LEVEL = { beginner: 0, intermediate: 1, advanced: 2 };
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  P.WEEKDAYS = WEEKDAYS;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  P.physique = function (a) {
    const list = MG.PHYSIQUES[a.sex] || MG.PHYSIQUES.male;
    return list.find((p) => p.id === a.physique) || list[1];
  };

  /* ================= NUTRITION TARGETS ================= */

  P.PACES = {
    cut: { name: 'Fat loss', adj: -0.2, protein: 2.2, fatShare: 0.25 },
    recomp: { name: 'Recomposition', adj: 0, protein: 2.0, fatShare: 0.27 },
    leanbulk: { name: 'Lean bulk', adj: 0.1, protein: 1.9, fatShare: 0.27 },
    bulk: { name: 'Bulk', adj: 0.18, protein: 1.8, fatShare: 0.27 },
  };

  P.nutrition = function (a) {
    const phys = P.physique(a);
    const h = a.heightCm / 100;
    const bmi = a.weightKg / (h * h);
    const bmr = 10 * a.weightKg + 6.25 * a.heightCm - 5 * a.age + (a.sex === 'male' ? 5 : -161);
    const base = { desk: 1.25, feet: 1.4, physical: 1.6 }[a.activity] || 1.25;
    const tdee = bmr * (base + 0.04 * a.days);

    // Pick a calorie strategy from where the person is now and where they want to go.
    const s = a.sex === 'female' ? -1.5 : 0;
    let auto;
    if (phys.goal === 'mass') auto = bmi >= 29 + s ? 'recomp' : bmi < 25 + s ? 'bulk' : 'leanbulk';
    else {
      const t = { lean: [20.5, 24], athletic: [22, 26], muscular: [24.5, 27.5] }[phys.goal];
      auto = bmi < t[0] + s ? 'leanbulk' : bmi < t[1] + s ? 'recomp' : 'cut';
    }
    let pace = a.pace && a.pace !== 'auto' ? a.pace : auto;
    const notes = [];
    if (a.age < 18 && pace === 'cut') {
      pace = 'recomp';
      notes.push('You are under 18, so the plan does not put you in a calorie deficit. Eat at maintenance and let training do the work.');
    }
    if (bmi < 18.5 && (pace === 'cut' || pace === 'recomp')) {
      pace = 'leanbulk';
      notes.push('Your BMI is under 18.5, so the plan uses a small surplus instead of a deficit.');
    }
    // BMI cannot tell fat from muscle, so the lean-look goals get a pointer to the faster route when Auto picks maintenance.
    if (phys.shred && pace === 'recomp' && (!a.pace || a.pace === 'auto')) {
      notes.push('For a lean, defined look, low body fat matters as much as muscle. If you cannot see the outline of your abs yet, choose Lose fat under Calorie strategy: you get there faster and the training keeps your muscle. Switch back once you are as lean as you want.');
    }
    const cfg = P.PACES[pace];
    const floor =a.sex === 'male' ? 1500 : 1200;
    let kcal = Math.round((tdee * (1 + cfg.adj)) / 10) * 10;
    if (kcal < floor) {
      kcal = floor;
      notes.push('Calories are held at a safe minimum of ' + floor + ' kcal.');
    }
    const baseKcal = kcal;
    // The tracker can nudge calories when real-world weight change does not match the plan.
    if (a.kcalAdjust) kcal = Math.max(floor, kcal + a.kcalAdjust);
    const refW = Math.min(a.weightKg, 27 * h * h); // do not inflate protein for higher body fat
    const protein = Math.round((cfg.protein * refW) / 5) * 5;
    const fat = Math.round(Math.max((cfg.fatShare * kcal) / 9, 0.6 * refW));
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    const weekly = ((baseKcal - tdee) * 7) / 7700; // the pace the plan is aiming for

    return {
      bmi, bmr: Math.round(bmr), tdee: Math.round(tdee), pace, autoPace: auto, paceName: cfg.name,
      kcal, baseKcal, adjust: kcal - baseKcal, protein, fat, carbs, weekly,
      fiber: Math.round((kcal / 1000) * 14),
      water: Math.round(a.weightKg * 0.035 * 10) / 10 + 0.5,
      notes,
    };
  };

  /* ================= TRAINING PROGRAM ================= */

  /* Each day type has the lifts it always starts with (must) and the slots it may add (pool).
     The planner fills the remaining places across the whole week so the weekly volume per muscle
     follows the chosen physique's emphasis (MG.PHYSIQUES[].emph). */
  const UPPER_POOL = ['chest_press', 'chest_incline', 'chest_fly', 'shoulder_press', 'lateral', 'rear_delt', 'row', 'vertical_pull', 'biceps', 'triceps', 'core', 'traps'];
  const LOWER_POOL = ['squat', 'hinge', 'single_leg', 'quad_iso', 'ham_curl', 'glute', 'calves', 'core'];
  const TEMPLATES = {
    fullA: { name: 'Full Body', must: ['squat', 'chest_press', 'row'], pool: UPPER_POOL.concat(LOWER_POOL) },
    fullB: { name: 'Full Body', must: ['hinge', 'shoulder_press', 'vertical_pull'], pool: UPPER_POOL.concat(LOWER_POOL) },
    fullC: { name: 'Full Body', must: ['squat', 'chest_incline', 'row'], pool: UPPER_POOL.concat(LOWER_POOL) },
    upperA: { name: 'Upper Body', must: ['chest_press', 'row'], pool: UPPER_POOL },
    upperB: { name: 'Upper Body', must: ['chest_incline', 'vertical_pull'], pool: UPPER_POOL },
    // Small shoulder and arm accessories are allowed on leg days when the goal needs more upper-body volume.
    lowerA: { name: 'Lower Body', must: ['squat', 'hinge'], pool: LOWER_POOL.concat(['lateral', 'rear_delt', 'biceps', 'triceps']) },
    lowerB: { name: 'Lower Body', must: ['hinge', 'squat'], pool: LOWER_POOL.concat(['lateral', 'rear_delt', 'biceps', 'triceps']) },
    push: { name: 'Push · Chest, Shoulders, Triceps', must: ['chest_press', 'shoulder_press'], pool: ['chest_press', 'chest_incline', 'chest_fly', 'shoulder_press', 'lateral', 'triceps', 'core'] },
    pull: { name: 'Pull · Back & Biceps', must: ['vertical_pull', 'row'], pool: ['row', 'vertical_pull', 'rear_delt', 'biceps', 'traps', 'lateral', 'core'] },
    legs: { name: 'Legs', must: ['squat', 'hinge'], pool: LOWER_POOL },
    glutes: { name: 'Glutes & Hamstrings', must: ['hinge', 'glute'], pool: ['glute', 'hinge', 'single_leg', 'ham_curl', 'squat', 'calves', 'core', 'quad_iso'] },
  };
  /* Slots that may appear twice in one session (different exercises). */
  const REPEATABLE = { row: 2, biceps: 2, triceps: 2, lateral: 1, glute: 2, chest_fly: 1 };
  /* Goals that care about arms get at least two direct exercises a week for each; rows and presses alone are not enough. */
  const DIRECT_ARMS = { bi: 'biceps', tri: 'triceps' };
  const ARM_EMPH = 0.7;
  const UPPER_EXTRAS = ['lateral', 'rear_delt', 'biceps', 'triceps'];
  const LEG_DAYS = ['lowerA', 'lowerB', 'legs', 'glutes'];

  /* How many sets each slot puts on each muscle (compounds give half credit to helpers). */
  const HITS = {
    chest_press: { chest: 1, tri: 0.5, front: 0.5 }, chest_incline: { chest: 1, front: 0.5, tri: 0.5 }, chest_fly: { chest: 1 },
    shoulder_press: { front: 1, side: 0.5, tri: 0.5 }, lateral: { side: 1 }, rear_delt: { rear: 1 },
    row: { back: 1, bi: 0.5, rear: 0.5 }, vertical_pull: { back: 1, bi: 0.5 }, traps: { back: 0.5 },
    squat: { quad: 1, glute: 0.5 }, hinge: { ham: 1, glute: 1 }, single_leg: { quad: 1, glute: 0.5 }, quad_iso: { quad: 1 },
    ham_curl: { ham: 1 }, glute: { glute: 1 }, calves: { calf: 1 }, biceps: { bi: 1 }, triceps: { tri: 1 }, core: { abs: 1 }, cardio: {},
  };
  P.HITS = HITS;
  P.MUSCLES = ['chest', 'back', 'front', 'side', 'rear', 'bi', 'tri', 'quad', 'ham', 'glute', 'calf', 'abs'];
  const MAIN_MUSCLE = (slot) => { const h = HITS[slot] || {}; return Object.keys(h).sort((x, y) => h[y] - h[x])[0]; };

  /* With very little pulling equipment a body-part split leaves "pull" days empty, so train the whole body each session instead. */
  function limitedPulling(a) {
    const lvl = LEVEL[a.experience] || 0;
    const wheres = a.location === 'both' ? ['gym', 'home'] : [a.location];
    return wheres.some((w) => {
      const eq = new Set(equipmentFor(a, w));
      const n = ['row', 'vertical_pull'].reduce((t, s) => t + MG.EX[s].filter((e) => hasReq(e.req, eq) && (e.lvl || 0) <= lvl).length, 0);
      return n < 3;
    });
  }

  function splitFor(a, phys) {
    const d = clamp(a.days, 2, 6);
    if (limitedPulling(a)) return ['fullA', 'fullB', 'fullC', 'fullA', 'fullB', 'fullC'].slice(0, d);
    if (phys.focus === 'glutes') {
      return {
        2: ['fullA', 'fullB'],
        3: ['lowerA', 'upperA', 'glutes'],
        4: ['lowerA', 'upperA', 'glutes', 'upperB'],
        5: ['lowerA', 'upperA', 'glutes', 'upperB', 'lowerB'],
        6: ['lowerA', 'upperA', 'glutes', 'upperB', 'lowerB', 'fullB'],
      }[d];
    }
    return {
      2: ['fullA', 'fullB'],
      3: LEVEL[a.experience] === 0 ? ['fullA', 'fullB', 'fullC'] : ['push', 'pull', 'legs'],
      4: ['upperA', 'lowerA', 'upperB', 'lowerB'],
      5: ['upperA', 'lowerA', 'push', 'pull', 'legs'],
      6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
    }[d];
  }

  const SPLIT_NAMES = { 2: 'Full Body ×2', 3: 'Three-day split', 4: 'Upper / Lower', 5: 'Upper / Lower + Push / Pull / Legs', 6: 'Push / Pull / Legs ×2' };
  const DAY_MAP = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
  const COUNT_FOR_MIN = { 30: 4, 45: 5, 60: 6, 75: 7, 90: 8 };

  function hasReq(req, eq) {
    return req.split('|').some((g) => g.split('+').every((k) => k === 'bw' || eq.has(k)));
  }

  /* The slot that actually supplies exercises with this equipment (a missing machine falls back to a related slot). */
  function resolveSlot(slot, eq, lvl, seen) {
    seen = seen || new Set();
    if (seen.has(slot)) return null;
    seen.add(slot);
    if ((MG.EX[slot] || []).some((e) => hasReq(e.req, eq) && (e.lvl || 0) <= lvl)) return slot;
    const fb = MG.SLOTS[slot].fallback;
    return fb ? resolveSlot(fb, eq, lvl, seen) : null;
  }
  function candidates(slot, eq, lvl) {
    const s = resolveSlot(slot, eq, lvl);
    return s ? MG.EX[s].filter((e) => hasReq(e.req, eq) && (e.lvl || 0) <= lvl) : [];
  }
  P.candidates = candidates;

  function prescribe(ex, kind, style, lvl, first) {
    if (ex.intervals) return { sets: lvl === 0 ? 6 : 8, reps: '30 s hard', rest: '30–60 s easy', restSec: 45, workSec: 30 };
    if (ex.time) return { sets: 3, reps: lvl === 0 ? '20–40 s' : '40–60 s', rest: '45 s', restSec: 45, workSec: 45 };
    let sets, reps, restSec;
    if (kind === 'compound') {
      sets = [3, 3, 4][lvl] + (style === 'mass' && first && lvl > 0 ? 1 : 0);
      // Lean goals lift heavy too: in a calorie deficit, heavier work is what keeps the muscle.
      reps = { mass: first ? '5–8' : '6–10', hyp: first ? '6–10' : '8–12', athletic: first ? '5–8' : '8–10', lean: first ? '6–10' : '8–12' }[style];
      restSec = { mass: first ? 180 : 120, hyp: first ? 150 : 90, athletic: first ? 120 : 90, lean: first ? 120 : 90 }[style];
      if (ex.heavy && !first) restSec = Math.max(restSec, style === 'lean' ? 120 : 150);
      if (ex.bwLoad) reps = '6–15';
      if (ex.id === 'Barbell_Deadlift') reps = first ? '4–6' : '5–8';
    } else if (kind === 'iso') {
      sets = [2, 3, 3][lvl] + (lvl === 2 && (style === 'hyp' || style === 'mass') ? 1 : 0);
      reps = { mass: '10–12', hyp: '12–15', athletic: '10–15', lean: '12–15' }[style];
      restSec = 60;
      if (ex.bwLoad) reps = '10–20';
    } else {
      sets = 3;
      reps = ex.bwLoad ? '10–20' : '10–15';
      restSec = 45;
    }
    if (ex.bwLoad) restSec = Math.min(restSec, 90); // unweighted moves do not need powerlifting rests
    const rest = restSec >= 120 ? restSec / 60 + ' min' : restSec + ' s';
    return { sets, reps, rest, restSec, workSec: 40 };
  }
  /* Sets a slot will get, used while planning the week before exercises are picked. */
  function estSets(slot, style, lvl, first) {
    const kind = MG.SLOTS[slot].kind;
    if (kind === 'compound') return [3, 3, 4][lvl] + (style === 'mass' && first && lvl > 0 ? 1 : 0);
    if (kind === 'iso') return [2, 3, 3][lvl] + (lvl === 2 && (style === 'hyp' || style === 'mass') ? 1 : 0);
    return kind === 'core' ? 3 : 0;
  }

  /* Rough session length for a list of slots before exercises are chosen (same sums as dayMinutes, typical rests). */
  function estMinutes(slots, style, lvl) {
    let firstDone = false;
    const sec = slots.reduce((t, slot) => {
      const kind = MG.SLOTS[slot].kind;
      if (kind === 'cardio') return t + (lvl === 0 ? 6 : 8) * 75 + 60;
      const first = !firstDone && kind === 'compound';
      if (first) firstDone = true;
      const sets = estSets(slot, style, lvl, first);
      const rest = kind === 'compound'
        ? (first ? { mass: 180, hyp: 150, athletic: 120, lean: 120 }[style] : style === 'mass' ? 120 : 90)
        : kind === 'iso' ? 60 : 45;
      return t + sets * (40 + rest) + 60;
    }, 0);
    return Math.round((sec / 60 + 5) / 5) * 5;
  }

  function makeItem(ex, slot, style, lvl, first) {
    const kind = MG.SLOTS[slot].kind;
    return Object.assign(
      { slot, label: MG.SLOTS[slot].label, kind, id: ex.id, name: ex.name, cue: ex.cue, req: ex.req, bwLoad: !!ex.bwLoad, first: !!first },
      prescribe(ex, kind, style, lvl, first)
    );
  }

  function dayMinutes(exs) {
    const sec = exs.reduce((t, e) => t + e.sets * (e.workSec + e.restSec) + 60, 0);
    return Math.round((sec / 60 + 5) / 5) * 5;
  }

  function equipmentFor(a, where) {
    const all = MG.EQUIPMENT.map((e) => e.id);
    if (a.location === 'both') return where === 'gym' ? all : a.equipment || [];
    return a.equipment || (a.location === 'gym' ? all : []);
  }

  /* Weekly sets per muscle for a list of days (exercises with real set counts). */
  P.weeklySets = function (days) {
    const t = {};
    P.MUSCLES.forEach((m) => (t[m] = 0));
    days.forEach((d) => d.exercises.forEach((e) => {
      for (const [m, f] of Object.entries(HITS[e.slot] || {})) t[m] += f * e.sets;
    }));
    return t;
  };

  /* The 4-week block: weeks 1-2 use phase A, weeks 3-4 phase B. Phase B keeps every session's structure and
     main lift, and swaps each other exercise for a variation that trains the same muscle, never an easier one. */
  const BLOCK_WEEKS = 4;
  P.BLOCK_WEEKS = BLOCK_WEEKS;

  /* ---------- phase A: choose the slots for the whole week, then the exercises ---------- */
  function buildPhaseA(a) {
    const phys = P.physique(a);
    const style = phys.style;
    const lvl = LEVEL[a.experience] || 0;
    const days = clamp(a.days, 2, 6);
    const split = splitFor(a, phys);
    const count = COUNT_FOR_MIN[a.minutes] || 6;
    const homeDays = a.location === 'both' ? clamp(a.homeDays == null ? Math.floor(days / 2) : a.homeDays, 0, days) : 0;
    const emph = phys.emph || {};

    // 1. Each day's setting, equipment and fixed opening lifts.
    const plan = split.map((key, i) => {
      const tpl = TEMPLATES[key];
      const where = a.location === 'both'
        ? (Math.floor(((i + 1) * homeDays) / days) > Math.floor((i * homeDays) / days) ? 'home' : 'gym')
        : a.location;
      const eqList = equipmentFor(a, where);
      const eq = new Set(eqList);
      const tail = style === 'lean' ? ['cardio'] : []; // conditioning finisher at the end
      const must = tpl.must.concat(style === 'athletic' ? ['core'] : []);
      const slots = [];
      must.forEach((s) => { const r = resolveSlot(s, eq, lvl); if (r && !slots.includes(r)) slots.push(r); });
      return { key, tpl, where, eq, eqList, slots, room: count - tail.length, tail };
    });
    const compoundsIn = (d) => d.slots.filter((s) => MG.SLOTS[s].kind === 'compound').length;
    const weekUses = (s) => plan.reduce((t, d) => t + d.slots.filter((x) => x === s).length, 0);
    const extrasOn = (d) => d.slots.filter((x) => UPPER_EXTRAS.includes(x)).length;

    // Open places are assumed to be half compound lifts, half isolation work, like a finished session.
    const filler = (d, n) => Array.from({ length: n }, (_, k) => (LEG_DAYS.includes(d.key) ? ['single_leg', 'calves'] : ['row', 'lateral'])[k % 2]);
    // Would the session still fit the user's time with this slot added? extraPlace: the slot gets a place of its own.
    const fits = (d, extra, extraPlace) => {
      const open = Math.max(0, d.room + (extraPlace ? 1 : 0) - d.slots.length - 1);
      return estMinutes(d.slots.concat(extra, filler(d, open), d.tail), style, lvl) <= a.minutes;
    };
    const fullDayFits = (d, extra) => fits(d, extra, true);
    // 1b. Shoulder-focused and strength goals get an overhead press when the session has time for it.
    //     Upper / lower weeks have none built in.
    if ((emph.side || 0) >= 1.2 || style === 'mass') {
      const hasPress = plan.some((d) => d.slots.includes('shoulder_press'));
      const day = !hasPress && ['upperB', 'upperA', 'fullB', 'fullA', 'fullC']
        .map((k) => plan.find((d) => d.key === k && d.slots.length < d.room && compoundsIn(d) < 4 && resolveSlot('shoulder_press', d.eq, lvl) === 'shoulder_press' && fits(d, 'shoulder_press', false)))
        .find(Boolean);
      if (day) day.slots.push('shoulder_press');
    }

    // 1c. Goals built around arms get two direct exercises a week for biceps and two for triceps, on different days
    //     (upper days first). Where a full session still fits the user's time, the arm exercise is an extra place,
    //     so it does not push out chest, back or shoulder work. Otherwise only the first one takes a regular place, and
    //     only for goals where arms are a headline muscle (not Big & Powerful, where back and legs come first).
    for (const [m, slot] of Object.entries(DIRECT_ARMS)) {
      if ((emph[m] || 0) < ARM_EMPH) continue;
      const order = plan.filter((d) => !LEG_DAYS.includes(d.key)).concat(plan.filter((d) => LEG_DAYS.includes(d.key)));
      for (const d of order) {
        const placed = weekUses(slot);
        if (placed >= 2) break;
        if (d.slots.includes(slot) || !d.tpl.pool.includes(slot)) continue;
        if (resolveSlot(slot, d.eq, lvl) !== slot) continue;
        if (LEG_DAYS.includes(d.key) && extrasOn(d) >= 2) continue;
        if (placed >= candidates(slot, d.eq, lvl).length * 2) continue;
        if (fullDayFits(d, slot)) { d.slots.push(slot); d.room += 1; }
        else if (placed === 0 && (emph[m] || 0) >= 1 && d.slots.length < d.room) d.slots.push(slot); // arms are a headline muscle
      }
    }

    // 2. Weekly targets per muscle, in proportion to the physique's emphasis.
    const capacity = plan.reduce((t, d) => t + d.room, 0) * estSets('row', style, lvl, false) * 1.35;
    const wSum = P.MUSCLES.reduce((t, m) => t + (emph[m] || 0), 0) || 1;
    const target = {};
    P.MUSCLES.forEach((m) => (target[m] = ((emph[m] || 0) / wSum) * capacity));
    const have = {};
    P.MUSCLES.forEach((m) => (have[m] = 0));
    const credit = (slot, first) => {
      const n = estSets(slot, style, lvl, first);
      for (const [m, f] of Object.entries(HITS[slot] || {})) have[m] += f * n;
    };
    plan.forEach((d) => d.slots.forEach((s, k) => credit(s, k === 0)));

    // 3. Fill the free places one round at a time across all days, always with the slot that best closes the
    //    biggest gaps against the targets. Rounds keep the week balanced instead of front-loading Monday.
    const score = (slot) => P.MUSCLES.reduce((t, m) => {
      const f = (HITS[slot] || {})[m] || 0;
      if (!f || !target[m]) return t;
      return t + f * Math.max(0, target[m] - have[m]) / target[m];
    }, 0);
    let progress = true;
    while (progress) {
      progress = false;
      for (const d of plan) {
        if (d.slots.length >= d.room) continue;
        let best = null, bestScore = 0;
        for (const s0 of d.tpl.pool) {
          const s = resolveSlot(s0, d.eq, lvl);
          if (!s || s === 'cardio') continue;
          const times = d.slots.filter((x) => x === s).length;
          const legDay = LEG_DAYS.includes(d.key);
          if (times >= (legDay && UPPER_EXTRAS.includes(s) ? 1 : REPEATABLE[s] || 1)) continue;
          if (legDay && UPPER_EXTRAS.includes(s) && d.slots.filter((x) => UPPER_EXTRAS.includes(x)).length >= 2) continue;
          // Each exercise at most twice a week: a slot with few options cannot be used more than that.
          if (weekUses(s) >= candidates(s, d.eq, lvl).length * 2) continue;
          if (MG.SLOTS[s].kind === 'compound' && compoundsIn(d) >= 4) continue;
          if (times && candidates(s, d.eq, lvl).length <= times) continue; // a repeat needs a second exercise
          const sc = score(s) * (times ? 0.8 : 1);
          if (sc > bestScore + 1e-9) { best = s; bestScore = sc; }
        }
        if (!best) {
          // Every target is met: use the remaining place on whatever the goal values most.
          for (const s0 of d.tpl.pool) {
            const s = resolveSlot(s0, d.eq, lvl);
            if (!s || s === 'cardio' || d.slots.includes(s)) continue;
            if (LEG_DAYS.includes(d.key) && UPPER_EXTRAS.includes(s) && d.slots.filter((x) => UPPER_EXTRAS.includes(x)).length >= 2) continue;
            if (weekUses(s) >= candidates(s, d.eq, lvl).length * 2) continue;
            const v = P.MUSCLES.reduce((t, m) => t + ((HITS[s] || {})[m] || 0) * (emph[m] || 0), 0);
            if (!best || v > bestScore) { best = s; bestScore = v; }
          }
        }
        if (best) { d.slots.push(best); credit(best, false); progress = true; }
      }
    }

    // 4. Pick exercises: least used across the week first, and a proper loaded lift as each day's main lift.
    const usage = {};
    return plan.map((d, i) => {
      const used = new Set();
      const picks = [];
      d.slots.concat(d.tail).forEach((slot) => {
        const c = candidates(slot, d.eq, lvl);
        const isMain = !picks.length && MG.SLOTS[slot].kind === 'compound';
        let best = null, bestScore = Infinity;
        c.forEach((ex, n) => {
          if (used.has(ex.id)) return;
          const sc = (usage[ex.id] || 0) * 100 + n + (ex.easy && lvl > 0 ? 500 : 0) + (isMain && (ex.noMain || ex.bwLoad) ? 300 : 0);
          if (sc < bestScore) { best = ex; bestScore = sc; }
        });
        if (!best) return;
        used.add(best.id);
        usage[best.id] = (usage[best.id] || 0) + 1;
        picks.push({ ex: best, slot });
      });
      // Main lift: the first compound, unless it is a weak choice and a better loaded compound is in the session.
      const isComp = (p) => MG.SLOTS[p.slot].kind === 'compound';
      const strong = (p) => isComp(p) && !p.ex.noMain && !p.ex.bwLoad;
      const firstComp = picks.findIndex(isComp);
      if (firstComp >= 0 && !strong(picks[firstComp])) {
        const better = picks.findIndex(strong);
        if (better > firstComp) picks.unshift(picks.splice(better, 1)[0]);
      }
      // Order: compounds, then isolation, then ab work, then the finisher.
      const rank = (p) => ({ compound: 0, iso: 1, core: 2, cardio: 3 }[MG.SLOTS[p.slot].kind]);
      picks.sort((x, y) => rank(x) - rank(y));
      let firstDone = false;
      const exercises = picks.map((p) => {
        const isFirst = !firstDone && isComp(p);
        if (isFirst) firstDone = true;
        return makeItem(p.ex, p.slot, style, lvl, isFirst);
      });
      return { tplName: d.tpl.name, weekday: DAY_MAP[days][i], where: d.where, eq: d.eqList, exercises, minutes: dayMinutes(exercises) };
    });
  }

  /* Name sessions, adding A / B when a day type appears more than once in the week. */
  function nameDays(daysOut) {
    const total = {}, seen = {};
    daysOut.forEach((d) => (total[d.tplName] = (total[d.tplName] || 0) + 1));
    daysOut.forEach((d) => {
      seen[d.tplName] = (seen[d.tplName] || 0) + 1;
      const suffix = total[d.tplName] > 1 ? ' ' + 'ABCD'[seen[d.tplName] - 1] : '';
      d.name = d.tplName.replace(' ·', suffix + ' ·') + (d.tplName.includes(' ·') ? '' : suffix);
      delete d.tplName;
    });
    return daysOut;
  }

  /* ---------- phase B: same sessions, different exercises ---------- */
  function buildPhaseB(a, daysA) {
    const phys = P.physique(a);
    const lvl = LEVEL[a.experience] || 0;
    const avoid = new Set(daysA.flatMap((d) => d.exercises.map((e) => e.id)));
    const usage = {};
    return daysA.map((dA) => {
      const eq = new Set(dA.eq);
      const used = new Set();
      // Fill the most constrained slots first, so an exercise that is the only option for one slot is not
      // taken by another slot that had alternatives (for example Chin-Up as both a lat and a biceps exercise).
      // Loaded exercises choose before bodyweight ones, so a bodyweight slot cannot take the only loaded option.
      const order = dA.exercises.map((e, k) => k).sort((x, y) => (dA.exercises[y].first - dA.exercises[x].first)
        || (dA.exercises[x].bwLoad - dA.exercises[y].bwLoad)
        || candidates(dA.exercises[x].slot, eq, lvl).length - candidates(dA.exercises[y].slot, eq, lvl).length);
      const out = new Array(dA.exercises.length);
      order.forEach((k) => { const itemA = dA.exercises[k]; out[k] = (() => {
        let ex = null;
        if (itemA.first) ex = (MG.EX[itemA.slot] || []).find((e) => e.id === itemA.id); // keep the main lift
        if (!ex) {
          let bestScore = Infinity;
          const list = candidates(itemA.slot, eq, lvl);
          const nA = Math.max(0, list.findIndex((c) => c.id === itemA.id));
          // For the muscles the goal is built around, do not trade the best lift for a clearly weaker one.
          const priority = (phys.emph || {})[MAIN_MUSCLE(itemA.slot)] >= 1.4;
          list.forEach((c, n) => {
            if (used.has(c.id)) return;
            const weaker = priority && n - nA >= 2 ? 1500 : 0;
            const repeats = (usage[c.id] || 0) >= 2 ? 3000 : (usage[c.id] || 0) * 100; // at most twice a week
            const downgrade = !itemA.bwLoad && c.bwLoad; // never swap a loaded exercise for an unloaded one
            const sc = repeats + n + weaker + (c.id === itemA.id ? 2000 : avoid.has(c.id) ? 1000 : 0) + (downgrade ? 5000 : 0) + (c.easy && lvl > 0 ? 500 : 0);
            if (sc < bestScore) { ex = c; bestScore = sc; }
          });
        }
        if (!ex) ex = (MG.EX[itemA.slot] || []).find((e) => e.id === itemA.id);
        if (used.has(ex.id)) ex = candidates(itemA.slot, eq, lvl).find((c) => !used.has(c.id) && (itemA.bwLoad || !c.bwLoad)) || ex;
        used.add(ex.id);
        usage[ex.id] = (usage[ex.id] || 0) + 1;
        return makeItem(ex, itemA.slot, phys.style, lvl, itemA.first);
      })(); });
      const exercises = out;
      return { name: dA.name, weekday: dA.weekday, where: dA.where, eq: dA.eq, exercises, minutes: dayMinutes(exercises) };
    });
  }

  /* Make sure enough sessions a week contain ab work. Short sessions get it in place of the isolation exercise
     the goal values least, so the session does not get longer. */
  function ensureAbs(daysOut, a, count) {
    const phys = P.physique(a);
    const lvl = LEVEL[a.experience] || 0;
    const emph = phys.emph || {};
    const need = Math.min(daysOut.length, phys.abs || 2);
    const has = (d) => d.exercises.some((e) => e.slot === 'core');
    const usage = {};
    daysOut.forEach((d) => d.exercises.forEach((e) => (usage[e.id] = (usage[e.id] || 0) + 1)));
    while (daysOut.filter(has).length < need) {
      // The session furthest (in days of the week) from one that already has ab work, so it is spread out.
      const withCore = daysOut.filter(has).map((d) => d.weekday);
      const gap = (d) => (withCore.length ? Math.min(...withCore.map((w) => Math.min(Math.abs(w - d.weekday), 7 - Math.abs(w - d.weekday)))) : 7);
      const target = daysOut.filter((d) => !has(d)).sort((x, y) => gap(y) - gap(x) || x.weekday - y.weekday)[0];
      if (!target) break;
      const taken = new Set(target.exercises.map((e) => e.id));
      const c = candidates('core', new Set(target.eq), lvl).filter((ex) => !taken.has(ex.id));
      if (!c.length) break;
      const ex = c.slice().sort((x, y) => (usage[x.id] || 0) - (usage[y.id] || 0))[0];
      usage[ex.id] = (usage[ex.id] || 0) + 1;
      const list = target.exercises;
      if (list.length >= count) {
        const isos = list.map((e, k) => ({ e, k })).filter((x) => x.e.kind === 'iso');
        if (isos.length) {
          const drop = isos.sort((x, y) => (emph[MAIN_MUSCLE(x.e.slot)] || 0) - (emph[MAIN_MUSCLE(y.e.slot)] || 0) || y.k - x.k)[0].k;
          list.splice(drop, 1);
        }
      }
      const item = makeItem(ex, 'core', phys.style, lvl, false);
      const cardioAt = list.findIndex((e) => e.slot === 'cardio');
      if (cardioAt >= 0) list.splice(cardioAt, 0, item); else list.push(item);
      target.minutes = dayMinutes(list);
    }
  }

  /* Bump this whenever the way programs are built changes, so saved plans can be offered an update.
     1 = first release, 2 = 4-week blocks and guaranteed ab work, 3 = per-physique muscle emphasis,
     4 = direct arm work for arm goals, an overhead press for shoulder goals, one lateral raise per session, band options. */
  P.WORKOUT_VERSION = 4;
  P.isOutdated = (workout) => !!workout && (workout.version || 1) < P.WORKOUT_VERSION;
  /* A fresh program from the same answers. The block keeps its start date so the week count carries on. */
  P.upgradeWorkout = function (old, a) {
    const w = P.workout(a);
    if (old && old.start) w.start = old.start;
    return w;
  };

  P.workout = function (a) {
    const phys = P.physique(a);
    const days = clamp(a.days, 2, 6);
    const split = splitFor(a, phys);
    const daysA = nameDays(buildPhaseA(a));
    ensureAbs(daysA, a, COUNT_FOR_MIN[a.minutes] || 6);
    const daysB = buildPhaseB(a, daysA);
    const splitName = split.every((k) => k.startsWith('full')) ? 'Full Body ×' + days
      : phys.focus === 'glutes' ? 'Lower-body focus split' : SPLIT_NAMES[days];
    return { splitName, style: phys.style, days: daysA, daysB, version: P.WORKOUT_VERSION, notes: equipmentNotes(a, phys, daysA) };
  };

  /* Muscles the goal is built around that the chosen equipment cannot train, with what would fix it. */
  const MUSCLE_NAMES = { chest: 'chest', back: 'back', front: 'front shoulders', side: 'side delts', rear: 'rear delts', bi: 'biceps', tri: 'triceps', quad: 'quads', ham: 'hamstrings', glute: 'glutes', calf: 'calves', abs: 'abs' };
  function equipmentNotes(a, phys, days) {
    const sets = P.weeklySets(days);
    const emph = phys.emph || {};
    const hasBands = a.location === 'gym' || (a.equipment || []).includes('bands');
    const notes = [];
    const missing = P.MUSCLES.filter((m) => (emph[m] || 0) >= 1 && sets[m] < 3);
    if (missing.includes('side') && !hasBands) {
      notes.push('Your equipment has nothing that trains the side delts, the part of the shoulder that makes them look wide. A light resistance band (about €10–15) adds lateral raises: tick Bands in your equipment and rebuild your plan.');
    }
    const rest = missing.filter((m) => !(m === 'side' && !hasBands));
    if (rest.length) {
      notes.push('Your equipment has little for your ' + rest.map((m) => MUSCLE_NAMES[m]).join(' and ') + ', which this goal is built around. A pair of dumbbells or a resistance band would cover it.');
    }
    return notes;
  }

  /* Plans saved before blocks existed have one phase and may lack ab work: add both, keeping the user's swaps. */
  P.ensureBlock = function (workout, a) {
    if (!workout) return workout;
    ensureAbs(workout.days, a, COUNT_FOR_MIN[a.minutes] || 6);
    if (!workout.daysB) workout.daysB = buildPhaseB(a, workout.days);
    return workout;
  };

  /* Which week of the 4-week block a date falls in, counting from the Monday the plan started. */
  const dayNum = (k) => { const p = k.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000; };
  P.blockWeek = function (startKey, todayKey) {
    // A date before the start (phone clock changed) counts as week 1.
    const weeks = startKey && todayKey ? Math.max(0, Math.floor((dayNum(todayKey) - dayNum(startKey)) / 7)) : 0;
    const week = (weeks % BLOCK_WEEKS) + 1;
    return { week, phase: week <= 2 ? 0 : 1, block: Math.floor(weeks / BLOCK_WEEKS) + 1 };
  };
  P.phaseDays = (workout, phase) => (phase === 1 && workout.daysB ? workout.daysB : workout.days);
  P.PHASE_WEEKS = ['Weeks 1–2', 'Weeks 3–4'];

  /* Replace one exercise with the next alternative that fits the same slot and equipment. */
  P.swapExercise = function (workout, a, dayIdx, exIdx, phase) {
    const day = P.phaseDays(workout, phase || 0)[dayIdx];
    const cur = day.exercises[exIdx];
    const lvl = LEVEL[a.experience] || 0;
    const c = candidates(cur.slot, new Set(day.eq), lvl);
    const taken = new Set(day.exercises.map((e) => e.id));
    const start = Math.max(0, c.findIndex((e) => e.id === cur.id));
    for (let n = 1; n <= c.length; n++) {
      const ex = c[(start + n) % c.length];
      if (!taken.has(ex.id)) {
        day.exercises[exIdx] = makeItem(ex, cur.slot, workout.style, lvl, cur.first);
        day.minutes = dayMinutes(day.exercises);
        return true;
      }
    }
    return false;
  };

  /* ================= MEAL PLAN ================= */

  P.banned = function (a) {
    const diet = MG.DIETS.find((d) => d.id === a.diet) || MG.DIETS[0];
    return new Set(diet.ban.concat(a.restrictions || []));
  };

  function resolveFood(id, ban) {
    const ok = (x) => !(MG.FOODS[x].tags || []).some((t) => ban.has(t));
    if (ok(id)) return id;
    for (const s of MG.FOODS[id].sub || []) {
      if (s === 'omit') return 'omit';
      if (ok(s)) return s;
    }
    return null;
  }

  /* When an ingredient is replaced, rename the dish to match what is actually on the plate. */
  const NAME_SWAPS = {
    almond_butter: [/peanut butter/i, 'almond butter'], sunflower_butter: [/peanut butter/i, 'sunflower butter'],
    pumpkin_seeds: [/almonds/i, 'pumpkin seeds'], maple_syrup: [/honey/i, 'maple syrup'],
  };

  function resolveRecipe(r, ban) {
    const ing = [];
    const changes = [];
    let name = r.n, omitted = false;
    for (const [food, g, role] of r.ing) {
      const res = resolveFood(food, ban);
      if (res === null) return null;
      if (res === 'omit') { changes.push(MG.FOODS[food].n.toLowerCase() + ' left out'); omitted = true; continue; }
      if (res !== food) {
        changes.push(MG.FOODS[food].n.toLowerCase() + ' → ' + MG.FOODS[res].n.toLowerCase());
        if (NAME_SWAPS[res]) name = name.replace(NAME_SWAPS[res][0], NAME_SWAPS[res][1]);
      }
      ing.push({ food: res, g, role, swapped: res !== food });
    }
    if (!ing.some((i) => i.role !== 'v')) return null;
    if (omitted && r.alt) name = r.alt;
    name = name.charAt(0).toUpperCase() + name.slice(1);
    return { id: r.id, t: r.t, n: name, how: r.how, min: r.min, ing, changes };
  }

  P.pools = function (a) {
    const ban = P.banned(a);
    const all = MG.RECIPES.map((r) => resolveRecipe(r, ban)).filter(Boolean);
    // 'quick' keeps to meals of 10 minutes or less, widening only if the restrictions leave too few of them.
    const ofType = (t) => {
      const list = all.filter((r) => r.t === t);
      if (a.cook !== 'quick') return list;
      const need = t === 'm' ? 4 : 2;
      for (const cap of [10, 15, 20]) {
        const quick = list.filter((r) => r.min <= cap);
        if (quick.length >= need) return quick;
      }
      return list;
    };
    const pools = { b: ofType('b'), m: ofType('m'), s: ofType('s') };
    if (!pools.b.length) pools.b = pools.s.length ? pools.s : pools.m;
    if (!pools.s.length) pools.s = pools.b;
    if (!pools.m.length) pools.m = pools.b;
    return pools;
  };

  const MEAL_LAYOUT = {
    3: [['Breakfast', 'b'], ['Lunch', 'm'], ['Dinner', 'm']],
    4: [['Breakfast', 'b'], ['Lunch', 'm'], ['Afternoon snack', 's'], ['Dinner', 'm']],
    5: [['Breakfast', 'b'], ['Mid-morning snack', 's'], ['Lunch', 'm'], ['Afternoon snack', 's'], ['Dinner', 'm']],
    6: [['Breakfast', 'b'], ['Mid-morning snack', 's'], ['Lunch', 'm'], ['Afternoon snack', 's'], ['Dinner', 'm'], ['Evening snack', 's']],
  };

  function roundAmount(foodId, grams) {
    const f = MG.FOODS[foodId];
    if (f.unit) {
      const n = Math.max(f.unit.step, Math.round(grams / f.unit.g / f.unit.step) * f.unit.step);
      return { g: n * f.unit.g, n };
    }
    const step = grams >= 200 ? 10 : 5;
    return { g: Math.max(5, Math.round(grams / step) * step) };
  }

  P.amountText = function (foodId, g) {
    const f = MG.FOODS[foodId];
    if (f.unit) {
      const n = Math.round((g / f.unit.g) * 2) / 2;
      const nText = n === 0.5 ? '½' : n % 1 ? Math.floor(n) + '½' : String(n);
      return nText + ' ' + (n <= 1 ? f.unit.one : f.unit.many) + ' (' + Math.round(g) + ' g)';
    }
    return Math.round(g) + (f.ml ? ' ml' : ' g');
  };

  function sum(items) {
    const t = { kcal: 0, p: 0, c: 0, f: 0 };
    items.forEach((it) => {
      const f = MG.FOODS[it.food];
      t.kcal += (f.k * it.g) / 100; t.p += (f.p * it.g) / 100; t.c += (f.c * it.g) / 100; t.f += (f.f * it.g) / 100;
    });
    return t;
  }
  const round = (t) => ({ kcal: Math.round(t.kcal), p: Math.round(t.p), c: Math.round(t.c), f: Math.round(t.f) });

  /* Scale the protein group and the energy group separately so the day lands on both calories and protein. */
  function solveDay(recipes, labels, target, ban) {
    let Kp = 0, Pp = 0, Ke = 0, Pe = 0, Kv = 0, Pv = 0;
    recipes.forEach((r) => r.ing.forEach((i) => {
      const f = MG.FOODS[i.food];
      const k = (f.k * i.g) / 100, p = (f.p * i.g) / 100;
      if (i.role === 'p') { Kp += k; Pp += p; } else if (i.role === 'e') { Ke += k; Pe += p; } else { Kv += k; Pv += p; }
    }));
    const LO_P = 0.4, LO_E = 0.3, HI = 2.8;
    const solve = (Kt, Pt) => {
      let sp, se;
      const det = Pp * Ke - Pe * Kp;
      if (Kp > 0 && Ke > 0 && Math.abs(det) > 1e-6) {
        sp = (Pt * Ke - Pe * Kt) / det;
        se = (Pp * Kt - Pt * Kp) / det;
        if (sp < LO_P || sp > HI) { sp = clamp(sp, LO_P, HI); se = (Kt - sp * Kp) / Ke; }
        if (se < LO_E || se > HI) { se = clamp(se, LO_E, HI); sp = clamp((Kt - se * Ke) / Kp, LO_P, HI); }
      } else {
        sp = se = clamp(Kt / (Kp + Ke), LO_E, HI);
      }
      return { sp, se };
    };
    let { sp, se } = solve(target.kcal - Kv, target.protein - Pv);

    // Food alone cannot always reach the protein target (small calorie budgets, plant-only diets).
    // In that case add a measured scoop of protein powder and re-balance the food around it.
    let topup = 0;
    const powder = resolveFood('whey', ban || new Set());
    const short = target.protein - (sp * Pp + se * Pe + Pv);
    if (short > 10 && powder && powder !== 'omit') {
      const pf = MG.FOODS[powder];
      topup = clamp(Math.round(short / (pf.p / 100) / 5) * 5, 10, 75);
      ({ sp, se } = solve(target.kcal - Kv - (topup * pf.k) / 100, target.protein - Pv - (topup * pf.p) / 100));
    }

    const meals = recipes.map((r, n) => ({
      label: labels[n][0], type: labels[n][1], id: r.id, name: r.n, how: r.how, min: r.min, changes: r.changes,
      items: r.ing.map((i) => {
        const raw = i.g * (i.role === 'p' ? sp : i.role === 'e' ? se : 1);
        return { food: i.food, role: i.role, swapped: i.swapped, g: roundAmount(i.food, raw).g };
      }),
    }));

    if (topup) {
      const host = meals.map((m) => ({ m, p: sum(m.items).p, pref: m.type === 'm' ? 1 : 0 }))
        .sort((x, y) => x.pref - y.pref || x.p - y.p)[0].m;
      const existing = host.items.find((i) => i.food === powder);
      if (existing) existing.g += topup;
      else host.items.push({ food: powder, role: 'p', swapped: false, g: topup, topup: true });
    }

    // Rounding to whole eggs and slices drifts the total, so nudge the loose carb and fat sources.
    const all = meals.flatMap((m) => m.items);
    let diff = target.kcal - sum(all).kcal;
    const adjustable = all.filter((i) => i.role === 'e' && !MG.FOODS[i.food].unit)
      .sort((x, y) => MG.FOODS[y.food].k * y.g - MG.FOODS[x.food].k * x.g);
    for (const it of adjustable) {
      if (Math.abs(diff) <= 25) break;
      const f = MG.FOODS[it.food];
      const lo = Math.max(5, Math.round((it.g * 0.6) / 5) * 5), hi = Math.round((it.g * 1.6) / 5) * 5;
      const next = clamp(it.g + Math.round(((diff / f.k) * 100) / 5) * 5, lo, hi);
      diff -= ((next - it.g) * f.k) / 100;
      it.g = next;
    }

    meals.forEach((m) => Object.assign(m, round(sum(m.items))));
    const total = round(sum(all));
    return { meals, total, sp, se, topup };
  }

  function scoreDay(day, target) {
    const t = day.total;
    return 3 * Math.abs(t.kcal - target.kcal) / target.kcal
      + 4 * Math.abs(t.p - target.protein) / target.protein
      + Math.abs(t.f - target.fat) / target.fat
      + 0.2 * Math.abs(Math.log(day.sp / day.se))
      + day.topup / 200;
  }

  P.meals = function (a, target, seed) {
    const pools = P.pools(a);
    const ban = P.banned(a);
    const layout = MEAL_LAYOUT[clamp(a.meals || 4, 3, 6)];
    const rand = rng(seed || 1);
    const weekUse = {};
    let yesterday = new Set();
    const days = [];

    for (let d = 0; d < 7; d++) {
      let best = null, bestScore = Infinity;
      for (let attempt = 0; attempt < 400; attempt++) {
        const chosen = [];
        const ids = new Set();
        let ok = true;
        for (const [, type] of layout) {
          const pool = pools[type];
          let r = null;
          for (let tries = 0; tries < 8 && !r; tries++) {
            const c = pool[Math.floor(rand() * pool.length)];
            if (!ids.has(c.id)) r = c;
          }
          if (!r) r = pool.find((c) => !ids.has(c.id)) || pool[0];
          if (!r) { ok = false; break; }
          ids.add(r.id);
          chosen.push(r);
        }
        if (!ok) break;
        const day = solveDay(chosen, layout, target, ban);
        let sc = scoreDay(day, target);
        // Accuracy beats variety: a day that misses calories or protein is heavily penalised.
        const kErr = Math.abs(day.total.kcal - target.kcal) / target.kcal;
        const pErr = Math.abs(day.total.p - target.protein) / target.protein;
        if (kErr > 0.03) sc += 5 + 20 * kErr;
        if (pErr > 0.08) sc += 3 + 10 * pErr;
        chosen.forEach((r) => { sc += 0.06 * (weekUse[r.id] || 0) + (yesterday.has(r.id) ? 0.25 : 0); });
        // avoid the same staple twice in one day (salmon for lunch and dinner, sweet potato twice...)
        const staples = new Set();
        chosen.filter((r) => r.t === 'm').forEach((r) => r.ing.forEach((i) => {
          if (i.role === 'v' || i.food === 'olive_oil') return;
          if (staples.has(i.food)) sc += 0.12;
          staples.add(i.food);
        }));
        if (sc < bestScore) { best = day; bestScore = sc; }
      }
      if (!best) throw new Error('No meals fit these restrictions.');
      best.meals.forEach((m) => (weekUse[m.id] = (weekUse[m.id] || 0) + 1));
      yesterday = new Set(best.meals.map((m) => m.id));
      days.push({ meals: best.meals, total: best.total });
    }
    return { days, layout: layout.map((l) => l[0]) };
  };

  /* Swap one meal for the next allowed recipe of the same kind, then re-balance that day. */
  P.swapMeal = function (mealPlan, a, target, dayIdx, mealIdx) {
    const pools = P.pools(a);
    const layout = MEAL_LAYOUT[clamp(a.meals || 4, 3, 6)];
    const day = mealPlan.days[dayIdx];
    const type = layout[mealIdx][1];
    const pool = pools[type];
    const taken = new Set(day.meals.map((m) => m.id));
    const start = Math.max(0, pool.findIndex((r) => r.id === day.meals[mealIdx].id));
    let next = null;
    for (let n = 1; n <= pool.length && !next; n++) {
      const r = pool[(start + n) % pool.length];
      if (!taken.has(r.id)) next = r;
    }
    if (!next) return false;
    const byId = {};
    Object.values(pools).forEach((list) => list.forEach((r) => (byId[r.id] = r)));
    const recipes = day.meals.map((m, n) => (n === mealIdx ? next : byId[m.id])).filter(Boolean);
    if (recipes.length !== day.meals.length) return false;
    const solved = solveDay(recipes, layout, target, P.banned(a));
    mealPlan.days[dayIdx] = { meals: solved.meals, total: solved.total };
    return true;
  };

  P.grocery = function (mealPlan) {
    const totals = {};
    mealPlan.days.forEach((d) => d.meals.forEach((m) => m.items.forEach((i) => (totals[i.food] = (totals[i.food] || 0) + i.g))));
    const cats = {};
    Object.keys(totals).forEach((id) => {
      const f = MG.FOODS[id];
      (cats[f.cat] = cats[f.cat] || []).push({ food: id, name: f.n, g: totals[id], text: P.amountText(id, totals[id]) });
    });
    Object.values(cats).forEach((list) => list.sort((x, y) => x.name.localeCompare(y.name)));
    return cats;
  };

  P.generate = function (a, seed) {
    const nutrition = P.nutrition(a);
    return { nutrition, workout: P.workout(a), meals: P.meals(a, nutrition, seed || 1), seed: seed || 1 };
  };
})(typeof window !== 'undefined' ? window : globalThis);
