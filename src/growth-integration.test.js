import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalProfile, ensureDailyPlan, normalizeData, addGrade, saveExam } from './coach.js';
import { STORAGE_KEY, loadData, saveData, parseBackup, serializeBackup } from './storage.js';
import { normalizeAbiturTarget } from './abitur-target.js';
import { normalizeSAT } from './sat.js';
import { normalizeIELTS } from './ielts.js';
import { normalizeTestJourney, saveDiagnosticAttempt } from './test-journeys.js';
import { createUniversityGoal, normalizeUniversityRequirement, saveUniversityGoal, getUniversityGoalRoadmap } from './university-goals.js';
import { getSubjectPriorities } from './recommendations.js';
import { getPreparationContext } from './test-preparation.js';
import { saveExamReflection, getRecoveryPlan, getRecoveryOutcome } from './recovery.js';
import { getTutorSession } from './tutor.js';

const TODAY = '2026-10-26';
const personal = () => createPersonalProfile({ today: TODAY });
function memoryStorage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}
function growthState() {
  let data = saveUniversityGoal(personal(), createUniversityGoal('ucl', { id: 'saved-ucl' }));
  data = saveDiagnosticAttempt(data, 'sat', { id: 'saved-diagnostic', date: TODAY, answers: { 'sat-diag-algebra': '6\nI subtracted 4 first.' }, checks: { 'sat-diag-algebra': 'correct' }, completed: false });
  data.abiturTarget = normalizeAbiturTarget({ mode: 'grade', targetGrade: 1.5, semesterAverage: 12, examAverage: 13, semesterOverrides: [{ resultId: 'mathematics-Q2', points: 14 }] });
  return data;
}

test('new growth records persist alongside existing grades, lessons and preferences through reload and backup', () => {
  let source = growthState();
  source = addGrade(source, { subjectId: 'german', points: 4, type: 'written', semester: 'Q1', date: '2026-10-19', weight: 1, note: 'Original teacher feedback' });
  source.schedule.lessons = [{ id: 'saved-math', subjectId: 'mathematics', title: '', day: 1, start: '08:05', end: '09:40', room: 'C052', teacher: 'Lip', cycle: 'all' }];
  source.profile.name = 'Saved name';
  const storage = memoryStorage();
  assert.equal(saveData(source, storage).ok, true);
  const reloaded = loadData(storage, TODAY).data;
  const restored = parseBackup(serializeBackup(source), TODAY);
  for (const result of [reloaded, restored]) {
    for (const key of ['universityGoals', 'testJourney', 'abiturTarget', 'grades']) assert.deepEqual(result[key], source[key]);
    assert.deepEqual(result.schedule.lessons, source.schedule.lessons);
    assert.equal(result.profile.name, source.profile.name);
    assert.equal(result.testJourney.sat.diagnostics[0].answers['sat-diag-algebra'], '6\nI subtracted 4 first.');
  }
});

test('older v2 backups add empty growth models without replacing grades or inventing university goals', () => {
  const original = growthState();
  delete original.universityGoals;
  delete original.testJourney;
  delete original.abiturTarget;
  const restored = parseBackup(JSON.stringify(original), TODAY);
  assert.deepEqual(restored.grades, original.grades);
  assert.deepEqual(restored.subjects, original.subjects);
  assert.deepEqual(restored.universityGoals.goals, []);
  assert.deepEqual(restored.testJourney.sat.diagnostics, []);
  assert.equal(restored.abiturTarget.targetGrade, null);
  assert.deepEqual(normalizeData(restored, TODAY), restored);
});

test('invalid additive records cannot overwrite an intact local profile or silently lose backup entries', () => {
  const valid = growthState(), storage = memoryStorage();
  assert.equal(saveData(valid, storage).ok, true);
  const original = storage.getItem(STORAGE_KEY);
  const mutations = [
    data => { data.universityGoals.goals.push({ ...data.universityGoals.goals[0] }); },
    data => { data.testJourney.sat.diagnostics[0].date = '2026-02-30'; },
    data => { data.testJourney.sat.diagnostics[0].checks['sat-diag-algebra'] = 'official-800'; },
    data => { data.abiturTarget.examAverage = 16; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.throws(() => parseBackup(JSON.stringify(invalid), TODAY), /Invalid Northstar backup/);
    assert.equal(saveData(invalid, storage).ok, false);
    assert.equal(storage.getItem(STORAGE_KEY), original);
  }
});

test('a UC shortlist suppresses automatic SAT work, while an explicit preparation choice restores it within the same daily budget', () => {
  let data = personal();
  data.tasks = [];
  data.subjects = data.subjects.map(subject => ({ ...subject, enabled: false }));
  data.sat = normalizeSAT({ enabled: true, targetTotal: 1400, examDate: '2026-10-27', weeklyMinutes: 180 });
  data.ielts.enabled = false;
  data = saveUniversityGoal(data, createUniversityGoal('ucla', { id: 'my-ucla' }));
  data = saveUniversityGoal(data, createUniversityGoal('berkeley', { id: 'my-berkeley' }));
  const without = ensureDailyPlan(data, TODAY);
  assert.equal(without.tasks.some(task => task.date === TODAY && task.satSkill), false);
  const explicit = ensureDailyPlan({ ...data, testJourney: normalizeTestJourney({ sat: { prepareAnyway: true } }) }, TODAY);
  const tasks = explicit.tasks.filter(task => task.date === TODAY);
  assert.ok(tasks.some(task => task.satSkill));
  assert.ok(tasks.length <= 5);
  assert.ok(tasks.reduce((sum, task) => sum + task.minutes, 0) <= data.schedule.weekly.find(day => day.day === 1).minutes);
  assert.deepEqual(data.sat.scores, [], 'Planning must not invent diagnostic or official results');
});

test('programme relevance boosts Mathematics without overriding an urgent school examination', () => {
  let data = personal();
  const before = getSubjectPriorities(data, TODAY).find(item => item.subjectId === 'mathematics');
  data = saveUniversityGoal(data, createUniversityGoal('ucl', { id: 'ucl-cs', priority: 'high' }));
  const relevant = getSubjectPriorities(data, TODAY).find(item => item.subjectId === 'mathematics');
  assert.ok(relevant.score > before.score);
  assert.equal(relevant.target, before.target, 'An unverified programme must not silently alter the user target');
  assert.match(relevant.university.reason, /noch nicht bestätigt/);
  data = saveExam(data, { id: 'urgent-informatik', title: 'Informatik Klausur', subjectId: 'computer-science', date: '2026-10-27', topics: ['Algorithmen'] });
  assert.equal(getSubjectPriorities(data, TODAY)[0].subjectId, 'computer-science');
});

test('school lessons and overlapping work reserve their union before SAT and IELTS split the real weekly capacity', () => {
  const data = personal();
  data.sat = normalizeSAT({ enabled: true, targetTotal: 1400, weeklyMinutes: 90 });
  data.ielts = normalizeIELTS({ enabled: true, targetOverall: 7, weeklyMinutes: 90 });
  data.schedule.weekly = [{ day: 1, minutes: 120, windowStart: '08:00', windowEnd: '10:00' }];
  data.schedule.lessons = [{ id: 'monday-lesson', subjectId: 'mathematics', day: 1, start: '08:00', end: '09:00', cycle: 'all' }];
  data.schedule.fixedActivities = [{ id: 'overlapping-work', title: 'Work', date: TODAY, days: [], start: '08:30', end: '09:15' }];
  const sat = getPreparationContext(data, TODAY, 'sat', 90), ielts = getPreparationContext(data, TODAY, 'ielts', 90);
  assert.equal(sat.weeklyAvailable, 45, 'The overlapping 30 minutes are reserved once');
  assert.equal(sat.allowance, 22);
  assert.equal(ielts.allowance, 22);
  assert.ok(sat.allowance + ielts.allowance <= 45);
  data.schedule.timeOverrides = [{ date: TODAY, minutes: 30 }];
  assert.equal(getPreparationContext(data, TODAY, 'sat', 90).allowance, 15);
  data.schedule.fixedActivities[0].end = '10:00';
  assert.equal(getPreparationContext(data, TODAY, 'sat', 90).allowance, 0);
  assert.equal(getPreparationContext(data, TODAY, 'ielts', 90).allowance, 0);
});

function germanRecovery() {
  let data = personal();
  data.exams = [{ id: 'de-q1', subjectId: 'german', title: 'Deutsch Klausur', date: '2026-10-19', topics: [] }];
  data.tasks = [];
  data.grades = [{ id: 'de-result', subjectId: 'german', points: 4, type: 'written', semester: 'Q1', date: '2026-10-19', weight: 1 }];
  return saveExamReflection(data, 'de-q1', { mood: 'poor', startDate: '2026-10-20', gradeId: 'de-result' }, TODAY);
}

test('a German setback starts actual diagnosis and uses checked answers rather than inferring an error cause from four points', () => {
  const data = germanRecovery();
  const before = getRecoveryPlan(data, 'de-q1', TODAY);
  assert.equal(before[0].learningTopic, 'recovery-german-diagnostic');
  assert.ok(before.every(stage => stage.learningTopic === 'recovery-german-diagnostic'));
  const diagnosticTask = { id: 'diagnostic-de', examId: 'de-q1', subjectId: 'german', category: 'language', minutes: 15, date: TODAY, revisionStage: 'recovery-diagnose', revisionPlanId: before[0].id, learningTopic: before[0].learningTopic, completed: true };
  const session = getTutorSession(data, diagnosticTask, TODAY);
  assert.equal(session.status, 'ready');
  assert.equal(session.questions.length, 3);
  assert.ok(session.questions.every(question => question.prompt && question.solution && question.explanation));
  data.tasks = [diagnosticTask];
  data.learning.sessions = [{ id: 'de-actual-answers', taskId: diagnosticTask.id, unitId: session.unitId, stage: 'done', completedAt: `${TODAY}T15:00:00Z`, checks: { 'de-diagnose-reading': 'good', 'de-diagnose-grammar': 'again', 'de-diagnose-analysis': 'good' } }];
  const after = getRecoveryPlan(data, 'de-q1', TODAY);
  assert.equal(after[1].learningTopic, 'german-argumentation');
  const followUp = getTutorSession(data, { ...diagnosticTask, id: 'de-follow-up', learningTopic: after[1].learningTopic }, TODAY);
  assert.equal(followUp.status, 'ready');
  assert.ok(followUp.questions[0].prompt && followUp.questions[0].solution);
  assert.equal(data.grades[0].points, 4);
  assert.deepEqual(data.recovery.records[0].causes, [], 'Diagnostic self-checks are not teacher-confirmed causes');
});

test('explicit teacher feedback takes precedence over a provisional recovery diagnostic', () => {
  let data = germanRecovery();
  const plan = getRecoveryPlan(data, 'de-q1', TODAY);
  data.tasks = [{ id: 'diagnostic-de', examId: 'de-q1', revisionStage: 'recovery-diagnose', revisionPlanId: plan[0].id, completed: true }];
  data.learning.sessions = [{ taskId: 'diagnostic-de', unitId: 'recovery-german-diagnostic', stage: 'done', checks: { 'de-diagnose-grammar': 'again' } }];
  data = saveExamReflection(data, 'de-q1', { causes: ['analysis'], teacherFeedback: 'Interpretation mit Belegen verbinden.' }, TODAY);
  const next = getRecoveryPlan(data, 'de-q1', TODAY)[1];
  assert.equal(next.learningTopic, 'german-literary-analysis');
  assert.equal(next.provisional, false);
});

test('recovery improvement compares later real results of the same type and semester without treating practice as a grade', () => {
  const data = germanRecovery();
  data.tasks = [{ examId: 'de-q1', revisionStage: 'recovery-diagnose', completed: true }];
  assert.equal(getRecoveryOutcome(data, 'de-q1', TODAY).difference, null);
  data.grades.push(
    { id: 'oral', subjectId: 'german', points: 15, type: 'oral', semester: 'Q1', date: '2026-10-21' },
    { id: 'next-semester', subjectId: 'german', points: 15, type: 'written', semester: 'Q2', date: '2026-10-22' },
    { id: 'future', subjectId: 'german', points: 15, type: 'written', semester: 'Q1', date: '2026-10-27' },
    { id: 'comparable', subjectId: 'german', points: 7, type: 'written', semester: 'Q1', date: '2026-10-23' },
  );
  const outcome = getRecoveryOutcome(data, 'de-q1', TODAY);
  assert.equal(outcome.completed, 1);
  assert.equal(outcome.baseline, 4);
  assert.equal(outcome.later, 7);
  assert.equal(outcome.difference, 3);
  assert.match(outcome.explanation, /keine Methodenwirkung/);
});

test('a programme roadmap separates verified requirements from evidence of satisfying them', () => {
  const goal = createUniversityGoal('ucl', { id: 'roadmap-ucl' });
  const requirement = normalizeUniversityRequirement({ ...goal.requirements.find(item => item.kind === 'subject'), subjectId: 'mathematics', minPoints: 12, evidenceScope: 'semester', semester: 'Q1', status: 'confirmed', entryYear: 2028, referenceYear: 2028, verifiedAt: TODAY, sourceInstitution: goal.name, sourceProgramme: goal.programme, manualChecked: true, manualNote: 'QA fixture only; this is not a real UCL admission requirement.' });
  goal.requirements = [requirement, ...goal.requirements.filter(item => item.kind !== 'subject')];
  const data = saveUniversityGoal(personal(), goal);
  let roadmap = getUniversityGoalRoadmap(data, goal.id, TODAY);
  assert.equal(roadmap.stages.length, 4);
  assert.equal(roadmap.stages[0].checked, 1);
  assert.equal(roadmap.stages[0].requirements.find(item => item.id === requirement.id)?.status, 'not-assessed');
  data.hessen.semesterResults = [{ id: 'math-q1', subjectId: 'mathematics', semester: 'Q1', points: 13, status: 'confirmed', included: true, inclusion: 'mandatory' }];
  roadmap = getUniversityGoalRoadmap(data, goal.id, TODAY);
  assert.equal(roadmap.stages[0].requirements.find(item => item.id === requirement.id)?.status, 'met');
  assert.equal(getUniversityGoalRoadmap(data, 'missing', TODAY), null);
});
