import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialData, createPersonalProfile, ensureDailyPlan, getDailyPlan, normalizeData, saveExam, saveSchedule, startTopicPractice } from './coach.js';
import { normalizeHessen, calculateAbitur, courseAssessmentPlan } from './hessen.js';
import { getCurrentLearningTopics, saveCustomTopic, setCurriculumSelection } from './curriculum.js';
import { getTutorSession } from './tutor.js';
import { normalizeRecovery, saveExamReflection } from './recovery.js';
import { getSemesterEstimate, saveSemesterConfig } from './semester-grades.js';
import { parseBackup, serializeBackup } from './storage.js';

const TODAY = '2026-10-26';
const clone = value => JSON.parse(JSON.stringify(value));
function setup(subjectId = 'physics') {
  const state = createInitialData({ today: TODAY, demo: false });
  state.onboardingCompleted = true;
  state.subjects = state.subjects.map(subject => ({ ...subject, enabled: subject.id === subjectId, weakTopics: [], priority: subject.id === subjectId ? 'high' : 'auto' }));
  state.profile.prioritySubjects = [subjectId];
  state.schedule.weekly = state.schedule.weekly.map(day => ({ ...day, minutes: 120, windowStart: '16:00', windowEnd: '20:00' }));
  return state;
}
function subjectTask(state, subjectId, date = TODAY) {
  const task = getDailyPlan(state, date, TODAY).tasks.find(item => item.subjectId === subjectId && !item.ieltsSkill && !item.satSkill);
  assert.ok(task, `the shared daily planner must actually schedule ${subjectId}`);
  return task;
}
function confirmEnglishExam(state) {
  return saveExam(state, { id: 'english-confirmed-q1', subjectId: 'english', title: 'Englisch · Q1-Klausur', date: TODAY, semester: 'Q1', format: 'written', topics: [], target: null });
}

// These fixtures are isolated QA records, never additional user examinations.
test('selected Q1 capacitor discharge drives the real shared planner and authored numerical questions', () => {
  let state = setCurriculumSelection(setup(), 'provided-physics-q1-entladen', { status: 'practice', examRelevant: true });
  state = ensureDailyPlan(state, TODAY);
  const task = subjectTask(state, 'physics');
  assert.equal(getCurrentLearningTopics(state, 'physics')[0].learningTopic, 'Elektrisches Feld · Kondensator · Entladen');
  assert.equal(task.learningTopic, 'physics-rc-discharge', 'generated tasks retain the resolved exact unit for future review');
  const tutor = getTutorSession(state, task, TODAY);
  assert.equal(tutor.status, 'ready');
  assert.equal(tutor.unitId, 'physics-rc-discharge');
  assert.ok(tutor.questions.some(question => /100 kΩ|100 µF/.test(question.prompt)), 'the session must contain actual numerical problems');
  assert.ok(tutor.questions.every(question => question.solution && question.explanation));
});

test('a broad active Physics parent cannot displace its selected discharge child after date rotation', () => {
  let state = setCurriculumSelection(setup(), 'provided-physics-q1-q1-1', { status: 'class' });
  state = setCurriculumSelection(state, 'provided-physics-q1-entladen', { status: 'practice' });
  assert.equal(state.curriculum.selections.length, 2, 'retain both UI selections');
  assert.equal(getCurrentLearningTopics(state, 'physics').length, 1, 'use the most specific active descendant for planning');
  for (const date of [TODAY, '2026-10-27', '2026-10-28']) {
    state = ensureDailyPlan(state, date, TODAY);
    const task = subjectTask(state, 'physics', date);
    assert.equal(task.learningTopic, 'physics-rc-discharge');
    assert.equal(getTutorSession(state, task, date).unitId, 'physics-rc-discharge');
  }
});

test('selected Q1 integral field produces real integration exercises rather than a generic study instruction', () => {
  let state = setCurriculumSelection(setup('mathematics'), 'provided-mathematics-q1-q1-1', { status: 'practice' });
  state = ensureDailyPlan(state, TODAY);
  const task = subjectTask(state, 'mathematics');
  const tutor = getTutorSession(state, task, TODAY);
  assert.equal(tutor.status, 'ready');
  assert.equal(tutor.unitId, 'mathematics-integration');
  assert.ok(tutor.questions.some(question => /3x²|x²/.test(question.prompt)));
  assert.ok(tutor.questions.some(question => /8\/3/.test(question.solution)));
});

test('a custom teacher-selected German classicism topic opens a text, concrete writing question and checking criteria', () => {
  let state = saveCustomTopic(setup('german'), { id: 'actual-teacher-topic', subjectId: 'german', semester: 'Q1', title: 'Weimarer Klassik', origin: 'teacher', note: 'Von mir als Unterrichtsthema eingetragen.' });
  state = setCurriculumSelection(state, 'actual-teacher-topic', { status: 'class' });
  state = ensureDailyPlan(state, TODAY);
  const tutor = getTutorSession(state, subjectTask(state, 'german'), TODAY);
  assert.equal(tutor.status, 'ready');
  assert.equal(tutor.unitId, 'german-classicism-humanity');
  assert.match(tutor.passage, /Eigene Übungsszene/);
  assert.ok(tutor.questions.some(question => /70–100/.test(question.prompt) && question.criteria?.length >= 3));
  assert.equal(getCurrentLearningTopics(state, 'german')[0].sourceUrl, '', 'a teacher topic must not become an official curriculum claim');
});

test('changing a selected topic invalidates an unstarted daily plan and keeps unsupported material honest', () => {
  let state = setCurriculumSelection(setup(), 'provided-physics-q1-q1-1', { status: 'class' });
  state = ensureDailyPlan(state, TODAY);
  const before = subjectTask(state, 'physics');
  assert.equal(getTutorSession(state, before, TODAY).status, 'unsupported');
  state = setCurriculumSelection(state, 'provided-physics-q1-entladen', { status: 'practice' });
  state = ensureDailyPlan(state, TODAY);
  const after = subjectTask(state, 'physics');
  assert.notEqual(after.planSignature, before.planSignature);
  assert.equal(after.learningTopic, 'physics-rc-discharge');
  assert.equal(getTutorSession(state, after, TODAY).status, 'ready');
  assert.equal(state.tasks.filter(task => task.id === after.id).length, 1, 'replanning does not duplicate the daily action');
});

test('known upcoming exam topics override a different selected course topic and never invent coverage', () => {
  let state = setCurriculumSelection(setup(), 'provided-physics-q1-entladen', { status: 'practice' });
  state = saveExam(state, { id: 'known-physics-test', subjectId: 'physics', title: 'Physik · Magnetisches Feld', date: '2026-10-28', semester: 'Q1', format: 'written', topics: ['Lorentzkraft'], target: null });
  state = ensureDailyPlan(state, TODAY);
  const task = subjectTask(state, 'physics');
  assert.equal(task.examId, 'known-physics-test');
  const tutor = getTutorSession(state, task, TODAY);
  assert.equal(tutor.status, 'unsupported');
  assert.match(tutor.unavailableReason, /Lorentzkraft/);
  assert.notEqual(tutor.unitId, 'physics-rc-discharge', 'RC exercises must not masquerade as Lorentz-force exam preparation');
});

test('Q2 field selections stay separate from Q1 and an uncovered geometry field is not replaced by unrelated exercises', () => {
  let state = setCurriculumSelection(setup('mathematics'), 'provided-mathematics-q1-q1-1', { status: 'practice' });
  state = setCurriculumSelection(state, 'provided-mathematics-q2-q2-3', { status: 'class' });
  state.profile.schoolYear = 'Q2';
  state = ensureDailyPlan(state, TODAY);
  const task = subjectTask(state, 'mathematics');
  assert.equal(task.learningTopic, 'Geraden und Ebenen im Raum');
  assert.equal(getTutorSession(state, task, TODAY).status, 'unsupported');
});

test('a poor completed English exam adds recovery inside the common budget without a fabricated second exam or grade', () => {
  let state = confirmEnglishExam(setup('english'));
  state = saveExamReflection(state, 'english-confirmed-q1', { mood: 'poor', causes: [], startDate: TODAY, reviewDate: '2026-11-02' }, TODAY);
  state = saveSchedule(state, { ...state.schedule, timeOverrides: [{ date: TODAY, minutes: 45 }] });
  const originalExams = clone(state.exams);
  state = ensureDailyPlan(state, TODAY);
  const plan = getDailyPlan(state, TODAY);
  const recovery = plan.tasks.find(task => task.revisionStage.startsWith('recovery-'));
  assert.ok(recovery, 'the recovery proposal reaches the actual shared allocator');
  const tutor = getTutorSession(state, recovery, TODAY);
  assert.equal(tutor.status, 'ready');
  assert.match(tutor.unitId, /recovery-english-diagnostic/);
  assert.ok(tutor.questions.length > 0 && tutor.questions.every(question => question.solution));
  assert.ok(plan.plannedMinutes <= 45);
  assert.deepEqual(state.exams, originalExams);
  assert.equal(state.grades.length, 0, 'feeling that an exam went badly is not a grade');
  assert.equal(courseAssessmentPlan(state, 'english', 'Q1').unscheduledCount, 0);
});

test('explicit classroom recovery scenario uses the returned English mark and never writes a semester grade to Block I', () => {
  let state = confirmEnglishExam(setup('english'));
  state.grades = [{ id: 'returned-exam', subjectId: 'english', date: TODAY, semester: 'Q1', type: 'written', points: 4, weight: 1, note: 'Tatsächlich zurückgegebenes Ergebnis für diesen Testfall.' }];
  state = saveSemesterConfig(state, { subjectId: 'english', semester: 'Q1', writtenShare: 1 / 3, writtenMode: 'equal', futureWritten: [], continuousPoints: 13, continuousStatus: 'estimate', teacherConfirmed: false });
  state = normalizeData(state, TODAY);
  const estimate = getSemesterEstimate(state, 'english', 'Q1');
  assert.equal(estimate.knownWrittenAverage, 4);
  assert.ok(Math.abs(estimate.estimatedPoints - 10) < 1e-8);
  assert.equal(estimate.config.futureWritten.length, 0);
  assert.equal(estimate.officialSemesterGrade, false);
  const abitur = calculateAbitur(state);
  assert.equal(abitur.blockI.knownPoints, 0);
  assert.equal(abitur.blockI.points, null);
});

test('the real planner respects school lessons when allocating a selected-topic session', () => {
  let state = setCurriculumSelection(setup(), 'provided-physics-q1-entladen', { status: 'practice' });
  state = saveSchedule(state, { ...state.schedule, timeOverrides: [{ date: TODAY, minutes: 45 }], lessons: [{ id: 'actual-afternoon-lesson', subjectId: 'physics', title: 'Physik LK', day: 1, start: '16:00', end: '17:00', room: 'PHL', teacher: '', cycle: 'all', term: 'Q1', courseType: 'LK', periodStart: 9, periodEnd: 10 }] });
  state = ensureDailyPlan(state, TODAY);
  const plan = getDailyPlan(state, TODAY);
  assert.ok(plan.tasks.some(task => task.subjectId === 'physics'));
  assert.ok(plan.plannedMinutes <= 45);
  for (const task of plan.tasks) for (const session of task.sessions) assert.ok(session.end <= '16:00' || session.start >= '17:00', 'no allocated session overlaps the recorded lesson');
});

test('old saved records migrate additively without changing grades, starting estimates, exams, timetable or completed notes', () => {
  const original = ensureDailyPlan(createPersonalProfile({ today: TODAY }), TODAY);
  original.subjects = original.subjects.map(subject => subject.id === 'mathematics' ? { ...subject, baselineWritten: 8.5, baselineOral: null, written: 8.5, oral: null, target: 13 } : subject);
  original.grades = [{ id: 'old-german-result', subjectId: 'german', date: '2026-10-15', semester: 'Q1', type: 'written', points: 4, weight: 1, note: 'Eine Einzelleistung, keine Halbjahresnote.' }];
  original.exams = confirmEnglishExam(original).exams;
  original.tasks[0] = { ...original.tasks[0], completed: true, completedAt: `${TODAY}T15:00:00.000Z`, notes: 'Mein früher gespeicherter Text.' };
  original.profile.theme = 'dark';
  for (const key of ['hessen', 'curriculum', 'recovery', 'semesterGrading']) delete original[key];
  const restored = parseBackup(JSON.stringify(original), TODAY);
  assert.deepEqual(restored.grades, original.grades);
  assert.deepEqual(restored.exams, original.exams);
  assert.deepEqual(restored.schedule, original.schedule);
  assert.equal(restored.tasks[0].notes, original.tasks[0].notes);
  assert.equal(restored.tasks[0].completedAt, original.tasks[0].completedAt);
  assert.equal(restored.subjects.find(subject => subject.id === 'mathematics').baselineWritten, 8.5);
  assert.equal(restored.subjects.find(subject => subject.id === 'mathematics').target, 13);
  assert.equal(restored.profile.theme, 'dark');
  assert.equal(restored.hessen.semesterResults.length, 0);
  assert.equal(restored.recovery.records.length, 0);
});

function fullBackupState() {
  let state = confirmEnglishExam(setup('english'));
  state.hessen = normalizeHessen({ targetPoints: 750,
    courseSettings: [{ subjectId: 'german', semester: 'Q1', weeklyHours: 4, teacherConfirmed: true, replacements: [{ id: 'confirmed-alternative', kind: 'presentation', count: 1, note: 'Ausdrücklich bestätigtes Testszenario.' }] }],
    semesterResults: [{ id: 'confirmed-math-q1', subjectId: 'mathematics', semester: 'Q1', points: 9, status: 'confirmed', inclusion: 'mandatory', included: true }, { id: 'projected-physics-q1', subjectId: 'physics', semester: 'Q1', points: 12.5, status: 'scenario', inclusion: 'optional', included: true }],
  });
  state = saveCustomTopic(state, { id: 'teacher-topic', subjectId: 'german', semester: 'Q1', title: 'Weimarer Klassik', origin: 'teacher', note: 'Eigener Unterrichtsstand' });
  state = setCurriculumSelection(state, 'teacher-topic', { status: 'class', examRelevant: true });
  state = setCurriculumSelection(state, 'provided-physics-q1-entladen', { status: 'practice' });
  state = saveExamReflection(state, 'english-confirmed-q1', { mood: 'poor', causes: ['analysis'], teacherFeedback: 'Aussage und Beleg verbinden.', lostPoints: 'Ein fehlender Beleg', startDate: TODAY, reviewDate: '2026-11-02', goal: 'Einen belegten Analyseabsatz schreiben.' }, TODAY);
  state = saveSemesterConfig(state, { subjectId: 'english', semester: 'Q1', writtenShare: 1 / 3, writtenMode: 'equal', futureWritten: [], continuousRange: { min: 10, max: 15 }, teacherConfirmed: false });
  return normalizeData(state, TODAY);
}

test('all new domain records round-trip together in a portable backup with uncertainty intact', () => {
  const state = fullBackupState();
  const restored = parseBackup(serializeBackup(state), TODAY);
  for (const key of ['hessen', 'curriculum', 'recovery', 'semesterGrading']) assert.deepEqual(restored[key], state[key], key);
  assert.equal(restored.hessen.semesterResults.find(result => result.id === 'projected-physics-q1').status, 'scenario');
  assert.equal(restored.semesterGrading.configs[0].teacherConfirmed, false);
  assert.deepEqual(restored.hessen.examinationSubjects.slice(2).map(item => item.subjectId), ['', '', '']);
  assert.equal(calculateAbitur(restored).regulatoryValidation.complete, false);
});

test('malformed new domain records are rejected before a restore could discard or change them', () => {
  const valid = fullBackupState();
  for (const [name, mutate] of [
    ['invalid semester result', state => { state.hessen.semesterResults[0].points = 16; }],
    ['invalid curriculum state', state => { state.curriculum.selections[0].status = 'officially-passed'; }],
    ['orphan curriculum reference', state => { state.curriculum.selections[0].topicId = 'does-not-exist'; }],
    ['invalid recovery cause', state => { state.recovery.records[0].causes.push('assumed-diagnosis'); }],
    ['invalid weighting', state => { state.semesterGrading.configs[0].writtenShare = 2; }],
  ]) {
    const invalid = clone(valid); mutate(invalid);
    assert.throws(() => parseBackup(JSON.stringify(invalid), TODAY), /Invalid Northstar backup:/, name);
  }
  assert.deepEqual(valid.recovery, normalizeRecovery(valid.recovery));
});


test('direct topic practice opens actual exercises within the shared allowance and recorded lesson windows', () => {
  let state = setCurriculumSelection(setup(), 'provided-physics-q1-entladen', { status: 'practice' });
  state = saveSchedule(state, { ...state.schedule, timeOverrides: [{ date: TODAY, minutes: 45 }], lessons: [{ id: 'recorded-lesson', subjectId: 'physics', title: 'Physik LK', day: 1, start: '16:00', end: '17:00', room: 'PHL', teacher: '', cycle: 'all', term: 'Q1', courseType: 'LK', periodStart: 9, periodEnd: 10 }] });
  state = ensureDailyPlan(state, TODAY);
  const topic = getCurrentLearningTopics(state, 'physics')[0];
  const opened = startTopicPractice(state, topic, TODAY);
  assert.equal(opened.task.origin, 'custom');
  assert.equal(opened.task.subjectId, 'physics');
  assert.equal(opened.task.learningTopic, topic.learningTopic);
  const tutor = getTutorSession(opened.state, opened.task, TODAY);
  assert.equal(tutor.status, 'ready');
  assert.equal(tutor.unitId, 'physics-rc-discharge');
  assert.ok(tutor.questions.some(question => /100 kΩ|100 µF/.test(question.prompt)));
  const plan = getDailyPlan(opened.state, TODAY);
  assert.ok(plan.plannedMinutes <= 45, 'the direct action must replace unstarted generated work instead of adding an independent budget');
  assert.ok(opened.task.sessions.length > 0, 'the direct topic action must receive real free-window placement');
  for (const task of plan.tasks) for (const session of task.sessions) assert.ok(session.end <= '16:00' || session.start >= '17:00', 'lesson time remains unavailable');
});

test('reopening the same direct topic session keeps a stable task and every saved question answer', () => {
  let state = setCurriculumSelection(setup(), 'provided-physics-q1-entladen', { status: 'practice' });
  const topic = getCurrentLearningTopics(state, 'physics')[0];
  const first = startTopicPractice(state, topic, TODAY);
  const tutor = getTutorSession(first.state, first.task, TODAY);
  const questionId = tutor.questions[0].id;
  const stamp = `${TODAY}T17:05:00.000Z`;
  state = { ...first.state,
    tasks: first.state.tasks.map(task => task.id === first.task.id ? { ...task, notes: 'Mein gespeicherter Rechenansatz.' } : task),
    learning: { ...first.state.learning, sessions: [{ id: first.task.id, taskId: first.task.id, unitId: tutor.unitId, stage: 'practice', questionIndex: 0, answers: { [questionId]: '  100000 × 0,0001 = 10 Sekunden.\nMeine Rechnung bleibt erhalten.  ' }, reviewAnswers: {}, revealed: [], checks: {}, mistakes: {}, startedAt: stamp, completedAt: null, updatedAt: stamp }] },
  };
  const before = clone(state);
  const reopened = startTopicPractice(state, topic, TODAY);
  assert.equal(reopened.task.id, first.task.id);
  assert.equal(reopened.state.tasks.filter(task => task.id === first.task.id).length, 1);
  assert.equal(reopened.task.notes, 'Mein gespeicherter Rechenansatz.');
  assert.deepEqual(reopened.state.learning.sessions, before.learning.sessions);
  assert.deepEqual(state, before, 'opening a session must not mutate the caller state');
  assert.equal(getTutorSession(reopened.state, reopened.task, TODAY).unitId, tutor.unitId);
});

test('direct practice refuses a zero or fully committed allowance without overwriting tasks or tutor answers', () => {
  let state = setCurriculumSelection(setup(), 'provided-physics-q1-entladen', { status: 'practice' });
  const topic = getCurrentLearningTopics(state, 'physics')[0];
  const noCapacity = saveSchedule(state, { ...state.schedule, timeOverrides: [{ date: TODAY, minutes: 0 }] });
  const noCapacityBefore = clone(noCapacity);
  assert.throws(() => startTopicPractice(noCapacity, topic, TODAY), /Lernfenster ist ausgefüllt/);
  assert.deepEqual(noCapacity, noCapacityBefore);

  state = saveSchedule(state, { ...state.schedule, timeOverrides: [{ date: TODAY, minutes: 20 }] });
  const started = startTopicPractice(state, topic, TODAY);
  assert.equal(started.task.minutes, 20);
  state = saveCustomTopic(started.state, { id: 'different-topic', subjectId: 'physics', semester: 'Q1', title: 'Kräfte und Beschleunigung', origin: 'teacher' });
  state = setCurriculumSelection(state, 'different-topic', { status: 'practice' });
  state.learning = { ...state.learning, sessions: [{ id: started.task.id, taskId: started.task.id, unitId: 'physics-rc-discharge', stage: 'practice', questionIndex: 0, answers: { 'rc-time-constant': 'Mein bereits begonnener Lösungsversuch.' }, reviewAnswers: {}, revealed: [], checks: {}, mistakes: {}, startedAt: `${TODAY}T17:00:00.000Z`, completedAt: null, updatedAt: `${TODAY}T17:00:00.000Z` }] };
  const before = clone(state);
  const nextTopic = getCurrentLearningTopics(state, 'physics').find(item => item.id === 'different-topic');
  assert.throws(() => startTopicPractice(state, nextTopic, TODAY), /Lernfenster ist ausgefüllt/);
  assert.deepEqual(state, before, 'failed scheduling must leave the existing session and all other records intact');
});
