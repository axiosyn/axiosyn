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
    const cfg = P.PACES[pace];
    const floor = a.sex === 'male' ? 1500 : 1200;
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

  const TEMPLATES = {
    fullA: { name: 'Full Body', slots: ['squat', 'chest_press', 'row', 'hinge', 'lateral', 'biceps', 'core', 'calves'] },
    fullB: { name: 'Full Body', slots: ['hinge', 'shoulder_press', 'vertical_pull', 'single_leg', 'chest_fly', 'triceps', 'core', 'rear_delt'] },
    fullC: { name: 'Full Body', slots: ['squat', 'chest_incline', 'row', 'ham_curl', 'shoulder_press', 'biceps', 'triceps', 'core'] },
    upperA: { name: 'Upper Body', slots: ['chest_press', 'row', 'shoulder_press', 'vertical_pull', 'lateral', 'triceps', 'biceps', 'rear_delt'] },
    upperB: { name: 'Upper Body', slots: ['vertical_pull', 'chest_incline', 'row', 'lateral', 'chest_fly', 'biceps', 'triceps', 'rear_delt'] },
    lowerA: { name: 'Lower Body', slots: ['squat', 'hinge', 'single_leg', 'ham_curl', 'calves', 'core', 'quad_iso', 'glute'] },
    lowerB: { name: 'Lower Body', slots: ['hinge', 'squat', 'single_leg', 'quad_iso', 'glute', 'calves', 'core', 'ham_curl'] },
    push: { name: 'Push · Chest, Shoulders, Triceps', slots: ['chest_press', 'shoulder_press', 'chest_incline', 'lateral', 'triceps', 'chest_fly', 'triceps', 'core'] },
    pull: { name: 'Pull · Back & Biceps', slots: ['vertical_pull', 'row', 'rear_delt', 'biceps', 'row', 'biceps', 'traps', 'core'] },
    legs: { name: 'Legs', slots: ['squat', 'hinge', 'single_leg', 'ham_curl', 'quad_iso', 'calves', 'core', 'glute'] },
    glutes: { name: 'Glutes & Hamstrings', slots: ['glute', 'hinge', 'single_leg', 'glute', 'ham_curl', 'calves', 'core', 'squat'] },
  };

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

  function candidates(slot, eq, lvl, seen) {
    seen = seen || new Set();
    if (seen.has(slot)) return [];
    seen.add(slot);
    const list = (MG.EX[slot] || []).filter((e) => hasReq(e.req, eq) && (e.lvl || 0) <= lvl);
    if (list.length) return list;
    const fb = MG.SLOTS[slot].fallback;
    return fb ? candidates(fb, eq, lvl, seen) : [];
  }
  P.candidates = candidates;

  function prescribe(ex, kind, style, lvl, first) {
    if (ex.intervals) return { sets: lvl === 0 ? 6 : 8, reps: '30 s hard', rest: '30–60 s easy', restSec: 45, workSec: 30 };
    if (ex.time) return { sets: 3, reps: lvl === 0 ? '20–40 s' : '40–60 s', rest: '45 s', restSec: 45, workSec: 45 };
    let sets, reps, restSec;
    if (kind === 'compound') {
      sets = [3, 3, 4][lvl] + (style === 'mass' && first && lvl > 0 ? 1 : 0);
      reps = { mass: first ? '5–8' : '6–10', hyp: first ? '6–10' : '8–12', athletic: first ? '5–8' : '8–10', lean: '10–12' }[style];
      restSec = { mass: first ? 180 : 120, hyp: first ? 150 : 90, athletic: first ? 120 : 90, lean: 75 }[style];
      if (ex.bwLoad) reps = '6–15';
      if (ex.id === 'Barbell_Deadlift') reps = style === 'lean' ? '6–8' : first ? '4–6' : '5–8';
    } else if (kind === 'iso') {
      sets = [2, 3, 3][lvl] + (lvl === 2 && (style === 'hyp' || style === 'mass') ? 1 : 0);
      reps = { mass: '10–12', hyp: '12–15', athletic: '10–15', lean: '15–20' }[style];
      restSec = style === 'lean' ? 45 : 60;
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

  P.workout = function (a) {
    const phys = P.physique(a);
    const lvl = LEVEL[a.experience] || 0;
    const days = clamp(a.days, 2, 6);
    const split = splitFor(a, phys);
    const count = COUNT_FOR_MIN[a.minutes] || 6;
    const homeDays = a.location === 'both' ? clamp(a.homeDays == null ? Math.floor(days / 2) : a.homeDays, 0, days) : 0;
    const usage = {};
    const seenTpl = {};
    const totalTpl = {};
    split.forEach((k) => (totalTpl[TEMPLATES[k].name] = (totalTpl[TEMPLATES[k].name] || 0) + 1));

    const out = split.map((key, i) => {
      const tpl = TEMPLATES[key];
      let where = a.location === 'both'
        ? (Math.floor(((i + 1) * homeDays) / days) > Math.floor((i * homeDays) / days) ? 'home' : 'gym')
        : a.location;
      const eqList = equipmentFor(a, where);
      const eq = new Set(eqList);

      let slots = tpl.slots.slice();
      if (phys.focus === 'glutes' && !slots.includes('glute')) slots.splice(3, 0, 'glute');
      const ends = phys.style === 'lean' ? ['cardio'] : phys.style === 'athletic' ? ['core'] : [];
      const boost = phys.boost || [];
      const ranked = slots
        .map((s, idx) => ({ s, idx, pr: boost.includes(s) ? Math.min(idx, 3.5) : idx }))
        .filter((x) => !ends.includes(x.s))
        .sort((x, y) => x.pr - y.pr || x.idx - y.idx);

      const usedToday = new Set();
      const pick = (slot) => {
        const c = candidates(slot, eq, lvl);
        let best = null, bestScore = Infinity;
        c.forEach((ex, n) => {
          if (usedToday.has(ex.id)) return;
          const sc = (usage[ex.id] || 0) * 100 + n;
          if (sc < bestScore) { best = ex; bestScore = sc; }
        });
        if (best) { usedToday.add(best.id); usage[best.id] = (usage[best.id] || 0) + 1; }
        return best;
      };

      const chosen = [];
      for (const r of ranked) {
        if (chosen.length >= count - ends.length) break;
        const ex = pick(r.s);
        if (ex) chosen.push({ ex, slot: r.s, idx: r.idx });
      }
      // Safety net: if the equipment cannot fill this session, pad it with whatever useful work is possible.
      const want = Math.min(count - ends.length, 4);
      for (const s of ['core', 'hinge', 'single_leg', 'chest_press', 'glute', 'squat', 'core', 'cardio']) {
        if (chosen.length >= want) break;
        if (ends.includes(s)) continue;
        const ex = pick(s);
        if (ex) chosen.push({ ex, slot: s, idx: 50 + chosen.length });
      }
      chosen.sort((x, y) => x.idx - y.idx);
      ends.forEach((s) => { const ex = pick(s); if (ex) chosen.push({ ex, slot: s, idx: 99 }); });

      let firstDone = false;
      const exercises = chosen.map(({ ex, slot }) => {
        const isFirst = !firstDone && MG.SLOTS[slot].kind === 'compound';
        if (isFirst) firstDone = true;
        return makeItem(ex, slot, phys.style, lvl, isFirst);
      });

      seenTpl[tpl.name] = (seenTpl[tpl.name] || 0) + 1;
      const suffix = totalTpl[tpl.name] > 1 ? ' ' + 'ABCD'[seenTpl[tpl.name] - 1] : '';
      return {
        name: tpl.name.replace(' ·', suffix + ' ·') + (tpl.name.includes(' ·') ? '' : suffix),
        weekday: DAY_MAP[days][i], where, eq: eqList, exercises, minutes: dayMinutes(exercises),
      };
    });

    const splitName = split.every((k) => k.startsWith('full')) ? 'Full Body ×' + days
      : phys.focus === 'glutes' ? 'Lower-body focus split' : SPLIT_NAMES[days];
    return { splitName, style: phys.style, days: out };
  };

  /* Replace one exercise with the next alternative that fits the same slot and equipment. */
  P.swapExercise = function (workout, a, dayIdx, exIdx) {
    const day = workout.days[dayIdx];
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
