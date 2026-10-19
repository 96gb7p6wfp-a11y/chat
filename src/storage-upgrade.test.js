import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalProfile, normalizeData } from './coach.js';
import { calculateSubject, GRADE_TYPES, SEMESTERS } from './grades.js';
import { getIELTSSummary } from './ielts.js';
import { lessonsForDate } from './timetable.js';
import { getActivityEvidence } from './profile-evidence.js';
import { STORAGE_KEY, loadData, parseBackup, saveData, serializeBackup } from './storage.js';

const TODAY = '2026-10-19';
const SKILLS = { listening: null, reading: null, writing: null, speaking: null };
function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}
function base() { return createPersonalProfile({ today: TODAY }); }
function restore(state) { return parseBackup(serializeBackup(state), TODAY); }
function rejects(rawState, message) { assert.throws(() => parseBackup(JSON.stringify(rawState), TODAY), /Invalid Northstar backup:/, message); }
function subject(state, id = 'mathematics') { return state.subjects.find(item => item.id === id); }
function grade(overrides = {}) { return { id: 'grade-real', subjectId: 'mathematics', date: '2026-10-12', points: 0, type: 'written', semester: 'Q1', weight: 2, note: 'Tatsächlich eingetragenes Ergebnis', ...overrides }; }
function lesson(overrides = {}) { return { id: 'lesson-a', subjectId: 'mathematics', title: '', day: 1, start: '08:00', end: '09:30', room: 'R 201', teacher: 'Optionaler eigener Eintrag', cycle: 'A', ...overrides }; }
function score(overrides = {}) { return { id: 'mock-writing', date: '2026-10-14', source: 'mock', skills: { ...SKILLS, writing: 6 }, overall: null, notes: 'Eigene Probeprüfung; keine offizielle Bewertung', ...overrides }; }
function attempt(overrides = {}) { return { id: 'attempt-real', taskId: 'practice-real', subjectId: 'german', topic: 'Textanalyse', questionId: 'paragraph-1', answer: 'Meine These\nMein noch unvollständiger Entwurf: Ä, Ö, ß.', date: '2026-10-18', rating: 'hard', mistake: 'Beleg und Interpretation noch nicht klar verbunden.', nextReviewDate: '2026-10-20', ...overrides }; }

// These tests exercise portable backups and the actual local-storage adapter,
// rather than asserting private normalizer output shapes.
test('all five assessment categories, semester identifiers and explicit weights survive backup and saving', () => {
  for (const mode of ['simple', 'weighted', 'category']) {
    const state = base();
    Object.assign(subject(state), { target: 11, grading: { mode, courseWeight: 2, weights: { written: 45, oral: 20, participation: 15, presentation: 10, other: 10 } } });
    state.grades = GRADE_TYPES.map((type, index) => grade({ id: `grade-${type}`, type, points: [0, 8, 11, 15, 10][index], semester: SEMESTERS[index % SEMESTERS.length], weight: [3, 1, 2, 1, 0.5][index], date: `2026-10-${String(index + 10).padStart(2, '0')}` }));
    const expected = structuredClone(state.grades);
    const before = calculateSubject(state, 'mathematics');
    const restored = restore(state);
    assert.deepEqual(restored.grades, expected, `${mode}: assessment details are personal data`);
    assert.deepEqual(subject(restored).grading, subject(state).grading);
    assert.equal(calculateSubject(restored, 'mathematics').average, before.average);
    const storage = memoryStorage();
    assert.equal(saveData(restored, storage).ok, true);
    const loaded = loadData(storage, TODAY);
    assert.equal(loaded.warning, '');
    assert.deepEqual(loaded.data.grades, expected);
  }
});

test('IELTS partial evidence preserves unknown skills, independent overall results and provenance', () => {
  const state = base();
  Object.assign(state.ielts, { examDate: '', targetOverall: 7.5, targets: { ...SKILLS, writing: 7 }, estimates: { ...SKILLS, listening: 6.5 }, weeklyMinutes: 120, mistakes: { listening: '', reading: '', writing: 'Task Response: nicht alle Fragenteile beantwortet', speaking: '' }, scores: [
    score({ id: 'official-overall', source: 'official', overall: 7, skills: { ...SKILLS } }),
    score(),
    score({ id: 'self-speaking', source: 'self', skills: { ...SKILLS, speaking: 5.5 } }),
  ] });
  const restored = restore(state);
  assert.deepEqual(restored.ielts, state.ielts);
  assert.equal(restored.ielts.examDate, '', 'A score does not invent a future exam date');
  assert.equal(restored.ielts.scores[0].skills.listening, null);
  assert.equal(restored.ielts.scores[0].overall, 7);
  assert.equal(restored.ielts.scores[1].overall, null, 'One mock skill does not invent an overall band');
  const writing = getIELTSSummary(restored, TODAY).skills.find(item => item.skill === 'writing');
  assert.equal(writing.current, 6);
  assert.equal(writing.source, 'mock');
});

test('A/B lessons retain their user-selected anchor, rooms and teacher without changing the active week', () => {
  const state = base();
  state.schedule.cycleAnchor = TODAY;
  state.schedule.lessons = [lesson(), lesson({ id: 'lesson-b', subjectId: 'physics', start: '08:15', end: '09:45', room: 'Labor', cycle: 'B' }), lesson({ id: 'lesson-all', day: 3, subjectId: 'german', cycle: 'all', teacher: '' })];
  const restored = restore(state);
  assert.deepEqual(restored.schedule.lessons, state.schedule.lessons);
  assert.equal(restored.schedule.cycleAnchor, TODAY);
  assert.deepEqual(lessonsForDate(restored, '2026-10-19').map(item => item.id), ['lesson-a']);
  assert.deepEqual(lessonsForDate(restored, '2026-10-26').map(item => item.id), ['lesson-b']);
  state.schedule.cycleAnchor = '';
  assert.equal(restore(state).schedule.cycleAnchor, '', 'An unknown A-week is not assigned silently');
});

test('learning drafts, mistake notes, next review dates and moved task context round-trip together', () => {
  const state = base();
  state.tasks = [{ id: 'practice-real', date: TODAY, title: 'Einen Analyseabsatz schreiben', category: 'academics', subjectId: 'german', minutes: 25, priority: 'high', origin: 'custom', completed: false, completedAt: null, notes: 'Entwurf behalten, auch wenn ich die Einheit verschiebe.', selfReview: ['claim', 'evidence'], objective: 'These und Textbeleg verbinden', expectedResult: 'Ein überarbeiteter Absatz', learningTopic: 'Textanalyse', reviewDate: '2026-10-20', movedFrom: '2026-10-18' }];
  state.learning.attempts = [attempt()];
  const restored = restore(state);
  assert.deepEqual(restored.learning.attempts, state.learning.attempts);
  const task = restored.tasks.find(item => item.id === 'practice-real');
  for (const field of ['notes', 'objective', 'expectedResult', 'learningTopic', 'reviewDate', 'movedFrom']) assert.equal(task[field], state.tasks[0][field]);
  assert.deepEqual(task.selfReview, ['claim', 'evidence']);
  assert.equal(task.completed, false);
});

test('application evidence and user-checked university sources retain status and exact supporting records', () => {
  const state = base();
  state.activities = [{ id: 'project-evidence', name: 'Mein eigenes Projekt', type: 'Project', startDate: '', endDate: '', hoursPerWeek: null, weeksPerYear: null, description: 'Eigene Beschreibung', responsibilities: 'Mein eigener Beitrag', achievements: '', impact: '', notes: 'Keine erfundenen Resultate', evidenceStatus: 'verified', projectUrl: 'https://github.com/example/own-project', evidence: [{ id: 'proof-real', label: 'Projektbeschreibung', url: 'https://example.org/project', note: 'Von mir zugeordnet; nicht von der App geprüft.', verifiedDate: TODAY }] }];
  state.universities = [{ id: 'university-user', name: 'Selbst recherchierte Hochschule', country: 'Germany', program: 'Informatik', deadline: '', requirements: 'Meine gespeicherten Anforderungen', requirementsStatus: 'verified', requirementsSource: 'https://example.org/admissions', requirementsCheckedDate: '2026-10-18', status: 'researching', url: '', notes: '' }];
  Object.assign(state.profile, { targetAverage: 11, language: 'de', prioritySubjects: ['german'] });
  Object.assign(subject(state, 'german'), { priority: 'high', difficulty: 4 });
  const restored = restore(state);
  assert.deepEqual(restored.activities[0].evidence, state.activities[0].evidence);
  assert.equal(restored.activities[0].projectUrl, state.activities[0].projectUrl);
  assert.equal(getActivityEvidence(restored.activities[0]).status, 'verified');
  assert.equal(restored.universities[0].requirementsStatus, 'verified');
  assert.equal(restored.universities[0].requirementsSource, state.universities[0].requirementsSource);
  assert.equal(restored.universities[0].requirementsCheckedDate, '2026-10-18');
  assert.equal(restored.universities[0].deadline, '');
  assert.equal(subject(restored, 'german').priority, 'high');
  assert.equal(subject(restored, 'german').difficulty, 4);
  assert.equal(restored.profile.targetAverage, 11);
});

test('an older v2 backup retains real zero grades, starting values, completions and drafts without new-schema fields', () => {
  const old = base();
  delete old.ielts;
  delete old.learning;
  delete old.schedule.lessons;
  delete old.schedule.cycleAnchor;
  for (const item of old.subjects) { delete item.grading; delete item.priority; delete item.difficulty; }
  for (const item of old.activities) { delete item.evidence; delete item.evidenceStatus; delete item.projectUrl; }
  for (const item of old.universities) { delete item.requirementsStatus; delete item.requirementsSource; delete item.requirementsCheckedDate; }
  Object.assign(subject(old), { written: 6, oral: 11, baselineWritten: 6, baselineOral: 11 });
  old.grades = [grade()];
  delete old.grades[0].semester;
  delete old.grades[0].weight;
  old.tasks = [{ id: 'historical-completion', date: '2026-10-12', title: 'Tatsächlich erledigt', category: 'academics', subjectId: 'mathematics', minutes: 25, completed: true, completedAt: '2026-10-12T16:15:00.000Z', notes: 'Wichtiger alter Entwurf', origin: 'custom' }];
  const restored = parseBackup(JSON.stringify(old), TODAY);
  assert.equal(restored.grades[0].points, 0);
  assert.equal(restored.grades[0].date, '2026-10-12');
  assert.equal(restored.grades[0].semester, '');
  assert.equal(restored.grades[0].weight, null);
  assert.equal(subject(restored).baselineWritten, 6);
  assert.equal(subject(restored).baselineOral, 11);
  assert.equal(restored.tasks[0].completedAt, old.tasks[0].completedAt);
  assert.equal(restored.tasks[0].notes, old.tasks[0].notes);
  const fresh = base();
  assert.ok(fresh.subjects.every(item => item.written === null && item.oral === null));
  assert.equal(fresh.grades.length, 0);
  assert.equal(fresh.ielts.examDate, '');
  assert.equal(fresh.ielts.targetOverall, null);
  assert.ok(Object.values(fresh.ielts.estimates).every(value => value === null));
});

test('invalid assessment weights and incomplete grading configuration cannot be silently clamped or replaced', () => {
  for (const weight of [0, -1, 100001, '2']) {
    const state = base(); state.grades = [grade({ weight })]; rejects(state, `grade weight ${weight}`);
  }
  for (const update of [{ courseWeight: 0 }, { courseWeight: 100001 }, { mode: 'official-hessen' }, { weights: { written: -50 } }, { weights: [] }]) {
    const state = base(); Object.assign(subject(state).grading, update); rejects(state, `grading ${JSON.stringify(update)}`);
  }
});

test('invalid IELTS bands, provenance, empty results and impossible dates are rejected rather than normalized away', () => {
  for (const invalid of [score({ skills: { ...SKILLS, writing: 7.25 } }), score({ overall: 9.5 }), score({ skills: { ...SKILLS, reading: '7' } }), score({ source: 'app-official' }), score({ date: '2026-02-30' }), score({ skills: { ...SKILLS }, overall: null })]) {
    const state = base(); state.ielts.scores = [invalid]; rejects(state, JSON.stringify(invalid));
  }
});

test('malformed lesson cycles, weekday and time ranges cannot disappear during restore', () => {
  for (const invalid of [lesson({ cycle: 'C' }), lesson({ day: 7 }), lesson({ day: 1.5 }), lesson({ start: '25:00' }), lesson({ start: '9:00' }), lesson({ end: '07:59' }), lesson({ start: '08:00', end: '08:00' }), lesson({ title: '', subjectId: '' })]) {
    const state = base(); state.schedule.lessons = [invalid]; rejects(state, JSON.stringify(invalid));
  }
});

test('backup restore rejects truncating new fields instead of accepting a partially lost record', () => {
  const cases = [
    state => { state.schedule.lessons = [lesson({ room: 'R'.repeat(101) })]; },
    state => { state.ielts.scores = [score({ notes: 'N'.repeat(2001) })]; },
    state => { state.learning.attempts = [attempt({ answer: 'A'.repeat(20001) })]; },
    state => { state.learning.attempts = [attempt({ topic: 'T'.repeat(201) })]; },
    state => { state.activities[0].evidence = [{ id: 'proof', label: 'L'.repeat(301), url: '', note: '' }]; },
    state => { state.tasks = [{ id: 'task', date: TODAY, title: 'Lernen', minutes: 20, completed: false, category: 'academics', objective: 'O'.repeat(501) }]; },
  ];
  for (const mutate of cases) { const state = base(); mutate(state); rejects(state); }
});

test('malformed upgraded saved data is archived byte-for-byte; failed saves cannot overwrite a good plan', () => {
  const good = normalizeData(base(), TODAY);
  const storage = memoryStorage();
  assert.equal(saveData(good, storage).ok, true);
  const original = storage.getItem(STORAGE_KEY);
  const invalid = structuredClone(good); invalid.ielts.scores = [score({ overall: 11 })];
  assert.equal(saveData(invalid, storage).ok, false);
  assert.equal(storage.getItem(STORAGE_KEY), original);
  const raw = JSON.stringify(invalid);
  const unreadable = memoryStorage({ [STORAGE_KEY]: raw });
  const loaded = loadData(unreadable, TODAY);
  assert.match(loaded.warning, /preserved/i);
  assert.ok(loaded.recoveryKey);
  assert.equal(unreadable.getItem(loaded.recoveryKey), raw);
  assert.equal(unreadable.getItem(STORAGE_KEY), raw, 'Loading alone never overwrites the original');
  assert.equal(loaded.data.ielts.scores.length, 0);
  assert.equal(saveData(loaded.data, unreadable).ok, true);
  assert.equal(unreadable.getItem(loaded.recoveryKey), raw);
});

test('nonfinite in-memory numeric values cannot turn into null and overwrite a valid saved plan', () => {
  for (const invalidNumber of [NaN, Infinity, -Infinity]) {
    for (const location of ['grade-weight', 'ielts-estimate']) {
      const state = base();
      const storage = memoryStorage();
      assert.equal(saveData(state, storage).ok, true);
      const original = storage.getItem(STORAGE_KEY);
      if (location === 'grade-weight') state.grades = [grade({ weight: invalidNumber })];
      else state.ielts.estimates.writing = invalidNumber;
      assert.equal(saveData(state, storage).ok, false, `${location}: ${String(invalidNumber)} must be rejected before JSON changes it`);
      assert.equal(storage.getItem(STORAGE_KEY), original);
    }
  }
});
