import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateGradeAverage, calculateSubject, getAcademicOverview, normalizeAcademicGrade, normalizeGrading, normalizeGradeForecast, getGradeForecast, getGradeEvidence, requiredFutureGrades } from './grades.js';
const record = (points, type = 'written', extra = {}) => ({ id: `g-${points}-${type}`, subjectId: 'math', date: '2026-10-19', points, type, semester: 'Q1', ...extra });
const data = records => ({ profile: { schoolYear: 'Q1' }, subjects: [{ id: 'math', name: 'Mathematik', level: 'LK', target: 10, written: 6, oral: 11, baselineWritten: 6, baselineOral: 11 }], grades: records });

test('simple average includes zero and does not invent assessment weights', () => {
  const result = calculateGradeAverage([record(0), record(12, 'oral')]);
  assert.equal(result.average, 6);
  assert.equal(normalizeGrading().mode, 'simple');
  assert.ok(Object.values(normalizeGrading().weights).every(value => value === null));
});
test('weighted results use explicit relative weights and retain precision for scenarios', () => {
  assert.equal(calculateGradeAverage([record(6, 'written', { weight: 2 }), record(12, 'oral', { weight: 1 })], { mode: 'weighted' }).average, 8);
  const missing = calculateGradeAverage([record(6), record(12, 'oral', { weight: 1 })], { mode: 'weighted' });
  assert.equal(missing.average, null);
  assert.equal(missing.complete, false);
  assert.equal(missing.missingWeights.length, 1);
});
test('category weights apply to category means rather than the number of entries', () => {
  const result = calculateGradeAverage([record(4), record(8), record(12, 'oral')], { mode: 'category', weights: { written: 2, oral: 1 } });
  assert.equal(result.average, 8);
  assert.equal(result.categories.written, 6);
});
test('missing categories and unconfigured assessment types never silently change weighting', () => {
  const settings = { mode: 'category', weights: { written: 2, oral: 1 } };
  assert.equal(calculateGradeAverage([record(10)], settings).average, null);
  assert.deepEqual(calculateGradeAverage([record(10)], settings).missingCategories, ['oral']);
  assert.equal(calculateGradeAverage([record(10), record(10, 'oral'), record(10, 'presentation')], settings).average, null);
});
test('actual assessments replace orientation baseline without counting it again', () => {
  assert.equal(calculateSubject(data([]), 'math').average, 8.5);
  assert.equal(calculateSubject(data([]), 'math').source, 'baseline');
  assert.equal(calculateSubject(data([record(14)]), 'math').average, 14);
  assert.equal(calculateSubject(data([record(14)]), 'math').source, 'assessments');
  assert.equal(calculateSubject(data([]), 'math', 'Q1').average, null);
});
test('semester averages do not attach old unassigned records to current semester', () => {
  const result = calculateSubject(data([record(4, 'written', { id: 'q1', semester: 'Q1' }), record(12, 'written', { id: 'q2', semester: 'Q2' }), record(15, 'oral', { semester: '' })]), 'math', 'Q2');
  assert.equal(result.average, 12);
  assert.equal(result.unassignedCount, 1);
  assert.equal(result.semesterAverages.find(entry => entry.semester === 'Q1').average, 4);
});
test('overall average uses configured course weights without assuming LK double weighting', () => {
  const state = data([record(6)]);
  state.subjects.push({ id: 'german', name: 'Deutsch', target: 10, oral: 12 });
  assert.equal(getAcademicOverview(state).average, 9);
  assert.equal(getAcademicOverview(state).target, null);
  state.subjects[0].grading = { courseWeight: 2 };
  state.profile.targetAverage = 10;
  assert.equal(getAcademicOverview(state).average, 8);
  assert.equal(getAcademicOverview(state).gap, 2);
  assert.equal(getAcademicOverview(state).weighted, true);
});
test('next assessment requirement exposes exact and whole-point minimum', () => {
  const result = requiredFutureGrades({ records: [record(7)], target: 10, future: [{ type: 'written' }] });
  assert.equal(result.requiredScore, 13);
  assert.equal(result.minimumWholePoints, 13);
  assert.equal(result.achievable, true);
});
test('weighted remaining exams scenario handles impossible targets', () => {
  const result = requiredFutureGrades({ records: [record(3, 'written', { weight: 3 })], target: 12, future: [{ type: 'written', weight: 1 }, { type: 'written', weight: 1 }], grading: { mode: 'weighted' } });
  assert.equal(result.requiredScore, 25.5);
  assert.equal(result.maxPossible, 7.8);
  assert.equal(result.achievable, false);
  assert.match(result.explanation, /15/);
});
test('category scenario includes oral what-if without treating it as actual evidence', () => {
  const records = [record(6)];
  const result = requiredFutureGrades({ records, target: 10, future: [{ type: 'written' }, { type: 'oral', points: 12 }], grading: { mode: 'category', weights: { written: 1, oral: 1 } } });
  assert.equal(result.requiredScore, 10);
  assert.equal(records.length, 1);
  assert.equal(records[0].points, 6);
});
test('scenarios reject missing weights and do not invent a schedule', () => {
  assert.equal(requiredFutureGrades({ records: [record(7)], target: 10 }).status, 'missing-data');
  assert.equal(requiredFutureGrades({ records: [record(7)], target: 10, future: [{ type: 'written', weight: 2 }], grading: { mode: 'weighted' } }).status, 'missing-data');
  assert.equal(requiredFutureGrades({ records: [], target: 10, future: [{ type: 'oral' }], grading: { mode: 'category', weights: { written: 1, oral: 1 } } }).status, 'missing-data');
});
test('all-fixed hypothetical results report feasibility without a fake required score', () => {
  const result = requiredFutureGrades({ records: [record(10)], target: 10, future: [{ type: 'oral', points: 12 }] });
  assert.equal(result.status, 'already-met');
  assert.equal(result.requiredScore, null);
  assert.equal(result.maxPossible, 11);
});
test('normalization preserves zero, expanded types, semester and only explicit weights', () => {
  const value = normalizeAcademicGrade(record(0, 'presentation', { weight: '2', semester: 'Q3', note: 'Vortrag' }));
  assert.equal(value.points, 0);
  assert.equal(value.type, 'presentation');
  assert.equal(value.weight, 2);
  assert.equal(value.semester, 'Q3');
  assert.equal(normalizeAcademicGrade(record(null)), null);
  assert.equal(normalizeAcademicGrade(record(10, 'oral', { date: '2026-02-30' })), null);
  assert.equal(normalizeAcademicGrade(record(10)).weight, null);
});
test('trend requires evidence and compares earlier and later records without an Abitur prediction', () => {
  assert.equal(calculateSubject(data([record(6)]), 'math').trend.direction, 'unknown');
  const results = [4, 6, 9, 11].map((points, index) => record(points, 'written', { id: String(index), date: `2026-10-${10 + index}` }));
  assert.equal(calculateSubject(data(results), 'math').trend.direction, 'up');
  assert.equal(calculateSubject(data(results), 'math').trend.difference, 5);
});


test('current semester never silently reuses a historical assigned grade', () => {
  const state = data([record(13, 'written', { semester: 'Q1' })]);
  state.profile.schoolYear = 'Q2';
  const current = calculateSubject(state, 'math');
  assert.equal(current.average, null);
  assert.equal(current.semester, 'Q2');
  assert.equal(calculateSubject(state, 'math', 'Q1').average, 13);
  assert.equal(calculateSubject(state, 'math', 'all').average, 13);
  assert.equal(getAcademicOverview(state).average, null);
});

test('unassigned historical results are preserved and labeled as orientation', () => {
  const state = data([record(8, 'written', { semester: '' })]);
  state.profile.schoolYear = 'Q2';
  const result = calculateSubject(state, 'math');
  assert.equal(result.average, 8);
  assert.match(result.methodLabel, /Ohne Halbjahr/);
  assert.equal(result.unassignedCount, 1);
});

function forecastAnalysis(records, target = 13, grading = { mode: 'weighted' }) {
  const state = data(records);
  state.subjects[0].target = target;
  state.subjects[0].grading = grading;
  return calculateSubject(state, 'math');
}
const nextScenario = (patch = {}) => ({ semester: 'Q1', mode: 'next', future: [{ id: 'next', type: 'written', weight: 5, points: null }], ...patch });

test('prominent next-score calculation refuses an undated 8.5 starting estimate', () => {
  const analysis = forecastAnalysis([], 13, { mode: 'simple' });
  assert.equal(analysis.average, 8.5);
  const result = getGradeForecast(analysis, nextScenario());
  assert.equal(result.requiredScore, null);
  assert.equal(result.status, 'missing-data');
  assert.deepEqual(result.missingFields, ['records']);
});
test('a target of13 from confirmed8.5 needs14.8 on a next assessment weighted5', () => {
  const analysis = forecastAnalysis([record(8, 'written', { weight: 1 }), record(9, 'oral', { weight: 1 })]);
  const result = getGradeForecast(analysis, nextScenario());
  assert.equal(analysis.average, 8.5);
  assert.ok(Math.abs(result.requiredScore - 14.8) < 1e-9);
  assert.equal(result.minimumWholePoints, 15);
  assert.deepEqual(result.calculation, { target: 13, denominator: 7, constant: 17, coefficient: 5 });
  assert.equal(result.achievable, true);
  assert.match(result.explanation, /nächsten Leistung/);
});
test('a target of13 from confirmed8.5 is impossible when next assessment hasweight1', () => {
  const result = getGradeForecast(forecastAnalysis([record(8, 'written', { weight: 1 }), record(9, 'oral', { weight: 1 })]), nextScenario({ future: [{ id: 'next', type: 'written', weight: 1 }] }));
  assert.equal(result.requiredScore, 22);
  assert.equal(result.status, 'impossible');
  assert.ok(Math.abs(result.maxPossible - 32 / 3) < 1e-9);
});
test('an exact next score needs fixed assumptions for every other remaining assessment', () => {
  const analysis = forecastAnalysis([record(8, 'written', { weight: 1 }), record(9, 'oral', { weight: 1 })], 12);
  const config = nextScenario({ future: [{ id: 'next', type: 'written', weight: 2 }, { id: 'other', type: 'oral', weight: 2 }] });
  assert.deepEqual(getGradeForecast(analysis, config).missingFields, ['otherScores']);
  config.future[1].points = 14;
  const result = getGradeForecast(analysis, config);
  assert.equal(result.requiredScore, 13.5);
  assert.equal(result.minimumWholePoints, 14);
});
test('remaining-average mode solves all unknown results without pretending that this is an exact next score', () => {
  const analysis = forecastAnalysis([record(8, 'written', { weight: 1 }), record(9, 'oral', { weight: 1 })], 12);
  const config = nextScenario({ mode: 'remaining', future: [{ id: 'next', type: 'written', weight: 2 }, { id: 'other', type: 'oral', weight: 2 }], comparisonScore: 13 });
  const result = getGradeForecast(analysis, config);
  assert.equal(result.kind, 'remaining');
  assert.equal(result.unknownCount, 2);
  assert.equal(result.requiredScore, 13.75);
  assert.equal(result.comparisonAverage, 11.5);
  assert.ok(Math.abs(result.bestCaseAverage - 77 / 6) < 1e-9);
  assert.equal(config.future[1].points, undefined);
});
test('next-score forecasting uses category weighting and a stated oral assumption transparently', () => {
  const analysis = forecastAnalysis([record(8, 'written'), record(11, 'oral')], 11, { mode: 'category', weights: { written: 2, oral: 1 } });
  const result = getGradeForecast(analysis, nextScenario());
  assert.equal(result.requiredScore, 14);
  assert.equal(result.achievable, true);
});
test('missing actual assessment weight or category prevents a precise next-score claim', () => {
  const analysis = forecastAnalysis([record(8, 'written')]);
  assert.deepEqual(getGradeForecast(analysis, nextScenario()).missingFields, ['weights']);
  const invalid = { ...analysis, records: [{ ...analysis.records[0], date: '' }] };
  assert.deepEqual(getGradeForecast(invalid, nextScenario()).missingFields, ['records']);
});
test('hypothetical comparison stays unknown until the user supplies a score, and normalization preserveszero', () => {
  const analysis = forecastAnalysis([record(8, 'written', { weight: 1 })], 10);
  assert.equal(getGradeForecast(analysis, nextScenario()).comparisonAverage, null);
  assert.equal(normalizeGradeForecast({ comparisonScore: 0, future: [{ id: 'zero', type: 'oral', points: 0, weight: 2 }] }).future[0].points, 0);
  assert.equal(normalizeGradeForecast({ comparisonScore: 0 }).comparisonScore, 0);
});
test('grade evidence describes category results and actual notes without inventing a skill diagnosis', () => {
  const analysis = forecastAnalysis([record(4, 'written', { weight: 1, note: 'Lehrkraft: Belege fehlen' }), record(10, 'oral', { weight: 1 })], 10);
  const evidence = getGradeEvidence(analysis);
  assert.equal(evidence.contrast.written, 4);
  assert.equal(evidence.contrast.oral, 10);
  assert.deepEqual(evidence.feedback.map(entry => entry.note), ['Lehrkraft: Belege fehlen']);
  assert.equal(evidence.teacherReviewSuggested, false);
  assert.equal(getGradeEvidence(forecastAnalysis([record(4, 'written', { weight: 1 })])).needsFeedback, true);
});

test('a savedQ1 what-if setup is never silently used forQ2 results', () => {
  const state = data([record(8, 'written', { weight: 1, semester: 'Q2' })]);
  state.profile.schoolYear = 'Q2';
  state.subjects[0].grading = { mode: 'weighted' };
  const analysis = calculateSubject(state, 'math');
  const result = getGradeForecast(analysis, nextScenario());
  assert.deepEqual(result.missingFields, ['semester']);
  assert.equal(result.requiredScore, null);
});
