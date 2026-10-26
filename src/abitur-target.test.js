import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHessen } from './hessen.js';
import { ABITUR_GRADE_REFERENCE, gradeTargetPoints, pointsToReferenceGrade, normalizeAbiturTarget, getAbiturTargetPlan } from './abitur-target.js';
const semesters = ['Q1', 'Q2', 'Q3', 'Q4'];
function fixture() {
  const subjects = [{ id: 'mathematics', name: 'Mathematik', level: 'LK', target: 13 }, { id: 'physics', name: 'Physik', level: 'LK', target: 13 }, ...['german', 'english', 'history', 'politics', 'art', 'religion'].map(id => ({ id, name: id, level: 'GK', target: 12 }))];
  const hessen = normalizeHessen({ semesterResults: subjects.flatMap(subject => semesters.map(semester => ({ id: `${subject.id}-${semester}`, subjectId: subject.id, semester, points: null, status: 'scenario', inclusion: subject.level === 'LK' ? 'mandatory' : 'optional', included: true }))), examinationSubjects: ['mathematics', 'physics', 'german', 'english', 'history'].map((subjectId, index) => ({ slot: index + 1, subjectId, points: null, status: 'scenario', mode: index < 3 ? 'written' : 'oral' })) });
  return { subjects, hessen, abiturTarget: normalizeAbiturTarget({ mode: 'points', targetPoints: 733, examAverage: 12, semesterAverage: 12 }) };
}

test('current official 900-point thresholds and grade boundaries match OAVO Annex 10b', () => {
  assert.equal(gradeTargetPoints(1), 823);
  assert.equal(gradeTargetPoints(1.3), 769);
  assert.equal(gradeTargetPoints(1.5), 733);
  assert.equal(gradeTargetPoints(1.7), 697);
  assert.equal(gradeTargetPoints(2), 643);
  assert.equal(gradeTargetPoints(4), 300);
  assert.equal(gradeTargetPoints(1.25), null);
  assert.equal(pointsToReferenceGrade(823), 1);
  assert.equal(pointsToReferenceGrade(822), 1.1);
  assert.equal(pointsToReferenceGrade(733), 1.5);
  assert.equal(pointsToReferenceGrade(732), 1.6);
  assert.equal(pointsToReferenceGrade(300), 4);
  assert.equal(pointsToReferenceGrade(299), null);
  assert.equal(pointsToReferenceGrade(822.9), null);
  assert.equal(ABITUR_GRADE_REFERENCE.verifiedAt, '2026-10-26');
  assert.match(ABITUR_GRADE_REFERENCE.citation, /Anlage 10b/);
});

test('verified official grade conversion needs no provisional opt-in and retains old backup fields', () => {
  const data = fixture();
  data.abiturTarget = normalizeAbiturTarget({ mode: 'grade', targetGrade: 1.5, allowReferenceConversion: false });
  const plan = getAbiturTargetPlan(data);
  assert.equal(plan.target.points, 733);
  assert.equal(plan.target.conversionStatus, 'confirmed');
  assert.equal(plan.config.allowReferenceConversion, false);
  assert.equal(getAbiturTargetPlan({ ...data, abiturTarget: { ...data.abiturTarget, targetGrade: null } }).target.points, null);
});

test('null future grades permit backward calculation with correct LK and exam weighting', () => {
  const plan = getAbiturTargetPlan(fixture());
  assert.equal(plan.selectionComplete, true);
  assert.equal(plan.semesterWeight, 40);
  assert.equal(plan.examWeight, 20);
  assert.equal(plan.requiredSemesters.requiredAverage, 12.325);
  assert.equal(plan.requiredSemesters.minimumWholePoints, 13);
  assert.equal(plan.requiredExams.requiredAverage, 12.65);
  assert.equal(plan.projected.blockI, 480);
  assert.equal(plan.projected.blockII, 240);
  assert.equal(plan.projected.total, 720);
  assert.equal(plan.maxPoints, 900);
});

test('changing assumed examination performance immediately changes required semester mean', () => {
  const data = fixture();
  const before = getAbiturTargetPlan(data);
  data.abiturTarget.examAverage = 13;
  const after = getAbiturTargetPlan(data);
  assert.equal(after.projected.total, 740);
  assert.equal(after.requiredSemesters.requiredAverage, 11.825);
  assert.ok(after.requiredSemesters.requiredAverage < before.requiredSemesters.requiredAverage);
});

test('confirmed semester grades are fixed contributions, not individual exam estimates', () => {
  const data = fixture();
  data.hessen.semesterResults[0] = { ...data.hessen.semesterResults[0], points: 10, status: 'confirmed' };
  data.grades = [{ id: 'individual', subjectId: 'german', points: 4, date: '2026-10-02', semester: 'Q1', type: 'written' }];
  data.subjects[0].written = 8.5;
  const plan = getAbiturTargetPlan(data);
  assert.equal(plan.confirmedSemesterPoints, 20);
  assert.equal(plan.fixedSemesterPoints, 20);
  assert.equal(plan.semesterWeight, 38);
  assert.ok(Math.abs(plan.requiredSemesters.requiredAverage - (733 - 20 - 240) / 38) < 1e-9);
});

test('what-if overrides preserve confirmed base records and identify their hypothetical status', () => {
  const data = fixture();
  data.hessen.semesterResults[0] = { ...data.hessen.semesterResults[0], points: 10, status: 'confirmed' };
  data.abiturTarget.semesterOverrides = [{ resultId: 'mathematics-Q1', points: 12 }];
  data.abiturTarget.examOverrides = [{ slot: 1, points: 15 }];
  const original = JSON.stringify(data);
  const plan = getAbiturTargetPlan(data);
  assert.equal(plan.fixedSemesterPoints, 24);
  assert.equal(plan.confirmedSemesterPoints, 0);
  assert.equal(plan.fixedExamPoints, 60);
  assert.equal(plan.exams[0].overridden, true);
  assert.equal(plan.semesters[0].originalPoints, 10);
  assert.equal(JSON.stringify(data), original);
});

test('incomplete selected GK results cannot produce exact required scores or a total', () => {
  const data = fixture();
  data.hessen.semesterResults.at(-1).included = false;
  const plan = getAbiturTargetPlan(data);
  assert.equal(plan.selectionComplete, false);
  assert.equal(plan.status, 'selection-incomplete');
  assert.equal(plan.requiredSemesters.status, 'missing-data');
  assert.equal(plan.projected.total, null);
  assert.equal(plan.maxPoints, null);
});

test('undecided or duplicate examination choices leave scenario incomplete', () => {
  const data = fixture();
  data.hessen.examinationSubjects[4].subjectId = '';
  assert.equal(getAbiturTargetPlan(data).selectionComplete, false);
  data.hessen.examinationSubjects[4].subjectId = 'mathematics';
  assert.equal(getAbiturTargetPlan(data).selectionComplete, false);
});

test('a target beyond the attainable maximum is detected even with optimistic future scores', () => {
  const data = fixture();
  data.abiturTarget.targetPoints = 900;
  data.hessen.semesterResults[0] = { ...data.hessen.semesterResults[0], points: 0, status: 'confirmed' };
  const plan = getAbiturTargetPlan(data);
  assert.equal(plan.maxPoints, 870);
  assert.equal(plan.status, 'impossible');
  assert.equal(plan.requiredSemesters.status, 'impossible');
  assert.equal(plan.semesters[0].value, 0);
});

test('known scenario values are assumptions and can be excluded from a new comparison', () => {
  const data = fixture();
  data.hessen.semesterResults[0].points = 8;
  let plan = getAbiturTargetPlan(data);
  assert.equal(plan.fixedSemesterPoints, 16);
  assert.equal(plan.confirmedSemesterPoints, 0);
  data.abiturTarget.useSavedScenarios = false;
  plan = getAbiturTargetPlan(data);
  assert.equal(plan.fixedSemesterPoints, 0);
  assert.equal(plan.semesterWeight, 40);
});

test('missing exam assumptions prevent a single required semester mean', () => {
  const data = fixture();
  data.abiturTarget.examAverage = null;
  const plan = getAbiturTargetPlan(data);
  assert.equal(plan.requiredSemesters.status, 'missing-data');
  assert.equal(plan.requiredSemesters.requiredAverage, null);
  assert.equal(plan.projected.total, null);
  assert.equal(plan.combined.requiredAverage, 733 / 60);
});

test('per-subject scenarios hold other user targets fixed and account for LK factors', () => {
  const plan = getAbiturTargetPlan(fixture());
  const math = plan.subjectScenarios.find(subject => subject.subjectId === 'mathematics');
  assert.equal(math.remainingWeight, 8);
  assert.equal(math.enteredTarget, 13);
  assert.equal(math.requiredAverage, (733 - 240 - (8 * 13 + 24 * 12)) / 8);
  const german = plan.subjectScenarios.find(subject => subject.subjectId === 'german');
  assert.equal(german.remainingWeight, 4);
  assert.notEqual(math.requiredAverage, german.requiredAverage);
});

test('semester timeline retains weighted contributions and does not fabricate unknowns', () => {
  const data = fixture();
  data.abiturTarget.semesterAverage = null;
  const plan = getAbiturTargetPlan(data);
  assert.equal(plan.timeline.length, 4);
  assert.ok(plan.timeline.every(term => term.remainingWeight === 10 && term.openCount === 8 && term.scenarioPoints === null));
});

test('zero and fixed all-known scenarios do not divide by zero or become missing grades', () => {
  const data = fixture();
  data.hessen.semesterResults.forEach(result => { result.points = 15; result.status = 'confirmed'; });
  data.hessen.examinationSubjects.forEach(result => { result.points = 15; result.status = 'confirmed'; });
  const plan = getAbiturTargetPlan(data);
  assert.equal(plan.projected.total, 900);
  assert.equal(plan.requiredSemesters.status, 'already-met');
  assert.equal(plan.requiredExams.status, 'already-met');
  assert.equal(plan.requiredSemesters.requiredAverage, null);
});

test('normalization bounds values, retains only unique override keys and does not invent a target', () => {
  const normalized = normalizeAbiturTarget({ targetGrade: 1.25, examAverage: 16, semesterAverage: 0, semesterOverrides: [{ resultId: 'a', points: 0 }, { resultId: 'a', points: 15 }], examOverrides: [{ slot: 6, points: 4 }, { slot: 1, points: 12 }] });
  assert.equal(normalized.targetGrade, null);
  assert.equal(normalized.examAverage, null);
  assert.equal(normalized.semesterAverage, 0);
  assert.deepEqual(normalized.semesterOverrides, [{ resultId: 'a', points: 0 }]);
  assert.deepEqual(normalized.examOverrides, [{ slot: 1, points: 12 }]);
  assert.equal(normalizeAbiturTarget().targetGrade, null);
});
