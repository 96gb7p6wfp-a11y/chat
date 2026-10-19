import test from 'node:test';
import assert from 'node:assert/strict';
import { band, calculateIELTSOverall, getIELTSSummary, getIELTSCandidates, getIELTSPractice, normalizeIELTS } from './ielts.js';

const TODAY = '2026-10-19';
const all = value => ({ listening: value, reading: value, writing: value, speaking: value });
const result = (date, skills, source = 'mock', id = date) => ({ id, date, source, skills, overall: null, notes: '' });

test('IELTS overall uses four skills and official nearest-half rounding', () => {
  assert.equal(calculateIELTSOverall({ listening: 6, reading: 6, writing: 6, speaking: 7 }), 6.5);
  assert.equal(calculateIELTSOverall({ listening: 6, reading: 7, writing: 7, speaking: 7 }), 7);
  assert.equal(calculateIELTSOverall({ listening: 6, reading: 6, writing: 6, speaking: 6.5 }), 6);
  assert.equal(calculateIELTSOverall({ listening: 0, reading: 0, writing: 0, speaking: 0 }), 0);
  assert.equal(calculateIELTSOverall({ listening: 9, reading: 9, writing: 9, speaking: 9 }), 9);
  assert.equal(calculateIELTSOverall({ listening: 6, reading: 6, writing: 6 }), null);
});

test('unknown bands remain unknown and invalid score increments are not invented', () => {
  for (const value of [undefined, null, '', '  ', [], {}, true, false, 'unknown', 9.5, -.5, 6.25, NaN]) assert.equal(band(value), null);
  assert.equal(band('7.5'), 7.5);
  const normal = normalizeIELTS({ examDate: '2026-02-30', targetOverall: 6.25, estimates: { writing: '6.5' } });
  assert.equal(normal.examDate, '');
  assert.equal(normal.targetOverall, null);
  assert.equal(normal.estimates.writing, 6.5);
  assert.equal(normal.estimates.reading, null);
  assert.equal(getIELTSSummary({}, TODAY).overall, null);
  assert.deepEqual(getIELTSCandidates({}, TODAY), []);
});

test('malformed records cannot turn into official evidence and score normalization is stable', () => {
  const state = normalizeIELTS({ scores: [null, false, { date: TODAY, source: 'ai', skills: all(9) }, result('2026-02-30', all(8)), result(TODAY, all(7)), result(TODAY, all(9)), { id: 'only-overall', date: TODAY, source: 'official', overall: 7.5 }] });
  assert.equal(state.scores.length, 2);
  assert.equal(state.scores[0].skills.listening, 7);
  assert.deepEqual(normalizeIELTS(state), state);
  for (const value of [null, 3, [], 'broken']) assert.doesNotThrow(() => normalizeIELTS(value));
});

test('mock results, self estimates and reported overall stay distinguishable', () => {
  const summary = getIELTSSummary({ ielts: { targetOverall: 7, estimates: all(8), scores: [result('2026-10-18', all(9), 'self'), { id: 'official-only', date: '2026-10-15', source: 'official', overall: 7, skills: {} }] } }, TODAY);
  assert.equal(summary.overall, null);
  assert.equal(summary.reportedOverall.overall, 7);
  assert.equal(summary.skills[0].source, 'self');
  assert.equal(summary.targetMet, false);
  assert.match(summary.readiness, /keine vollständige/);
});

test('actual earlier evidence is not replaced by a later optimistic self-rating', () => {
  const summary = getIELTSSummary({ ielts: { targetOverall: 7, scores: [result('2026-10-01', all(6)), result('2026-10-15', all(8), 'self')] } }, TODAY);
  assert.equal(summary.skills[0].current, 6);
  assert.equal(summary.skills[0].source, 'mock');
  assert.equal(summary.overall, 6);
  assert.equal(summary.targetMet, false);
});

test('weakness and trends reflect entered results and exclude future test claims', () => {
  const state = { ielts: { targetOverall: 7, scores: [result('2026-10-01', all(6)), result('2026-10-18', { ...all(7), writing: 5.5 }), result('2026-10-25', all(9), 'official')] } };
  const summary = getIELTSSummary(state, TODAY);
  assert.equal(summary.weakest.skill, 'writing');
  assert.equal(summary.weakest.gap, 1.5);
  assert.equal(summary.weakest.trend, -.5);
  assert.equal(summary.skills[0].trend, 1);
  assert.equal(summary.scores.length, 2);
  const candidates = getIELTSCandidates(state, TODAY);
  assert.equal(candidates[0].ieltsSkill, 'writing');
  assert.ok(candidates[0].score > candidates.find(candidate => candidate.ieltsSkill === 'listening').score);
});

test('goal comparison uses all four bands from one complete record', () => {
  const state = { ielts: { targetOverall: 7, targets: { writing: 7 }, scores: [result('2026-10-18', { listening: 8, reading: 8, writing: 6.5, speaking: 8 })] } };
  assert.equal(getIELTSSummary(state, TODAY).targetMet, false);
  state.ielts.scores[0].skills.writing = 7;
  assert.equal(getIELTSSummary(state, TODAY).targetMet, true);
  assert.match(getIELTSSummary(state, TODAY).readiness, /neue Leistung/);
});

test('completed tasks never generate score evidence or proficiency claims', () => {
  const state = { ielts: { targetOverall: 8 }, tasks: Array.from({ length: 20 }, (_, index) => ({ id: String(index), date: TODAY, completed: true, minutes: 30, ieltsSkill: 'writing' })) };
  const summary = getIELTSSummary(state, TODAY);
  assert.equal(summary.overall, null);
  assert.equal(summary.targetMet, false);
  assert.equal(summary.skills.every(skill => skill.current === null), true);
  assert.deepEqual(getIELTSCandidates(state, TODAY), []);
});

test('preparation respects weekly allowance and reduces work immediately before exam', () => {
  const state = { ielts: { targetOverall: 7, examDate: '2026-10-20', weeklyMinutes: 60 }, tasks: [{ date: TODAY, completed: true, minutes: 50, ieltsSkill: 'reading' }, { date: '2026-10-18', completed: true, minutes: 90, ieltsSkill: 'writing' }] };
  const candidates = getIELTSCandidates(state, TODAY);
  assert.equal(candidates.length, 4);
  assert.equal(candidates[0].minutes, 10);
  assert.match(candidates[0].title, /ruhig wiederholen/);
  assert.match(candidates[0].steps[1].instruction, /keinen vollständigen/);
  state.ielts.weeklyMinutes = 50;
  assert.deepEqual(getIELTSCandidates(state, TODAY), []);
  state.ielts.weeklyMinutes = 90;
  state.ielts.examDate = '2026-10-18';
  assert.deepEqual(getIELTSCandidates(state, TODAY), []);
  state.ielts.examDate = '';
  state.ielts.enabled = false;
  assert.deepEqual(getIELTSCandidates(state, TODAY), []);
});

test('pending IELTS plan does not invalidate itself and tasks give actionable practice', () => {
  const state = { ielts: { targetOverall: 7, weeklyMinutes: 30 }, tasks: [{ date: TODAY, completed: false, minutes: 30, ieltsSkill: 'reading' }] };
  assert.equal(getIELTSCandidates(state, TODAY).length, 4);
  for (const skill of ['listening', 'reading', 'writing', 'speaking']) {
    const practice = getIELTSPractice(skill, { minutes: 30 });
    assert.equal(practice.steps.reduce((sum, step) => sum + step.minutes, 0), 30);
    assert.ok(practice.expectedResult);
    assert.equal(new URL(practice.resource.url).hostname, 'ielts.org');
    assert.match(practice.assessmentNote, /kein Nachweis/);
  }
  const writing = getIELTSPractice('writing', { minutes: 45, days: 15 });
  assert.deepEqual(writing.steps.map(step => step.minutes), [3, 37, 4, 1]);
  assert.match(writing.steps[1].instruction, /250/);
});

test('recent practice balances skills instead of repeating Listening every day', () => {
  const state = { ielts: { targetOverall: 7, weeklyMinutes: 180 }, tasks: [{ date: '2026-10-18', completed: true, minutes: 30, ieltsSkill: 'listening' }] };
  assert.equal(getIELTSCandidates(state, TODAY)[0].ieltsSkill, 'reading');
  state.tasks.push({ date: '2026-10-18', completed: true, minutes: 30, ieltsSkill: 'reading' });
  assert.equal(getIELTSCandidates(state, TODAY)[0].ieltsSkill, 'writing');
  state.ielts.scores = [result('2026-10-18', { ...all(7), speaking: 5 })];
  assert.equal(getIELTSCandidates(state, TODAY)[0].ieltsSkill, 'speaking');
});
