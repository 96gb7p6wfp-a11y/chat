import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalProfile, ensureDailyPlan, getAvailability, normalizeData, shiftDate, editTask, moveTask } from './coach.js';
import { normalizeSAT, getSATCandidates } from './sat.js';
import { normalizeIELTS } from './ielts.js';
import { getUpcomingEvents, getEventCandidates } from './events.js';
import { applyExamImport, applyTimetableImport } from './school-import.js';
import { parseBackup, serializeBackup } from './storage.js';
const TODAY = '2026-10-19';
function setup() {
  let state = createPersonalProfile({ today: TODAY });
  state.onboardingCompleted = true;
  state.sat = normalizeSAT({ enabled: true, targetTotal: 1400, examDate: '2027-03-01', weeklyMinutes: 90, estimates: { math: 600, readingWriting: 500 } });
  state.ielts = normalizeIELTS({ enabled: true, targetOverall: 7, examDate: '2027-02-01', weeklyMinutes: 90 });
  return state;
}
const minute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
test('school, IELTS and SAT share a real daily allowance with at most one test preparation action', () => {
  let state = applyTimetableImport(applyExamImport(setup(), undefined, { includeSubjects: true }));
  state.schedule.weekly = state.schedule.weekly.map(day => ({ ...day, minutes: 45, windowStart: '08:00', windowEnd: '21:00' }));
  for (let offset = 0; offset < 7; offset++) {
    const date = shiftDate(TODAY, offset);
    state = ensureDailyPlan(state, date, TODAY);
    const tasks = state.tasks.filter(task => task.date === date && !task.skipped);
    assert.ok(tasks.reduce((sum, task) => sum + task.minutes, 0) <= 45);
    assert.ok(tasks.filter(task => task.ieltsSkill || task.satSkill).length <= 1);
    const windows = getAvailability(state, date).freeWindows;
    for (const task of tasks) for (const session of task.sessions) {
      assert.ok(windows.some(window => session.start >= window.start && session.end <= window.end), 'sessions fit actual free windows');
    }
  }
});

test('the more-work review never stretches a standardized-test task beyond its remaining weekly allowance', () => {
  const state = setup();
  state.ielts.enabled = false;
  state.sat.weeklyMinutes = 10;
  state.schedule.weekly = state.schedule.weekly.map(day => ({ ...day, minutes: 240 }));
  state.weeklyReviews = [{ weekStart: '2026-10-12', effort: 'more', focusSubjectId: '', reflection: '', completedAt: '2026-10-18T17:00:00Z' }];
  const next = ensureDailyPlan(state, TODAY);
  for (const task of next.tasks.filter(task => task.date === TODAY && task.satSkill && !task.skipped)) assert.ok(task.minutes <= 10);
});

test('full SAT simulations are either uninterrupted full length or omitted', () => {
  const state = setup();
  state.ielts.enabled = false;
  state.sat.weeklyMinutes = 240;
  state.schedule.weekly = state.schedule.weekly.map(day => ({ ...day, minutes: 180, windowStart: '16:00', windowEnd: '20:00' }));
  state.schedule.fixedActivities = [{ id: 'break', title: 'Verpflichtung', days: [1], date: '', start: '17:00', end: '18:00', category: 'appointment' }];
  assert.ok(getSATCandidates(state, TODAY).some(task => task.satSkill === 'full'));
  const fragmented = ensureDailyPlan(state, TODAY);
  assert.equal(fragmented.tasks.filter(task => task.date === TODAY && task.satSkill === 'full' && !task.skipped).length, 0, 'two small windows do not become a full exam');
  state.schedule.fixedActivities = [];
  const continuous = ensureDailyPlan(state, TODAY);
  for (const task of continuous.tasks.filter(task => task.satSkill === 'full' && !task.skipped)) {
    assert.equal(task.minutes, 144);
    assert.equal(task.sessions.length, 1);
    assert.equal(minute(task.sessions[0].end) - minute(task.sessions[0].start), 144);
  }
});

test('canonical SAT calendar entry suppresses a same-date legacy duplicate and creates no second generic study plan', () => {
  const state = setup();
  state.profile.testPlans = [{ id: 'old-sat', name: 'SAT', targetDate: state.sat.examDate, status: 'Booked', notes: '' }];
  const events = getUpcomingEvents(state, TODAY).filter(event => event.testName === 'SAT');
  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'sat:digital');
  assert.ok(!getEventCandidates(state, TODAY).some(item => item.eventId === 'sat:digital'));
});

test('SAT, booked versus suggested dates, imported exam metadata and corrected timetable survive restoration', () => {
  let state = applyTimetableImport(applyExamImport(setup(), undefined, { includeSubjects: true }));
  state.sat.dateStatus = 'booked';
  state.sat.scores = [{ id: 'diagnostic', date: '2026-10-18', source: 'mock', skills: { readingWriting: 550, math: 620 }, overall: 1170, notes: 'Meine Probeprüfung' }];
  state.exams[0].date = '2026-10-27'; state.exams[0].room = 'Selbst bestätigt';
  state.schedule.lessons[0].room = 'Korrigiert';
  state = normalizeData(state, TODAY);
  const restored = parseBackup(serializeBackup(state), TODAY);
  assert.deepEqual(restored.sat, state.sat);
  assert.deepEqual(restored.ielts, state.ielts);
  assert.deepEqual(restored.exams, state.exams);
  assert.deepEqual(restored.schedule.lessons, state.schedule.lessons);
  assert.deepEqual(applyExamImport(restored).exams, state.exams);
  assert.deepEqual(applyTimetableImport(restored).schedule.lessons, state.schedule.lessons);
});

test('malformed SAT results fail import without silently changing saved evidence', () => {
  const state = setup();
  state.sat.scores = [{ id: 'bad', date: '2026-10-18', source: 'mock', skills: { readingWriting: 555, math: null }, overall: null, notes: '' }];
  assert.throws(() => parseBackup(JSON.stringify(state), TODAY), /ten-point steps/);
});

test('editing or moving a full simulation cannot relabel a shortened or fragmented session as a full test', () => {
  const state = setup();
  state.ielts.enabled = false;
  state.schedule.weekly = state.schedule.weekly.map(day => ({ ...day, minutes: 45 }));
  state.tasks = [{ id: 'full', date: TODAY, title: 'Vollständige Bluebook-Diagnose', category: 'language', origin: 'generated', satSkill: 'full', minutes: 144, completed: false }];
  assert.throws(() => editTask(state, 'full', { minutes: 30 }), /144 Minuten/);
  assert.throws(() => moveTask(state, 'full', '2026-10-20'), /144 Minuten/);
  assert.equal(state.tasks[0].date, TODAY);
  assert.equal(state.tasks[0].minutes, 144);
});

test('the shared calendar preserves whether an IELTS date is planned or personally booked', () => {
  const state = setup();
  assert.match(getUpcomingEvents(state, TODAY).find(item => item.source === 'ielts').notes, /noch nicht gebucht/);
  state.ielts.dateStatus = 'booked';
  assert.equal(getUpcomingEvents(state, TODAY).find(item => item.source === 'ielts').notes, 'Gebuchter Termin');
});
