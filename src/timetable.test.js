import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleForDate, lessonBlocks, lessonsForDate, normalizeLessons, timetableConflicts } from './timetable.js';

const lesson = (patch = {}) => ({ id: 'math', subjectId: 'mathematics', day: 1, start: '08:00', end: '09:30', cycle: 'all', ...patch });
const state = (lessons, cycleAnchor = '') => ({ subjects: [{ id: 'mathematics', name: 'Mathematik' }], schedule: { lessons, cycleAnchor } });

test('lesson normalization rejects malformed ranges and preserves optional room and teacher', () => {
  const valid = lesson({ room: ' B 104 ', teacher: ' Frau Müller ' });
  assert.deepEqual(normalizeLessons([valid, valid, lesson({ id: 'bad', start: '25:00' }), lesson({ id: 'reverse', end: '07:00' }), lesson({ id: 'empty', subjectId: '' })]), [{ ...valid, title: '', room: 'B 104', teacher: 'Frau Müller' }]);
});

test('A/B weeks use a known A-week across month, year and DST boundaries', () => {
  const data = state([], '2026-10-21');
  assert.equal(cycleForDate(data, '2026-10-19'), 'A');
  assert.equal(cycleForDate(data, '2026-10-25'), 'A');
  assert.equal(cycleForDate(data, '2026-10-26'), 'B');
  assert.equal(cycleForDate(data, '2026-10-12'), 'B');
  assert.equal(cycleForDate(data, '2027-01-04'), 'B');
});

test('unknown A/B anchor never invents a school week and cautiously reserves possible lessons', () => {
  const data = state([lesson(), lesson({ id: 'physics', cycle: 'A', start: '09:45', end: '11:15' })]);
  assert.equal(cycleForDate(data, '2026-10-19'), null);
  assert.deepEqual(lessonBlocks(data, '2026-10-19').map(item => item.id), ['math', 'physics']);
  assert.deepEqual(lessonsForDate(data, '2026-10-19').map(item => item.id), ['math']);
  assert.equal(lessonBlocks(data, '2026-10-19')[1].provisional, true);
  assert.equal(lessonBlocks(data, '2026-10-19')[0].title, 'Mathematik');
  assert.equal(lessonBlocks(data, '2026-10-19')[0].source, 'lesson');
});

test('lessons match weekday and alternating cycle without modifying saved records', () => {
  const data = state([lesson(), lesson({ id: 'A', cycle: 'A' }), lesson({ id: 'B', cycle: 'B' }), lesson({ id: 'tuesday', day: 2 })], '2026-10-19');
  const before = structuredClone(data);
  assert.deepEqual(lessonsForDate(data, '2026-10-19').map(item => item.id), ['math', 'A']);
  assert.deepEqual(lessonsForDate(data, '2026-10-26').map(item => item.id), ['math', 'B']);
  assert.deepEqual(lessonsForDate(data, '2026-02-30'), []);
  assert.deepEqual(data, before);
});

test('conflicts ignore adjacent times and opposite A/B cycles, including edits to the same lesson', () => {
  const lessons = [lesson({ cycle: 'A' }), lesson({ id: 'B', cycle: 'B' }), lesson({ id: 'next', start: '09:30', end: '10:15' })];
  assert.deepEqual(timetableConflicts(lessons), []);
  assert.equal(timetableConflicts(lessons, lesson({ id: 'new', start: '09:00', end: '10:00' })).length, 3);
  assert.equal(timetableConflicts(lessons, lesson({ cycle: 'A' })).length, 0);
  assert.deepEqual(timetableConflicts(lessons, lesson({ id: 'bad', start: '10:30', end: '10:00' })), []);
});

test('lesson busy blocks remove only their occupied intervals from realistic study windows', async () => {
  const { createPersonalProfile, getAvailability, getDailyPlan } = await import('./coach.js');
  const data = createPersonalProfile({ today: '2026-10-19' });
  data.schedule.weekly = data.schedule.weekly.map(day => day.day === 1 ? { ...day, minutes: 180, windowStart: '08:00', windowEnd: '18:00' } : day);
  data.schedule.fixedActivities = [];
  data.schedule.lessons = [lesson({ start: '08:00', end: '10:00' }), lesson({ id: 'later', start: '16:00', end: '17:00' })];
  assert.deepEqual(getAvailability(data, '2026-10-19').freeWindows, [{ start: '10:00', end: '16:00', minutes: 360 }, { start: '17:00', end: '18:00', minutes: 60 }]);
  const plan = getDailyPlan(data, '2026-10-19');
  assert.ok(plan.tasks.length > 0);
  assert.ok(plan.plannedMinutes <= 180);
  assert.ok(plan.tasks.every(task => task.sessions.every(session => data.schedule.lessons.every(block => session.end <= block.start || session.start >= block.end))));
});
