import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecovery, saveExamReflection, getExamReflection, getPendingExamReflections, buildReturnedExamGrade, getPossibleExamGradeMatches, linkReturnedExamGrade, calculateClassroomRecovery, getRecoveryPlan, getRecoveryCandidates, RECOVERY_TUTOR_UNITS } from './recovery.js';

const fixture = () => ({ subjects: [{ id: 'english', name: 'Englisch', level: 'GK', target: 10 }], exams: [{ id: 'english-q1', subjectId: 'english', title: 'Englisch Klausur', date: '2026-10-26', topics: [] }], tasks: [], grades: [], recovery: { records: [] } });
const start = data => saveExamReflection(data, 'english-q1', { mood: 'poor', startDate: '2026-10-27' }, '2026-10-27');
test('normalization preserves optional evidence without turning mood into a grade', () => {
  assert.deepEqual(normalizeRecovery(null), { records: [] });
  const recovery = normalizeRecovery({ records: [{ examId: 'exam', mood: 'poor', causes: ['analysis', 'unknown', 'analysis'], teacherFeedback: '  Belege erklären  ', startDate: '2026-02-30' }, { examId: 'exam', mood: 'good' }] });
  assert.equal(recovery.records.length, 1); assert.deepEqual(recovery.records[0].causes, ['analysis']); assert.equal(recovery.records[0].teacherFeedback, 'Belege erklären'); assert.equal(recovery.records[0].startDate, ''); assert.equal(recovery.records[0].gradeId, '');
});
test('post-exam reflection refuses future exams and is idempotent per exam', () => {
  const data = fixture();
  assert.throws(() => saveExamReflection(data, 'english-q1', { mood: 'poor' }, '2026-10-25'), /erst am Prüfungstag/);
  const first = start(data), next = saveExamReflection(first, 'english-q1', { mood: 'medium' }, '2026-10-28');
  assert.equal(next.recovery.records.length, 1); assert.equal(getExamReflection(next, 'english-q1').mood, 'medium'); assert.deepEqual(next.grades, []); assert.deepEqual(next.exams, data.exams);
});
test('reflection prompt is only pending after the exam and before an impression', () => {
  const data = fixture();
  assert.equal(getPendingExamReflections(data, '2026-10-26').length, 0); assert.equal(getPendingExamReflections(data, '2026-10-27').length, 1); assert.equal(getPendingExamReflections(start(data), '2026-10-27').length, 0);
});
test('returned grade requires actual points, type, date, semester and explicit weighting', () => {
  const data = start(fixture()), input = { points: 4, type: 'written', date: '2026-10-26', semester: 'Q1', weight: 1 };
  for (const field of ['points', 'type', 'date', 'semester', 'weight']) assert.throws(() => buildReturnedExamGrade(data, 'english-q1', { ...input, [field]: '' }, '2026-10-27'));
  const grade = buildReturnedExamGrade(data, 'english-q1', input, '2026-10-27');
  assert.equal(grade.points, 4); assert.equal(grade.id, 'recovery-grade-english-q1'); assert.equal(grade.subjectId, 'english');
  assert.throws(() => buildReturnedExamGrade(data, 'english-q1', { ...input, date: '2026-10-28' }, '2026-10-27'), /Leistungsdatum/);
});
test('matching existing grade must be linked or explicitly confirmed as a different assessment', () => {
  const data = start(fixture()); data.grades = [{ id: 'real-result', subjectId: 'english', points: 4, date: '2026-10-26', type: 'written', semester: 'Q1', weight: 1 }];
  const input = { points: 4, type: 'written', date: '2026-10-26', semester: 'Q1', weight: 1 };
  assert.equal(getPossibleExamGradeMatches(data, 'english-q1').length, 1);
  assert.throws(() => buildReturnedExamGrade(data, 'english-q1', input, '2026-10-27'), /bereits/);
  const linked = linkReturnedExamGrade(data, 'english-q1', 'real-result', '2026-10-27');
  assert.equal(buildReturnedExamGrade(linked, 'english-q1', { ...input, points: 5 }, '2026-10-27').id, 'real-result');
  assert.equal(linked.grades.length, 1); assert.equal(linked.grades[0].points, 4);
});
test('classroom recovery uses explicit scenario and detects impossible outcomes', () => {
  const missing = calculateClassroomRecovery({ writtenAverage: 4, target: 10 }); assert.equal(missing.status, 'missing-data');
  const result = calculateClassroomRecovery({ writtenAverage: 4, writtenShare: 1 / 3, target: 10, classroomPoints: 13 });
  assert.equal(result.status, 'achievable'); assert.ok(Math.abs(result.requiredClassroom - 13) < 1e-9); assert.equal(result.minimumWholePoints, 13); assert.ok(Math.abs(result.projected - 10) < 1e-9);
  const impossible = calculateClassroomRecovery({ writtenAverage: 4, writtenShare: 0.5, target: 13 }); assert.equal(impossible.status, 'impossible'); assert.equal(impossible.requiredClassroom, 22); assert.equal(impossible.bestPossible, 9.5);
  assert.equal(calculateClassroomRecovery({ writtenAverage: 0, writtenShare: 1 / 3, target: 0, classroomPoints: 0 }).projected, 0);
});
test('unknown feedback starts an actual provisional diagnosis and no second exam', () => {
  const data = start(fixture()), plan = getRecoveryPlan(data, 'english-q1', '2026-10-27');
  assert.equal(plan.length, 5); assert.ok(plan.every(stage => stage.provisional)); assert.equal(plan[0].learningTopic, 'recovery-english-diagnostic'); assert.deepEqual(data.exams.map(exam => exam.date), ['2026-10-26']);
  const actual = RECOVERY_TUTOR_UNITS.find(unit => unit.id === plan[0].learningTopic); assert.ok(actual.explanation.length > 100); assert.equal(actual.questions.length, 3); assert.ok(actual.questions.every(question => question.prompt && question.solution && question.explanation));
});
test('poor result schedules one due candidate through common time allocator, not a backlog', () => {
  const data = start(fixture());
  assert.equal(getRecoveryCandidates(data, '2026-10-27').length, 1);
  assert.equal(getRecoveryCandidates(data, '2026-11-20').length, 1);
  const first = getRecoveryCandidates(data, '2026-10-27')[0]; assert.equal(first.minutes, 15); assert.equal(first.category, 'language'); assert.equal(first.learningTopic, 'recovery-english-diagnostic');
  const completed = { ...data, tasks: [{ revisionPlanId: first.revisionPlanId, completed: true }] };
  assert.equal(getRecoveryCandidates(completed, '2026-10-27').length, 0); assert.equal(getRecoveryCandidates(completed, '2026-10-28')[0].learningTopic, 'recovery-english-diagnostic');
});
test('confirmed weakness selects specific actual practice, feedback remains self-reported evidence', () => {
  const data = saveExamReflection(start(fixture()), 'english-q1', { causes: ['grammar'], teacherFeedback: 'Satzverknüpfungen prüfen.' }, '2026-10-27');
  const plan = getRecoveryPlan(data, 'english-q1', '2026-10-27'); assert.equal(plan[1].learningTopic, 'recovery-english-grammar'); assert.equal(plan[1].provisional, false);
  const lesson = RECOVERY_TUTOR_UNITS.find(unit => unit.id === plan[1].learningTopic); assert.match(lesson.questions[0].prompt, /Correct/); assert.match(lesson.questions[0].solution, /but/);
  const closed = saveExamReflection(data, 'english-q1', { closed: true }, '2026-10-27'); assert.equal(getRecoveryCandidates(closed, '2026-11-01').length, 0);
});
