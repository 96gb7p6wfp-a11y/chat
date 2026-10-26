import test from 'node:test';
import assert from 'node:assert/strict';
import { getSemesterEstimate, normalizeSemesterConfig, normalizeSemesterGrading, saveSemesterConfig } from './semester-grades.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);
const grade = (points, patch = {}) => ({ id: `grade-${points}`, subjectId: 'english', semester: 'Q1', type: 'written', date: '2026-10-26', points, weight: null, ...patch });
const config = patch => ({ subjectId: 'english', semester: 'Q1', writtenShare: 1 / 3, continuousPoints: null, continuousStatus: 'estimate', teacherConfirmed: false, writtenMode: 'equal', futureWritten: [], ...patch });
const data = (grades = [grade(4)], patch = {}) => ({ subjects: [{ id: 'english', target: 10, baselineWritten: 7, baselineOral: 7 }], grades, semesterGrading: { configs: [config(patch)] } });

test('single poor English Klausur can recover through explicit classroom scenario without another fictional Klausur', () => {
  const result = getSemesterEstimate(data(), 'english', 'Q1');
  assert.equal(result.knownWrittenAverage, 4);
  assert.equal(result.estimatedPoints, null);
  assert.equal(result.requiredNext.status, 'missing-data');
  assert.equal(result.config.futureWritten.length, 0);
  close(result.requiredContinuous.requiredScore, 13);
  assert.equal(result.requiredContinuous.minimumWholePoints, 13);
  const projected = getSemesterEstimate(data(undefined, { continuousPoints: 13 }), 'english', 'Q1');
  close(projected.estimatedPoints, 10);
  assert.equal(projected.officialSemesterGrade, false);
});

test('an individual German result is not converted to a semester grade without an explicit model', () => {
  const value = { subjects: [{ id: 'german', target: 10 }], grades: [grade(4, { subjectId: 'german' })] };
  const result = getSemesterEstimate(value, 'german');
  assert.equal(result.status, 'missing-data');
  assert.equal(result.estimatedPoints, null);
  assert.equal(result.config.writtenShare, null);
  assert.equal(result.config.writtenMode, 'unset');
});

test('starting estimates and undated or other-semester grades never enter the Klausur pool', () => {
  const value = data([grade(4, { date: '' }), grade(15, { semester: 'Q2' }), grade(11, { type: 'oral' })], { continuousPoints: 12 });
  const result = getSemesterEstimate(value, 'english', 'Q1');
  assert.equal(result.knownWrittenAverage, null);
  assert.equal(result.estimatedPoints, null);
  assert.equal(result.writtenRecords.length, 0);
  assert.equal(result.otherRecords.length, 1);
});

test('grade weights are never silently assumed equal', () => {
  const value = data([grade(8), grade(9)], { writtenMode: 'unset', continuousPoints: 12 });
  const unset = getSemesterEstimate(value, 'english');
  assert.equal(unset.estimatedPoints, null);
  assert.ok(unset.missing.includes('Gewichtung der Klausuren untereinander'));
  value.semesterGrading.configs[0].writtenMode = 'weighted';
  const missingWeight = getSemesterEstimate(value, 'english');
  assert.ok(missingWeight.missing.includes('Einzelgewicht jeder Klausur'));
});

test('weighted next Klausur minimum and impossible target detection use actual assessment weights', () => {
  const value = data([grade(8, { id: 'a', weight: 1 }), grade(9, { id: 'b', weight: 1 })], { writtenShare: .5, continuousPoints: 13, writtenMode: 'weighted', futureWritten: [{ id: 'next', points: null, weight: 5 }] });
  value.subjects[0].target = 13;
  const result = getSemesterEstimate(value, 'english');
  close(result.knownWrittenAverage, 8.5);
  close(result.requiredNext.requiredScore, 14.8);
  assert.equal(result.requiredNext.minimumWholePoints, 15);
  assert.equal(result.requiredNext.achievable, true);
  value.semesterGrading.configs[0].futureWritten[0].weight = 1;
  const impossible = getSemesterEstimate(value, 'english');
  assert.equal(impossible.requiredNext.status, 'impossible');
  close(impossible.requiredNext.requiredScore, 22);
  assert.ok(impossible.requiredNext.maxPossible < 13);
});

test('two remaining unknown Klausuren allow a required mean but no single exact next result', () => {
  const result = getSemesterEstimate(data([grade(6)], { writtenShare: .5, continuousPoints: 12, futureWritten: [{ id: 'next', points: null }, { id: 'last', points: null }] }), 'english');
  assert.equal(result.requiredNext.status, 'missing-data');
  close(result.requiredRemaining.requiredScore, 9);
  assert.equal(result.requiredRemaining.minimumWholePoints, 9);
  assert.equal(result.nextRange.minRequired, 3);
  assert.equal(result.nextRange.maxRequired, 18);
});

test('fixed later Klausur assumptions make the next result uniquely calculable', () => {
  const result = getSemesterEstimate(data([grade(6)], { writtenShare: .5, continuousPoints: 12, futureWritten: [{ id: 'next', points: null }, { id: 'last', points: 10 }] }), 'english');
  close(result.requiredNext.requiredScore, 8);
  assert.equal(result.requiredNext.achievable, true);
});

test('missing continuous assessment does not invent a range; only user-entered bounds produce one', () => {
  const value = data(undefined, { futureWritten: [{ id: 'next', points: null }] });
  const missing = getSemesterEstimate(value, 'english');
  assert.equal(missing.requiredNext.status, 'missing-data');
  assert.equal(missing.nextRange, null);
  assert.equal(missing.outcomeRange, null);
  value.semesterGrading.configs[0].continuousRange = { min: 8, max: 12 };
  const range = getSemesterEstimate(value, 'english');
  close(range.nextRange.minRequired, 8);
  close(range.nextRange.maxRequired, 24);
  assert.equal(range.requiredNext.status, 'missing-data');
  value.semesterGrading.configs[0].continuousRange = { min: 12, max: 8 };
  assert.equal(getSemesterEstimate(value, 'english').nextRange, null);
});

test('other assessed work is not automatically counted as a Klausur or a classroom mean', () => {
  const value = data([grade(4), grade(14, { id: 'presentation', type: 'presentation' }), grade(15, { id: 'oral', type: 'oral' })], { continuousPoints: 10 });
  const separate = getSemesterEstimate(value, 'english');
  assert.equal(separate.knownWrittenAverage, 4);
  assert.equal(separate.writtenRecords.length, 1);
  value.semesterGrading.configs[0].replacementGradeIds = ['presentation'];
  const replacement = getSemesterEstimate(value, 'english');
  assert.equal(replacement.knownWrittenAverage, 9);
  assert.equal(replacement.writtenRecords.length, 2);
  assert.equal(replacement.otherRecords.length, 1);
});

test('maximum and selected semester scenario are mathematically distinct from a confirmed grade', () => {
  const value = data(undefined, { continuousPoints: 12, futureWritten: [{ id: 'next', points: 10 }] });
  const result = getSemesterEstimate(value, 'english');
  close(result.projectedWrittenAverage, 7);
  close(result.estimatedPoints, 31 / 3);
  close(result.requiredContinuous.requiredScore, 11.5);
  assert.equal(result.officialSemesterGrade, false);
  assert.equal(result.source, 'selected-scenario');
});

test('zero grades and endpoint weight scenarios remain mathematically well defined', () => {
  const classroom = getSemesterEstimate(data([grade(0)], { writtenShare: 0, writtenMode: 'unset', continuousPoints: 10 }), 'english');
  close(classroom.estimatedPoints, 10);
  const writtenOnly = getSemesterEstimate(data([grade(0)], { writtenShare: 1, continuousPoints: null }), 'english');
  close(writtenOnly.estimatedPoints, 0);
  assert.equal(writtenOnly.requiredContinuous.status, 'impossible');
});

test('a zero written share never fabricates a next-score range or changes the descriptive written denominator', () => {
  const value = data([grade(4), grade(10)], { writtenShare: 0, writtenMode: 'equal', continuousPoints: 12 });
  const result = getSemesterEstimate(value, 'english');
  close(result.projectedWrittenAverage, 7);
  close(result.estimatedPoints, 12);
  value.semesterGrading.configs[0].continuousPoints = null;
  value.semesterGrading.configs[0].continuousRange = { min: 8, max: 12 };
  value.semesterGrading.configs[0].futureWritten = [{ id: 'next', points: null }];
  const range = getSemesterEstimate(value, 'english');
  assert.equal(range.nextRange, null);
  assert.equal(range.requiredNext.requiredScore, null);
  assert.ok(Object.values(range.outcomeRange).every(Number.isFinite));
  const noWrittenData = getSemesterEstimate(data([], { writtenShare: 0, writtenMode: 'unset', continuousPoints: 10 }), 'english');
  assert.equal(noWrittenData.projectedWrittenAverage, null);
  close(noWrittenData.estimatedPoints, 10);
});

test('the next-result calculation treats the first scenario result as unknown while keeping later assumptions fixed', () => {
  const value = data([grade(6)], { writtenShare: .5, continuousPoints: 12, futureWritten: [{ id: 'next', points: 2 }, { id: 'later', points: 10 }] });
  const result = getSemesterEstimate(value, 'english');
  close(result.requiredNext.requiredScore, 8);
  close(result.projectedWrittenAverage, 6);
  close(result.estimatedPoints, 9);
  value.semesterGrading.configs[0].futureWritten[0].points = 14;
  const changedComparison = getSemesterEstimate(value, 'english');
  close(changedComparison.requiredNext.requiredScore, 8);
  close(changedComparison.estimatedPoints, 11);
});

test('normalization is bounded, preserves explicit zeros, deduplicates per semester and saves without changing records', () => {
  const normalized = normalizeSemesterConfig({ subjectId: 'english', writtenShare: 0, continuousPoints: 0, writtenMode: 'bogus', teacherConfirmed: 'true', futureWritten: [{ id: 'x', points: 18, weight: -1 }, { id: 'x', points: 0, weight: 2 }], replacementGradeIds: ['same', 'same'] });
  assert.equal(normalized.writtenShare, 0);
  assert.equal(normalized.continuousPoints, 0);
  assert.equal(normalized.writtenMode, 'unset');
  assert.equal(normalized.teacherConfirmed, false);
  assert.equal(normalized.futureWritten[0].points, null);
  assert.notEqual(normalized.futureWritten[0].id, normalized.futureWritten[1].id);
  assert.deepEqual(normalized.replacementGradeIds, ['same']);
  assert.equal(normalizeSemesterGrading({ configs: [config({ continuousPoints: 5 }), config({ continuousPoints: 9 })] }).configs.length, 1);
  const value = data();
  const saved = saveSemesterConfig(value, config({ continuousPoints: 13 }));
  assert.equal(saved.semesterGrading.configs[0].continuousPoints, 13);
  assert.deepEqual(saved.grades, value.grades);
  assert.deepEqual(saved.subjects, value.subjects);
});
