import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalProfile, saveExam, saveSubject, addGrade, shiftDate, saveSchedule } from './coach.js';
import { getRecommendations, getSubjectPriorities } from './recommendations.js';
const TODAY = '2026-10-19';
const personal = () => createPersonalProfile({ today: TODAY });

test('unknown current grades stay unknown while the stated German weakness receives attention', () => {
  const state = personal();
  const highest = getSubjectPriorities(state, TODAY)[0];
  assert.equal(highest.subjectId, 'german');
  assert.equal(highest.current, null);
  assert.match(highest.reason, /aktuelle Note fehlt/);
  assert.ok(state.subjects.every(subject => subject.written === null && subject.oral === null));
});
test('an approaching LK examination temporarily outranks the general German focus', () => {
  let state = saveSubject(personal(), { id: 'german', written: 5, target: 10 });
  state = saveExam(state, { id: 'physics', title: 'Physik Klausur', subjectId: 'physics', date: shiftDate(TODAY, 1), topics: ['RC-Kreis'] });
  const top = getSubjectPriorities(state, TODAY)[0];
  assert.equal(top.subjectId, 'physics');
  assert.match(top.reason, /LK.*morgen/);
});
test('new assessment evidence changes the subject gap and recommendations immediately', () => {
  let state = saveSubject(personal(), { id: 'mathematics', target: 10 });
  const before = getSubjectPriorities(state, TODAY).find(subject => subject.subjectId === 'mathematics');
  state = addGrade(state, { subjectId: 'mathematics', points: 3, type: 'written', date: TODAY, semester: 'Q1' });
  const after = getSubjectPriorities(state, TODAY).find(subject => subject.subjectId === 'mathematics');
  assert.equal(after.current, 3);
  assert.equal(after.gap, 7);
  assert.ok(after.score > before.score);
  assert.equal(getRecommendations(state, TODAY)[0].subjectId, 'mathematics');
});
test('manual priorities change ranking without hiding an exam tomorrow', () => {
  let state = saveSubject(personal(), { id: 'english', priority: 'high' });
  assert.equal(getSubjectPriorities(state, TODAY)[0].subjectId, 'english');
  state = saveSubject(state, { id: 'physics', priority: 'low' });
  state = saveExam(state, { id: 'exam', subjectId: 'physics', title: 'Physik', date: shiftDate(TODAY, 1) });
  assert.equal(getSubjectPriorities(state, TODAY)[0].subjectId, 'physics');
});
test('practice recommendations respect a fully blocked study window', () => {
  let state = personal();
  state = saveSchedule(state, { weekly: state.schedule.weekly.map(day => ({ ...day, windowStart: '16:00', windowEnd: '17:00', minutes: 60 })), fixedActivities: [{ id: 'work', title: 'Arbeit', date: TODAY, start: '16:00', end: '17:00', days: [] }] });
  assert.ok(getSubjectPriorities(state, TODAY).every(subject => subject.minutes === 0));
  assert.equal(getRecommendations(state, TODAY)[0].type, 'recovery');
});
test('weak grades alone never trigger unsupported tutoring advice', () => {
  let state = personal();
  state = addGrade(state, { subjectId: 'german', points: 2, type: 'written', date: TODAY });
  const recommendations = getRecommendations(state, TODAY);
  assert.equal(recommendations.some(item => item.type === 'feedback'), false);
  assert.ok(recommendations.every(item => item.why && item.how && item.benefit && Number.isFinite(item.minutes)));
});
test('a documented project does not receive the missing project evidence recommendation', () => {
  const state = personal();
  state.activities = [{ id: 'code', name: 'Coding project', type: 'Project', responsibilities: 'Developed the interface', projectUrl: 'https://github.com/example/project', evidence: [] }];
  assert.equal(getRecommendations(state, TODAY).some(item => item.type === 'profile'), false);
});
test('an assignment approaching in a subject increases its priority', () => {
  const state = personal();
  const before = getSubjectPriorities(state, TODAY).find(item => item.subjectId === 'history');
  state.events = [{ id: 'deadline', title: 'Geschichte abgeben', subjectId: 'history', date: shiftDate(TODAY, 2) }];
  const after = getSubjectPriorities(state, TODAY).find(item => item.subjectId === 'history');
  assert.ok(after.score > before.score);
});
test('IELTS recommendations use declared scores and describe a concrete practice method', () => {
  const state = personal();
  state.ielts = { enabled: true, targetOverall: 7, targets: { writing: 7 }, estimates: { writing: 5 }, weeklyMinutes: 90 };
  const recommendation = getRecommendations(state, TODAY).find(item => item.type === 'ielts');
  assert.ok(recommendation);
  assert.match(recommendation.why, /selbst eingeschätzt/);
  assert.ok(recommendation.how && recommendation.benefit);
  assert.ok(recommendation.minutes <= 90);
});
