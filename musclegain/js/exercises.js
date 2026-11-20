/* Exercise library, equipment list and goal physiques.
   Exercise photos: free-exercise-db (public domain) — https://github.com/yuhonas/free-exercise-db
   Physique photos: Unsplash (free licence). Swap for your own before going live. */
(function (root) {
  const MG = (root.MG = root.MG || {});

  // Photos live in the project (img/). tools/download-photos.js fetches them again from the sources below.
  MG.IMG_BASE = 'img/exercises/';
  MG.IMG_REMOTE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
  MG.PHYSIQUE_REMOTE = 'https://images.unsplash.com/';

  MG.EQUIPMENT = [
    { id: 'db', name: 'Dumbbells', hint: 'Fixed or adjustable' },
    { id: 'bb', name: 'Barbell & plates', hint: 'Straight or EZ bar' },
    { id: 'bench', name: 'Bench', hint: 'Flat or adjustable' },
    { id: 'rack', name: 'Squat rack', hint: 'Rack or stands' },
    { id: 'bar', name: 'Pull-up bar', hint: 'Doorway bar counts' },
    { id: 'dip', name: 'Dip bars', hint: 'Or parallel bars' },
    { id: 'kb', name: 'Kettlebell', hint: 'One is enough' },
    { id: 'bands', name: 'Resistance bands', hint: 'Loop or tube' },
    { id: 'cable', name: 'Cable machine', hint: 'Pulley / lat pulldown' },
    { id: 'mach', name: 'Gym machines', hint: 'Leg press, leg curl, chest press…' },
  ];


  /* style  -> how sets/reps/rest are written
     goal   -> how calories are set (see planner.js)
     emph   -> share of weekly training volume each muscle should get. The planner builds every session to hit these
               proportions, so this is what makes one goal's program look different from another's.
               Muscles: chest, back, front (front delts), side (side delts), rear (rear delts), bi, tri, quad, ham, glute, calf, abs.
     abs    -> minimum sessions a week with ab work (default 2) */
  const EMPH = (o) => Object.assign({ chest: 1, back: 1.2, front: 0.3, side: 0.8, rear: 0.5, bi: 0.6, tri: 0.6, quad: 1, ham: 0.7, glute: 0.7, calf: 0.4, abs: 0.5 }, o);

  MG.PHYSIQUES = {
    male: [
      { id: 'm_lean', name: 'Lean & Defined', img: 'img/physiques/m_lean.jpg', photo: 'photo-1541521493945-d00ed7dd0d8d',
        blurb: 'Slim waist, visible abs, light athletic muscle.', style: 'lean', goal: 'lean', abs: 3, shred: true,
        emph: EMPH({ side: 1, rear: 0.6, quad: 0.8, glute: 0.6, abs: 0.9 }) },
      { id: 'm_athletic', name: 'Athletic', img: 'img/physiques/m_athletic.jpg', photo: 'photo-1562038969-e85c13ecb2ac',
        blurb: 'Balanced muscle everywhere. Strong, fit and mobile.', style: 'athletic', goal: 'athletic',
        emph: EMPH({ quad: 1.1, ham: 0.8, glute: 0.8, abs: 0.6 }) },
      { id: 'm_muscular', name: 'Muscular & Shredded', img: 'img/physiques/m_muscular.jpg', photo: 'photo-1610312856669-2cee66b2949c',
        blurb: 'Wide shoulders, full chest and arms, low body fat.', style: 'hyp', goal: 'muscular', abs: 3, shred: true,
        emph: EMPH({ chest: 1.5, back: 1.3, side: 1.4, rear: 0.8, bi: 1, tri: 1, quad: 0.8, ham: 0.6, glute: 0.5, abs: 0.7 }) },
      { id: 'm_mass', name: 'Big & Powerful', img: 'img/physiques/m_mass.jpg', photo: 'photo-1626724419913-ac60f768c20f',
        blurb: 'Maximum size and strength. Mass first, abs later.', style: 'mass', goal: 'mass',
        emph: EMPH({ chest: 1.2, back: 1.4, front: 0.4, side: 0.9, bi: 0.7, tri: 0.8, quad: 1.3, ham: 0.9, glute: 0.8, abs: 0.3 }) },
    ],
    female: [
      { id: 'f_toned', name: 'Toned & Slim', img: 'img/physiques/f_toned.jpg', photo: 'photo-1708011108850-49646bd34503',
        blurb: 'Lean all over with light muscle definition.', style: 'lean', goal: 'lean', abs: 3, shred: true,
        emph: EMPH({ chest: 0.6, back: 1, side: 0.7, bi: 0.4, tri: 0.5, quad: 1, ham: 0.8, glute: 1.1, abs: 0.8 }) },
      { id: 'f_defined', name: 'Lean & Defined', img: 'img/physiques/f_defined.jpg', photo: 'photo-1606902965551-dce093cda6e7',
        blurb: 'Visible abs, shaped shoulders and legs.', style: 'hyp', goal: 'athletic', abs: 3, shred: true,
        emph: EMPH({ chest: 0.6, back: 1, side: 1.1, rear: 0.6, bi: 0.5, tri: 0.6, quad: 1, ham: 0.8, glute: 1, abs: 0.9 }) },
      { id: 'f_strong', name: 'Athletic & Strong', img: 'img/physiques/f_strong.jpg', photo: 'photo-1708011108776-45ad9e625269',
        blurb: 'Noticeable muscle and real strength on the big lifts.', style: 'athletic', goal: 'muscular',
        emph: EMPH({ chest: 0.9, quad: 1.1, ham: 0.9, glute: 1, abs: 0.6 }) },
      { id: 'f_curvy', name: 'Curvy & Strong', img: 'img/physiques/f_curvy.jpg', photo: 'photo-1768929035644-6e146b35acd8',
        blurb: 'Glutes and legs first, with a tight waist and toned upper body.', style: 'hyp', goal: 'muscular', focus: 'glutes',
        emph: EMPH({ chest: 0.4, back: 0.8, front: 0.2, side: 0.6, rear: 0.4, bi: 0.3, tri: 0.4, quad: 0.9, ham: 1, glute: 2, calf: 0.3, abs: 0.6 }) },
    ],
  };

  /* kind: compound | iso | core | cardio. fallback: slot used when nothing in this slot fits the equipment. */
  MG.SLOTS = {
    chest_press:    { label: 'Chest', kind: 'compound' },
    chest_incline:  { label: 'Upper chest', kind: 'compound', fallback: 'chest_press' },
    chest_fly:      { label: 'Chest', kind: 'iso', fallback: 'chest_press' },
    shoulder_press: { label: 'Shoulders', kind: 'compound', fallback: 'chest_incline' },
    lateral:        { label: 'Side delts', kind: 'iso' },
    rear_delt:      { label: 'Rear delts', kind: 'iso' },
    row:            { label: 'Back', kind: 'compound' },
    vertical_pull:  { label: 'Lats', kind: 'compound', fallback: 'row' },
    traps:          { label: 'Traps', kind: 'iso' },
    squat:          { label: 'Quads & glutes', kind: 'compound' },
    hinge:          { label: 'Hamstrings & glutes', kind: 'compound' },
    single_leg:     { label: 'Legs', kind: 'compound' },
    quad_iso:       { label: 'Quads', kind: 'iso', fallback: 'single_leg' },
    ham_curl:       { label: 'Hamstrings', kind: 'iso', fallback: 'hinge' },
    glute:          { label: 'Glutes', kind: 'iso' },
    calves:         { label: 'Calves', kind: 'iso' },
    biceps:         { label: 'Biceps', kind: 'iso' },
    triceps:        { label: 'Triceps', kind: 'iso' },
    core:           { label: 'Core', kind: 'core' },
    cardio:         { label: 'Conditioning', kind: 'cardio' },
  };

  /* [photo id, display name, equipment, coaching cue, options]
     equipment: '+' = all needed, '|' = either works, 'bw' = bodyweight only.
     options: lvl = minimum experience (0 beginner, 1 intermediate, 2 advanced), time = held/timed, bwLoad = unweighted,
     easy = a regression, only picked for non-beginners when nothing else fits,
     noMain = fine as an accessory but never the main lift of a day, heavy = needs long rests even when not done first */
  const E = (id, name, req, cue, o) => Object.assign({ id, name, req, cue }, o || {});

  MG.EX = {
    chest_press: [
      E('Barbell_Bench_Press_-_Medium_Grip', 'Barbell Bench Press', 'bb+bench', 'Shoulder blades pinched back and down, bar to mid-chest, feet planted.'),
      E('Dumbbell_Bench_Press', 'Dumbbell Bench Press', 'db+bench', 'Lower until the dumbbells are level with your chest, press up and slightly in.'),
      E('Machine_Bench_Press', 'Machine Chest Press', 'mach', 'Set the seat so handles line up with mid-chest. Control the way back.'),
      E('Dumbbell_Floor_Press', 'Dumbbell Floor Press', 'db', 'Lie on the floor, pause when your upper arms touch down, then press.'),
      E('Alternating_Floor_Press', 'Kettlebell Floor Press', 'kb', 'Press one side at a time, keeping the wrist straight and stacked.'),
      E('Pushups', 'Push-Up', 'bw', 'Body in one straight line, chest to the floor, elbows about 45° from your sides.', { bwLoad: true }),
    ],
    chest_incline: [
      E('Barbell_Incline_Bench_Press_-_Medium_Grip', 'Incline Barbell Press', 'bb+bench', 'Bench at 30°. Bar touches high on the chest, just under the collarbone.'),
      E('Incline_Dumbbell_Press', 'Incline Dumbbell Press', 'db+bench', 'Bench at 30°. Deep stretch at the bottom, do not clang the weights at the top.'),
      E('Leverage_Incline_Chest_Press', 'Incline Machine Press', 'mach', 'Keep your back against the pad and drive the handles up and together.'),
      E('Dips_-_Chest_Version', 'Chest Dip', 'dip', 'Lean forward, elbows slightly flared, lower until shoulders are just below elbows.', { lvl: 1, bwLoad: true }),
      E('Push-Ups_With_Feet_Elevated', 'Feet-Elevated Push-Up', 'bw', 'Feet on a chair or sofa. Higher feet shift more work to the upper chest and shoulders.', { bwLoad: true }),
    ],
    chest_fly: [
      E('Cable_Crossover', 'Cable Crossover', 'cable', 'Slight bend in the elbows, hug a barrel and squeeze the chest for a second.'),
      E('Butterfly', 'Pec Deck Fly', 'mach', 'Lead with the elbows and stop the stretch when shoulders feel tight.'),
      E('Dumbbell_Flyes', 'Dumbbell Fly', 'db+bench', 'Go lighter than you think. Wide arc, soft elbows, stretch then squeeze.'),
      E('Incline_Dumbbell_Flyes', 'Incline Dumbbell Fly', 'db+bench', 'Same as a flat fly on a 30° bench to hit the upper chest.'),
      E('Push-Up_Wide', 'Wide Push-Up', 'bw', 'Hands a palm wider than shoulder width each side. Slow on the way down.', { bwLoad: true }),
    ],
    shoulder_press: [
      E('Standing_Military_Press', 'Overhead Press', 'bb', 'Squeeze glutes and abs, press the bar in a straight line and finish with your head through.'),
      E('Dumbbell_Shoulder_Press', 'Dumbbell Shoulder Press', 'db', 'Forearms vertical the whole time. Lower to ear height.'),
      E('Machine_Shoulder_Military_Press', 'Machine Shoulder Press', 'mach', 'Do not let your lower back arch off the pad.'),
      E('Arnold_Dumbbell_Press', 'Arnold Press', 'db', 'Start palms facing you, rotate out as you press.'),
      E('Two-Arm_Kettlebell_Military_Press', 'Kettlebell Overhead Press', 'kb', 'Kettlebell rests on the back of the forearm. Press without leaning back.'),
      E('Handstand_Push-Ups', 'Handstand Push-Up', 'bw', 'Against a wall. Lower your head to the floor under control.', { lvl: 2, bwLoad: true }),
      E('Shoulder_Press_-_With_Bands', 'Band Shoulder Press', 'bands', 'Stand on the band, press straight up and lock out overhead. Shorten the band to make it harder.', { noMain: true }),
    ],
    lateral: [
      E('Side_Lateral_Raise', 'Dumbbell Lateral Raise', 'db', 'Lead with the elbows and raise to shoulder height. No swinging.'),
      E('Standing_Low-Pulley_Deltoid_Raise', 'Cable Lateral Raise', 'cable', 'Cable crosses in front of the body. Constant tension all the way.'),
      E('Seated_Side_Lateral_Raise', 'Seated Lateral Raise', 'db', 'Sitting removes momentum, so use lighter dumbbells.'),
      E('Lateral_Raise_-_With_Bands', 'Band Lateral Raise', 'bands', 'Stand on the band, raise your arms out to shoulder height and lower slowly against the pull.'),
    ],
    rear_delt: [
      E('Face_Pull', 'Face Pull', 'cable', 'Rope to eye level, pull the ends apart and finish with thumbs pointing behind you.'),
      E('Reverse_Machine_Flyes', 'Reverse Pec Deck', 'mach', 'Arms long, sweep back until they are in line with your shoulders.'),
      E('Seated_Bent-Over_Rear_Delt_Raise', 'Bent-Over Rear Delt Raise', 'db', 'Chest on thighs, raise the dumbbells out wide with pinkies leading.'),
      E('Band_Pull_Apart', 'Band Pull-Apart', 'bands', 'Arms straight, pull the band to your chest by squeezing the shoulder blades.'),
    ],
    row: [
      E('Bent_Over_Barbell_Row', 'Barbell Row', 'bb', 'Hinge to about 45°, flat back, pull the bar to your lower ribs.'),
      E('Seated_Cable_Rows', 'Seated Cable Row', 'cable', 'Chest tall. Pull the handle to your belly button, then let the shoulders reach forward.'),
      E('One-Arm_Dumbbell_Row', 'One-Arm Dumbbell Row', 'db', 'Hand and knee on a bench or chair. Pull the elbow toward your hip.'),
      E('Leverage_Iso_Row', 'Machine Row', 'mach', 'Chest stays on the pad. Drive the elbows back, pause, lower slowly.'),
      E('T-Bar_Row_with_Handle', 'T-Bar Row', 'bb', 'One end of the bar wedged in a corner. Keep your chest up and back flat.', { lvl: 1 }),
      E('Dumbbell_Incline_Row', 'Chest-Supported Dumbbell Row', 'db+bench', 'Lie face-down on an incline bench so your lower back gets a rest.'),
      E('Bent_Over_Two-Dumbbell_Row', 'Bent-Over Dumbbell Row', 'db', 'Both dumbbells together, flat back, squeeze at the top.'),
      E('One-Arm_Kettlebell_Row', 'Kettlebell Row', 'kb', 'Staggered stance, free hand on your knee, row to the hip.'),
      E('Inverted_Row', 'Inverted Row', 'bw', 'Under a sturdy table or low bar. Body straight, pull your chest to the edge.', { bwLoad: true }),
    ],
    vertical_pull: [
      E('Pullups', 'Pull-Up', 'bar', 'Start from a dead hang, drive elbows to your pockets, chin over the bar.', { lvl: 1, bwLoad: true }),
      E('Wide-Grip_Lat_Pulldown', 'Lat Pulldown', 'cable', 'Lean back slightly and pull the bar to your upper chest.'),
      E('Band_Assisted_Pull-Up', 'Band-Assisted Pull-Up', 'bar+bands', 'Loop the band over the bar and under a knee. Use a lighter band as you get stronger.', { bwLoad: true, easy: true }),
      E('Chin-Up', 'Chin-Up', 'bar', 'Palms facing you. If you cannot get 5 reps, jump up and lower yourself for 5 slow seconds.', { bwLoad: true }),
      E('Close-Grip_Front_Lat_Pulldown', 'Close-Grip Pulldown', 'cable', 'Elbows travel down in front of you. Full stretch at the top.'),
      E('Straight-Arm_Dumbbell_Pullover', 'Dumbbell Pullover', 'db+bench', 'Arms almost straight, lower behind your head until the lats stretch.', { noMain: true }),
    ],
    traps: [
      E('Barbell_Shrug', 'Barbell Shrug', 'bb', 'Shrug straight up toward your ears and hold for a second. Do not roll.'),
      E('Dumbbell_Shrug', 'Dumbbell Shrug', 'db', 'Arms long, shoulders up, pause, lower slowly.'),
      E('Cable_Shrugs', 'Cable Shrug', 'cable', 'Stand close to the low pulley and shrug straight up.'),
    ],
    squat: [
      E('Barbell_Squat', 'Barbell Back Squat', 'bb+rack', 'Brace hard, sit between your hips, thighs at least parallel, drive up through mid-foot.', { heavy: true }),
      E('Leg_Press', 'Leg Press', 'mach', 'Lower until knees are near 90° without your hips rolling off the pad. Never lock out hard.'),
      E('Front_Barbell_Squat', 'Front Squat', 'bb+rack', 'Elbows high, torso upright. Great for quads.', { lvl: 1, heavy: true }),
      E('Hack_Squat', 'Hack Squat', 'mach', 'Feet low on the platform for more quads. Go deep and controlled.'),
      E('Goblet_Squat', 'Goblet Squat', 'kb|db', 'Hold the weight at your chest, elbows inside the knees at the bottom.'),
      E('Dumbbell_Squat', 'Dumbbell Squat', 'db', 'Dumbbells at your sides, chest proud, sit down and back.'),
      E('Bodyweight_Squat', 'Bodyweight Squat', 'bw', 'Three seconds down, pause, stand up fast. Add a backpack when 20 reps is easy.', { bwLoad: true }),
      E('Freehand_Jump_Squat', 'Jump Squat', 'bw', 'Squat to parallel and jump. Land soft and go straight into the next rep.', { bwLoad: true, noMain: true }),
    ],
    hinge: [
      E('Barbell_Deadlift', 'Deadlift', 'bb', 'Bar over mid-foot, flat back, push the floor away and stand tall. Reset every rep.', { heavy: true }),
      E('Romanian_Deadlift', 'Romanian Deadlift', 'bb', 'Soft knees, push hips back until the hamstrings stretch, bar stays close to your legs.'),
      E('Stiff-Legged_Dumbbell_Deadlift', 'Dumbbell Romanian Deadlift', 'db', 'Slide the dumbbells down your thighs, hips back, flat back.'),
      E('One-Arm_Kettlebell_Swings', 'Kettlebell Swing', 'kb', 'It is a hip snap, not a squat. The bell floats to chest height.'),
      E('Hyperextensions_Back_Extensions', 'Back Extension', 'mach', 'Pad just below the hips. Rise until your body is straight, not higher.', { noMain: true }),
      E('Pull_Through', 'Cable Pull-Through', 'cable', 'Face away from the pulley, hinge back, then drive hips forward and squeeze.', { noMain: true }),
      E('Band_Good_Morning', 'Band Good Morning', 'bands', 'Stand on the band, loop it over your neck, hinge with a flat back.', { noMain: true }),
      E('Kettlebell_One-Legged_Deadlift', 'Single-Leg Kettlebell Deadlift', 'kb', 'Hips stay square to the floor. Reach the free leg straight back.', { lvl: 1 }),
      E('Single_Leg_Glute_Bridge', 'Single-Leg Glute Bridge', 'bw', 'One foot planted, drive through the heel until hips are fully extended.', { bwLoad: true, noMain: true }),
      E('Butt_Lift_Bridge', 'Glute Bridge', 'bw', 'Ribs down, push through your heels and hold the top for two seconds.', { bwLoad: true, noMain: true }),
    ],
    single_leg: [
      E('Split_Squat_with_Dumbbells', 'Bulgarian Split Squat', 'db+bench', 'Rear foot on the bench, drop straight down, front knee tracks over the toes.'),
      E('Dumbbell_Lunges', 'Dumbbell Lunge', 'db', 'Long step, back knee just above the floor, push back through the front heel.'),
      E('Barbell_Lunge', 'Barbell Lunge', 'bb', 'Stay tall and take a step long enough that the front shin stays near vertical.', { lvl: 1 }),
      E('Dumbbell_Step_Ups', 'Dumbbell Step-Up', 'db', 'Use a bench or stairs. Push through the top foot only, do not bounce off the floor.'),
      E('Dumbbell_Rear_Lunge', 'Reverse Lunge', 'db', 'Step back instead of forward. Easier on the knees.'),
      E('Bodyweight_Walking_Lunge', 'Walking Lunge', 'bw', 'Continuous steps, torso upright. Count reps per leg.', { bwLoad: true }),
      E('Step-up_with_Knee_Raise', 'Step-Up with Knee Raise', 'bw', 'Use stairs or a sturdy chair. Drive the free knee up at the top.', { bwLoad: true, noMain: true }),
      E('Split_Jump', 'Split Jump', 'bw', 'Lunge, jump, switch legs in the air. Land softly.', { lvl: 1, bwLoad: true, noMain: true }),
    ],
    quad_iso: [
      E('Leg_Extensions', 'Leg Extension', 'mach', 'Squeeze hard at the top for a second and lower over three seconds.'),
    ],
    ham_curl: [
      E('Lying_Leg_Curls', 'Lying Leg Curl', 'mach', 'Hips pressed into the pad. Curl all the way, lower slowly.'),
      E('Seated_Leg_Curl', 'Seated Leg Curl', 'mach', 'Lean slightly forward to stretch the hamstrings more.'),
      E('Seated_Band_Hamstring_Curl', 'Band Hamstring Curl', 'bands', 'Anchor the band in front of you and curl your heel under the chair.'),
    ],
    glute: [
      E('Barbell_Hip_Thrust', 'Barbell Hip Thrust', 'bb+bench', 'Upper back on the bench, chin tucked, lock out with the glutes and hold a second.'),
      E('Barbell_Glute_Bridge', 'Barbell Glute Bridge', 'bb', 'Same as a hip thrust but from the floor. Pad the bar.'),
      E('One-Legged_Cable_Kickback', 'Cable Kickback', 'cable', 'Strap on the ankle, kick straight back without arching your lower back.'),
      E('Thigh_Abductor', 'Hip Abduction Machine', 'mach', 'Lean forward a little and push the knees out. Pause when open.'),
      E('Hip_Lift_with_Band', 'Banded Hip Lift', 'bands', 'Band across the hips, anchored under your hands or feet. Squeeze at the top.'),
      E('Single_Leg_Glute_Bridge', 'Single-Leg Glute Bridge', 'bw', 'One foot planted, drive through the heel until hips are fully extended.', { bwLoad: true, noMain: true }),
      E('Glute_Kickback', 'Glute Kickback', 'bw', 'On all fours, press one heel toward the ceiling. Hold the top.', { bwLoad: true, noMain: true }),
      E('Butt_Lift_Bridge', 'Glute Bridge', 'bw', 'Ribs down, push through your heels and hold the top for two seconds.', { bwLoad: true, noMain: true }),
    ],
    calves: [
      E('Standing_Calf_Raises', 'Standing Calf Raise', 'mach', 'Full stretch at the bottom, pause, then all the way up onto the big toe.'),
      E('Seated_Calf_Raise', 'Seated Calf Raise', 'mach', 'Two-second pause in the stretch on every rep.'),
      E('Standing_Barbell_Calf_Raise', 'Barbell Calf Raise', 'bb', 'Balls of the feet on a plate, rise as high as you can.'),
      E('Standing_Dumbbell_Calf_Raise', 'Dumbbell Calf Raise', 'db', 'Stand on a step for extra range. Do one leg at a time when it gets easy.'),
    ],
    biceps: [
      E('Barbell_Curl', 'Barbell Curl', 'bb', 'Elbows pinned to your sides. No leaning back.'),
      E('Dumbbell_Bicep_Curl', 'Dumbbell Curl', 'db', 'Turn the palms up as you curl and lower for three seconds.'),
      E('Standing_Biceps_Cable_Curl', 'Cable Curl', 'cable', 'Step back a little so the weight never rests on the stack.'),
      E('Hammer_Curls', 'Hammer Curl', 'db', 'Palms face each other. Builds the forearms and outer arm.'),
      E('Incline_Dumbbell_Curl', 'Incline Dumbbell Curl', 'db+bench', 'Arms hang behind the body for a big stretch. Use lighter weights.'),
      E('EZ-Bar_Curl', 'EZ-Bar Curl', 'bb', 'Angled grip is kinder on the wrists. Full range.'),
      E('Machine_Preacher_Curls', 'Machine Preacher Curl', 'mach', 'Armpits on the top of the pad. Do not let the weight drop.'),
      E('Concentration_Curls', 'Concentration Curl', 'db', 'Elbow against the inner thigh, squeeze at the top.'),
      E('Chin-Up', 'Chin-Up', 'bar', 'Palms facing you. The best bodyweight biceps builder.', { bwLoad: true }),
    ],
    triceps: [
      E('Triceps_Pushdown', 'Triceps Pushdown', 'cable', 'Elbows glued to your ribs. Lock out and squeeze.'),
      E('EZ-Bar_Skullcrusher', 'Skull Crusher', 'bb+bench', 'Lower the bar just behind your head, elbows pointing at the ceiling.'),
      E('Dips_-_Triceps_Version', 'Triceps Dip', 'dip', 'Stay upright with elbows tucked. Stop when upper arms are parallel to the floor.', { lvl: 1, bwLoad: true }),
      E('Standing_Dumbbell_Triceps_Extension', 'Overhead Dumbbell Extension', 'db', 'One dumbbell in both hands, lower behind the head, elbows in.'),
      E('Triceps_Pushdown_-_Rope_Attachment', 'Rope Pushdown', 'cable', 'Spread the rope apart at the bottom.'),
      E('Lying_Dumbbell_Tricep_Extension', 'Lying Dumbbell Extension', 'db+bench', 'Palms facing each other, lower beside your ears.'),
      E('Tricep_Dumbbell_Kickback', 'Dumbbell Kickback', 'db', 'Upper arm parallel to the floor, straighten fully and hold.'),
      E('Speed_Band_Overhead_Triceps', 'Band Overhead Extension', 'bands', 'Anchor the band low behind you and extend overhead.'),
      E('Bench_Dips', 'Bench Dip', 'bw', 'Hands on a bench or chair, hips close to the edge. Bend legs to make it easier.', { bwLoad: true }),
      E('Push-Ups_-_Close_Triceps_Position', 'Close-Grip Push-Up', 'bw', 'Hands under the chest, elbows brush your ribs.', { bwLoad: true }),
    ],
    core: [
      E('Hanging_Leg_Raise', 'Hanging Leg Raise', 'bar', 'No swinging. Bend the knees to make it easier.', { bwLoad: true }),
      E('Cable_Crunch', 'Cable Crunch', 'cable', 'Hips stay still. Curl your ribs toward your pelvis.'),
      E('Plank', 'Plank', 'bw', 'Squeeze glutes and pull elbows toward toes. Stop when your hips sag.', { time: true }),
      E('Reverse_Crunch', 'Reverse Crunch', 'bw', 'Roll your hips off the floor instead of swinging the legs.', { bwLoad: true }),
      E('Air_Bike', 'Bicycle Crunch', 'bw', 'Slow and deliberate, shoulder to opposite knee.', { bwLoad: true }),
      E('Dead_Bug', 'Dead Bug', 'bw', 'Lower back flat on the floor while the opposite arm and leg reach out.', { bwLoad: true }),
      E('Russian_Twist', 'Russian Twist', 'bw', 'Rotate the ribcage, not just the arms. Hold a weight to progress.', { bwLoad: true }),
      E('Side_Bridge', 'Side Plank', 'bw', 'Straight line from head to heels. Do both sides.', { time: true }),
      E('Flat_Bench_Lying_Leg_Raise', 'Lying Leg Raise', 'bench', 'Lower the legs slowly and stop before your back arches.', { bwLoad: true }),
      E('Crunches', 'Crunch', 'bw', 'Short range, exhale hard at the top.', { bwLoad: true }),
    ],
    cardio: [
      E('Rowing_Stationary', 'Rowing Machine Intervals', 'mach', '30 seconds hard, 60 seconds easy. Legs, then hips, then arms.', { time: true, intervals: true }),
      E('Bicycling_Stationary', 'Bike Intervals', 'mach', '30 seconds hard, 60 seconds easy.', { time: true, intervals: true }),
      E('One-Arm_Kettlebell_Swings', 'Kettlebell Swing Intervals', 'kb', '30 seconds of swings, 30 seconds rest.', { time: true, intervals: true }),
      E('Mountain_Climbers', 'Mountain Climbers', 'bw', '30 seconds on, 30 seconds off. Hips low, knees fast.', { time: true, intervals: true }),
      E('Star_Jump', 'Star Jumps', 'bw', '30 seconds on, 30 seconds off. Land softly.', { time: true, intervals: true }),
    ],
  };
})(typeof window !== 'undefined' ? window : globalThis);
