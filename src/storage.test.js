import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData, createPersonalProfile, ensureDailyPlan, normalizeData, saveSubject, saveTaskNotes, saveTaskReview, skipTask, addGrade as recordGrade, removeGrade as deleteGrade } from './coach.js';
import { createStudyState, finishStudy, getStudyStats, getStudyTimer, pauseStudy, resumeStudy, startStudy } from './study.js';
import { getEventPlan, saveEvent } from './events.js';
import { addGrade, addTask, createInitialState, saveReflection, toggleTask } from './planner.js';
import { LEGACY_KEY, MAX_BACKUP_BYTES, STORAGE_KEY, loadData, parseBackup, saveData, serializeBackup } from './storage.js';

const TODAY = '2026-10-08';

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    values,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function realLegacyData() {
  let data = addTask(createInitialState(), { title: 'Finish one real analysis paragraph', date: TODAY, minutes: 20 });
  data = toggleTask(data, data.tasks[0].id, new Date('2026-10-08T14:20:00Z'));
  data = addGrade(data, { subject: 'English', points: 0, date: TODAY, note: 'A real zero-point assessment' });
  data = saveReflection(data, { date: TODAY, achieved: 'I completed my writing practice', next: 'Get teacher feedback' });
  data.milestones[0].completed = true;
  data.profile.gradeGoal = 'Reach at least 10 points in English and Mathematics.';
  return data;
}

test('a new installation opens the supplied personal profile and onboarding without invented history', () => {
  const storage = memoryStorage();
  const result = loadData(storage, TODAY);
  assert.equal(result.writable, true);
  assert.equal(result.warning, '');
  assert.equal(result.data.version, 2);
  assert.equal(result.data.onboardingCompleted, false);
  assert.equal(result.data.demo, false);
  assert.ok(result.data.tasks.length > 0);
  assert.ok(result.data.tasks.filter(task => task.date === TODAY).every((task) => !task.completed && !task.completedAt));
  assert.ok(result.data.tasks.every(task => !task.completed));
  assert.equal(result.data.subjects.find(subject => subject.id === 'mathematics').written, 6);
  assert.equal(result.data.subjects.find(subject => subject.id === 'english').written, null);
  assert.equal(result.data.exams.length, 0);
  assert.equal(result.data.grades.length, 0);
  assert.equal(storage.values.size, 0, 'Loading never mutates storage until autosave is requested');
});

test('local data survives save and reload without changing completions or identifiers', () => {
  const storage = memoryStorage();
  const first = ensureDailyPlan(createInitialData({ today: TODAY, demo: true }), TODAY);
  assert.deepEqual(saveData(first, storage), { ok: true, error: '' });
  const loaded = loadData(storage, TODAY);
  assert.equal(loaded.warning, '');
  assert.deepEqual(loaded.data, first);
  assert.deepEqual(JSON.parse(serializeBackup(first)), first);
});

test('legacy migration preserves real tasks, zero-point grades and reflections and leaves the original untouched', () => {
  const legacy = realLegacyData();
  const raw = JSON.stringify(legacy);
  const storage = memoryStorage({ [LEGACY_KEY]: raw });
  const result = loadData(storage, TODAY);
  assert.equal(result.writable, true);
  assert.equal(result.data.version, 2);
  assert.equal(result.data.onboardingCompleted, true);
  assert.equal(result.data.profile.academicGoalNotes, legacy.profile.gradeGoal);
  assert.match(result.warning, /upgraded/i);
  const task = result.data.tasks.find((record) => record.id === legacy.tasks[0].id);
  assert.equal(task.title, legacy.tasks[0].title);
  assert.equal(task.completedAt, legacy.tasks[0].completedAt);
  assert.equal(task.completed, true);
  const grade = result.data.grades.find((record) => record.id === legacy.grades[0].id);
  assert.equal(grade.points, 0);
  assert.ok(result.data.reflections.some((record) => record.achieved === legacy.reflections[0].achieved));
  assert.equal(result.data.legacyMilestones.find(record => record.id === legacy.milestones[0].id).completed, true);
  assert.ok(result.data.roadmapCompleted.length > 0, 'Existing milestone progress is mapped to the new pathway');
  assert.equal(storage.getItem(LEGACY_KEY), raw);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(saveData(result.data, storage).ok, true);
  assert.equal(storage.getItem(LEGACY_KEY), raw);
  assert.ok(loadData(storage, TODAY).data.tasks.some((record) => record.completedAt === legacy.tasks[0].completedAt));
});

test('a malformed saved state is preserved byte-for-byte before the replacement can be saved', () => {
  const raw = '{ "version": 2, BROKEN';
  const storage = memoryStorage({ [STORAGE_KEY]: raw });
  const result = loadData(storage, TODAY);
  assert.equal(result.writable, true);
  assert.match(result.warning, /original data.*preserved/i);
  const recoveryEntries = [...storage.values].filter(([key]) => key.startsWith(`${STORAGE_KEY}.recovery.`));
  assert.equal(recoveryEntries.length, 1);
  assert.equal(recoveryEntries[0][1], raw);
  assert.equal(storage.getItem(STORAGE_KEY), raw, 'Loading alone never replaces the unreadable original');
  assert.equal(saveData(result.data, storage).ok, true);
  assert.equal(storage.getItem(recoveryEntries[0][0]), raw);
});

test('malformed nested saved data is preserved before a clean personal profile can replace it', () => {
  for (const field of ['profile', 'schedule', 'study']) {
    const invalid = createPersonalProfile({ today: TODAY });
    invalid[field] = null;
    const raw = JSON.stringify(invalid);
    const storage = memoryStorage({ [STORAGE_KEY]: raw });
    const result = loadData(storage, TODAY);
    assert.equal(result.writable, true);
    assert.equal(result.data.demo, false);
    assert.ok([...storage.values].some(([key, content]) => key.startsWith(`${STORAGE_KEY}.recovery.`) && content === raw));
    assert.equal(storage.getItem(STORAGE_KEY), raw);
    assert.equal(saveData(result.data, storage).ok, true);
  }
});

test('the supplied profile and unknown activity details survive backup and ordinary reload', () => {
  const storage = memoryStorage();
  const state = ensureDailyPlan(createPersonalProfile({ today: TODAY }), TODAY);
  assert.equal(saveData(state, storage).ok, true);
  assert.deepEqual(loadData(storage, TODAY).data, state);
  assert.deepEqual(parseBackup(serializeBackup(state), TODAY), state);
});

test('skipped-task drafts survive local reload and backup; invalid skip flags cannot overwrite valid saved data', () => {
  const storage = memoryStorage();
  let state = ensureDailyPlan(createPersonalProfile({ today: TODAY }), TODAY);
  const task = state.tasks[0];
  state = saveTaskNotes(state, task.id, 'Keep this draft even when I skip today.');
  state = skipTask(state, task.id);
  state = ensureDailyPlan(state, TODAY);
  assert.equal(saveData(state, storage).ok, true);
  const restored = loadData(storage, TODAY).data;
  assert.equal(restored.tasks.find(item => item.id === task.id).skipped, true);
  assert.equal(restored.tasks.find(item => item.id === task.id).notes, 'Keep this draft even when I skip today.');
  assert.deepEqual(parseBackup(serializeBackup(restored), TODAY), restored);
  const original = storage.getItem(STORAGE_KEY);
  for (const update of [ { skipped: 'yes' }, { skipped: true, completed: true, completedAt: `${TODAY}T18:00:00Z` } ]) {
    const invalid = structuredClone(restored);
    Object.assign(invalid.tasks.find(item => item.id === task.id), update);
    assert.equal(saveData(invalid, storage).ok, false);
    assert.equal(storage.getItem(STORAGE_KEY), original);
  }
});

test('failure to preserve a corrupt original pauses autosaving instead of destroying it', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: 'corrupt original' });
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  const result = loadData(storage, TODAY);
  assert.equal(result.writable, false);
  assert.match(result.warning, /paused to protect the original/i);
  assert.equal(storage.getItem(STORAGE_KEY), 'corrupt original');
});

test('storage security and quota failures surface actionable errors without crashing the app', () => {
  const blocked = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('SecurityError'); },
  };
  const result = loadData(blocked, TODAY);
  assert.equal(result.writable, false);
  assert.match(result.warning, /cannot read saved data/i);
  const saved = saveData(result.data, blocked);
  assert.equal(saved.ok, false);
  assert.match(saved.error, /export a backup/i);
});

test('backup import rejects JSON, versions, wrong entities, duplicate IDs, impossible dates and out-of-range points', () => {
  assert.throws(() => parseBackup('not json', TODAY), /valid JSON/);
  assert.throws(() => parseBackup('null', TODAY), /state object/);
  assert.throws(() => parseBackup('{"version":99}', TODAY), /version/);
  const legacy = realLegacyData();
  for (const mutate of [
    (value) => { value.profile = []; },
    (value) => { value.tasks = {}; },
    (value) => { value.tasks.push({ ...value.tasks[0] }); },
    (value) => { value.tasks[0].date = '2026-02-30'; },
    (value) => { value.tasks[0].completedAt = null; },
    (value) => { value.grades[0].points = -1; },
    (value) => { value.grades[0].points = 16; },
    (value) => { value.grades[0].points = '7'; },
    (value) => { value.grades.push({ ...value.grades[0] }); },
    (value) => { value.reflections[0].date = '2026-11-31'; },
  ]) {
    const invalid = structuredClone(legacy);
    mutate(invalid);
    assert.throws(() => parseBackup(JSON.stringify(invalid), TODAY), /Invalid Northstar backup/);
  }
  const migrated = parseBackup(JSON.stringify(legacy), TODAY);
  assert.equal(migrated.grades[0].points, 0);
});

test('backup size is measured in UTF-8 bytes and an oversized backup is rejected before parsing', () => {
  const overLimit = 'é'.repeat(Math.ceil(MAX_BACKUP_BYTES / 2) + 1);
  assert.throws(() => parseBackup(overLimit, TODAY), /larger than 20 MB/);
});

test('invalid new data never replaces the last valid saved plan', () => {
  const storage = memoryStorage();
  const data = ensureDailyPlan(createInitialData({ today: TODAY, demo: true }), TODAY);
  assert.equal(saveData(data, storage).ok, true);
  const original = storage.getItem(STORAGE_KEY);
  const invalid = structuredClone(data);
  invalid.tasks.push({ ...invalid.tasks[0] });
  const result = saveData(invalid, storage);
  assert.equal(result.ok, false);
  assert.match(result.error, /duplicate/i);
  assert.equal(storage.getItem(STORAGE_KEY), original);
});

test('current backups reject malformed subject grades, exams, schedules and task records', () => {
  const state = ensureDailyPlan(createInitialData({ today: TODAY, demo: true }), TODAY);
  for (const mutate of [
    (data) => { data.subjects[0].written = 16; },
    (data) => { data.subjects.push({ ...data.subjects[0] }); },
    (data) => { data.exams = [{ id: 'exam-invalid', subjectId: data.subjects[0].id, title: 'Impossible exam', date: '2026-02-30', topics: [], format: 'written' }]; },
    (data) => { data.tasks[0].date = '2026-11-31'; },
    (data) => { data.tasks[0].minutes = -10; },
    (data) => { data.schedule.weekly[0].minutes = 721; },
    (data) => { data.schedule.weekly[1].day = data.schedule.weekly[0].day; },
    (data) => { data.schedule.weekly[0].windowEnd = data.schedule.weekly[0].windowStart; },
    (data) => { data.schedule.fixedActivities = [{ id: 'invalid-activity', title: 'Work', days: [], date: '', start: '17:00', end: '18:00' }]; },
  ]) {
    const invalid = structuredClone(state);
    mutate(invalid);
    assert.throws(() => parseBackup(JSON.stringify(invalid), TODAY), /Invalid Northstar backup/);
  }
});

test('a personal backup retains every coaching module, unknown valid test status, and archived-subject history', () => {
  const state = ensureDailyPlan(createInitialData({ today: TODAY, demo: false }), TODAY);
  state.onboardingCompleted = true;
  state.profile.name = 'Test student';
  state.profile.testPlans = [{ id: 'real-ielts', name: 'IELTS', status: 'Awaiting university confirmation', targetDate: '2027-06-12', targetScore: '7.5', notes: 'Check whether my selected programmes need a language certificate.' }];
  state.subjects[0] = { ...state.subjects[0], written: 6, oral: 11, target: 10, weakTopics: ['Derivatives'], enabled: false };
  state.grades = [{ id: 'real-grade-zero', subjectId: state.subjects[0].id, points: 0, type: 'written', date: TODAY, note: 'Keep archived subject records' }];
  state.exams = [{ id: 'real-exam', subjectId: 'english', title: 'English analysis exam', date: '2026-10-26', topics: ['American Dream', 'Analysis'], format: 'written', target: 11 }];
  state.activities = [{ id: 'real-volleyball', name: 'Volleyball captain', type: 'Sport', startDate: '2024-09-01', hoursPerWeek: 6, weeksPerYear: 40, description: 'Prepare drills and support new team members.', achievements: 'Led two training sessions.', impact: 'Four new players joined the beginner practice.' }];
  state.universities.push({ id: 'real-germany', name: 'German university research', country: 'Germany', program: 'Business Informatics', deadline: '2028-07-15', requirements: 'Verify the actual 2028 application deadline and route.', notes: 'Research sample saved by the user', url: 'https://example.com/programme', status: 'shortlisted' });
  state.weeklyReviews = [{ weekStart: '2026-10-05', reflection: 'Review small progress instead of building a backlog.', focusSubjectId: 'english', effort: 'lighter', completedAt: '2026-10-11T15:00:00.000Z' }];
  state.reflections = [{ date: TODAY, achieved: 'Practised a summary paragraph', next: 'Check sentence structure', gratitude: 'Teacher feedback', intention: 'Begin after school' }];
  state.schedule.timeOverrides = [{ date: TODAY, minutes: 40 }];
  state.schedule.fixedActivities = [{ id: 'real-work', title: 'Restaurant work', days: [6], date: '', start: '16:00', end: '18:00', category: 'work' }];
  state.roadmapCompleted = ['usa-research'];
  state.dismissedTaskIds = ['generated-old-task'];
  const canonical = normalizeData(state, TODAY);
  const restored = parseBackup(serializeBackup(canonical), TODAY);
  assert.deepEqual(restored, canonical);
  assert.equal(restored.profile.testPlans[0].status, 'Awaiting university confirmation');
  assert.equal(restored.grades[0].points, 0);
  assert.equal(restored.subjects[0].enabled, false);
  assert.equal(restored.activities[0].impact, state.activities[0].impact);
  assert.deepEqual(restored.weeklyReviews, state.weeklyReviews);
});

test('backup validation rejects excessive text or dates in nested plans instead of silently truncating them', () => {
  const state = ensureDailyPlan(createInitialData({ today: TODAY, demo: false }), TODAY);
  for (const mutate of [
    (value) => { value.tasks[0].title = 'x'.repeat(301); },
    (value) => { value.tasks[0].reason = 'x'.repeat(1201); },
    (value) => { value.profile.testPlans = [{ id: 'invalid-test', name: 'IELTS', targetDate: '2027-02-29' }]; },
    (value) => { value.weeklyReviews = [{ weekStart: '2026-10-06', reflection: 'Starts on a Tuesday', effort: 'same', completedAt: null }]; },
    (value) => { value.universities[0].url = 'javascript:alert(1)'; },
    (value) => { value.reflections = [{ date: TODAY, achieved: 'x'.repeat(4001) }]; },
  ]) {
    const invalid = structuredClone(state);
    mutate(invalid);
    assert.throws(() => parseBackup(JSON.stringify(invalid), TODAY), /Invalid Northstar backup/);
  }
});

test('records which normalization would discard are rejected, while old task references can remain', () => {
  const state = ensureDailyPlan(createInitialData({ today: TODAY, demo: false }), TODAY);
  const invalid = structuredClone(state);
  invalid.grades = [{ id: 'unmatched-grade', subjectId: 'missing-subject', points: 8, type: 'written', date: TODAY, note: 'Do not silently discard this record' }];
  assert.throws(() => parseBackup(JSON.stringify(invalid), TODAY), /cannot be restored/i);
  const history = normalizeData(state, TODAY);
  history.tasks[0].subjectId = 'a-subject-removed-after-this-task';
  history.tasks[0].examId = 'an-exam-removed-after-this-task';
  const restored = parseBackup(serializeBackup(history), TODAY);
  assert.equal(restored.tasks[0].subjectId, history.tasks[0].subjectId);
  assert.equal(restored.tasks[0].examId, history.tasks[0].examId);
});

test('starting written and oral grades survive grade records, backup reload, and deletion of the last result', () => {
  const storage = memoryStorage();
  let state = ensureDailyPlan(createInitialData({ today: TODAY, demo: false }), TODAY);
  state = saveSubject(state, { id: 'mathematics', written: 6, oral: 11, target: 10 });
  state = recordGrade(state, { id: 'new-zero-grade', subjectId: 'mathematics', points: 0, type: 'written', date: TODAY, note: 'A real zero-point result' });
  const recorded = state.subjects.find(subject => subject.id === 'mathematics');
  assert.equal(recorded.written, 0);
  assert.equal(recorded.oral, 11);
  assert.equal(recorded.baselineWritten, 6);
  assert.equal(recorded.baselineOral, 11);
  assert.equal(saveData(state, storage).ok, true);
  const reloaded = loadData(storage, TODAY);
  assert.equal(reloaded.warning, '');
  const restored = parseBackup(serializeBackup(reloaded.data), TODAY);
  const deleted = deleteGrade(restored, 'new-zero-grade');
  const subject = deleted.subjects.find(item => item.id === 'mathematics');
  assert.equal(subject.written, 6);
  assert.equal(subject.oral, 11);
  assert.equal(subject.baselineWritten, 6);
  assert.equal(subject.baselineOral, 11);
});

test('a genuine zero baseline remains distinct from unknown grades after saving and record deletion', () => {
  let state = ensureDailyPlan(createInitialData({ today: TODAY, demo: false }), TODAY);
  state = saveSubject(state, { id: 'english', written: 0, oral: null });
  state = recordGrade(state, { id: 'new-english-grade', subjectId: 'english', points: 8, type: 'written', date: TODAY });
  const restored = parseBackup(serializeBackup(state), TODAY);
  const subject = deleteGrade(restored, 'new-english-grade').subjects.find(item => item.id === 'english');
  assert.equal(subject.written, 0);
  assert.equal(subject.baselineWritten, 0);
  assert.equal(subject.oral, null);
  assert.equal(subject.baselineOral, null);
});

test('baseline grades are optional in old v2 backups, but invalid supplied baselines are rejected', () => {
  const state = normalizeData(createInitialData({ today: TODAY, demo: false }), TODAY);
  const oldBackup = structuredClone(state);
  for (const subject of oldBackup.subjects) {
    delete subject.baselineWritten;
    delete subject.baselineOral;
  }
  const compatible = parseBackup(JSON.stringify(oldBackup), TODAY);
  assert.equal(compatible.subjects.length, state.subjects.length);
  for (const baseline of [-1, 16, '6', false]) {
    const invalid = structuredClone(state);
    invalid.subjects[0].baselineWritten = baseline;
    assert.throws(() => parseBackup(JSON.stringify(invalid), TODAY), /Invalid Northstar backup/);
  }
});

test('old v2 backups receive empty focus and self-review data without losing their tasks', () => {
  const old = ensureDailyPlan(createInitialData({ today: TODAY, demo: false }), TODAY);
  delete old.study;
  for (const task of old.tasks) delete task.selfReview;
  const restored = parseBackup(JSON.stringify(old), TODAY);
  assert.deepEqual(restored.study, createStudyState());
  assert.equal(restored.tasks.length, old.tasks.length);
  assert.ok(restored.tasks.every(task => Array.isArray(task.selfReview) && task.selfReview.length === 0));
});

test('focus backups preserve running, paused and saved session intervals and independent task completion', () => {
  let state = ensureDailyPlan(createInitialData({ today: TODAY, demo: false }), TODAY);
  const task = state.tasks[0];
  state = startStudy(state, task, `${TODAY}T14:00:00Z`, 5);
  state = parseBackup(serializeBackup(state), TODAY);
  assert.equal(getStudyTimer(state, `${TODAY}T14:00:30Z`).elapsedSeconds, 30);
  state = pauseStudy(state, `${TODAY}T14:00:30Z`);
  state = parseBackup(serializeBackup(state), TODAY);
  assert.equal(getStudyTimer(state, `${TODAY}T16:00:00Z`).elapsedSeconds, 30);
  assert.equal(state.study.active.runningSince, null);
  state = resumeStudy(state, `${TODAY}T16:00:00Z`);
  state = finishStudy(state, `${TODAY}T16:00:30Z`);
  state = saveTaskReview(state, task.id, ['clear-claim', 'evidence']);
  const restored = parseBackup(serializeBackup(state), TODAY);
  assert.deepEqual(restored.study, state.study);
  assert.equal(getStudyStats(restored).seconds, 60);
  assert.equal(restored.tasks.find(item => item.id === task.id).completed, false);
  assert.deepEqual(restored.tasks.find(item => item.id === task.id).selfReview, ['clear-claim', 'evidence']);
});

test('invalid focus records are rejected before they can overwrite the last valid saved data', () => {
  let state = ensureDailyPlan(createInitialData({ today: TODAY, demo: false }), TODAY);
  state = startStudy(state, state.tasks[0], `${TODAY}T14:00:00Z`, 5);
  state = finishStudy(state, `${TODAY}T14:01:00Z`);
  state = startStudy(state, state.tasks[1], `${TODAY}T15:00:00Z`, 5);
  const storage = memoryStorage();
  assert.equal(saveData(state, storage).ok, true);
  const original = storage.getItem(STORAGE_KEY);
  for (const mutate of [
    data => { data.study = null; },
    data => { data.study.active.category = 'made-up'; },
    data => { data.study.active.targetSeconds = 0; },
    data => { data.study.active.targetSeconds = 10801; },
    data => { data.study.active.runningSince = `${TODAY}T15:00:00`; },
    data => { data.study.active.startedAt = '2026-02-30T15:00:00Z'; },
    data => { data.study.active.timeZone = 'Invalid/Zone'; },
    data => { data.study.active.id = data.study.sessions[0].id; },
    data => { data.study.sessions.push({ ...data.study.sessions[0] }); },
    data => { data.study.sessions[0].seconds = 999; },
    data => { data.study.sessions[0].endedAt = `${TODAY}T13:59:00Z`; },
    data => { data.study.sessions[0].intervals[0].end = `${TODAY}T13:59:00Z`; },
    data => { data.study.sessions[0].intervals.push({ ...data.study.sessions[0].intervals[0] }); },
    data => { data.study.active.intervals = [{ start: `${TODAY}T15:00:00Z`, end: `${TODAY}T15:01:00Z` }]; },
    data => { data.study.active.startedAt = `${TODAY}T14:00:00Z`; data.study.active.runningSince = `${TODAY}T14:00:00Z`; },
    data => { data.study.sessions.push({ ...data.study.sessions[0], id: 'overlapping-log' }); },
    data => { data.tasks[0].selfReview = ['claim', 'claim']; },
    data => { data.tasks[0].selfReview = ['claim', 4]; },
    data => { data.tasks[0].selfReview = ['x'.repeat(151)]; },
  ]) {
    const invalid = structuredClone(state);
    mutate(invalid);
    assert.throws(() => parseBackup(JSON.stringify(invalid), TODAY), /Invalid Northstar backup/);
    assert.equal(saveData(invalid, storage).ok, false);
    assert.equal(storage.getItem(STORAGE_KEY), original);
  }
});

test('old v2 backups without unified events or linked roadmap fields remain compatible', () => {
  const old = ensureDailyPlan(createInitialData({ today: TODAY, demo: false }), TODAY);
  delete old.events;
  for (const task of old.tasks) {
    for (const field of ['eventId', 'eventSourceId', 'eventStage', 'roadmapItemId', 'roadmapStepId', 'linkedGoal']) delete task[field];
  }
  const restored = parseBackup(JSON.stringify(old), TODAY);
  assert.deepEqual(restored.events, []);
  assert.equal(restored.tasks.length, old.tasks.length);
  assert.ok(restored.tasks.every(task => task.eventId === '' && task.roadmapItemId === '' && task.linkedGoal === ''));
});

test('portable backups retain event preparation, structured achievements, linked goals and measured study together', () => {
  let state = ensureDailyPlan(createInitialData({ today: TODAY, demo: false }), TODAY);
  state = saveEvent(state, { id: 'real-project', title: 'Restaurant campaign deadline', type: 'project', date: '2026-10-18', endDate: '', createdDate: TODAY, intent: 'deadline', pathway: 'Both', minutes: 25, priority: 'high', status: 'planned', notes: 'Measure my contribution through bookings.', goalId: 'activities', resource: 'https://example.com/campaign' });
  state.activities = [{ id: 'actual-work', name: 'Restaurant management', type: 'Work / Entrepreneurship', startDate: '2025-02-01', endDate: '2026-09-30', updatedDate: TODAY, hoursPerWeek: 4, weeksPerYear: 36, description: 'Support restaurant operations.', responsibilities: 'Schedule shifts and plan marketing.', achievements: 'Led the summer campaign.', impact: 'Twenty verified bookings.', notes: 'Keep supervisor feedback and dated evidence.' }];
  state.tasks[0] = { ...state.tasks[0], eventId: 'custom:real-project', eventSourceId: 'real-project', eventStage: 'build', roadmapItemId: 'usa-activities', roadmapStepId: 'usa-activities-impact', linkedGoal: 'Build an honest, sustained extracurricular profile', selfReview: ['evidence'], notes: 'Draft campaign results.' };
  state = startStudy(state, state.tasks[0], `${TODAY}T14:00:00Z`, 5);
  state = finishStudy(state, `${TODAY}T14:01:00Z`);
  const canonical = normalizeData(state, TODAY);
  const restored = parseBackup(serializeBackup(canonical), TODAY);
  assert.deepEqual(restored, canonical);
  assert.equal(restored.events[0].createdDate, TODAY);
  assert.equal(restored.activities[0].responsibilities, 'Schedule shifts and plan marketing.');
  assert.equal(restored.activities[0].endDate, '2026-09-30');
  assert.equal(restored.tasks[0].eventId, 'custom:real-project');
  assert.equal(restored.tasks[0].linkedGoal, canonical.tasks[0].linkedGoal);
  assert.equal(getStudyStats(restored).seconds, 60);
});

test('invalid events cannot silently truncate, lose milestones or overwrite a valid local backup', () => {
  let state = ensureDailyPlan(createInitialData({ today: TODAY, demo: false }), TODAY);
  state = saveEvent(state, { id: 'project', title: 'Project delivery', type: 'project', date: '2026-10-18', createdDate: TODAY, pathway: 'Both', minutes: 25, priority: 'high', status: 'planned', notes: 'Evidence and next step.' });
  const storage = memoryStorage();
  assert.equal(saveData(state, storage).ok, true);
  const original = storage.getItem(STORAGE_KEY);
  for (const mutate of [
    value => { value.events = {}; },
    value => { value.events.push({ ...value.events[0] }); },
    value => { value.events[0].id = ''; },
    value => { value.events[0].title = ''; },
    value => { value.events[0].title = 'x'.repeat(301); },
    value => { value.events[0].type = 'invented'; },
    value => { value.events[0].date = '2027-02-29'; },
    value => { value.events[0].endDate = '2026-10-17'; },
    value => { value.events[0].createdDate = '2026-02-30'; },
    value => { value.events[0].pathway = 'Mars'; },
    value => { value.events[0].minutes = 121; },
    value => { value.events[0].minutes = 4; },
    value => { value.events[0].minutes = 15.5; },
    value => { value.events[0].status = 'cancelled'; },
    value => { value.events[0].priority = 'urgent'; },
    value => { value.events[0].intent = 'undefined'; },
    value => { value.events[0].notes = 'x'.repeat(4001); },
    value => { value.events[0].resource = 'javascript:alert(1)'; },
    value => { value.events[0].goalId = 'x'.repeat(201); },
  ]) {
    const invalid = structuredClone(state);
    mutate(invalid);
    assert.throws(() => parseBackup(JSON.stringify(invalid), TODAY), /Invalid Northstar backup/);
    assert.equal(saveData(invalid, storage).ok, false);
    assert.equal(storage.getItem(STORAGE_KEY), original);
  }
});

test('extended activity dates and task goal links are validated before restoration', () => {
  const state = normalizeData(ensureDailyPlan(createInitialData({ today: TODAY, demo: true }), TODAY), TODAY);
  for (const mutate of [
    value => { value.activities[0].endDate = '2027-02-29'; },
    value => { value.activities[0].endDate = '2023-01-01'; },
    value => { value.activities[0].updatedDate = '2026-02-30'; },
    value => { value.activities[0].responsibilities = 'x'.repeat(4001); },
    value => { value.activities[0].notes = 'x'.repeat(4001); },
    value => { value.tasks[0].eventId = 'x'.repeat(221); },
    value => { value.tasks[0].eventStage = 'x'.repeat(101); },
    value => { value.tasks[0].eventSourceId = 'x'.repeat(201); },
    value => { value.tasks[0].roadmapItemId = 'x'.repeat(201); },
    value => { value.tasks[0].roadmapStepId = 'x'.repeat(201); },
    value => { value.tasks[0].linkedGoal = 'x'.repeat(401); },
  ]) {
    const invalid = structuredClone(state);
    mutate(invalid);
    assert.throws(() => parseBackup(JSON.stringify(invalid), TODAY), /Invalid Northstar backup/);
  }
  state.tasks[0].eventId = 'custom:removed-milestone';
  state.tasks[0].eventSourceId = 'removed-milestone';
  const restored = parseBackup(serializeBackup(state), TODAY);
  assert.equal(restored.tasks[0].eventId, 'custom:removed-milestone');
});

test('a split test rehearsal keeps its original event stage after backup restoration without becoming full timed credit', () => {
  const state = ensureDailyPlan(createInitialData({ today: TODAY, demo: false }), TODAY);
  state.profile.testPlans = [{ id: 'booked-ielts', name: 'IELTS', status: 'Booked', targetDate: '2026-10-12', targetScore: '7.5', notes: 'Verified requirement for my selected target.' }];
  state.tasks[0] = { ...state.tasks[0], title: 'IELTS: practise part of a timed test section', eventId: 'test:booked-ielts', eventSourceId: 'booked-ielts', eventStage: 'rehearsal', minutes: 30, completed: true, completedAt: `${TODAY}T18:30:00Z`, sessions: [{ start: '16:00', end: '16:15' }, { start: '18:00', end: '18:15' }], start: '16:00', end: '18:15' };
  const restored = parseBackup(serializeBackup(state), TODAY);
  assert.equal(restored.tasks[0].eventStage, 'rehearsal');
  assert.equal(restored.tasks[0].eventId, 'test:booked-ielts');
  const stage = getEventPlan(restored, 'test:booked-ielts', TODAY).find(item => item.stage === 'rehearsal');
  assert.equal(stage.practiceMinutes, 30);
  assert.equal(stage.completedMinutes, 15);
  assert.equal(stage.completed, false);
  assert.equal(stage.remainingMinutes, 30);
});
