import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSATTotal, getSATCandidates, getSATPractice, getSATSummary, normalizeSAT, satScore } from './sat.js';
import { getPreparationContext, getPreparationHorizon } from './test-preparation.js';
import { getIELTSCandidates, normalizeIELTS } from './ielts.js';
import { getGuidedSession } from './guided-learning.js';

const today = '2026-10-19';
const both = value => ({ readingWriting: value, math: value });
const score = (date, skills, source = 'mock', id = date) => ({ id, date, source, skills });
const state = extra => ({ sat: { enabled: true, targetTotal: 1400, targets: both(700), weeklyMinutes: 150 }, tasks: [], ...extra });

test('SAT score boundaries and total require known measured sections', () => {
  for (const value of [undefined, null, '', ' ', [], {}, true, false, NaN, 190, 810, 605]) assert.equal(satScore(value), null);
  assert.equal(satScore('650'), 650); assert.equal(satScore(400, true), 400); assert.equal(satScore(1600, true), 1600); assert.equal(satScore(800), 800);
  assert.equal(calculateSATTotal({ readingWriting: 650, math: 700 }), 1350);
  assert.equal(calculateSATTotal({ math: 700 }), null);
  assert.equal(normalizeSAT().enabled, false); assert.deepEqual(getSATCandidates({}, today), []);
});

test('SAT normalization preserves evidence, deduplicates IDs and rejects ungrounded records', () => {
  const normal = normalizeSAT({ enabled: true, dateStatus: 'booked', examDate: '2026-02-30', targetTotal: 1455, scores: [score(today, both(650)), score(today, both(800)), score('2026-10-18', both(750), 'ai'), score('2026-02-30', both(700)), { id: 'overall', date: today, source: 'official', overall: 1450 }] });
  assert.equal(normal.examDate, ''); assert.equal(normal.targetTotal, null); assert.equal(normal.dateStatus, 'booked'); assert.equal(normal.scores.length, 2);
  assert.equal(normal.scores[0].skills.math, 650); assert.deepEqual(normalizeSAT(normal), normal);
  assert.equal(getSATSummary({ sat: normal }, today).overall, 1300);
  for (const value of [null, [], 2, 'broken']) assert.doesNotThrow(() => normalizeSAT(value));
});

test('SAT estimates, future claims and reported totals never become complete evidence', () => {
  const summary = getSATSummary(state({ sat: { estimates: both(750), targetTotal: 1400, scores: [{ id: 'total-only', date: today, source: 'official', overall: 1450 }, score('2026-10-20', both(800), 'official')] } }), today);
  assert.equal(summary.overall, null); assert.equal(summary.reportedOverall.overall, 1450); assert.equal(summary.targetMet, false);
  assert.equal(summary.sections[0].source, 'estimate'); assert.equal(summary.scores.length, 1);
  assert.match(summary.readiness, /kein vollständiger/);
});

test('SAT priorities respond to actual weaknesses and distinguish self ratings', () => {
  const data = state({ sat: { enabled: true, targetTotal: 1400, targets: both(700), scores: [score('2026-10-01', both(620)), score('2026-10-18', { readingWriting: 590, math: 730 }), score(today, both(800), 'self')] } });
  const summary = getSATSummary(data, today);
  assert.equal(summary.weakest.skill, 'readingWriting'); assert.equal(summary.weakest.current, 590); assert.equal(summary.weakest.trend, -30);
  assert.equal(summary.sections[1].trend, 110); assert.equal(summary.targetMet, false);
  assert.equal(getSATCandidates(data, today)[0].satSkill, 'readingWriting');
  data.sat.scores.push(score(today, both(720), 'official', 'official-new'));
  assert.equal(getSATSummary(data, today).targetMet, true);
});

test('SAT total target does not silently become equal section targets', () => {
  const summary = getSATSummary(state(), today);
  assert.equal(summary.sections[0].target, 700);
  const onlyTotal = getSATSummary({ sat: { targetTotal: 1400 } }, today);
  assert.ok(onlyTotal.sections.every(section => section.target === null && section.gap === null));
});

test('shared preparation allowance cannot exceed the entered whole-week study budget', () => {
  const data = state({ sat: { enabled: true, targetTotal: 1400, weeklyMinutes: 300 }, ielts: { enabled: true, targetOverall: 7, weeklyMinutes: 300 }, schedule: { weekly: [{ day: 1, minutes: 120 }] } });
  const sat = getPreparationContext(data, today, 'sat', 300), ielts = getPreparationContext(data, today, 'ielts', 300);
  assert.equal(sat.allowance, 60); assert.equal(ielts.allowance, 60); assert.ok(sat.allowance + ielts.allowance <= 120);
  data.tasks = [{ date: today, completed: true, minutes: 55, satSkill: 'math' }];
  assert.equal(getPreparationContext(data, today, 'sat', 300).remaining, 5);
  assert.deepEqual(getSATCandidates(data, today), []);
});

test('school examinations shorten both SAT and IELTS while a changed test date updates countdown', () => {
  const data = state({ ielts: { targetOverall: 7, weeklyMinutes: 90 }, exams: [{ date: '2026-10-20', subjectId: 'physics' }] });
  assert.ok(getSATCandidates(data, today).every(candidate => candidate.minutes <= 15));
  assert.ok(getIELTSCandidates(data, today).every(candidate => candidate.minutes <= 15));
  data.exams[0].date = '2026-10-26';
  assert.ok(getSATCandidates(data, today).every(candidate => candidate.minutes <= 25));
  data.sat.examDate = '2026-11-20';
  assert.equal(getSATSummary(data, today).daysUntil, 32);
  data.sat.examDate = '2026-12-20';
  assert.equal(getSATSummary(data, today).daysUntil, 62);
});

test('SAT preparation respects completion budget, last-day recovery, and pause', () => {
  const data = state({ sat: { enabled: true, targetTotal: 1400, examDate: '2026-10-20', weeklyMinutes: 60 }, tasks: [{ date: today, completed: true, minutes: 50, satSkill: 'math' }] });
  const candidates = getSATCandidates(data, today);
  assert.equal(candidates[0].minutes, 10); assert.match(candidates[0].title, /bekannte Fehler/);
  assert.match(candidates[0].steps[1].instruction, /keinen neuen vollständigen/);
  data.sat.weeklyMinutes = 50; assert.deepEqual(getSATCandidates(data, today), []);
  data.sat.weeklyMinutes = 90; data.sat.examDate = '2026-10-18'; assert.deepEqual(getSATCandidates(data, today), []);
  data.sat.examDate = ''; data.sat.enabled = false; assert.deepEqual(getSATCandidates(data, today), []);
});

test('complete Bluebook simulations require sufficient budget and avoid school exam weeks', () => {
  const data = state({ schedule: { weekly: [{ day: 1, minutes: 180 }] } });
  const simulation = getSATCandidates(data, today).find(candidate => candidate.satSkill === 'full');
  assert.equal(simulation.minutes, 144); assert.equal(simulation.steps.reduce((sum, step) => sum + step.minutes, 0), 144);
  data.exams = [{ date: '2026-10-26' }]; assert.equal(getSATCandidates(data, today).some(candidate => candidate.satSkill === 'full'), false);
  data.exams = []; data.sat.scores = [score('2026-10-18', both(650))]; assert.equal(getSATCandidates(data, today).some(candidate => candidate.satSkill === 'full'), false);
  data.sat.scores = []; data.schedule.weekly[0].minutes = 90; assert.equal(getSATCandidates(data, today).some(candidate => candidate.satSkill === 'full'), false);
});

test('practice instructions and guided sessions honor short budgets and avoid fake scores', () => {
  for (const skill of ['readingWriting', 'math']) for (const minutes of [5, 10, 25, 45]) {
    const practice = getSATPractice(skill, { minutes });
    assert.equal(practice.steps.reduce((sum, step) => sum + step.minutes, 0), minutes);
    const session = getGuidedSession({ sat: {} }, { satSkill: skill, title: 'SAT Übung', minutes, date: today, category: 'language' }, today);
    assert.equal(session.subject, 'SAT'); assert.equal(session.phases.reduce((sum, phase) => sum + phase.minutes, 0), minutes);
    assert.ok(session.questions.length >= 1); assert.equal(session.score, undefined); assert.match(session.materialLabel, /Eigene Übungsfragen/);
    assert.ok(session.resources.every(resource => new URL(resource.url).hostname === 'satsuite.collegeboard.org'));
  }
  const full = getGuidedSession({}, { satSkill: 'full', minutes: 144, date: today }, today);
  assert.equal(full.questions.length, 0); assert.equal(full.phases.reduce((sum, phase) => sum + phase.minutes, 0), 144);
});

test('suggested periods remain conditional and avoid nearby known school examinations', () => {
  const horizon = getPreparationHorizon({ exams: [{ date: '2026-12-17' }] }, today);
  assert.match(horizon.headline, /Erst Diagnose/); assert.match(horizon.explanation, /nicht seriös bestimmen/);
  assert.equal(horizon.window.start, '2026-12-31'); assert.match(horizon.note, /keine bestätigten/);
  assert.equal(normalizeIELTS({ examDate: '2026-12-01' }).dateStatus, 'planned');
  assert.equal(normalizeIELTS({ examDate: '2026-12-01', dateStatus: 'booked' }).dateStatus, 'booked');
});

test('milestones update with the chosen test date without changing or booking that date', () => {
  const first = getSATSummary(state({ sat: { enabled: true, targetTotal: 1400, examDate: '2026-12-12', dateStatus: 'planned' } }), today);
  const changed = getSATSummary(state({ sat: { enabled: true, targetTotal: 1400, examDate: '2027-01-09', dateStatus: 'planned' } }), today);
  assert.equal(first.data.dateStatus, 'planned'); assert.equal(first.data.examDate, '2026-12-12');
  assert.ok(first.milestones.some(item => item.date === '2026-11-28'));
  assert.ok(changed.milestones.some(item => item.date === '2026-12-26'));
  assert.ok(changed.milestones.every(item => item.date < changed.data.examDate));
});
