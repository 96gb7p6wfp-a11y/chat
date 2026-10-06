import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  addGrade,
  addTask,
  createInitialState,
  deleteTask,
  getStats,
  localDateKey,
  makeDailyPlan,
  normalizeState,
  saveProfile,
  saveReflection,
  toggleMilestone,
  toggleTask,
} from './planner.js';

function completedTask(state, { scheduled, completed, category = 'academics', minutes = 20 }) {
  const next = addTask(state, { title: 'A real task', category, date: scheduled, minutes });
  return toggleTask(next, next.tasks.at(-1).id, completed);
}

test('initial state has no invented achievements and separate editable values', () => {
  const initial = createInitialState();
  assert.deepEqual(initial.tasks, []);
  assert.deepEqual(initial.reflections, []);
  assert.deepEqual(initial.grades, []);
  assert.equal(initial.profile.name, '');
  assert.equal(initial.profile.dailyMinutes, 60);
  assert.equal(initial.profile.schoolYear, 'Grade 12');
  assert.equal(initial.profile.schoolSystem, 'Germany · public Gymnasium');
  assert.equal(initial.profile.graduationYear, '2028');
  assert.equal(initial.profile.applicationYear, '');
  assert.equal(initial.profile.subjects, 'English, German');
  assert.ok(initial.milestones.every((milestone) => !milestone.completed));
  initial.profile.name = 'Changed';
  initial.milestones[0].completed = true;
  assert.equal(createInitialState().profile.name, '');
  assert.equal(createInitialState().milestones[0].completed, false);
});

test('daily plans fit the time budget and remain idempotent after task deletion or reload', () => {
  const initial = saveProfile(createInitialState(), { subjects: 'Math, Biology', major: 'Biology', dailyMinutes: 45 });
  const plan = makeDailyPlan(initial, '2026-10-06');
  assert.equal(initial.tasks.length, 0);
  assert.equal(plan.tasks.length, 6);
  assert.equal(new Set(plan.tasks.map((task) => task.category)).size, 6);
  assert.equal(plan.tasks.reduce((sum, task) => sum + task.minutes, 0), 45);
  assert.match(plan.tasks[0].title, /Math/);
  assert.match(plan.tasks.find((task) => task.category === 'activities').title, /Biology/);
  assert.strictEqual(makeDailyPlan(plan, '2026-10-06'), plan);
  const deleted = deleteTask(plan, plan.tasks[0].id);
  const loaded = normalizeState(JSON.parse(JSON.stringify(deleted)));
  assert.strictEqual(makeDailyPlan(loaded, '2026-10-06'), loaded);
  assert.equal(makeDailyPlan(loaded, '2026-10-07').tasks.length, 11);
});

test('six varied recommendations exactly fit all supported budgets and languages stay English/German', () => {
  for (const budget of [20, 21, 45, 60, 90, 240]) {
    const state = saveProfile(createInitialState(), { subjects: 'English, German, Math', dailyMinutes: budget });
    const first = makeDailyPlan(state, '2026-10-06').tasks;
    const second = makeDailyPlan(state, '2026-10-07').tasks;
    assert.equal(first.reduce((sum, task) => sum + task.minutes, 0), budget);
    assert.ok(first.every((task) => task.minutes > 0));
    assert.match(first.find((task) => task.category === 'academics').title, /Math/);
    const firstLanguage = first.find((task) => task.category === 'languages').title;
    const secondLanguage = second.find((task) => task.category === 'languages').title;
    assert.match(firstLanguage, /English|German/);
    assert.doesNotMatch(firstLanguage, /Math/);
    assert.ok(firstLanguage.includes('English') !== secondLanguage.includes('English'));
    assert.notEqual(first.find((task) => task.category === 'confidence').title, second.find((task) => task.category === 'confidence').title);
  }
});

test('completing overdue work records the actual completion month and survives reload', () => {
  const completedAt = new Date(2026, 9, 1, 12, 30);
  const state = completedTask(createInitialState(), { scheduled: '2026-09-30', completed: completedAt });
  assert.equal(state.tasks[0].date, '2026-09-30');
  assert.equal(state.tasks[0].completedAt, completedAt.toISOString());
  const loaded = normalizeState(JSON.parse(JSON.stringify(state)));
  const october = getStats(loaded, '2026-10-01');
  assert.equal(october.month.completed, 1);
  assert.equal(october.today.completed, 1);
  assert.equal(october.today.total, 0);
  assert.equal(getStats(loaded, '2026-09-30').month.completed, 0);
  const undone = toggleTask(loaded, state.tasks[0].id);
  assert.equal(undone.tasks[0].completedAt, null);
  assert.equal(getStats(undone, '2026-10-01').overall.completed, 0);
});

test('monthly categories, minutes, and weekly data count only real completed work', () => {
  let state = createInitialState();
  state = completedTask(state, { scheduled: '2026-10-01', completed: new Date(2026, 9, 1, 13), category: 'academics', minutes: 30 });
  state = completedTask(state, { scheduled: '2026-09-25', completed: new Date(2026, 9, 5, 13), category: 'activities', minutes: 25 });
  state = completedTask(state, { scheduled: '2026-09-29', completed: new Date(2026, 8, 29, 13), category: 'reflection', minutes: 5 });
  state = addTask(state, { title: 'Still to do', date: '2026-10-06', minutes: 15 });
  const stats = getStats(state, '2026-10-06');
  assert.equal(stats.month.completed, 2);
  assert.equal(stats.month.completedMinutes, 55);
  assert.deepEqual(stats.month.categories, { academics: 1, languages: 0, confidence: 0, wellbeing: 0, activities: 1, reflection: 0 });
  assert.equal(stats.overall.completed, 3);
  assert.equal(stats.overall.completedMinutes, 60);
  assert.equal(stats.today.remaining, 1);
  assert.equal(stats.today.plannedMinutes, 15);
  assert.equal(stats.weekly7.length, 7);
  assert.equal(stats.weekly7[0].date, '2026-09-30');
  assert.equal(stats.weekly7[5].completed, 1);
  assert.equal(stats.weekly7[5].minutes, 25);
});

test('streak allows today to remain unfinished but breaks across a missed day', () => {
  let state = createInitialState();
  for (const day of [2, 3, 4, 5]) {
    state = completedTask(state, { scheduled: `2026-10-0${day}`, completed: new Date(2026, 9, day, 12) });
  }
  assert.equal(getStats(state, '2026-10-06').streak, 4);
  assert.equal(getStats(state, '2026-10-07').streak, 0);
  state = completedTask(state, { scheduled: '2026-10-06', completed: new Date(2026, 9, 6, 12) });
  assert.equal(getStats(state, '2026-10-06').streak, 5);
});

test('local calendar dates and completion stats do not accidentally use UTC', () => {
  assert.equal(localDateKey(new Date(2026, 9, 6, 0, 5)), '2026-10-06');
  const moduleUrl = new URL('./planner.js', import.meta.url).href;
  const script = `
    import { addTask, createInitialState, getStats, localDateKey, toggleTask } from ${JSON.stringify(moduleUrl)};
    const at = new Date('2026-10-01T00:30:00Z');
    let state = addTask(createInitialState(), {title:'Overdue work',date:'2026-10-01',minutes:10});
    state = toggleTask(state, state.tasks[0].id, at);
    process.stdout.write(JSON.stringify({key:localDateKey(at),september:getStats(state,'2026-09-30').month.completed,october:getStats(state,'2026-10-01').month.completed}));
  `;
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: 'America/Los_Angeles' },
    encoding: 'utf8',
  }));
  assert.deepEqual(result, { key: '2026-09-30', september: 1, october: 0 });
});

test('normalization rejects invalid records without fabricating completion timestamps', () => {
  const state = normalizeState({
    profile: { name: ' Alex ', dailyMinutes: 'not a number' },
    tasks: [
      { id: 'a', title: 'Valid scheduled task', date: '2026-10-06', completed: true },
      { id: 'b', title: 'Impossible date', date: '2026-02-30', completed: false },
      { id: 'a', title: 'Duplicate', date: '2026-10-06' },
    ],
    reflections: [{ date: '2026-10-06', achieved: 'Learned something' }, { date: 'invalid' }],
    generatedPlanDates: ['2026-10-06', 'invalid', '2026-10-06'],
  });
  assert.equal(state.profile.name, 'Alex');
  assert.equal(state.profile.dailyMinutes, 60);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].completed, false);
  assert.equal(state.tasks[0].completedAt, null);
  assert.equal(state.reflections.length, 1);
  assert.deepEqual(state.generatedPlanDates, ['2026-10-06']);
  assert.deepEqual(normalizeState(null), createInitialState());
});

test('reflections replace the same day and milestones toggle without changing source state', () => {
  const initial = createInitialState();
  let next = saveReflection(initial, { date: '2026-10-06', achieved: 'Read a chapter', next: 'Review notes' });
  next = saveReflection(next, { date: '2026-10-06', achieved: 'Read two chapters' });
  assert.equal(next.reflections.length, 1);
  assert.equal(next.reflections[0].achieved, 'Read two chapters');
  assert.equal(initial.reflections.length, 0);
  const toggled = toggleMilestone(next, next.milestones[0].id);
  assert.equal(toggled.milestones[0].completed, true);
  assert.equal(next.milestones[0].completed, false);
});

test('grades reject invalid points and empty subjects while accepting actual zero-point records', () => {
  const initial = createInitialState();
  for (const points of [-1, 16, NaN, Infinity, '', null, '12']) {
    assert.strictEqual(addGrade(initial, { subject: 'English', points, date: '2026-10-06' }), initial);
  }
  assert.strictEqual(addGrade(initial, { subject: ' ', points: 12, date: '2026-10-06' }), initial);
  const recorded = addGrade(initial, { subject: 'English', points: 0, note: 'Real assessment', date: '2026-10-06' });
  assert.equal(initial.grades.length, 0);
  assert.equal(recorded.grades[0].points, 0);
  assert.equal(recorded.grades[0].note, 'Real assessment');
});

test('grade summaries use recorded points, calendar months, and the latest subject record', () => {
  const initial = createInitialState();
  assert.deepEqual(getStats(initial, '2026-10-06').grades, { count: 0, average: null, monthCount: 0, bySubject: [] });
  let state = addGrade(initial, { subject: 'English', points: 10, date: '2026-09-30' });
  state = addGrade(state, { subject: 'english', points: 14, date: '2026-10-03' });
  state = addGrade(state, { subject: 'German', points: 9, date: '2026-10-04' });
  const stats = getStats(state, '2026-10-06').grades;
  assert.equal(stats.count, 3);
  assert.equal(stats.average, 11);
  assert.equal(stats.monthCount, 2);
  const english = stats.bySubject.find((entry) => entry.subject.toLowerCase() === 'english');
  assert.equal(english.count, 2);
  assert.equal(english.average, 12);
  assert.equal(english.latestPoints, 14);
  assert.equal(english.latestDate, '2026-10-03');
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(state))).grades, state.grades);
});

test('import normalization discards invalid grade records and preserves unknown application timing', () => {
  const state = normalizeState({ grades: [
    { id: 'a', subject: 'English', points: 12, date: '2026-10-06' },
    { id: 'b', subject: 'German', points: 19, date: '2026-10-06' },
    { id: 'c', subject: 'German', points: null, date: '2026-10-06' },
    { id: 'd', subject: '', points: 12, date: '2026-10-06' },
    { id: 'a', subject: 'Duplicate', points: 15, date: '2026-10-06' },
    { id: 'e', subject: 'German', points: 12, date: '2026-02-30' },
  ] });
  assert.equal(state.grades.length, 1);
  assert.equal(state.profile.graduationYear, '2028');
  assert.equal(state.profile.applicationYear, '');
});
