import test from 'node:test';
import assert from 'node:assert/strict';
import { DIAGNOSTIC_QUESTIONS, checkDiagnosticAnswer, getDiagnosticSummary, getJourneyPreparation, normalizeTestJourney, rankCandidateTestDates, saveDiagnosticAttempt, saveJourneyPart } from './test-journeys.js';
import { normalizeSAT } from './sat.js';
import { normalizeIELTS } from './ielts.js';
import { getSATCandidates } from './sat.js';
import { getIELTSCandidates } from './ielts.js';
import { DIAGNOSTIC_SKILL_IDS, getInformalPracticeNeeds, getPreparationContext } from './test-preparation.js';
import { createUniversityGoal, saveUniversityGoal } from './university-goals.js';

const TODAY = '2026-10-28';
const fixture = () => ({ profile: {}, tasks: [], exams: [], schedule: { weekly: Array.from({ length: 7 }, (_, day) => ({ day, minutes: 60 })) }, sat: normalizeSAT({ enabled: true, targetTotal: 1400, weeklyMinutes: 120 }), ielts: normalizeIELTS({ enabled: false }) });
const mock = (id, date, source, math, readingWriting, overall = null) => ({ id, date, source, skills: { math, readingWriting }, overall, notes: '' });

test('diagnostic skill mapping matches the actual authored questions', () => {
  for (const [name, questions] of Object.entries(DIAGNOSTIC_QUESTIONS)) {
    for (const question of questions) assert.ok(DIAGNOSTIC_SKILL_IDS[name][question.skill].includes(question.id));
    assert.equal(Object.values(DIAGNOSTIC_SKILL_IDS[name]).flat().length, questions.length);
  }
});

test('informal mistakes guide unmeasured practice without creating score evidence', () => {
  let data = saveDiagnosticAttempt(fixture(), 'sat', { id: 'weak-reading', date: TODAY, answers: { 'sat-diag-evidence': 'A' }, checks: { 'sat-diag-evidence': 'review' } });
  assert.equal(getSATCandidates(data, TODAY)[0].satSkill, 'readingWriting');
  assert.equal(getJourneyPreparation(data, 'sat', TODAY).measured, null);
  data = saveDiagnosticAttempt(data, 'ielts', { id: 'weak-speaking', date: TODAY, answers: { 'ielts-diag-speaking': 'My answer needs structure.' }, checks: { 'ielts-diag-speaking': 'review' } });
  data.ielts = normalizeIELTS({ enabled: true, targetOverall: 7, weeklyMinutes: 120 });
  assert.equal(getIELTSCandidates(data, TODAY)[0].ieltsSkill, 'speaking');
  assert.equal(getJourneyPreparation(data, 'ielts', TODAY).measured, null);
  assert.deepEqual(getInformalPracticeNeeds(data, 'sat', '2026-10-01'), []);
});

test('unneeded SAT allocation does not reduce IELTS time for a UC-only shortlist', () => {
  let data = fixture();
  data.schedule.weekly = [{ day: 3, minutes: 60 }];
  data.ielts = normalizeIELTS({ enabled: true, targetOverall: 7, weeklyMinutes: 60 });
  data = saveUniversityGoal(data, createUniversityGoal('ucla', { id: 'uc-only' }));
  assert.equal(getPreparationContext(data, TODAY, 'ielts', 60).allowance, 60);
  data = saveJourneyPart(data, 'sat', { prepareAnyway: true });
  assert.equal(getPreparationContext(data, TODAY, 'ielts', 60).allowance, 20);
});

test('SAT original diagnostic covers both sections without producing a score', () => {
  assert.equal(DIAGNOSTIC_QUESTIONS.sat.length, 7);
  assert.deepEqual(new Set(DIAGNOSTIC_QUESTIONS.sat.map(item => item.skill)), new Set(['math', 'readingWriting']));
  for (const item of DIAGNOSTIC_QUESTIONS.sat) {
    assert.ok(item.prompt.length > 30 && item.solution.length && item.explanation.length > 30);
    assert.equal(checkDiagnosticAnswer('sat', item.id, item.accepted[0]).correct, true);
    assert.equal(checkDiagnosticAnswer('sat', item.id, 'not an answer').correct, false);
    assert.equal(checkDiagnosticAnswer('sat', item.id, item.accepted[0]).officialScore, null);
  }
});

test('numeric checking preserves decimal place values instead of collapsing 2.5 into 25', () => {
  assert.equal(checkDiagnosticAnswer('sat', 'sat-diag-data', '2.5').correct, false);
  assert.equal(checkDiagnosticAnswer('sat', 'sat-diag-data', '25 %').correct, true);
  assert.equal(checkDiagnosticAnswer('sat', 'sat-diag-algebra', 'x = 6.0').correct, true);
  assert.equal(checkDiagnosticAnswer('sat', 'sat-diag-evidence', 'B.').correct, true);
});

test('IELTS diagnostic uses all four skills and self-check criteria without fabricated bands', () => {
  assert.deepEqual(new Set(DIAGNOSTIC_QUESTIONS.ielts.map(item => item.skill)), new Set(['listening', 'reading', 'writing', 'speaking']));
  assert.equal(DIAGNOSTIC_QUESTIONS.ielts[0].requiresAudio, true);
  for (const item of DIAGNOSTIC_QUESTIONS.ielts) {
    const feedback = checkDiagnosticAnswer('ielts', item.id, 'my original answer');
    assert.equal(feedback.correct, null);
    assert.equal(feedback.officialScore, null);
    assert.ok(feedback.criteria.length > 0);
  }
});

test('completed informal diagnostic keeps actual SAT results unchanged and identifies review topics', () => {
  const source = fixture();
  const snapshot = JSON.stringify(source);
  const attempt = { id: 'attempt-one', date: TODAY, answers: Object.fromEntries(DIAGNOSTIC_QUESTIONS.sat.map(item => [item.id, item.accepted[0]])), checks: Object.fromEntries(DIAGNOSTIC_QUESTIONS.sat.map((item, index) => [item.id, index === 0 ? 'review' : 'correct'])), completed: true };
  const next = saveDiagnosticAttempt(source, 'sat', attempt);
  assert.equal(JSON.stringify(source), snapshot);
  assert.deepEqual(next.sat.scores, []);
  const summary = getDiagnosticSummary(next, 'sat');
  assert.equal(summary.completed, true);
  assert.deepEqual(summary.needsPractice, ['Algebra']);
  assert.equal(summary.officialScore, null);
  assert.equal(getJourneyPreparation(next, 'sat', TODAY).measured, null);
});

test('an asserted completed flag without actual checked answers cannot mark a diagnostic complete', () => {
  const data = saveDiagnosticAttempt(fixture(), 'sat', { id: 'empty', date: TODAY, answers: {}, checks: {}, completed: true });
  assert.equal(getDiagnosticSummary(data, 'sat').completed, false);
  assert.throws(() => saveDiagnosticAttempt(data, 'sat', { id: 'bad', date: '2026-02-30' }));
});

test('saved diagnostic answer updates retain one stable record and text', () => {
  let data = saveDiagnosticAttempt(fixture(), 'sat', { id: 'one', date: TODAY, answers: { 'sat-diag-algebra': '6\nmy reasoning' }, checks: {}, completed: false });
  data = saveDiagnosticAttempt(data, 'sat', { ...data.testJourney.sat.diagnostics[0], checks: { 'sat-diag-algebra': 'correct' } });
  assert.equal(data.testJourney.sat.diagnostics.length, 1);
  assert.equal(data.testJourney.sat.diagnostics[0].answers['sat-diag-algebra'], '6\nmy reasoning');
});

test('preparation prioritizes actual official results over self estimates and informal diagnostics', () => {
  const data = fixture();
  data.sat = normalizeSAT({ ...data.sat, estimates: { math: 800, readingWriting: 800 }, scores: [mock('official', '2026-10-01', 'official', 650, 600), mock('self', TODAY, 'self', 800, 800), mock('mock', '2026-10-20', 'mock', 700, 700)] });
  const result = getJourneyPreparation(data, 'sat', TODAY);
  assert.equal(result.baseline.source, 'official');
  assert.equal(result.measured, 1250);
  assert.equal(result.gap, 150);
  assert.equal(result.hours, null);
  assert.equal(result.weeks, null);
  assert.equal(result.scorePromise, false);
});

test('a reported actual overall is usable while unknown component scores remain unknown', () => {
  const data = fixture();
  data.sat.scores = [mock('reported', '2026-10-01', 'mock', null, null, 1300)];
  const result = getJourneyPreparation(data, 'sat', TODAY);
  assert.equal(result.measured, 1300);
  assert.equal(result.gap, 100);
  assert.equal(result.baseline.skills.math, null);
});

test('contradictory total and section scores keep the target gap unknown', () => {
  const data = fixture();
  data.sat.scores = [mock('reported', '2026-10-01', 'mock', 600, 600, 1400)];
  const result = getJourneyPreparation(data, 'sat', TODAY);
  assert.equal(result.conflictingResult, true);
  assert.equal(result.measured, null);
  assert.equal(result.gap, null);
});

test('explicit hour scenarios calculate weeks and a date warning without promising a score', () => {
  let data = fixture();
  data.sat.examDate = '2026-11-11';
  data = saveJourneyPart(data, 'sat', { hours: { min: 10, max: 20 } });
  const result = getJourneyPreparation(data, 'sat', TODAY);
  assert.deepEqual(result.weeks, { min: 5, max: 10 });
  assert.match(result.deadlineAssessment, /nicht bis zum Termin/);
  assert.equal(result.scorePromise, false);
  assert.equal(result.measured, null);
});

test('school exams cap current daily test preparation and a zero allowance never creates infinite weeks', () => {
  let data = fixture();
  data.exams.push({ id: 'physics', date: '2026-10-29', title: 'Physik LK' });
  assert.ok(getJourneyPreparation(data, 'sat', TODAY).dailyMinutes <= 15);
  data = saveJourneyPart(data, 'sat', { hours: { min: 10, max: 20 } });
  data.sat.weeklyMinutes = 0;
  const result = getJourneyPreparation(data, 'sat', TODAY);
  assert.equal(result.weeks, null);
  assert.equal(result.dailyMinutes, 0);
});

test('only user-entered provider dates are ranked and school conflicts outweigh an earlier date', () => {
  let data = fixture();
  assert.deepEqual(rankCandidateTestDates(data, 'sat', TODAY), []);
  data.exams.push({ id: 'physics', date: '2026-12-07', title: 'Physik LK' });
  data = saveJourneyPart(data, 'sat', { candidateDates: [
    { id: 'close', date: '2026-12-06', deadline: '2026-11-20', sourceUrl: 'https://satsuite.collegeboard.org/sat/dates-deadlines', verifiedAt: TODAY, status: 'confirmed' },
    { id: 'later', date: '2027-03-01', deadline: '2027-02-01', sourceUrl: 'https://satsuite.collegeboard.org/sat/dates-deadlines', verifiedAt: TODAY, status: 'confirmed' },
    { id: 'expired', date: '2026-11-01', deadline: '2026-10-20', sourceUrl: '', verifiedAt: '', status: 'provisional' },
  ] });
  const ranked = rankCandidateTestDates(data, 'sat', TODAY);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].id, 'later');
  assert.equal(ranked[1].schoolConflicts[0].id, 'physics');
});

test('unofficial date links cannot become confirmed provider dates', () => {
  const data = normalizeTestJourney({ sat: { candidateDates: [{ id: 'fake', date: '2027-03-01', sourceUrl: 'https://example.org/fake', verifiedAt: TODAY, status: 'confirmed' }] } });
  assert.equal(data.sat.candidateDates[0].status, 'provisional');
});

test('explicit SAT override and journey notes normalize without enabling a test or changing targets', () => {
  let data = fixture();
  data.sat.enabled = false;
  data = saveJourneyPart(data, 'sat', { prepareAnyway: true, registration: { checkedDate: TODAY, notes: 'Mein eigener Bewerbungsgrund' } });
  assert.equal(data.testJourney.sat.prepareAnyway, true);
  assert.equal(data.sat.enabled, false);
  assert.equal(data.sat.targetTotal, 1400);
  assert.deepEqual(normalizeTestJourney(data.testJourney), data.testJourney);
});
