import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStudyState, discardStudy, finishStudy, getStudyStats, getStudyTimer,
  normalizeStudy, pauseStudy, removeStudySession, resumeStudy, startStudy,
} from './study.js';

const TASK = { id: 'math', title: 'Review derivatives', subjectId: 'mathematics', category: 'academics', minutes: 10, completed: false };
const START = '2026-10-08T14:00:00.000Z';
const at = seconds => new Date(new Date(START).getTime() + seconds * 1000);
const initial = () => ({ tasks: [{ ...TASK }], study: createStudyState() });

test('a focus session snapshots the task and derives elapsed time from the clock', () => {
  const original = initial();
  const state = startStudy(original, TASK, START);
  assert.equal(original.study.active, null);
  assert.equal(state.study.active.taskId, TASK.id);
  assert.equal(state.study.active.taskTitle, TASK.title);
  assert.equal(state.study.active.subjectId, TASK.subjectId);
  assert.equal(state.study.active.targetSeconds, 600);
  assert.deepEqual(state.study.active.intervals, []);
  const timer = getStudyTimer(state, at(90));
  assert.equal(timer.elapsedSeconds, 90);
  assert.equal(timer.remainingSeconds, 510);
  assert.equal(timer.running, true);
  assert.equal(timer.finished, false);
  assert.equal(timer.active, state.study.active, 'Rendering never rewrites the snapshot');
  assert.equal(getStudyStats(state).seconds, 0, 'Live time is not counted as saved measured time');
});

test('pause survives normalization and reload, resumed intervals exclude time spent paused', () => {
  let state = pauseStudy(startStudy(initial(), TASK, START), at(90));
  assert.equal(state.study.active.runningSince, null);
  assert.deepEqual(state.study.active.intervals, [{ start: START, end: at(90).toISOString() }]);
  const encoded = JSON.stringify(state.study);
  state = { ...state, study: normalizeStudy(JSON.parse(encoded), at(2000)) };
  assert.equal(getStudyTimer(state, at(2000)).elapsedSeconds, 90);
  state = resumeStudy(state, at(2000));
  assert.equal(getStudyTimer(state, at(2010)).elapsedSeconds, 100);
  state = finishStudy(state, at(2010));
  assert.equal(state.study.active, null);
  assert.equal(state.study.sessions[0].seconds, 100);
  assert.equal(state.study.sessions[0].intervals.length, 2);
  assert.equal(state.tasks[0].completed, false, 'Saving focus time never claims the exercise is complete');
});

test('running reloads and background time cap at the configured target and save only once', () => {
  let state = startStudy(initial(), TASK, START);
  state = { ...state, study: normalizeStudy(JSON.parse(JSON.stringify(state.study)), at(120)) };
  assert.equal(getStudyTimer(state, at(120)).elapsedSeconds, 120);
  const completedTimer = getStudyTimer(state, at(86400));
  assert.equal(completedTimer.elapsedSeconds, 600);
  assert.equal(completedTimer.remainingSeconds, 0);
  assert.equal(completedTimer.finished, true);
  state = finishStudy(state, at(86400));
  assert.equal(state.study.sessions.length, 1);
  assert.equal(state.study.sessions[0].seconds, 600);
  assert.equal(state.study.sessions[0].intervals[0].end, at(600).toISOString());
  assert.equal(finishStudy(state, at(90000)), state);
  assert.equal(getStudyStats(state).seconds, 600);
});

test('only one focus session can run, duplicate starts are safe, and discard removes no saved history', () => {
  let state = startStudy(initial(), TASK, START);
  assert.equal(startStudy(state, TASK, at(5)), state);
  assert.throws(() => startStudy(state, { ...TASK, id: 'english' }, at(5)), /current focus session/);
  state = finishStudy(state, at(60));
  state = startStudy(state, TASK, at(100));
  const discarded = discardStudy(state);
  assert.equal(discarded.study.active, null);
  assert.deepEqual(discarded.study.sessions, state.study.sessions);
  assert.equal(discardStudy(discarded), discarded);
});

test('duration overrides stay inside five to 180 minutes and reject missing tasks or bad clocks', () => {
  assert.equal(startStudy(initial(), { ...TASK, minutes: 2 }, START).study.active.targetSeconds, 300);
  assert.equal(startStudy(initial(), TASK, START, 250).study.active.targetSeconds, 10800);
  assert.equal(startStudy(initial(), TASK, START, 25).study.active.targetSeconds, 1500);
  assert.throws(() => startStudy(initial(), TASK, START, 0), /duration/);
  assert.throws(() => startStudy(initial(), null, START), /valid task/);
  assert.throws(() => startStudy(initial(), TASK, 'invalid date'), /timestamp/);
  assert.throws(() => getStudyTimer(initial(), new Date(NaN)), /timestamp/);
});

test('pausing and resuming a completed session cannot extend its target', () => {
  let state = pauseStudy(startStudy(initial(), TASK, START), at(900));
  assert.equal(getStudyTimer(state, at(900)).finished, true);
  assert.equal(resumeStudy(state, at(1000)), state);
  assert.equal(pauseStudy(state, at(1000)), state);
  state = finishStudy(state, at(1000));
  assert.equal(state.study.sessions[0].seconds, 600);
});

test('fractional intervals aggregate before whole saved seconds are counted', () => {
  let state = pauseStudy(startStudy(initial(), TASK, START), at(0.6));
  state = resumeStudy(state, at(2));
  state = finishStudy(state, at(2.7));
  assert.equal(state.study.sessions[0].seconds, 1);
  const duration = state.study.sessions[0].intervals.reduce((sum, interval) => sum + (new Date(interval.end) - new Date(interval.start)), 0);
  assert.equal(duration, 1000);
  assert.equal(getStudyStats(state).seconds, 1);
  assert.deepEqual(normalizeStudy(state.study, at(3)), state.study);
});

test('saving less than a whole second clears the timer without inventing a log', () => {
  const state = finishStudy(startStudy(initial(), TASK, START), at(0.7));
  assert.equal(state.study.active, null);
  assert.deepEqual(state.study.sessions, []);
});

test('local midnight divides a saved session across days and requested date ranges', () => {
  const started = '2026-10-08T23:58:00+02:00';
  let state = startStudy(initial(), TASK, started, 5);
  state = { ...state, study: { ...state.study, active: { ...state.study.active, timeZone: 'Europe/Berlin' } } };
  state = finishStudy(state, '2026-10-09T00:03:00+02:00');
  const all = getStudyStats(state);
  assert.deepEqual(all.byDay, { '2026-10-08': 120, '2026-10-09': 180 });
  assert.equal(all.seconds, 300);
  assert.deepEqual(all.bySubject, { mathematics: 300 });
  assert.equal(all.sessions, 1);
  assert.equal(getStudyStats(state, '2026-10-08', '2026-10-08').seconds, 120);
  assert.equal(getStudyStats(state, '2026-10-09', '2026-10-09').seconds, 180);
  assert.deepEqual(all.sessionIds, [state.study.sessions[0].id]);
});

test('fall and spring daylight-saving transitions measure real time in the recorded local day', () => {
  for (const [start, end, day] of [
    ['2026-10-25T02:55:00+02:00', '2026-10-25T02:05:00+01:00', '2026-10-25'],
    ['2026-03-29T01:55:00+01:00', '2026-03-29T03:05:00+02:00', '2026-03-29'],
  ]) {
    let state = startStudy(initial(), TASK, start);
    state = { ...state, study: { ...state.study, active: { ...state.study.active, timeZone: 'Europe/Berlin' } } };
    state = finishStudy(state, end);
    assert.equal(state.study.sessions[0].seconds, 600);
    assert.deepEqual(getStudyStats(state).byDay, { [day]: 600 });
  }
});

test('sessions crossing Sunday into Monday contribute only their actual seconds to each week', () => {
  let state = startStudy(initial(), TASK, '2026-10-11T23:59:00+02:00', 5);
  state = { ...state, study: { ...state.study, active: { ...state.study.active, timeZone: 'Europe/Berlin' } } };
  state = finishStudy(state, '2026-10-12T00:04:00+02:00');
  assert.equal(getStudyStats(state, '2026-10-05', '2026-10-11').seconds, 60);
  assert.equal(getStudyStats(state, '2026-10-12', '2026-10-18').seconds, 240);
});

test('deleting an accidental saved session recalculates totals and leaves an active timer intact', () => {
  let state = finishStudy(startStudy(initial(), TASK, START), at(60));
  const id = state.study.sessions[0].id;
  state = startStudy(state, TASK, at(100));
  const removed = removeStudySession(state, id);
  assert.equal(removed.study.active, state.study.active);
  assert.equal(getStudyStats(removed).seconds, 0);
  assert.equal(state.study.sessions.length, 1);
  assert.equal(removeStudySession(removed, id), removed);
});

test('invalid normalization cannot fabricate measured time, and old empty study data stays empty', () => {
  assert.deepEqual(normalizeStudy(undefined, START), createStudyState());
  const active = startStudy(initial(), TASK, START).study.active;
  assert.equal(normalizeStudy({ active: { ...active, targetSeconds: -1 }, sessions: [] }, START).active, null);
  assert.equal(normalizeStudy({ active: { ...active, intervals: [{ start: START, end: at(-1).toISOString() }] }, sessions: [] }, START).active, null);
  assert.deepEqual(normalizeStudy({ active: null, sessions: [{ ...active, endedAt: at(10).toISOString(), seconds: 50 }] }, START), createStudyState());
});

test('clock rollback never creates negative focus time or overlapping resumed intervals', () => {
  let state = startStudy(initial(), TASK, START);
  assert.equal(getStudyTimer(state, at(-20)).elapsedSeconds, 0);
  state = pauseStudy(state, at(60));
  state = resumeStudy(state, at(30));
  assert.equal(state.study.active.runningSince, at(60).toISOString());
  state = finishStudy(state, at(90));
  assert.equal(state.study.sessions[0].seconds, 90);
});
