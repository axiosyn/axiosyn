/* Progress tracker: bodyweight, logged sets, finished workouts and meals eaten.
   Everything is stored in this browser only (localStorage), separately from the plan, so rebuilding the
   plan never wipes a user's history. All weights are stored in kg. No DOM access here. */
(function (root) {
  const MG = (root.MG = root.MG || {});
  const T = (MG.tracker = {});
  const KEY = 'musclegain.track.v1';
  const store = typeof localStorage !== 'undefined' ? localStorage : null;

  T.empty = () => ({ weights: {}, sets: {}, sessions: {}, meals: {} });
  T.data = T.empty();

  T.load = function () {
    try {
      const d = JSON.parse(store.getItem(KEY));
      if (d && typeof d === 'object') T.data = Object.assign(T.empty(), d);
    } catch (e) { /* nothing saved yet */ }
  };
  T.save = function () {
    try { store.setItem(KEY, JSON.stringify(T.data)); } catch (e) { /* storage blocked */ }
  };

  /* ---------- dates (local time, not UTC) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  T.dateKey = (d) => { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  T.parse = (k) => { const p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  T.addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  T.weekdayIdx = (d) => ((d || new Date()).getDay() + 6) % 7; // Monday = 0
  T.weekStart = (d) => T.addDays(d || new Date(), -T.weekdayIdx(d));
  const daysBetween = (a, b) => Math.round((T.parse(b) - T.parse(a)) / 86400000);

  /* ---------- bodyweight ---------- */
  T.setWeight = function (date, kg) {
    if (kg == null || !(kg > 0)) delete T.data.weights[date]; else T.data.weights[date] = Math.round(kg * 100) / 100;
    T.save();
  };
  T.weightSeries = () => Object.keys(T.data.weights).sort().map((date) => ({ date, kg: T.data.weights[date] }));

  /* kg per week from a straight-line fit over the last `window` days of weigh-ins.
     Needs at least 3 weigh-ins spread over a week, otherwise day-to-day noise dominates. */
  T.weeklyRate = function (series, window) {
    if (!series.length) return null;
    const last = series[series.length - 1].date;
    const pts = series.filter((p) => daysBetween(p.date, last) <= (window || 21)).map((p) => ({ x: -daysBetween(p.date, last), y: p.kg }));
    if (pts.length < 3 || pts[pts.length - 1].x - pts[0].x < 7) return null;
    const n = pts.length, mx = pts.reduce((t, p) => t + p.x, 0) / n, my = pts.reduce((t, p) => t + p.y, 0) / n;
    const sxx = pts.reduce((t, p) => t + (p.x - mx) * (p.x - mx), 0);
    if (!sxx) return null;
    return (pts.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0) / sxx) * 7;
  };

  /* ---------- sets ---------- */
  T.logSet = function (exId, date, i, field, value) {
    const byDate = (T.data.sets[exId] = T.data.sets[exId] || {});
    const sets = (byDate[date] = byDate[date] || []);
    while (sets.length <= i) sets.push({});
    if (value == null || value === '' || isNaN(value)) delete sets[i][field]; else sets[i][field] = value;
    while (sets.length && !Object.keys(sets[sets.length - 1]).length) sets.pop();
    if (!sets.length) delete byDate[date];
    if (!Object.keys(byDate).length) delete T.data.sets[exId];
    T.save();
  };
  T.setsOn = (exId, date) => ((T.data.sets[exId] || {})[date] || []);
  T.lastSets = function (exId, before) {
    const dates = Object.keys(T.data.sets[exId] || {}).filter((d) => d < before).sort();
    if (!dates.length) return null;
    const date = dates[dates.length - 1];
    return { date, sets: T.data.sets[exId][date] };
  };

  T.e1rm = (w, r) => w * (1 + r / 30); // Epley estimate of a one-rep max
  /* The best set of a session: highest estimated max when weight was used, otherwise most reps or seconds. */
  T.bestSet = function (sets) {
    let best = null;
    (sets || []).forEach((s) => {
      if (!(s.r > 0)) return;
      const w = s.w > 0 ? s.w : 0;
      const score = w ? T.e1rm(w, s.r) : s.r;
      if (!best || (w && !best.w) || (!!w === !!best.w && score > best.score)) best = { w, r: s.r, score };
    });
    return best;
  };
  T.liftHistory = function (exId) {
    const byDate = T.data.sets[exId] || {};
    return Object.keys(byDate).sort().map((date) => ({ date, best: T.bestSet(byDate[date]) })).filter((x) => x.best);
  };

  /* ---------- sessions ---------- */
  T.finish = function (date, info) { T.data.sessions[date] = info; T.save(); };
  T.unfinish = function (date) { delete T.data.sessions[date]; T.save(); };
  /* A day counts as trained if a workout was finished or any set was logged. */
  T.trainedDates = function () {
    const out = new Set(Object.keys(T.data.sessions));
    Object.values(T.data.sets).forEach((byDate) => Object.keys(byDate).forEach((d) => {
      if (byDate[d].some((s) => s.r > 0)) out.add(d);
    }));
    return out;
  };
  T.trainedThisWeek = function (today) {
    const start = T.dateKey(T.weekStart(today)), end = T.dateKey(T.addDays(T.weekStart(today), 6));
    return [...T.trainedDates()].filter((d) => d >= start && d <= end).length;
  };

  /* ---------- meals ---------- */
  T.toggleMeal = function (date, idx, info) {
    const day = (T.data.meals[date] = T.data.meals[date] || {});
    if (day[idx]) delete day[idx]; else day[idx] = info;
    if (!Object.keys(day).length) delete T.data.meals[date];
    T.save();
    return !!(T.data.meals[date] && T.data.meals[date][idx]);
  };
  T.clearMeal = function (date, idx) {
    const day = T.data.meals[date];
    if (!day) return;
    if (idx == null) delete T.data.meals[date]; else { delete day[idx]; if (!Object.keys(day).length) delete T.data.meals[date]; }
    T.save();
  };
  T.eaten = function (date) {
    const day = T.data.meals[date] || {};
    const list = Object.values(day);
    return { count: list.length, kcal: list.reduce((t, m) => t + (m.kcal || 0), 0), p: list.reduce((t, m) => t + (m.p || 0), 0), idx: Object.keys(day).map(Number) };
  };

  /* ---------- backup ---------- */
  T.exportJSON = () => JSON.stringify({ app: 'musclegain', version: 1, exported: new Date().toISOString(), data: T.data }, null, 2);
  T.importJSON = function (text) {
    const j = JSON.parse(text);
    const d = j && j.app === 'musclegain' ? j.data : null;
    const isMap = (x) => x && typeof x === 'object' && !Array.isArray(x);
    if (!isMap(d) || !['weights', 'sets', 'sessions', 'meals'].every((k) => isMap(d[k]))) throw new Error('Not a MuscleGain backup file.');
    T.data = Object.assign(T.empty(), { weights: d.weights, sets: d.sets, sessions: d.sessions, meals: d.meals });
    T.save();
  };
  T.clear = function () { T.data = T.empty(); T.save(); };
  T.isEmpty = () => !['weights', 'sets', 'sessions', 'meals'].some((k) => Object.keys(T.data[k]).length);
})(typeof window !== 'undefined' ? window : globalThis);
