/* Questionnaire and results UI. Plan logic lives in planner.js, progress data in tracker.js. */
(function () {
  const MG = window.MG, P = MG.planner, T = MG.tracker;
  const app = document.getElementById('app');
  const topActions = document.getElementById('top-actions');
  const KEY = 'musclegain.v1';
  const ALL_EQ = MG.EQUIPMENT.map((e) => e.id);
  const NUM_FIELDS = ['days', 'homeDays', 'minutes', 'meals'];
  const STEPS = ['About you', 'Goal physique', 'Training', 'Diet'];
  const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const EQ_NAME = { db: 'Dumbbells', bb: 'Barbell', bench: 'Bench', rack: 'Rack', bar: 'Pull-up bar', dip: 'Dip bars', kb: 'Kettlebell', bands: 'Bands', cable: 'Cable', mach: 'Machine', bw: 'Bodyweight' };
  const EX_META = {};
  Object.values(MG.EX).forEach((list) => list.forEach((e) => (EX_META[e.id] = { name: e.name, time: !!e.time })));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const defaults = () => ({
    sex: null, age: '', heightCm: '', weightKg: '', activity: 'desk', experience: 'beginner',
    physique: null, pace: 'auto',
    location: null, days: 4, homeDays: 2, minutes: 60, gymEq: ALL_EQ.slice(), homeEq: [],
    diet: 'omnivore', restrictions: [], meals: 4, cook: 'normal', kcalAdjust: 0, adjustedOn: null,
  });

  let state = { step: 0, units: 'metric', a: defaults(), plan: null, tab: 'overview', mealDay: T.weekdayIdx(), logDay: null, viewPhase: null, errors: {} };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.a) state = Object.assign(state, s, { a: Object.assign(defaults(), s.a), errors: {} });
    } catch (e) { /* first visit or storage blocked */ }
  }
  function save() {
    try {
      const { step, units, a, plan, tab, mealDay, logDay, viewPhase } = state;
      localStorage.setItem(KEY, JSON.stringify({ step, units, a, plan, tab, mealDay, logDay, viewPhase }));
    } catch (e) { /* storage blocked: the site still works, it just forgets on reload */ }
  }

  function answers() {
    const a = state.a;
    return Object.assign({}, a, {
      age: +a.age, heightCm: +a.heightCm, weightKg: +a.weightKg,
      equipment: a.location === 'gym' ? a.gymEq : a.homeEq,
      homeDays: Math.max(1, Math.min(a.days - 1, a.homeDays)),
    });
  }
  const statsValid = () => {
    const a = answers();
    return a.sex && a.age >= 14 && a.age <= 90 && a.heightCm >= 120 && a.heightCm <= 230 && a.weightKg >= 35 && a.weightKg <= 250;
  };

  /* ---------- units and dates ---------- */
  const isImp = () => state.units === 'imperial';
  const wUnit = () => (isImp() ? 'lb' : 'kg');
  const toDisp = (kg) => (isImp() ? Math.round(kg * 2.20462 * 2) / 2 : Math.round(kg * 10) / 10);
  const fromDisp = (v) => (isImp() ? v / 2.20462 : v);
  const today = () => T.dateKey();
  /* 4-week blocks: weeks 1-2 use phase A, weeks 3-4 phase B. viewPhase null means follow the calendar. */
  const blockNow = () => P.blockWeek(state.plan && state.plan.workout.start, today());
  const viewPhase = () => (state.viewPhase == null ? blockNow().phase : state.viewPhase);
  const phaseDays = (ph) => P.phaseDays(state.plan.workout, ph == null ? viewPhase() : ph);
  const fmtDate = (k) => T.parse(k).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const fmtSet = (s, timed) => (s.w > 0 ? toDisp(s.w) + ' ' + wUnit() + ' × ' + s.r : s.r + (timed ? ' s' : ' reps'));

  /* ---------- small builders ---------- */
  const choice = (field, val, title, desc) =>
    `<button type="button" class="choice ${state.a[field] === val ? 'on' : ''}" data-set="${field}" data-val="${val}" aria-pressed="${state.a[field] === val}"><b>${esc(title)}</b>${desc ? `<small>${esc(desc)}</small>` : ''}</button>`;
  const pill = (field, val, text, small) =>
    `<button type="button" class="pill ${state.a[field] === val ? 'on' : ''}" data-set="${field}" data-val="${val}" aria-pressed="${state.a[field] === val}">${esc(text)}${small ? `<small>${esc(small)}</small>` : ''}</button>`;
  const err = (k) => (state.errors[k] ? `<div class="error">${esc(state.errors[k])}</div>` : '');
  const num = (field, value, unit, ph) =>
    `<div class="input"><input type="number" inputmode="decimal" data-field="${field}" value="${value === '' || value == null ? '' : value}" placeholder="${ph || ''}" aria-label="${field}"><span>${unit}</span></div>`;

  /* ---------- wizard steps ---------- */
  function stepAbout() {
    const a = state.a, imp = isImp();
    const totalIn = a.heightCm ? Math.round(a.heightCm / 2.54) : null;
    return `
      <div class="field">
        <div class="label">Sex <span class="hint">Used for the calorie calculation</span></div>
        <div class="choices">${choice('sex', 'male', 'Male')}${choice('sex', 'female', 'Female')}</div>${err('sex')}
      </div>
      <div class="field">
        <div class="label">Your numbers
          <span class="seg" style="margin-left:10px" role="group" aria-label="Units">
            <button type="button" class="${imp ? '' : 'on'}" data-action="units" data-val="metric">kg / cm</button>
            <button type="button" class="${imp ? 'on' : ''}" data-action="units" data-val="imperial">lb / ft</button>
          </span>
        </div>
        <div class="row">
          <div><label class="hint" style="margin:0 0 6px;display:block">Age</label>${num('age', a.age, 'years', '28')}</div>
          <div><label class="hint" style="margin:0 0 6px;display:block">Height</label>${imp
            ? `<div class="input-pair">${num('ft', totalIn ? Math.floor(totalIn / 12) : '', 'ft', '5')}${num('in', totalIn ? totalIn % 12 : '', 'in', '11')}</div>`
            : num('heightCm', a.heightCm ? Math.round(a.heightCm) : '', 'cm', '180')}</div>
          <div><label class="hint" style="margin:0 0 6px;display:block">Weight</label>${imp
            ? num('lb', a.weightKg ? Math.round(a.weightKg * 2.20462) : '', 'lb', '170')
            : num('weightKg', a.weightKg ? Math.round(a.weightKg * 10) / 10 : '', 'kg', '78')}</div>
        </div>${err('age')}${err('height')}${err('weight')}
      </div>
      <div class="field">
        <div class="label">Your day outside of training</div>
        <div class="choices">
          ${choice('activity', 'desk', 'Mostly sitting', 'Desk job, studying, driving')}
          ${choice('activity', 'feet', 'On my feet', 'Retail, teaching, lots of walking')}
          ${choice('activity', 'physical', 'Physical work', 'Construction, warehouse, farming')}
        </div>
      </div>
      <div class="field">
        <div class="label">Lifting experience</div>
        <div class="choices">
          ${choice('experience', 'beginner', 'Beginner', 'Under a year of consistent training')}
          ${choice('experience', 'intermediate', 'Intermediate', '1 to 3 years, know the main lifts')}
          ${choice('experience', 'advanced', 'Advanced', '3+ years of serious training')}
        </div>
      </div>`;
  }

  function stepPhysique() {
    const a = state.a;
    const list = MG.PHYSIQUES[a.sex] || MG.PHYSIQUES.male;
    let reco = '';
    if (a.physique && statsValid()) {
      const n = P.nutrition(Object.assign(answers(), { pace: 'auto' }));
      const pct = Math.round(P.PACES[n.autoPace].adj * 100);
      reco = `<div class="reco">For this physique at your current stats we recommend <b>${P.PACES[n.autoPace].name.toLowerCase()}</b> (${pct === 0 ? 'maintenance calories' : (pct > 0 ? '+' : '') + pct + '% calories'}). Leave it on Auto unless you have a reason to change it.</div>`;
    }
    return `
      <div class="field">
        <div class="phys-grid">
          ${list.map((p) => `
            <button type="button" class="phys ${a.physique === p.id ? 'on' : ''}" data-set="physique" data-val="${p.id}" aria-pressed="${a.physique === p.id}">
              <img src="${p.img}" alt="${esc(p.name)} physique example" loading="lazy">
              <span class="tick">✓</span>
              <span class="txt"><b>${esc(p.name)}</b><small>${esc(p.blurb)}</small></span>
            </button>`).join('')}
        </div>${err('physique')}
      </div>
      <div class="field">
        <div class="label">Calorie strategy</div>
        <div class="pills">
          ${pill('pace', 'auto', 'Auto', 'recommended')}${pill('pace', 'cut', 'Lose fat')}${pill('pace', 'recomp', 'Maintain & recomp')}${pill('pace', 'leanbulk', 'Lean bulk')}${pill('pace', 'bulk', 'Bulk')}
        </div>${reco}
      </div>`;
  }

  function stepTraining() {
    const a = state.a;
    const eqKey = a.location === 'gym' ? 'gymEq' : 'homeEq';
    const eqTitle = { gym: 'What does your gym have?', home: 'What equipment do you have at home?', both: 'What do you have at home?' }[a.location];
    const eqHint = { gym: 'Untick anything that is missing', home: 'Leave everything unticked for a bodyweight-only plan', both: 'Your gym days assume a fully equipped gym' }[a.location];
    const homeMax = a.days - 1;
    return `
      <div class="field">
        <div class="label">Where will you train?</div>
        <div class="choices">
          ${choice('location', 'gym', 'Gym', 'Commercial or well-equipped gym')}
          ${choice('location', 'home', 'Home', 'Whatever you have, even nothing')}
          ${choice('location', 'both', 'Both', 'Some days at the gym, some at home')}
        </div>${err('location')}
      </div>
      <div class="field">
        <div class="label">Training days per week</div>
        <div class="pills">${[2, 3, 4, 5, 6].map((d) => pill('days', d, d + ' days')).join('')}</div>
      </div>
      ${a.location === 'both' ? `
      <div class="field">
        <div class="label">How many of those at home?</div>
        <div class="pills">${Array.from({ length: homeMax }, (_, i) => i + 1).map((d) =>
          `<button type="button" class="pill ${Math.min(a.homeDays, homeMax) === d ? 'on' : ''}" data-set="homeDays" data-val="${d}">${d} home · ${a.days - d} gym</button>`).join('')}</div>
      </div>` : ''}
      <div class="field">
        <div class="label">Time per session</div>
        <div class="pills">${[30, 45, 60, 75, 90].map((m) => pill('minutes', m, m + ' min')).join('')}</div>
      </div>
      ${a.location ? `
      <div class="field">
        <div class="label">${eqTitle} <span class="hint">${eqHint}</span></div>
        ${a.location !== 'gym' ? `<div class="presets">
          <button type="button" class="btn btn-ghost btn-xs" data-action="preset" data-val="">Bodyweight only</button>
          <button type="button" class="btn btn-ghost btn-xs" data-action="preset" data-val="db,bench">Dumbbells + bench</button>
          <button type="button" class="btn btn-ghost btn-xs" data-action="preset" data-val="db,bb,bench,rack,bar">Full home gym</button>
        </div>` : ''}
        <div class="equip">
          ${MG.EQUIPMENT.map((e) => {
            const on = a[eqKey].includes(e.id);
            return `<button type="button" class="choice ${on ? 'on' : ''}" data-toggle="${eqKey}" data-val="${e.id}" aria-pressed="${on}"><span class="box">✓</span><span><b>${esc(e.name)}</b><small>${esc(e.hint)}</small></span></button>`;
          }).join('')}
        </div>
      </div>` : ''}`;
  }

  function stepDiet() {
    const a = state.a;
    return `
      <div class="field">
        <div class="label">How do you eat?</div>
        <div class="choices">${MG.DIETS.map((d) => choice('diet', d.id, d.name, d.hint)).join('')}</div>
      </div>
      <div class="field">
        <div class="label">Allergies and foods to avoid <span class="hint">Pick all that apply</span></div>
        <div class="pills">${MG.RESTRICTIONS.map((r) => {
          const on = a.restrictions.includes(r.id);
          return `<button type="button" class="pill ${on ? 'on' : ''}" data-toggle="restrictions" data-val="${r.id}" aria-pressed="${on}">${esc(r.name)}</button>`;
        }).join('')}</div>
      </div>
      <div class="field">
        <div class="label">How much do you want to cook?</div>
        <div class="choices">
          ${choice('cook', 'quick', 'Keep it quick', 'Every meal ready in 10 minutes or less: no-cook, microwave or one pan')}
          ${choice('cook', 'normal', 'I do not mind cooking', 'A mix of quick meals and proper cooked dinners')}
        </div>
      </div>
      <div class="field">
        <div class="label">Meals per day</div>
        <div class="pills">
          ${pill('meals', 3, '3', 'meals')}${pill('meals', 4, '4', '3 meals + snack')}${pill('meals', 5, '5', '3 meals + 2 snacks')}${pill('meals', 6, '6', '3 meals + 3 snacks')}
        </div>
      </div>
      ${state.errors.generate ? `<div class="note">${esc(state.errors.generate)}</div>` : ''}`;
  }

  const STEP_COPY = [
    ['Tell us about you', 'We use this to work out your calories and how hard to push the training.'],
    ['Pick the body you are training for', 'This decides your rep ranges, exercise priorities and whether you eat to gain or to lean out.'],
    ['Where and how often', 'The program only uses equipment you actually have.'],
    ['Your diet', 'Every meal in your plan respects these choices.'],
  ];

  function renderWizard() {
    const s = state.step;
    const body = [stepAbout, stepPhysique, stepTraining, stepDiet][s]();
    app.innerHTML = `
      <div class="wizard">
        ${s === 0 ? `<div class="hero"><h1>Build the body<br>you <em>actually</em> want.</h1><p>Four quick steps. You get a full training program with photos of every exercise, a 7-day diet plan built around your equipment and what you can eat, and a tracker to log your progress.</p></div>` : ''}
        <div class="progress" aria-label="Step ${s + 1} of 4">${STEPS.map((n, i) => `<div class="${i < s ? 'done' : i === s ? 'now' : ''}">${n}</div>`).join('')}</div>
        <h2 class="step-title">${STEP_COPY[s][0]}</h2>
        <p class="step-sub">${STEP_COPY[s][1]}</p>
        ${body}
        <div class="nav">
          ${s > 0 ? '<button type="button" class="btn btn-ghost" data-action="back">Back</button>' : '<span></span>'}
          ${s < 3 ? '<button type="button" class="btn btn-primary" data-action="next">Continue</button>' : '<button type="button" class="btn btn-primary" data-action="generate">Build my plan</button>'}
        </div>
      </div>`;
    topActions.innerHTML = state.plan ? '<button type="button" class="btn btn-ghost btn-sm" data-action="show-plan">Back to my plan</button>' : '';
  }

  function validate(step) {
    const a = answers(), e = {};
    if (step === 0) {
      if (!a.sex) e.sex = 'Pick one so we can estimate your calories.';
      if (!(a.age >= 14 && a.age <= 90)) e.age = 'Enter an age between 14 and 90.';
      if (!(a.heightCm >= 120 && a.heightCm <= 230)) e.height = isImp() ? 'Enter a height between 4 ft and 7 ft 6 in.' : 'Enter a height between 120 and 230 cm.';
      if (!(a.weightKg >= 35 && a.weightKg <= 250)) e.weight = isImp() ? 'Enter a weight between 77 and 550 lb.' : 'Enter a weight between 35 and 250 kg.';
    }
    if (step === 1 && !a.physique) e.physique = 'Tap the physique closest to your goal.';
    if (step === 2 && !a.location) e.location = 'Choose where you will train.';
    state.errors = e;
    return !Object.keys(e).length;
  }

  /* ================= RESULTS ================= */
  function overviewHTML() {
    const a = answers(), n = state.plan.nutrition, w = state.plan.workout, phys = P.physique(a);
    const bk = n.baseKcal || n.kcal;
    const rate = isImp() ? Math.abs(n.weekly * 2.20462).toFixed(1) + ' lb' : Math.abs(n.weekly).toFixed(2) + ' kg';
    const copy = {
      cut: `The plan starts about <b>${n.tdee - bk} kcal below</b> your estimated maintenance of ${n.tdee} kcal. Expect to lose roughly <b>${rate} a week</b> while the lifting keeps your muscle.`,
      recomp: `You eat at <b>maintenance</b> (about ${n.tdee} kcal). Your weight stays roughly the same while you slowly trade fat for muscle.`,
      leanbulk: `The plan starts about <b>${bk - n.tdee} kcal above</b> your estimated maintenance of ${n.tdee} kcal. Expect to gain roughly <b>${rate} a week</b>, mostly muscle.`,
      bulk: `The plan starts about <b>${bk - n.tdee} kcal above</b> your estimated maintenance of ${n.tdee} kcal. Expect to gain roughly <b>${rate} a week</b>.`,
    }[n.pace];
    const manual = a.pace !== 'auto' && a.pace === n.pace && n.pace !== n.autoPace;
    const why = manual
      ? `You chose this strategy yourself. For your stats we would normally start with ${P.PACES[n.autoPace].name.toLowerCase()}.`
      : `Your BMI is ${n.bmi.toFixed(1)} and you are aiming for “${esc(phys.name)}”, so this is the fastest sensible route there.`;
    const byDay = {};
    w.days.forEach((d) => (byDay[d.weekday] = d));
    const whereLabel = (d) => (d.where === 'home' ? 'Home' : 'Gym');
    return `
      <div class="tiles">
        <div class="tile hl"><div class="k">Calories</div><div class="v">${n.kcal}<small>kcal</small></div><div class="s">per day</div></div>
        <div class="tile"><div class="k">Protein</div><div class="v">${n.protein}<small>g</small></div><div class="s">${(n.protein / a.weightKg).toFixed(1)} g per kg bodyweight</div></div>
        <div class="tile"><div class="k">Carbs</div><div class="v">${n.carbs}<small>g</small></div><div class="s">fuel for training</div></div>
        <div class="tile"><div class="k">Fat</div><div class="v">${n.fat}<small>g</small></div><div class="s">hormones and health</div></div>
      </div>
      <div class="cards">
        <div class="card">
          <span class="badge">${esc(n.paceName)}</span>
          <h3 style="margin-top:12px">Your strategy</h3>
          <p>${copy}</p>
          <p>${why}</p>
          <p>Log your weight in the Progress tab three mornings a week. It compares your real trend with the plan and tells you when to change your calories.</p>
          ${n.adjust ? `<div class="note">Your calories are currently ${n.adjust > 0 ? 'raised' : 'lowered'} by ${Math.abs(n.adjust)} kcal based on your tracked weight.</div>` : ''}
          ${n.notes.map((t) => `<div class="note">${esc(t)}</div>`).join('')}
        </div>
        <div class="card">
          <h3>How to progress</h3>
          <ul>
            <li>Start with a weight that leaves <b>1 to 2 reps in the tank</b> at the bottom of the rep range.</li>
            <li>When you hit the <b>top of the range on every set</b>, add 2.5 to 5% next session.</li>
            <li>Log your sets in the Training tab so you always know what to beat.</li>
            <li>Sleep 7 to 9 hours. Drink about ${n.water.toFixed(1)} litres of water a day.</li>
            <li>Every 6 to 8 weeks take an easy week: same exercises, half the sets.</li>
          </ul>
        </div>
      </div>
      <div class="section-h"><h3>Your week</h3><p>${esc(w.splitName)} · ${w.days.length} sessions · week ${blockNow().week} of a 4-week block</p></div>
      <div class="week">
        ${SHORT_DAYS.map((d, i) => byDay[i]
          ? `<div class="wd train"><div class="d">${d}</div><b>${esc(byDay[i].name.split(' ·')[0])}</b><small>${whereLabel(byDay[i])} · ${byDay[i].minutes} min</small></div>`
          : `<div class="wd"><div class="d">${d}</div><b>Rest</b><small>Walk 7–10k steps</small></div>`).join('')}
      </div>`;
  }

  /* ---------- training ---------- */
  function eqText(req, eq) {
    const groups = req.split('|');
    const g = groups.find((x) => x.split('+').every((k) => k === 'bw' || eq.includes(k))) || groups[0];
    return g.split('+').map((k) => EQ_NAME[k]).join(' + ');
  }
  const videoUrl = (name) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent('how to ' + name + ' proper form');

  function logRowsHTML(e, tk, last) {
    const timed = e.reps.includes(' s'), intervals = e.reps === '30 s hard';
    const todays = T.setsOn(e.id, tk);
    const rows = Array.from({ length: intervals ? 1 : e.sets }, (_, k) => {
      const cur = todays[k] || {}, prev = (last && last.sets[k]) || {};
      const attrs = (key) => `type="number" inputmode="decimal" min="0" data-lg-ex="${e.id}" data-lg-i="${k}" data-lg-k="${key}"`;
      const weight = timed ? '' :
        `<input ${attrs('w')} value="${cur.w > 0 ? toDisp(cur.w) : ''}" placeholder="${prev.w > 0 ? toDisp(prev.w) : e.bwLoad ? '+0' : '0'}" aria-label="${esc(e.name)} set ${k + 1} weight in ${wUnit()}"><i>${wUnit()}</i><b>×</b>`;
      return `<div class="logrow"><span>${intervals ? 'Rounds' : 'Set ' + (k + 1)}</span>${weight}<input ${attrs('r')} value="${cur.r > 0 ? cur.r : ''}" placeholder="${prev.r > 0 ? prev.r : ''}" aria-label="${esc(e.name)} set ${k + 1} ${timed ? 'seconds' : 'reps'}"><i>${intervals ? 'done' : timed ? 'sec' : 'reps'}</i></div>`;
    }).join('');
    return `<div class="logrows">${rows}</div>`;
  }

  function dayHTML(i) {
    const d = phaseDays()[i];
    const tk = today();
    const logging = state.logDay === i;
    const doneToday = T.data.sessions[tk] && T.data.sessions[tk].day === i;
    return `
      <section class="day ${logging ? 'logging' : ''}" id="day-${i}">
        <div class="day-head">
          <div><div class="d">Day ${i + 1} · ${P.WEEKDAYS[d.weekday]}</div><h3>${esc(d.name)}</h3></div>
          <div class="day-meta">
            <span class="chip">${d.where === 'home' ? 'At home' : 'At the gym'}</span><span class="chip">${d.exercises.length} exercises</span><span class="chip">about ${d.minutes} min</span>
            ${doneToday ? '<span class="chip ok">Done today ✓</span>' : ''}
            ${logging
              ? `<button type="button" class="btn btn-primary btn-xs" data-action="finish-day" data-day="${i}">Finish workout</button>`
              : `<button type="button" class="btn btn-ghost btn-xs" data-action="log-day" data-day="${i}">${doneToday ? 'Edit today’s log' : 'Log this workout'}</button>`}
          </div>
        </div>
        <div class="ex-grid">
          ${d.exercises.map((e, n) => {
            const timed = e.reps.includes(' s');
            const last = T.lastSets(e.id, tk);
            const lastSets = last ? last.sets.filter((s) => s.r > 0) : [];
            return `
            <article class="ex">
              <div class="ex-photos">
                <figure><img src="${MG.IMG_BASE}${e.id}/0.jpg" alt="${esc(e.name)}: start position" loading="lazy"><figcaption>Start</figcaption></figure>
                <figure><img src="${MG.IMG_BASE}${e.id}/1.jpg" alt="${esc(e.name)}: finish position" loading="lazy"><figcaption>Finish</figcaption></figure>
                <button type="button" class="playbtn" data-action="anim" aria-label="Play the movement for ${esc(e.name)}">▶ Motion</button>
              </div>
              <div class="ex-body">
                <div class="ex-top"><span class="n">${n + 1}</span><h4>${esc(e.name)}</h4></div>
                <div class="rx"><div><b>${e.sets}</b>sets</div><div><b>${esc(e.reps)}</b>${timed ? 'each' : 'reps'}</div><div><b>${esc(e.rest)}</b>rest</div></div>
                <p class="cue">${esc(e.cue)}${e.bwLoad ? ' Stop 1 to 2 reps before failure.' : ''}</p>
                ${lastSets.length ? `<p class="last">Last time (${fmtDate(last.date)}): ${lastSets.map((s) => fmtSet(s, timed)).join(' · ')}</p>` : ''}
                ${logging ? logRowsHTML(e, tk, last) : ''}
                <div class="ex-foot">
                  <div class="tags"><span class="chip">${esc(e.label)}</span><span class="chip">${esc(eqText(e.req, d.eq))}</span></div>
                  <div class="ex-btns">
                    <a class="btn btn-ghost btn-xs" href="${videoUrl(e.name)}" target="_blank" rel="noopener noreferrer" title="Opens video tutorials on YouTube">Video ↗</a>
                    <button type="button" class="btn btn-ghost btn-xs" data-action="swap-ex" data-day="${i}" data-idx="${n}" title="Show a different exercise for the same muscle">Swap</button>
                  </div>
                </div>
              </div>
            </article>`;
          }).join('')}
        </div>
      </section>`;
  }

  function trainingHTML() {
    const w = state.plan.workout;
    const styleCopy = {
      lean: 'Real weights in moderate rep ranges to keep your muscle while the diet takes the fat off, with a short conditioning finisher.',
      athletic: 'Heavy compound lifts first, moderate-rep accessory work after, and core work in every session.',
      hyp: 'Classic muscle-building rep ranges. The week is built so the muscles your goal physique depends on get the most sets.',
      mass: 'Heavy compound lifts first, then volume. Long rests and big weights.',
    }[w.style];
    const b = blockNow(), vp = viewPhase();
    return `
      <div class="section-h" style="margin-top:0"><h3>${esc(w.splitName)}</h3><p>${styleCopy} Tap Motion to see the movement, Swap to change an exercise, and Log this workout to record your sets.</p></div>
      <div class="blockbar">
        <div><b>Week ${b.week} of 4</b>${b.block > 1 ? ' · block ' + b.block : ''}<small>Weeks 1–2 and weeks 3–4 use different exercises for the same muscles. Each day’s main lift stays the same so you can watch it go up. After week 4 the block starts again.</small></div>
        <div class="seg" role="group" aria-label="Which weeks to show">${P.PHASE_WEEKS.map((label, ph) => `<button type="button" class="${vp === ph ? 'on' : ''}" data-action="phase" data-val="${ph}" aria-pressed="${vp === ph}">${label}${ph === b.phase ? ' · now' : ''}</button>`).join('')}</div>
      </div>
      ${vp !== b.phase ? `<div class="note" style="margin-bottom:18px">You are looking ahead at ${P.PHASE_WEEKS[vp].toLowerCase()}. You are in week ${b.week} now.</div>` : ''}
      ${phaseDays().map((_, i) => dayHTML(i)).join('')}`;
  }

  /* ---------- diet ---------- */
  function mealDayHTML(i) {
    const d = state.plan.meals.days[i], n = state.plan.nutrition;
    const isToday = i === T.weekdayIdx();
    const eaten = T.eaten(today());
    const diff = (v, t, unit) => { const x = v - t; return `<small>(${x >= 0 ? '+' : ''}${x}${unit} vs target)</small>`; };
    return `
      <section class="mealday ${i === state.mealDay ? 'on' : ''}" id="mealday-${i}">
        <h3>${P.WEEKDAYS[i]}</h3>
        ${isToday ? `<div class="eatbar"><div><b>Today</b> · ${eaten.count} of ${d.meals.length} meals eaten · <b>${eaten.kcal}</b> of ${n.kcal} kcal · <b>${eaten.p}</b> of ${n.protein} g protein</div><div class="bar"><i style="width:${Math.min(100, (eaten.kcal / n.kcal) * 100)}%"></i></div></div>` : ''}
        <div class="meal-grid">
          ${d.meals.map((m, k) => {
            const on = isToday && eaten.idx.includes(k);
            return `
            <article class="meal ${on ? 'eaten' : ''}">
              <div><div class="lbl">${esc(m.label)}${m.min ? ` <span>· ${m.min} min</span>` : ''}</div><h4 style="margin:6px 0 6px">${esc(m.name)}</h4>
                <div class="mm"><b>${m.kcal} kcal</b> · ${m.p} g protein · ${m.c} g carbs · ${m.f} g fat</div></div>
              <ul class="ing">
                ${m.items.map((it) => `<li><span class="amt">${P.amountText(it.food, it.g)}</span><span>${esc(MG.FOODS[it.food].n)}${it.swapped ? '<em>swapped in</em>' : ''}${it.topup ? '<em>protein top-up</em>' : ''}</span></li>`).join('')}
              </ul>
              <p class="how">${esc(m.how)}${m.items.some((x) => x.topup) ? ' Shake the extra protein powder with water and have it on the side.' : ''}</p>
              ${m.changes && m.changes.length ? `<p class="adapted">Adapted for you: ${esc(m.changes.join(', '))}.</p>` : ''}
              <div class="meal-actions">
                ${isToday ? `<button type="button" class="btn ${on ? 'btn-primary' : 'btn-ghost'} btn-xs" data-action="eat" data-day="${i}" data-idx="${k}" aria-pressed="${on}">${on ? 'Eaten ✓' : 'Mark as eaten'}</button>` : ''}
                <button type="button" class="btn btn-ghost btn-xs" data-action="swap-meal" data-day="${i}" data-idx="${k}">Swap this meal</button>
              </div>
            </article>`;
          }).join('')}
        </div>
        <div class="daytotal">
          <span><b>${d.total.kcal}</b> kcal ${diff(d.total.kcal, n.kcal, '')}</span>
          <span><b>${d.total.p} g</b> protein ${diff(d.total.p, n.protein, ' g')}</span>
          <span><b>${d.total.c} g</b> carbs</span>
          <span><b>${d.total.f} g</b> fat</span>
        </div>
      </section>`;
  }

  function nutritionHTML() {
    const a = answers(), n = state.plan.nutrition, plan = state.plan.meals;
    const pk = n.protein * 4, ck = n.carbs * 4, fk = n.fat * 9, tot = pk + ck + fk;
    const avgP = plan.days.reduce((t, d) => t + d.total.p, 0) / 7;
    const notes = [];
    if (avgP < n.protein * 0.92) notes.push(`With these restrictions and this calorie budget, food plus a protein top-up gets you to about ${Math.round(avgP)} g of protein a day. That is still plenty to build muscle.`);
    if (n.kcal >= 3200 && a.meals <= 3) notes.push('That is a lot of food for three sittings. Switching to 5 or 6 meals a day will make the portions much easier.');
    if (a.restrictions.includes('gluten')) notes.push('Gluten-free: buy oats, stock cubes and sauces that are certified gluten-free.');
    const dietName = (MG.DIETS.find((d) => d.id === a.diet) || {}).name;
    const restrNames = a.restrictions.map((r) => MG.RESTRICTIONS.find((x) => x.id === r).name);
    const tags = [dietName === 'I eat everything' ? 'No diet restrictions' : dietName].concat(restrNames, a.cook === 'quick' ? ['Quick meals only'] : []);
    return `
      <div class="card">
        <div class="section-h" style="margin:0 0 4px"><h3>Daily targets</h3><p>${n.kcal} kcal · fibre ${n.fiber} g+</p></div>
        <div class="macrobar"><i class="p" style="width:${(pk / tot) * 100}%"></i><i class="c" style="width:${(ck / tot) * 100}%"></i><i class="f" style="width:${(fk / tot) * 100}%"></i></div>
        <div class="legend"><span class="p">Protein ${n.protein} g</span><span class="c">Carbs ${n.carbs} g</span><span class="f">Fat ${n.fat} g</span></div>
        <p style="margin-top:14px;font-size:.9rem">${esc(tags.join(' · '))}. Meat and fish are weighed raw, rice, pasta, quinoa and oats dry. Season with herbs, spices, lemon, garlic and salt as you like.</p>
        ${notes.map((t) => `<div class="note">${esc(t)}</div>`).join('')}
      </div>
      <div class="section-h">
        <div class="pills daypills" style="margin:0">${SHORT_DAYS.map((d, i) => `<button type="button" class="pill ${i === state.mealDay ? 'on' : ''} ${i === T.weekdayIdx() ? 'today' : ''}" data-action="mealday" data-val="${i}">${d}</button>`).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="new-week">Give me a different week</button>
      </div>
      ${plan.days.map((_, i) => mealDayHTML(i)).join('')}`;
  }

  /* ---------- shopping ---------- */
  const CAT_ORDER = ['Meat & fish', 'Dairy, eggs & alternatives', 'Beans, tofu & plant protein', 'Grains, bread & potatoes', 'Fruit & vegetables', 'Pantry', 'Supplements'];
  function shoppingHTML() {
    const cats = P.grocery(state.plan.meals);
    return `
      <div class="section-h" style="margin-top:0"><div><h3>Shopping list for the week</h3><p>Everything in your 7-day meal plan, added up.</p></div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="copy-list">Copy list</button></div>
      <div class="shop">
        ${CAT_ORDER.filter((c) => cats[c]).map((c) => `
          <div class="card"><h3>${esc(c)}</h3>
            ${cats[c].map((it) => `<label><input type="checkbox"><b style="font-weight:500">${esc(it.name)}</b><span>${esc(it.text)}</span></label>`).join('')}
          </div>`).join('')}
      </div>`;
  }
  function shoppingText() {
    const cats = P.grocery(state.plan.meals);
    return CAT_ORDER.filter((c) => cats[c]).map((c) => c.toUpperCase() + '\n' + cats[c].map((it) => '- ' + it.name + ': ' + it.text).join('\n')).join('\n\n');
  }

  /* ---------- progress ---------- */
  const bodyW = (kg) => (isImp() ? kg * 2.20462 : kg);

  function weightChart(series) {
    if (!series.length) return '<div class="empty">No weigh-ins yet. Add today’s weight to start your chart.</div>';
    const W = 600, H = 210, L = 46, R = 14, TOP = 14, B = 28;
    const vals = series.map((p) => bodyW(p.kg));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 2) { const mid = (hi + lo) / 2; lo = mid - 1; hi = mid + 1; }
    const padY = (hi - lo) * 0.15; lo -= padY; hi += padY;
    const t0 = T.parse(series[0].date).getTime(), t1 = T.parse(series[series.length - 1].date).getTime();
    const x = (date) => (t1 === t0 ? L + (W - L - R) / 2 : L + ((T.parse(date).getTime() - t0) / (t1 - t0)) * (W - L - R));
    const y = (v) => TOP + ((hi - v) / (hi - lo)) * (H - TOP - B);
    const pts = series.map((p, i) => [x(p.date), y(vals[i])]);
    const ticks = [lo + padY, (lo + hi) / 2, hi - padY];
    return `
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bodyweight chart, ${series.length} weigh-ins, latest ${vals[vals.length - 1].toFixed(1)} ${wUnit()}">
        ${ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="ax" x="${L - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${t.toFixed(1)}</text>`).join('')}
        ${pts.length > 1 ? `<polyline class="line" points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>` : ''}
        ${pts.map((p, i) => `<circle class="dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4"><title>${fmtDate(series[i].date)}: ${vals[i].toFixed(1)} ${wUnit()}</title></circle>`).join('')}
        <text class="ax" x="${L}" y="${H - 6}">${fmtDate(series[0].date)}</text>
        ${series.length > 1 ? `<text class="ax" x="${W - R}" y="${H - 6}" text-anchor="end">${fmtDate(series[series.length - 1].date)}</text>` : ''}
      </svg>`;
  }

  function sparkline(vals) {
    if (vals.length < 2) return '<span></span>';
    const W = 90, H = 26, lo = Math.min(...vals), span = Math.max(...vals) - lo || 1;
    const pts = vals.map((v, i) => (3 + (i / (vals.length - 1)) * (W - 6)).toFixed(1) + ',' + (H - 4 - ((v - lo) / span) * (H - 8)).toFixed(1)).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
  }

  function trendHTML(series, n) {
    const rate = T.weeklyRate(series);
    if (rate == null) return '<p class="trend">Weigh in at least three times across a week to see your trend. Same time of day, ideally first thing in the morning.</p>';
    const last = series[series.length - 1].date;
    const recent = series.filter((p) => (T.parse(last) - T.parse(p.date)) / 86400000 <= 21);
    const span = Math.round((T.parse(last) - T.parse(recent[0].date)) / 86400000);
    const f = (kg) => Math.abs(bodyW(kg)).toFixed(isImp() ? 1 : 2) + ' ' + wUnit();
    const dir = (kg) => (Math.abs(kg) < 0.05 ? 'holding steady' : (kg > 0 ? 'gaining ' : 'losing ') + 'about ' + f(kg) + ' a week');
    const planned = Math.abs(n.weekly) < 0.05 ? 'a steady weight' : (n.weekly > 0 ? 'a gain' : 'a loss') + ' of about ' + f(n.weekly) + ' a week';
    const diff = rate - n.weekly;
    const sinceAdjust = state.a.adjustedOn ? Math.round((T.parse(today()) - T.parse(state.a.adjustedOn)) / 86400000) : null;
    let verdict;
    if (Math.abs(diff) <= 0.15) verdict = '<b class="good">On track.</b> Change nothing.';
    else if (span < 13) verdict = `Your weight is running ${diff > 0 ? 'higher' : 'lower'} than planned, but the first week or two is mostly water. Keep logging before changing anything.`;
    else if (sinceAdjust != null && sinceAdjust < 14) verdict = `You changed your calories on ${fmtDate(state.a.adjustedOn)}. Give the new target two weeks before judging it again.`;
    else {
      const delta = diff > 0 ? -150 : 150;
      verdict = `Your weight is running ${diff > 0 ? 'higher' : 'lower'} than the plan expects.
        <button type="button" class="btn btn-primary btn-xs" data-action="apply-adjust" data-val="${delta}" style="margin-left:6px">${delta > 0 ? 'Add' : 'Take off'} 150 kcal a day</button>`;
    }
    return `<p class="trend">Over the last ${span} days you are <b>${dir(rate)}</b>. The plan is aiming for ${planned}. ${verdict}</p>`;
  }

  function calendarHTML() {
    const now = new Date(), tk = today(), trained = T.trainedDates();
    const start = T.addDays(T.weekStart(now), -28);
    let cells = '';
    for (let i = 0; i < 35; i++) {
      const d = T.addDays(start, i), k = T.dateKey(d);
      const cls = (trained.has(k) ? 'on ' : '') + (k === tk ? 'now ' : '') + (k > tk ? 'future' : '');
      cells += `<div class="cal-d ${cls}" title="${fmtDate(k)}${trained.has(k) ? ': trained' : ''}">${d.getDate()}${T.data.weights[k] ? '<i></i>' : ''}</div>`;
    }
    return `<div class="cal"><div class="cal-g cal-h">${SHORT_DAYS.map((d) => `<span>${d}</span>`).join('')}</div><div class="cal-g">${cells}</div>
      <p class="cal-key"><span class="k1"></span>Trained<span class="k2"></span>Weighed in</p></div>`;
  }

  function liftsHTML() {
    const rows = Object.keys(T.data.sets).map((id) => ({ id, h: T.liftHistory(id) })).filter((x) => x.h.length)
      .sort((x, y) => y.h[y.h.length - 1].date.localeCompare(x.h[x.h.length - 1].date)).slice(0, 15);
    if (!rows.length) return '<div class="empty">Open the Training tab, tap “Log this workout” and your lifts will show up here.</div>';
    const fmtBest = (b, meta) => (b.w ? toDisp(b.w) + ' ' + wUnit() + ' × ' + b.r : b.r + (meta.time ? ' s' : ' reps'));
    return `<div class="lifts">${rows.map(({ id, h }) => {
      const meta = EX_META[id] || { name: id.replace(/_/g, ' ') };
      const f = h[0].best, l = h[h.length - 1].best;
      let ch = 'first log', cls = '';
      if (h.length > 1) {
        if (f.w && l.w) { const pct = (l.score / f.score - 1) * 100; ch = (pct >= 0 ? '+' : '') + pct.toFixed(0) + '% strength'; cls = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : ''; }
        else { const dd = l.r - f.r; ch = (dd >= 0 ? '+' : '') + dd + (meta.time ? ' s' : ' reps'); cls = dd > 0 ? 'up' : dd < 0 ? 'down' : ''; }
      }
      return `<div class="lift"><b>${esc(meta.name)}</b><span><small>First · ${fmtDate(h[0].date)}</small>${fmtBest(f, meta)}</span><span><small>Latest · ${fmtDate(h[h.length - 1].date)}</small>${fmtBest(l, meta)}</span><span class="chg ${cls}">${ch}</span>${sparkline(h.map((x) => x.best.score))}</div>`;
    }).join('')}</div>`;
  }

  function progressHTML() {
    const n = state.plan.nutrition, w = state.plan.workout;
    const tk = today(), now = new Date();
    const series = T.weightSeries();
    const latest = series[series.length - 1], first = series[0];
    const change = series.length > 1 ? latest.kg - first.kg : null;
    const eaten = T.eaten(tk);
    const nowDays = P.phaseDays(w, blockNow().phase);
    const todayIdx = nowDays.findIndex((d) => d.weekday === T.weekdayIdx(now));
    const todayDay = nowDays[todayIdx];
    const doneToday = !!T.data.sessions[tk] || T.trainedDates().has(tk);
    const mealsToday = state.plan.meals.days[T.weekdayIdx(now)].meals.length;
    const todayW = T.data.weights[tk];
    return `
      <div class="tiles">
        <div class="tile hl"><div class="k">This week</div><div class="v">${T.trainedThisWeek(now)}<small>/ ${w.days.length}</small></div><div class="s">workouts done</div></div>
        <div class="tile"><div class="k">All time</div><div class="v">${T.trainedDates().size}</div><div class="s">workouts logged</div></div>
        <div class="tile"><div class="k">Bodyweight</div><div class="v">${latest ? bodyW(latest.kg).toFixed(1) : '–'}<small>${wUnit()}</small></div><div class="s">${change != null ? (change >= 0 ? '+' : '−') + Math.abs(bodyW(change)).toFixed(1) + ' ' + wUnit() + ' since ' + fmtDate(first.date) : 'no weigh-ins yet'}</div></div>
        <div class="tile"><div class="k">Eaten today</div><div class="v">${eaten.kcal}<small>/ ${n.kcal}</small></div><div class="s">${eaten.p} of ${n.protein} g protein</div></div>
      </div>
      <div class="cards">
        <div class="card">
          <h3>Bodyweight</h3>
          <div class="weigh">
            <div class="input"><input type="number" inputmode="decimal" data-weight-input value="${todayW ? bodyW(todayW).toFixed(1) : ''}" placeholder="${latest ? bodyW(latest.kg).toFixed(1) : 'Today'}" aria-label="Today's weight in ${wUnit()}"><span>${wUnit()}</span></div>
            <button type="button" class="btn btn-primary btn-sm" data-action="save-weight">${todayW ? 'Update today' : 'Save today’s weight'}</button>
          </div>
          <div class="error" id="weight-error" hidden></div>
          ${weightChart(series)}
          ${trendHTML(series, n)}
        </div>
        <div class="card">
          <h3>Today · ${now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
          <div class="todo">
            <div class="todo-row ${doneToday ? 'done' : ''}">
              <div><b>${todayDay ? esc(todayDay.name) : 'Rest day'}</b><small>${todayDay ? (doneToday ? 'Workout logged' : 'about ' + todayDay.minutes + ' min · ' + (todayDay.where === 'home' ? 'at home' : 'at the gym')) : (doneToday ? 'You trained anyway' : 'Walk 7–10k steps and recover')}</small></div>
              ${todayDay ? `<button type="button" class="btn ${doneToday ? 'btn-ghost' : 'btn-primary'} btn-xs" data-action="go-train" data-day="${todayIdx}">${doneToday ? 'Open' : 'Start workout'}</button>` : ''}
            </div>
            <div class="todo-row ${eaten.count >= mealsToday ? 'done' : ''}">
              <div><b>${eaten.count} of ${mealsToday} meals eaten</b><small>${eaten.kcal} of ${n.kcal} kcal</small></div>
              <button type="button" class="btn btn-ghost btn-xs" data-action="go-meals">Open meals</button>
            </div>
            <div class="todo-row ${todayW ? 'done' : ''}">
              <div><b>${todayW ? 'Weighed in' : 'Weigh in'}</b><small>${todayW ? bodyW(todayW).toFixed(1) + ' ' + wUnit() : 'Three mornings a week is enough'}</small></div>
            </div>
          </div>
          <h3 style="margin-top:22px">Last five weeks</h3>
          ${calendarHTML()}
        </div>
      </div>
      <div class="section-h"><h3>Your lifts</h3><p>Best set of your first and latest session for each exercise.</p></div>
      ${liftsHTML()}
      <div class="card" style="margin-top:20px">
        <h3>Your data</h3>
        <p>Your progress is saved in this browser on this device only. Download a backup now and then, and restore it if you switch phone or clear your browser.</p>
        <div class="databtns">
          <button type="button" class="btn btn-ghost btn-sm" data-action="export-track">Download backup</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="import-track">Restore from backup</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="clear-track">Clear tracker</button>
          <input type="file" accept="application/json,.json" data-track-file hidden>
        </div>
        <div class="error" id="track-msg" hidden></div>
      </div>`;
  }

  /* ---------- results shell ---------- */
  const TABS = [['overview', 'Overview'], ['training', 'Training'], ['nutrition', 'Diet plan'], ['shopping', 'Shopping list'], ['progress', 'Progress']];
  const PANELS = { overview: overviewHTML, training: trainingHTML, nutrition: nutritionHTML, shopping: shoppingHTML, progress: progressHTML };
  const panelInner = (id) => `<h2 class="panel-title">${TABS.find((t) => t[0] === id)[1]}</h2>${PANELS[id]()}`;
  function refreshPanel(id) {
    const el = document.getElementById('panel-' + id);
    if (el) el.innerHTML = panelInner(id);
  }

  function renderResults() {
    const a = answers(), phys = P.physique(a);
    const where = { gym: 'at the gym', home: 'at home', both: 'at the gym and at home' }[a.location];
    if (!PANELS[state.tab]) state.tab = 'overview';
    app.innerHTML = `
      <div class="results">
        <div class="res-head">
          <div class="eyebrow">Your plan is ready</div>
          <h1>${esc(phys.name)}</h1>
          <p class="sub">${a.days} sessions a week ${where}, about ${a.minutes} minutes each · ${state.plan.nutrition.kcal} kcal a day</p>
        </div>
        <nav class="tabs" aria-label="Plan sections">${TABS.map(([id, name]) => `<button type="button" class="tab ${state.tab === id ? 'on' : ''}" data-action="tab" data-val="${id}">${name}</button>`).join('')}</nav>
        ${TABS.map(([id]) => `<section class="panel ${state.tab === id ? 'on' : ''}" id="panel-${id}">${panelInner(id)}</section>`).join('')}
      </div>`;
    topActions.innerHTML = `
      <button type="button" class="btn btn-ghost btn-sm" data-action="edit">Edit <span>answers</span></button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="print">Print <span>/ save PDF</span></button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="reset">Start over</button>`;
  }

  function render() {
    if (state.step >= 4 && state.plan) {
      try { renderResults(); return; } catch (e) { console.error(e); state.plan = null; state.step = 0; }
    }
    if (state.step > 3) state.step = 0;
    renderWizard();
  }

  function generate() {
    try {
      state.a.kcalAdjust = 0; state.a.adjustedOn = null;
      state.plan = P.generate(answers(), Math.floor(Math.random() * 1e9) + 1);
      state.plan.workout.start = T.dateKey(T.weekStart());
      state.viewPhase = null;
      state.step = 4; state.tab = 'overview'; state.logDay = null; state.errors = {};
      T.clearMeal(today());
    } catch (e) {
      console.error(e);
      state.errors = { generate: 'We could not build a meal plan with every one of those restrictions. Remove one and try again.' };
    }
    save(); render(); window.scrollTo(0, 0);
  }

  function showTab(id) {
    state.tab = id; save();
    if (id === 'progress') refreshPanel('progress');
    app.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.val === id));
    app.querySelectorAll('.panel').forEach((p) => p.classList.toggle('on', p.id === 'panel-' + id));
  }
  const replaceDay = (i) => { const el = document.getElementById('day-' + i); if (el) el.outerHTML = dayHTML(i); };
  const replaceMealDay = (i) => { const el = document.getElementById('mealday-' + i); if (el) el.outerHTML = mealDayHTML(i); };
  function arm(btn, label, fn) {
    if (btn.dataset.armed) { fn(); return; }
    const original = btn.textContent;
    btn.dataset.armed = '1'; btn.textContent = label;
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = original; } }, 3000);
  }
  function message(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text; el.hidden = !text;
  }

  /* ---------- events ---------- */
  document.addEventListener('input', (ev) => {
    const ds = ev.target.dataset;
    if (!ds) return;
    if (ds.lgEx) { // a set being logged
      const v = parseFloat(ev.target.value);
      const val = isNaN(v) || v < 0 ? null : ds.lgK === 'w' ? Math.round(fromDisp(v) * 1000) / 1000 : v;
      T.logSet(ds.lgEx, today(), +ds.lgI, ds.lgK, val);
      return;
    }
    const f = ds.field;
    if (!f) return;
    const a = state.a, v = ev.target.value;
    if (f === 'ft' || f === 'in') {
      const ft = parseFloat(app.querySelector('[data-field="ft"]').value) || 0;
      const inch = parseFloat(app.querySelector('[data-field="in"]').value) || 0;
      a.heightCm = ft || inch ? Math.round((ft * 12 + inch) * 2.54 * 10) / 10 : '';
    } else if (f === 'lb') a.weightKg = v === '' ? '' : Math.round((parseFloat(v) / 2.20462) * 10) / 10;
    else a[f] = v === '' ? '' : parseFloat(v);
    save();
  });

  document.addEventListener('change', (ev) => {
    if (!ev.target.matches || !ev.target.matches('[data-track-file]')) return;
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    file.text().then((text) => {
      T.importJSON(text);
      state.logDay = null; save(); render();
    }).catch(() => message('track-msg', 'That file is not a MuscleGain backup.'));
  });

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-set],[data-toggle],[data-action]');
    if (!t) return;
    const a = state.a, d = t.dataset;

    if (d.set) {
      const val = NUM_FIELDS.includes(d.set) ? +d.val : d.val;
      if (d.set === 'sex' && a.sex !== val) a.physique = null;
      a[d.set] = val;
      if (d.set === 'days') a.homeDays = Math.max(1, Math.min(a.days - 1, a.homeDays));
      delete state.errors[d.set];
      save(); render(); return;
    }
    if (d.toggle) {
      const list = a[d.toggle];
      const i = list.indexOf(d.val);
      if (i >= 0) list.splice(i, 1); else list.push(d.val);
      save(); render(); return;
    }

    switch (d.action) {
      case 'units': state.units = d.val; save(); render(); break;
      case 'preset': a.homeEq = d.val ? d.val.split(',') : []; save(); render(); break;
      case 'next': if (validate(state.step)) state.step++; save(); render(); window.scrollTo(0, 0); break;
      case 'back': state.step = Math.max(0, state.step - 1); state.errors = {}; save(); render(); window.scrollTo(0, 0); break;
      case 'generate': if ([0, 1, 2, 3].every(validate)) generate(); else render(); break;
      case 'show-plan': state.step = 4; save(); render(); window.scrollTo(0, 0); break;
      case 'edit': state.step = 0; save(); render(); window.scrollTo(0, 0); break;
      case 'print': window.print(); break;
      case 'reset':
        arm(t, 'Click again to erase', () => {
          state = Object.assign(state, { step: 0, a: defaults(), plan: null, tab: 'overview', logDay: null, errors: {} });
          save(); render(); window.scrollTo(0, 0);
        });
        break;
      case 'tab': showTab(d.val); window.scrollTo(0, 0); break;
      case 'mealday':
        state.mealDay = +d.val; save();
        app.querySelectorAll('.daypills .pill').forEach((b) => b.classList.toggle('on', +b.dataset.val === state.mealDay));
        app.querySelectorAll('.mealday').forEach((p) => p.classList.toggle('on', p.id === 'mealday-' + state.mealDay));
        break;

      /* training */
      case 'anim': {
        const box = t.closest('.ex-photos');
        const on = box.classList.toggle('play');
        t.textContent = on ? '❚❚ Stop' : '▶ Motion';
        break;
      }
      case 'phase': {
        const ph = +d.val;
        state.viewPhase = ph === blockNow().phase ? null : ph;
        state.logDay = null; save();
        refreshPanel('training');
        break;
      }
      case 'swap-ex':
        if (P.swapExercise(state.plan.workout, answers(), +d.day, +d.idx, viewPhase())) { save(); replaceDay(+d.day); }
        else t.textContent = 'No alternative';
        break;
      case 'log-day': {
        const prev = state.logDay;
        state.logDay = +d.day; save();
        if (prev != null && prev !== state.logDay) replaceDay(prev);
        replaceDay(state.logDay);
        break;
      }
      case 'finish-day': {
        const i = +d.day;
        T.finish(today(), { day: i, name: phaseDays()[i].name });
        state.logDay = null; save(); replaceDay(i);
        break;
      }
      case 'go-train': {
        state.logDay = +d.day; state.viewPhase = null; save();
        refreshPanel('training'); showTab('training');
        const el = document.getElementById('day-' + d.day);
        if (el) el.scrollIntoView();
        break;
      }

      /* diet */
      case 'eat': {
        const m = state.plan.meals.days[+d.day].meals[+d.idx];
        T.toggleMeal(today(), +d.idx, { name: m.name, kcal: m.kcal, p: m.p });
        replaceMealDay(+d.day);
        break;
      }
      case 'swap-meal':
        if (P.swapMeal(state.plan.meals, answers(), state.plan.nutrition, +d.day, +d.idx)) {
          if (+d.day === T.weekdayIdx()) T.clearMeal(today(), +d.idx);
          save(); replaceMealDay(+d.day); refreshPanel('shopping');
        } else t.textContent = 'No alternative';
        break;
      case 'new-week':
        state.plan.meals = P.meals(answers(), state.plan.nutrition, Math.floor(Math.random() * 1e9) + 1);
        T.clearMeal(today());
        save(); render();
        break;
      case 'go-meals':
        state.mealDay = T.weekdayIdx(); save();
        refreshPanel('nutrition'); showTab('nutrition'); window.scrollTo(0, 0);
        break;
      case 'copy-list':
        if (navigator.clipboard) navigator.clipboard.writeText(shoppingText()).then(() => { t.textContent = 'Copied'; setTimeout(() => (t.textContent = 'Copy list'), 1800); });
        break;

      /* progress */
      case 'save-weight': {
        const raw = app.querySelector('[data-weight-input]').value;
        const kg = fromDisp(parseFloat(raw));
        if (raw !== '' && !(kg >= 30 && kg <= 300)) { message('weight-error', 'Enter a realistic weight in ' + wUnit() + '.'); break; }
        T.setWeight(today(), raw === '' ? null : kg);
        refreshPanel('progress');
        break;
      }
      case 'apply-adjust': {
        a.kcalAdjust = Math.max(-600, Math.min(600, (a.kcalAdjust || 0) + +d.val));
        a.adjustedOn = today();
        state.plan.nutrition = P.nutrition(answers());
        state.plan.meals = P.meals(answers(), state.plan.nutrition, Math.floor(Math.random() * 1e9) + 1);
        T.clearMeal(today());
        save(); render();
        break;
      }
      case 'export-track': {
        const url = URL.createObjectURL(new Blob([T.exportJSON()], { type: 'application/json' }));
        const link = Object.assign(document.createElement('a'), { href: url, download: 'musclegain-backup-' + today() + '.json' });
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        break;
      }
      case 'import-track': app.querySelector('[data-track-file]').click(); break;
      case 'clear-track':
        arm(t, 'Click again to erase', () => { T.clear(); state.logDay = null; save(); render(); });
        break;
    }
  });

  // If a photo file is missing, show a tidy placeholder instead of a broken image.
  document.addEventListener('error', (ev) => {
    const el = ev.target;
    if (!el || el.tagName !== 'IMG') return;
    const fig = el.closest('figure');
    if (fig) fig.classList.add('fail'); else el.style.display = 'none';
  }, true);

  T.load();
  load();
  // Plans saved before 4-week blocks existed: add weeks 3-4 and ab work, keep the user's swaps, start the block this week.
  if (state.plan && state.plan.workout && (!state.plan.workout.daysB || !state.plan.workout.start)) {
    try {
      P.ensureBlock(state.plan.workout, answers());
      if (!state.plan.workout.start) state.plan.workout.start = T.dateKey(T.weekStart());
      save();
    } catch (e) { console.error(e); }
  }
  render();
})();
