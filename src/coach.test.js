import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  addGrade, addTask, createInitialData, createPersonalProfile, ensureDailyPlan, getAvailability, getDailyPlan,
  getExamPlan, getGoals, getProgress, getRoadmap, getWeeklyReview, isDateKey,
  localDateKey, migrateLegacy, normalizeData, removeExam, removeGrade, removeTask,
  saveActivity, saveExam, saveProfile, saveSchedule, saveSubject, saveTaskNotes, saveTaskReview,
  saveUniversity, saveWeeklyReview, shiftDate, skipTask, startOfWeek, toggleRoadmapItem, toggleTask,
} from './coach.js';
import { createStudyState, finishStudy, pauseStudy, removeStudySession, startStudy } from './study.js';
import { getEventPlan, saveEvent } from './events.js';

const TODAY = '2026-10-08';
function personal() { return createInitialData({ today: TODAY, demo: false }); }

test('the supplied personal starting point contains known grades and commitments without invented evidence', () => {
  const state = createPersonalProfile({ today: TODAY });
  const subject = id => state.subjects.find(item => item.id === id);
  assert.equal(state.demo, false);
  assert.equal(state.onboardingCompleted, false);
  assert.equal(state.createdDate, TODAY);
  assert.equal(state.profile.schoolYear, 'Q1');
  assert.equal(state.profile.graduationYear, '2028');
  assert.deepEqual(state.profile.pathways, ['USA', 'Germany']);
  assert.equal(subject('mathematics').written, 6);
  assert.equal(subject('mathematics').oral, 11);
  assert.equal(subject('mathematics').baselineWritten, 6);
  assert.equal(subject('mathematics').baselineOral, 11);
  assert.equal(subject('english').written, null);
  assert.equal(subject('english').oral, 7);
  assert.equal(subject('history').oral, 8);
  assert.equal(subject('computer-science').oral, 10);
  assert.equal(subject('politics').oral, 9);
  assert.ok(['physics', 'german'].every(id => subject(id).written === null && subject(id).oral === null));
  assert.deepEqual(state.subjects.filter(item => item.level === 'LK').map(item => item.id), ['mathematics', 'physics']);
  assert.deepEqual(state.schedule.fixedActivities[0].days, [2, 5]);
  assert.deepEqual(state.universities.map(item => item.name), ['UCLA', 'UC Berkeley']);
  assert.ok(state.activities.every(item => item.startDate === '' && item.endDate === '' && item.hoursPerWeek === null && item.weeksPerYear === null && item.achievements === '' && item.impact === ''));
  assert.equal(state.profile.englishLevel, 'Not sure yet');
  assert.equal(state.profile.germanLevel, 'Not sure yet');
  assert.deepEqual(state.exams, []);
  assert.deepEqual(state.grades, []);
  assert.deepEqual(state.tasks, []);
  assert.deepEqual(state.study, createStudyState());
  assert.deepEqual(normalizeData(state, TODAY), state);
});

test('normalization safely handles malformed nested profile and schedule values', () => {
  for (const value of [null, [], 4, 'broken']) {
    const restored = normalizeData({ ...personal(), profile: value, schedule: value }, TODAY);
    assert.equal(restored.profile.schoolYear, 'Q1');
    assert.equal(restored.schedule.weekly.length, 7);
    assert.doesNotThrow(() => getDailyPlan(restored, TODAY));
  }
});

test('a written draft and self-review survive same-day reprioritization without growing the plan', () => {
  let state = ensureDailyPlan(personal(), TODAY);
  const draft = state.tasks.find(item => !item.examId);
  state = saveTaskNotes(state, draft.id, 'My unfinished paragraph must survive an exam being added.');
  state = saveTaskReview(state, draft.id, ['structure']);
  state = saveExam(state, { id: 'urgent-new-exam', title: 'English Klausur', subjectId: 'english', date: shiftDate(TODAY, 2), topics: ['Analysis'], format: 'written' });
  state = saveSchedule(state, { timeOverrides: [{ date: TODAY, minutes: 45 }] });
  state = ensureDailyPlan(state, TODAY);
  const retained = state.tasks.find(item => item.id === draft.id);
  assert.ok(retained);
  assert.equal(retained.notes, 'My unfinished paragraph must survive an exam being added.');
  assert.deepEqual(retained.selfReview, ['structure']);
  assert.ok(state.tasks.filter(item => item.date === TODAY).length <= 5);
  assert.ok(getDailyPlan(state, TODAY).plannedMinutes <= 45);
});

test('a started exam action shrinks to a five-minute allowance without losing its draft or overcrediting revision', () => {
  let state = ensureDailyPlan(saveExam(personal(), { id: 'draft-exam', title: 'English Klausur', subjectId: 'english', date: shiftDate(TODAY, 8), topics: ['Analysis'], format: 'written' }), TODAY);
  const original = state.tasks.find(task => task.examId === 'draft-exam');
  assert.equal(original.minutes, 25);
  state = saveTaskNotes(state, original.id, 'My unfinished analysis paragraph.');
  state = saveTaskReview(state, original.id, ['structure', 'evidence']);
  state = toggleTask(state, original.id, `${TODAY}T14:00:00Z`);
  state = toggleTask(state, original.id, `${TODAY}T14:01:00Z`);
  state = ensureDailyPlan(budget(state, 5), TODAY);
  const plan = getDailyPlan(state, TODAY);
  const resized = plan.tasks.find(task => task.id === original.id);
  assert.equal(plan.plannedMinutes, 5);
  assert.equal(plan.tasks.length, 1);
  assert.equal(resized.minutes, 5);
  assert.equal(resized.title, original.title);
  assert.equal(resized.notes, 'My unfinished analysis paragraph.');
  assert.deepEqual(resized.selfReview, ['structure', 'evidence']);
  assert.equal(totalMinutes(resized.sessions.map(session => ({ minutes: minuteOf(session.end) - minuteOf(session.start) }))), 5);
  const restored = normalizeData(JSON.parse(JSON.stringify(state)), TODAY);
  assert.equal(getDailyPlan(restored, TODAY).plannedMinutes, 5);
  assert.equal(restored.tasks.filter(task => task.id === original.id).length, 1);
  state = toggleTask(state, original.id, `${TODAY}T14:06:00Z`);
  const revision = getExamPlan(state, 'draft-exam', TODAY).find(step => step.id === original.revisionPlanId);
  assert.equal(revision.completedMinutes, 5);
  assert.equal(revision.remainingMinutes, 20);
  assert.equal(revision.completed, false);
});

test('zero allowance parks saved writing and expanding the day restores it once without undoing deliberate skips', () => {
  let state = ensureDailyPlan(personal(), TODAY);
  const original = state.tasks[0];
  state = saveTaskNotes(state, original.id, 'Keep this writing even on a rest day.');
  state = saveTaskReview(state, original.id, ['accuracy']);
  state = ensureDailyPlan(budget(state, 0), TODAY);
  assert.equal(getDailyPlan(state, TODAY).tasks.length, 0);
  const parked = state.tasks.find(task => task.id === original.id);
  assert.equal(parked.skipped, true);
  assert.equal(parked.notes, 'Keep this writing even on a rest day.');
  assert.deepEqual(parked.selfReview, ['accuracy']);
  assert.equal(state.dismissedTaskIds.includes(original.id), false);
  state = normalizeData(JSON.parse(JSON.stringify(state)), TODAY);
  assert.strictEqual(ensureDailyPlan(state, TODAY), state);
  state = ensureDailyPlan(budget(state, 45), TODAY);
  const restored = getDailyPlan(state, TODAY).tasks.find(task => task.id === original.id);
  assert.ok(restored);
  assert.equal(restored.skipped, false);
  assert.equal(restored.title, original.title);
  assert.equal(restored.minutes, original.minutes);
  assert.equal(restored.notes, parked.notes);
  assert.deepEqual(restored.selfReview, parked.selfReview);
  assert.equal(state.tasks.filter(task => task.id === original.id).length, 1);
  assert.ok(getDailyPlan(state, TODAY).plannedMinutes <= 45);
  state = skipTask(state, original.id);
  state = ensureDailyPlan(budget(state, 120), TODAY);
  assert.equal(state.tasks.find(task => task.id === original.id).skipped, true);
  assert.ok(getDailyPlan(state, TODAY).tasks.every(task => task.id !== original.id));
});

test('several started actions stay saved when only one five-minute action fits', () => {
  let state = ensureDailyPlan(budget(personal(), 120), TODAY);
  const started = state.tasks.slice(0, 4);
  assert.equal(started.length, 4);
  for (const task of started) state = saveTaskNotes(state, task.id, `Saved writing for ${task.title}`);
  state = ensureDailyPlan(budget(state, 5), TODAY);
  let plan = getDailyPlan(state, TODAY);
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.plannedMinutes, 5);
  for (const task of started) {
    const record = state.tasks.find(item => item.id === task.id);
    assert.equal(record.notes, `Saved writing for ${task.title}`);
    assert.equal(state.tasks.filter(item => item.id === task.id).length, 1);
  }
  state = ensureDailyPlan(budget(state, 120), TODAY);
  plan = getDailyPlan(state, TODAY);
  assert.ok(plan.tasks.length <= 5);
  assert.ok(plan.plannedMinutes <= 120);
  assert.ok(started.every(task => plan.tasks.some(item => item.id === task.id)));
  assert.equal(new Set(state.tasks.map(task => task.id)).size, state.tasks.length);
});

test('skipping a task saves its writing, replans today within its allowance and keeps an honest weekly denominator', () => {
  let state = ensureDailyPlan(createPersonalProfile({ today: TODAY }), TODAY);
  const task = state.tasks[0];
  state = saveTaskNotes(state, task.id, 'An unfinished explanation that I will keep for later.');
  state = saveTaskReview(state, task.id, ['structure']);
  const before = getWeeklyReview(state, TODAY).total;
  state = skipTask(state, task.id);
  state = ensureDailyPlan(state, TODAY);
  const saved = state.tasks.find(item => item.id === task.id);
  assert.equal(saved.skipped, true);
  assert.equal(saved.completed, false);
  assert.equal(saved.notes, 'An unfinished explanation that I will keep for later.');
  assert.deepEqual(saved.selfReview, ['structure']);
  assert.ok(state.dismissedTaskIds.includes(task.id));
  const plan = getDailyPlan(state, TODAY);
  assert.ok(plan.tasks.every(item => item.id !== task.id && !item.skipped));
  assert.ok(plan.tasks.length <= 5);
  assert.ok(plan.plannedMinutes <= plan.availableMinutes);
  assert.equal(plan.plannedMinutes, plan.tasks.reduce((sum, item) => sum + item.minutes, 0));
  assert.ok(getWeeklyReview(state, TODAY).total >= before);
  assert.equal(getWeeklyReview(state, TODAY).completed, 0);
  state = ensureDailyPlan(state, shiftDate(TODAY, 1));
  assert.ok(getDailyPlan(state, shiftDate(TODAY, 1)).tasks.every(item => item.id !== task.id));
  assert.equal(getDailyPlan(state, TODAY, shiftDate(TODAY, 1)).tasks.find(item => item.id === task.id).skipped, true);
  state = toggleTask(state, task.id, `${TODAY}T18:00:00Z`);
  assert.equal(state.tasks.find(item => item.id === task.id).skipped, false);
  assert.equal(state.tasks.find(item => item.id === task.id).completed, true);
  assert.equal(state.dismissedTaskIds.includes(task.id), false);
  assert.equal(getWeeklyReview(state, TODAY).completed, 1);
});

test('skipped custom work leaves room for a fresh plan, and deleted exams do not delete started writing', () => {
  let state = addTask(personal(), { id: 'personal-action', title: 'Document one achievement', category: 'activity', date: TODAY, minutes: 30 });
  state = saveTaskNotes(state, 'personal-action', 'Responsibility notes.');
  state = ensureDailyPlan(state, TODAY);
  state = skipTask(state, 'personal-action');
  state = ensureDailyPlan(state, TODAY);
  assert.equal(state.tasks.find(item => item.id === 'personal-action').notes, 'Responsibility notes.');
  assert.ok(getDailyPlan(state, TODAY).tasks.every(item => item.id !== 'personal-action'));
  state = saveExam(state, { id: 'removed-exam', title: 'English', subjectId: 'english', date: shiftDate(TODAY, 3), topics: ['Analysis'], format: 'written' });
  state = ensureDailyPlan(state, TODAY);
  const task = state.tasks.find(item => item.examId === 'removed-exam');
  state = saveTaskNotes(state, task.id, 'This exam draft must not disappear.');
  state = skipTask(state, task.id);
  state = removeExam(state, 'removed-exam');
  state = ensureDailyPlan(state, TODAY);
  assert.equal(state.tasks.find(item => item.id === task.id).notes, 'This exam draft must not disappear.');
  assert.equal(state.tasks.find(item => item.id === task.id).skipped, true);
});

test('new and demo coaching data contain no fabricated measured study sessions', () => {
  for (const demo of [false, true]) {
    const state = createInitialData({ today: TODAY, demo });
    assert.deepEqual(state.study, createStudyState());
  }
  const old = personal();
  delete old.study;
  assert.deepEqual(normalizeData(old, TODAY).study, createStudyState());
});

test('an active or paused generated exercise survives planning changes and exam deletion', () => {
  let state = saveExam(personal(), { id: 'focus-exam', subjectId: 'english', title: 'English Klausur', date: shiftDate(TODAY, 8), topics: ['Analysis', 'Civil Rights'], format: 'written' });
  state = ensureDailyPlan(state, TODAY);
  const task = state.tasks.find(task => task.examId === 'focus-exam');
  state = startStudy(state, task, `${TODAY}T14:00:00Z`);
  state = saveSchedule(state, { timeOverrides: [{ date: TODAY, minutes: 5 }] });
  state = ensureDailyPlan(state, TODAY);
  let retained = state.tasks.find(item => item.id === task.id);
  assert.equal(retained.minutes, task.minutes);
  assert.equal(retained.title, task.title);
  assert.deepEqual(retained.steps, task.steps);
  state = pauseStudy(state, `${TODAY}T14:00:30Z`);
  state = removeExam(state, 'focus-exam');
  state = ensureDailyPlan(state, TODAY);
  retained = state.tasks.find(item => item.id === task.id);
  assert.equal(retained.title, task.title);
  assert.equal(state.study.active.taskId, task.id);
  assert.equal(retained.completed, false);
});

test('self-review selections persist across normalization and same-ID plan regeneration', () => {
  let state = ensureDailyPlan(personal(), TODAY);
  const task = state.tasks.find(item => !item.examId);
  state = saveTaskReview(state, task.id, ['structure', 'evidence', 'structure']);
  state = normalizeData(state, TODAY);
  assert.deepEqual(state.tasks.find(item => item.id === task.id).selfReview, ['structure', 'evidence']);
  state = saveSubject(state, { id: 'mathematics', target: 12 });
  state = ensureDailyPlan(state, TODAY);
  assert.deepEqual(state.tasks.find(item => item.id === task.id).selfReview, ['structure', 'evidence']);
  assert.ok(personal().tasks.every(item => !item.selfReview?.length));
});

test('revision task steps capture their course topics for stable history after an exam is edited', () => {
  let state = saveExam(personal(), { id: 'context-exam', subjectId: 'physics', title: 'Electric fields', date: shiftDate(TODAY, 8), topics: ['Electric fields', 'Potential'], format: 'written' });
  state = ensureDailyPlan(state, TODAY);
  const task = state.tasks.find(item => item.examId === 'context-exam');
  assert.ok(task.steps.includes('Practise the course context: Electric fields, Potential.'));
  state = toggleTask(state, task.id, `${TODAY}T14:00:00Z`);
  state = saveExam(state, { id: 'context-exam', topics: ['Mechanics'] });
  state = ensureDailyPlan(state, TODAY);
  assert.deepEqual(state.tasks.find(item => item.id === task.id).steps, task.steps);
});
function budget(state, minutes, day = TODAY) {
  return saveSchedule(state, { timeOverrides: [{ date: day, minutes }] });
}
function completed(state, task, at = new Date(`${task.date}T12:00:00`)) {
  const next = addTask(state, task);
  return toggleTask(next, next.tasks.at(-1).id, at);
}
const totalMinutes = tasks => tasks.reduce((sum, task) => sum + task.minutes, 0);
const minuteOf = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

test('personal mode uses known Q1 / Hessen / LK context without invented grades or history', () => {
  const state = personal();
  assert.equal(state.version, 2);
  assert.equal(state.demo, false);
  assert.equal(state.profile.schoolYear, 'Q1');
  assert.equal(state.profile.schoolSystem, 'Hessen · Gymnasium');
  assert.equal(state.profile.graduationYear, '2028');
  assert.equal(state.profile.universityStartYear, '');
  assert.equal(state.profile.englishLevel, 'Not sure yet');
  assert.equal(state.profile.germanLevel, 'Not sure yet');
  assert.ok(state.subjects.filter(subject => subject.level === 'LK').every(subject => ['mathematics', 'physics'].includes(subject.id)));
  assert.ok(state.subjects.every(subject => subject.written === null && subject.oral === null));
  assert.deepEqual(state.tasks, []);
  assert.deepEqual(state.grades, []);
  assert.deepEqual(state.activities, []);
  assert.deepEqual(state.exams, []);
  assert.ok(state.universities.every(university => university.deadline === ''));
});

test('demo is explicit, dates are relative, and normalization preserves its full active plan', () => {
  const state = createInitialData({ today: TODAY, demo: true });
  assert.equal(state.demo, true);
  assert.equal(state.onboardingCompleted, false);
  assert.equal(state.exams.find(exam => exam.subjectId === 'english').date, '2026-10-26');
  assert.ok(state.tasks.some(task => task.completed && task.notes.includes('Demo')));
  assert.ok(state.grades.every(grade => grade.note.includes('Demo')));
  const loaded = normalizeData(JSON.parse(JSON.stringify(state)), TODAY);
  assert.deepEqual(getDailyPlan(loaded, TODAY).tasks, getDailyPlan(state, TODAY).tasks);
  assert.strictEqual(ensureDailyPlan(loaded, TODAY), loaded);
});

test('real calendar validation rejects impossible dates and local week starts Monday', () => {
  assert.equal(isDateKey('2028-02-29'), true);
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '0000-01-01', '2026-10-8', undefined]) assert.equal(isDateKey(date), false);
  assert.equal(shiftDate('2026-10-31', 1), '2026-11-01');
  assert.equal(startOfWeek('2026-10-11'), '2026-10-05');
  assert.equal(localDateKey(new Date(2026, 9, 8, 0, 5)), TODAY);
  assert.throws(() => shiftDate('2026-02-30', 1), /calendar date/);
  assert.throws(() => saveExam(personal(), { title: 'Impossible', subjectId: 'english', date: '2026-02-30' }), /valid date/);
});

test('overlapping recurring and dated events are subtracted once, with no planning inside fixed activities', () => {
  let state = personal();
  state = saveSchedule(state, {
    weekly: state.schedule.weekly.map(day => day.day === 4 ? { ...day, minutes: 180, windowStart: '16:00', windowEnd: '20:00' } : day),
    fixedActivities: [
      { id: 'volley', title: 'Volleyball', days: [4], start: '17:00', end: '18:30', category: 'sport' },
      { id: 'work', title: 'Work', days: [], date: TODAY, start: '18:00', end: '19:00', category: 'work' },
      { id: 'school', title: 'School', days: [4], start: '08:00', end: '15:00', category: 'school' },
    ],
  });
  const available = getAvailability(state, TODAY);
  assert.equal(available.availableMinutes, 120);
  assert.deepEqual(available.freeWindows, [{ start: '16:00', end: '17:00', minutes: 60 }, { start: '19:00', end: '20:00', minutes: 60 }]);
  const plan = getDailyPlan(state, TODAY);
  assert.equal(plan.tasks.length, 5);
  assert.ok(plan.plannedMinutes <= 120);
  for (const task of plan.tasks) for (const session of task.sessions) assert.ok(session.end <= '17:00' || session.start >= '19:00');
  const all = plan.tasks.flatMap(task => task.sessions).sort((a, b) => a.start.localeCompare(b.start));
  for (let index = 1; index < all.length; index++) assert.ok(all[index].start >= all[index - 1].end);
});

test('dated events override recurring weekdays and dated budgets cap actual free time', () => {
  let state = personal();
  state = saveSchedule(state, { fixedActivities: [{ id: 'one-off', title: 'Appointment', date: '2026-10-09', days: [4], start: '16:00', end: '19:00' }], timeOverrides: [{ date: TODAY, minutes: 25 }] });
  assert.equal(getAvailability(state, TODAY).blocks.length, 0);
  assert.equal(getAvailability(state, TODAY).availableMinutes, 25);
  assert.equal(getAvailability(state, '2026-10-09').blocks.length, 1);
});

test('little and zero available time generate fewer actions, never a giant workload', () => {
  for (const minutes of [0, 3, 5, 15, 20, 29, 30, 45, 85, 120, 300]) {
    const state = ensureDailyPlan(budget(personal(), minutes), TODAY);
    const plan = getDailyPlan(state, TODAY);
    assert.ok(totalMinutes(plan.tasks) <= plan.availableMinutes);
    assert.ok(plan.tasks.length <= 5);
    assert.ok(plan.tasks.every(task => task.minutes > 0));
    if (minutes === 0 || minutes === 3) assert.equal(plan.tasks.length, 0);
    if (minutes >= 30) assert.ok(plan.tasks.length >= 3);
    if (minutes > 0 && minutes < 30) assert.ok(plan.tasks.length <= 2);
  }
});

test('English exam in twelve days outranks long-term research and exposes a concrete revision stage', () => {
  let state = personal();
  state = saveExam(state, { id: 'english-exam', subjectId: 'english', title: 'English Klausur', date: shiftDate(TODAY, 12), topics: ['American Dream', 'Summary', 'Analysis', 'Comment'], format: 'written', target: 11 });
  const plan = getDailyPlan(state, TODAY);
  assert.equal(plan.tasks[0].examId, 'english-exam');
  assert.equal(plan.tasks[0].subjectId, 'english');
  assert.equal(plan.tasks[0].revisionStage, 'understand');
  assert.equal(plan.tasks[0].priority, 'high');
  assert.match(plan.tasks[0].reason, /12 days/);
  assert.ok(plan.tasks[0].steps.length > 0);
});

test('weak subject gap and LK importance alter prioritization without an exam', () => {
  let state = personal();
  state = saveSubject(state, { id: 'mathematics', written: 2, oral: 5, target: 11, weakTopics: ['Derivatives'] });
  state = saveSubject(state, { id: 'physics', written: 12, oral: 13, target: 12 });
  state = saveSubject(state, { id: 'english', written: 12, oral: 12, target: 11 });
  state = saveSubject(state, { id: 'german', written: 12, oral: 13, target: 11 });
  const plan = getDailyPlan(state, TODAY);
  assert.equal(plan.tasks[0].subjectId, 'mathematics');
  assert.match(plan.tasks[0].title, /Derivatives/);
  assert.match(plan.tasks[0].reason, /3\.5 points; target 11/);
  assert.ok(plan.tasks.some(task => ['university', 'activity'].includes(task.category)));
});

test('near saved university deadline takes precedence and UC never auto-schedules SAT', () => {
  let state = saveUniversity(personal(), { id: 'deadline-target', name: 'Target University', country: 'USA', deadline: shiftDate(TODAY, 4), program: 'Computer Science', url: 'https://example.edu/admissions' });
  let plan = getDailyPlan(state, TODAY);
  assert.match(plan.tasks[0].title, /Target University/);
  assert.match(plan.tasks[0].reason, /deadline.*4 days/);
  assert.ok(plan.tasks.every(task => !/SAT:/.test(task.title)));
  state = saveProfile(state, { pathways: ['Germany'] });
  plan = getDailyPlan(state, TODAY);
  assert.ok(plan.tasks.every(task => !/Target University/.test(task.title)));
});

test('explicit test plan respects target dates and explains UC test-free policy', () => {
  let state = saveProfile(personal(), { testPlans: [{ id: 'sat', name: 'SAT', status: 'Preparing', targetDate: shiftDate(TODAY, 10), targetScore: '1450', notes: 'For non-UC targets only' }] });
  const plan = getDailyPlan(state, TODAY);
  const task = plan.tasks.find(task => task.title.startsWith('SAT:'));
  assert.ok(task);
  assert.match(task.reason, /UC does not consider SAT\/ACT/);
});

test('completed and unnecessary tests never schedule preparation, while undecided tests get verification only', () => {
  for (const status of ['Completed', 'completed', 'Not needed', 'NOT NEEDED']) {
    const state = saveProfile(personal(), { testPlans: [{ id: 'test', name: 'IELTS', status, targetDate: shiftDate(TODAY, 4) }] });
    assert.ok(getDailyPlan(state, TODAY).tasks.every(task => !task.id.includes('test-test') && !task.id.includes('test-research-test')));
  }
  const research = saveProfile(personal(), { testPlans: [{ id: 'test', name: 'SAT', status: 'Considering', targetDate: shiftDate(TODAY, 4) }] });
  assert.ok(getDailyPlan(research, TODAY).tasks.every(task => !task.title.startsWith('SAT:')));
  const booked = saveProfile(personal(), { testPlans: [{ id: 'test', name: 'IELTS', status: 'bOoKeD', targetDate: shiftDate(TODAY, 4) }] });
  assert.ok(getDailyPlan(booked, TODAY).tasks.some(task => task.title.startsWith('IELTS:')));
});

test('language level changes useful vocabulary difficulty instead of prescribing advanced words to beginners', () => {
  const settings = personal();
  const quiet = { ...settings, subjects: settings.subjects.map(subject => ({ ...subject, enabled: false })) };
  quiet.roadmapCompleted = quiet.profile.pathways.flatMap(path => getRoadmap(quiet, path, TODAY).flatMap(phase => phase.items.map(item => item.id)));
  const count = level => {
    const state = saveProfile(quiet, { englishLevel: level, germanLevel: level });
    return getDailyPlan(state, TODAY).tasks.find(task => task.id.includes('vocabulary')).title;
  };
  assert.match(count('A2'), /4 useful everyday words/);
  assert.match(count('B2'), /8 precise words/);
  assert.match(count('C1'), /12 precise words/);
});

test('today completion changes progress immediately without replacing or refilling other actions', () => {
  let state = saveExam(personal(), { id: 'exam', subjectId: 'english', title: 'English Klausur', date: shiftDate(TODAY, 12), topics: ['Analysis'] });
  state = ensureDailyPlan(state, TODAY);
  const before = state.tasks.filter(task => task.date === TODAY);
  const ids = before.map(task => task.id);
  state = toggleTask(state, before[0].id, new Date(`${TODAY}T12:00:00`));
  state = ensureDailyPlan(state, TODAY);
  assert.deepEqual(state.tasks.filter(task => task.date === TODAY).map(task => task.id), ids);
  assert.equal(state.tasks.filter(task => task.date === TODAY).length, before.length);
  assert.equal(getProgress(state, TODAY).weekly.completed, 1);
  assert.equal(getProgress(state, TODAY).exams[0].completed, 1);
  assert.ok(getProgress(state, TODAY).exams[0].readiness > 0);
  assert.ok(getProgress(state, TODAY).exams[0].readiness < 100);
  assert.strictEqual(ensureDailyPlan(state, TODAY), state);
});

test('readiness counts only actual completed revision milestones, never planned or maintenance actions', () => {
  let state = saveExam(personal(), { id: 'exam', subjectId: 'mathematics', title: 'Mathematics Klausur', date: shiftDate(TODAY, 12), topics: ['Derivatives'] });
  state = ensureDailyPlan(state, TODAY);
  assert.equal(getProgress(state, TODAY).exams[0].readiness, 0);
  const first = state.tasks.find(task => task.examId === 'exam');
  state = toggleTask(state, first.id, new Date(`${TODAY}T12:00:00`));
  const tomorrow = shiftDate(TODAY, 1);
  state = ensureDailyPlan(state, tomorrow);
  const next = state.tasks.find(task => task.date === tomorrow && task.examId === 'exam');
  assert.equal(next.revisionStage, '');
  assert.match(next.title, /consolidate/);
  state = toggleTask(state, next.id, new Date(`${tomorrow}T12:00:00`));
  assert.equal(getProgress(state, tomorrow).exams[0].completed, 1);
  const due = shiftDate(TODAY, 2);
  assert.equal(getDailyPlan(state, due).tasks.find(task => task.examId === 'exam').revisionStage, 'practice');
});

test('five completed minutes cannot inflate a full revision milestone, and following days finish the remaining work', () => {
  let state = saveExam(personal(), { id: 'exam', subjectId: 'english', title: 'English Klausur', date: shiftDate(TODAY, 12), topics: ['American Dream'] });
  state = ensureDailyPlan(budget(state, 5), TODAY);
  const first = state.tasks.find(task => task.examId === 'exam');
  assert.equal(first.minutes, 5);
  state = toggleTask(state, first.id, new Date(`${TODAY}T12:00:00`));
  const partial = getExamPlan(state, 'exam', TODAY).find(step => step.stage === 'understand');
  assert.equal(partial.completed, false);
  assert.equal(partial.completedMinutes, 5);
  assert.equal(partial.requiredMinutes, 25);
  assert.equal(partial.remainingMinutes, 20);
  assert.equal(getProgress(state, TODAY).exams[0].readiness, 0);
  assert.equal(getDailyPlan(state, TODAY).tasks.length, 1);
  const tomorrow = shiftDate(TODAY, 1);
  state = ensureDailyPlan(state, tomorrow);
  const next = state.tasks.find(task => task.date === tomorrow && task.examId === 'exam');
  assert.equal(next.minutes, 20);
  state = toggleTask(state, next.id, new Date(`${tomorrow}T12:00:00`));
  assert.equal(getExamPlan(state, 'exam', tomorrow).find(step => step.stage === 'understand').completed, true);
  assert.equal(getProgress(state, tomorrow).exams[0].completed, 1);
});

test('partial or split timed rehearsals do not claim a full uninterrupted timed milestone', () => {
  let state = saveExam(personal(), { id: 'exam', subjectId: 'english', title: 'English Klausur', date: shiftDate(TODAY, 14) });
  const date = shiftDate(TODAY, 10); // Four days before the exam.
  const plan = getExamPlan(state, 'exam', TODAY);
  // Prior completed milestones establish why a timed rehearsal is now useful.
  for (const step of plan.filter(step => ['understand', 'summary', 'analysis'].includes(step.stage))) state = completed(state, { date: step.date, title: step.title, category: 'language', subjectId: 'english', examId: 'exam', revisionStage: step.stage, revisionPlanId: step.id, minutes: step.minutes });
  state = ensureDailyPlan(budget(state, 15, date), date);
  const timed = state.tasks.find(task => task.date === date && task.revisionStage === 'timed');
  assert.ok(timed);
  assert.match(timed.title, /one timed exam section/);
  state = toggleTask(state, timed.id, new Date(`${date}T12:00:00`));
  let milestone = getExamPlan(state, 'exam', date).find(step => step.stage === 'timed');
  assert.equal(milestone.completed, false);
  assert.equal(milestone.requiredMinutes, 40);
  assert.equal(milestone.remainingMinutes, 40);
  state = completed(state, { date, title: 'Split practice', category: 'language', subjectId: 'english', examId: 'exam', revisionStage: 'timed', revisionPlanId: milestone.id, minutes: 40, sessions: [{ start: '16:00', end: '16:20' }, { start: '17:00', end: '17:20' }] });
  milestone = getExamPlan(state, 'exam', date).find(step => step.stage === 'timed');
  assert.equal(milestone.completed, false);
  assert.equal(milestone.completedMinutes, 20);
  state = completed(state, { date, title: 'Full timed paper', category: 'language', subjectId: 'english', examId: 'exam', revisionStage: 'timed', revisionPlanId: milestone.id, minutes: 40, sessions: [{ start: '18:00', end: '18:40' }] });
  assert.equal(getExamPlan(state, 'exam', date).find(step => step.stage === 'timed').completed, true);
});

test('discipline and exam format change revision exercises, with light revision only near exam', () => {
  let state = personal();
  state = saveExam(state, { id: 'english', title: 'English', subjectId: 'english', date: shiftDate(TODAY, 14), format: 'written' });
  state = saveExam(state, { id: 'maths', title: 'Mathematics', subjectId: 'mathematics', date: shiftDate(TODAY, 14), format: 'written' });
  state = saveExam(state, { id: 'oral', title: 'Physics oral', subjectId: 'physics', date: shiftDate(TODAY, 14), format: 'oral' });
  state = saveExam(state, { id: 'practical', title: 'Physics practical', subjectId: 'physics', date: shiftDate(TODAY, 14), format: 'practical' });
  assert.ok(getExamPlan(state, 'english', TODAY).some(step => step.stage === 'analysis'));
  assert.ok(getExamPlan(state, 'maths', TODAY).some(step => step.stage === 'mixed'));
  assert.ok(getExamPlan(state, 'oral', TODAY).some(step => step.stage === 'explain'));
  assert.ok(getExamPlan(state, 'practical', TODAY).some(step => step.stage === 'interpret'));
  for (const id of ['english', 'maths', 'oral', 'practical']) {
    const plan = getExamPlan(state, id, TODAY);
    assert.equal(plan.at(-1).date, shiftDate(TODAY, 13));
    assert.equal(plan.at(-1).stage, 'light');
    assert.ok(plan.every(step => step.date >= TODAY && step.date < shiftDate(TODAY, 14)));
  }
});

test('late-added short-notice exam produces compressed, real dates without tasks on exam day', () => {
  const state = saveExam(personal(), { id: 'short', title: 'Physics test', subjectId: 'physics', date: shiftDate(TODAY, 2), format: 'test' });
  const plan = getExamPlan(state, 'short', TODAY);
  assert.ok(plan.every(step => step.date >= TODAY && step.date < shiftDate(TODAY, 2)));
  assert.equal(getDailyPlan(state, shiftDate(TODAY, 2)).tasks.some(task => task.examId === 'short'), false);
});

test('an exam added long after setup compresses from its actual addition date, not the original install date', () => {
  const added = shiftDate(TODAY, 60);
  const state = saveExam(personal(), { id: 'late', subjectId: 'physics', title: 'Late announced exam', createdDate: added, date: shiftDate(added, 2) });
  const loaded = normalizeData(JSON.parse(JSON.stringify(state)), added);
  const plan = getExamPlan(loaded, 'late', added);
  assert.equal(plan.length, 3);
  assert.ok(plan.every(step => step.date >= added && step.date < shiftDate(added, 2)));
  assert.ok(getDailyPlan(loaded, added).tasks.filter(task => task.examId === 'late').length >= 2);
});

test('overdue actions stay in history but are not copied into tomorrow as a backlog', () => {
  let state = ensureDailyPlan(personal(), TODAY);
  const original = state.tasks.filter(task => task.date === TODAY);
  const tomorrow = shiftDate(TODAY, 1);
  state = ensureDailyPlan(state, tomorrow);
  const plan = getDailyPlan(state, tomorrow);
  assert.ok(plan.tasks.length >= 3 && plan.tasks.length <= 5);
  assert.ok(plan.tasks.every(task => !original.some(old => old.id === task.id)));
  assert.equal(state.tasks.filter(task => task.date === TODAY).length, original.length);
  assert.match(plan.adjustment, /fresh plan.*backlog/);
});

test('historical plans keep their recorded tasks and sessions when current priorities or schedules change', () => {
  const yesterday = shiftDate(TODAY, -1);
  let state = createInitialData({ today: yesterday, demo: false });
  state = ensureDailyPlan(state, yesterday);
  const original = state.tasks.find(task => task.date === yesterday);
  state = saveTaskNotes(state, original.id, 'What I actually worked on yesterday.');
  state = toggleTask(state, original.id, new Date(`${yesterday}T12:00:00`));
  const recorded = state.tasks.filter(task => task.date === yesterday);
  state = saveSubject(state, { id: 'english', written: 2, oral: 4, target: 12 });
  state = saveExam(state, { id: 'urgent', subjectId: 'english', title: 'New English exam', date: shiftDate(TODAY, 3) });
  state = saveSchedule(state, { fixedActivities: [{ id: 'new-event', title: 'Updated timetable', days: [3], start: '16:00', end: '20:00' }] });
  assert.strictEqual(ensureDailyPlan(state, yesterday, TODAY), state);
  const history = getDailyPlan(state, yesterday, TODAY);
  assert.equal(history.isHistory, true);
  assert.deepEqual(history.tasks, recorded);
  assert.equal(history.plannedMinutes, totalMinutes(recorded));
  assert.equal(history.availableMinutes, null);
  assert.equal(history.remainingMinutes, null);
  assert.deepEqual(history.freeWindows, []);
  assert.match(history.adjustment, /Past plans are preserved/);
  assert.equal(history.goal, 'Your saved study history');
});

test('past dates and dates before installation never receive fabricated recommendations', () => {
  const state = personal();
  const yesterday = shiftDate(TODAY, -1);
  assert.strictEqual(ensureDailyPlan(state, yesterday), state);
  assert.strictEqual(ensureDailyPlan(state, yesterday, TODAY), state);
  const history = getDailyPlan(state, yesterday, TODAY);
  assert.equal(history.isHistory, true);
  assert.deepEqual(history.tasks, []);
  assert.equal(history.plannedMinutes, 0);
  assert.match(history.adjustment, /No actions were saved/);
  assert.equal(getDailyPlan(state, yesterday).isHistory, true);
  assert.throws(() => ensureDailyPlan(state, TODAY, '2026-02-30'), /calendar date/);
  assert.throws(() => getDailyPlan(state, TODAY, 'invalid'), /calendar date/);
});

test('today and future dates still recalculate when current planning inputs change', () => {
  const tomorrow = shiftDate(TODAY, 1);
  let state = ensureDailyPlan(personal(), tomorrow, TODAY);
  const before = getDailyPlan(state, tomorrow, TODAY);
  assert.equal(before.isHistory, false);
  assert.equal(before.tasks.some(task => task.examId === 'new-exam'), false);
  state = saveExam(state, { id: 'new-exam', title: 'Physics Klausur', subjectId: 'physics', createdDate: TODAY, date: shiftDate(TODAY, 4) });
  state = ensureDailyPlan(state, tomorrow, TODAY);
  const future = getDailyPlan(state, tomorrow, TODAY);
  assert.equal(future.isHistory, false);
  assert.equal(future.tasks[0].examId, 'new-exam');
  assert.ok(future.plannedMinutes <= future.availableMinutes);
  assert.equal(getDailyPlan(state, TODAY, TODAY).isHistory, false);
});

test('settings-driven regeneration preserves real completions, custom actions and note content', () => {
  let state = ensureDailyPlan(personal(), TODAY);
  const original = state.tasks.find(task => task.date === TODAY);
  state = saveTaskNotes(state, original.id, 'My actual work and remaining question');
  state = toggleTask(state, original.id, new Date(`${TODAY}T12:00:00`));
  state = addTask(state, { title: 'Ask teacher for feedback', category: 'academics', subjectId: 'english', minutes: 10, date: TODAY, notes: 'Bring my paragraph.' });
  state = saveExam(state, { id: 'urgent', subjectId: 'physics', title: 'Physics Klausur', date: shiftDate(TODAY, 4) });
  state = ensureDailyPlan(state, TODAY);
  const plan = getDailyPlan(state, TODAY);
  assert.ok(plan.tasks.length <= 5);
  assert.ok(plan.plannedMinutes <= plan.availableMinutes);
  assert.equal(state.tasks.find(task => task.id === original.id).notes, 'My actual work and remaining question');
  assert.equal(state.tasks.find(task => task.id === original.id).completed, true);
  assert.ok(plan.tasks.some(task => task.origin === 'custom' && task.title.includes('teacher')));
  assert.ok(plan.tasks.some(task => task.examId === 'urgent'));
});

test('large custom tasks are retained with an explicit over-budget notice', () => {
  let state = budget(personal(), 20);
  state = addTask(state, { date: TODAY, title: 'My longer scheduled task', minutes: 60, category: 'academics' });
  const plan = getDailyPlan(state, TODAY);
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.plannedMinutes, 60);
  assert.match(plan.adjustment, /exceed.*availability/);
  assert.equal(plan.remainingMinutes, 0);
});

test('deleting a generated recommendation suppresses that action after reload', () => {
  let state = ensureDailyPlan(personal(), TODAY);
  const deleted = state.tasks.find(task => task.date === TODAY);
  state = removeTask(state, deleted.id);
  state = normalizeData(JSON.parse(JSON.stringify(state)), TODAY);
  state = ensureDailyPlan(state, TODAY);
  assert.equal(state.tasks.some(task => task.id === deleted.id), false);
});

test('weekly review changes the next week, and Sunday includes a short actual review action', () => {
  let state = saveSubject(personal(), { id: 'mathematics', written: 12, oral: 12, target: 10 });
  const sunday = '2026-10-11';
  assert.ok(getDailyPlan(state, sunday).tasks.some(task => task.category === 'review'));
  const monday = '2026-10-12';
  const before = getDailyPlan(state, monday);
  state = saveWeeklyReview(state, { weekStart: '2026-10-05', reflection: 'Need shorter German writing practice', focusSubjectId: 'german', effort: 'Too much' });
  const after = getDailyPlan(state, monday);
  assert.ok(after.tasks.findIndex(task => task.subjectId === 'german') < before.tasks.findIndex(task => task.subjectId === 'german') || after.tasks[0].subjectId === 'german');
  assert.match(after.adjustment, /weekly review/);
  assert.equal(state.weeklyReviews[0].weekStart, '2026-10-05');
});

test('a lighter weekly review reserves time next week without changing the actual timetable allowance', () => {
  const monday = '2026-10-12';
  const state = budget(personal(), 120, monday);
  const usual = getDailyPlan(state, monday);
  const reviewed = saveWeeklyReview(state, { weekStart: '2026-10-05', effort: 'lighter' });
  const lighter = getDailyPlan(reviewed, monday);
  assert.equal(lighter.availableMinutes, usual.availableMinutes);
  assert.equal(lighter.availableMinutes, 120);
  assert.ok(lighter.plannedMinutes <= Math.floor(lighter.availableMinutes * .8));
  assert.ok(lighter.plannedMinutes < usual.plannedMinutes);
  assert.ok(lighter.remainingMinutes >= 24);
  assert.match(lighter.adjustment, /lighter week.*20%/);
  assert.equal(getDailyPlan(reviewed, '2026-10-19').plannedMinutes, getDailyPlan(state, '2026-10-19').plannedMinutes);
});

test('more weekly effort uses spare capacity but stays within the real allowance and five actions', () => {
  const monday = '2026-10-12';
  let usedSpareCapacity = false;
  const fixtures = [personal(), createInitialData({ today: TODAY, demo: true }), saveProfile(personal(), { schoolYear: 'Graduated' })];
  for (const fixture of fixtures) for (const minutes of [0, 3, 5, 15, 20, 29, 30, 50, 60, 75, 84, 85, 120, 180]) {
    const state = budget(fixture, minutes, monday);
    const usual = getDailyPlan(state, monday);
    const more = getDailyPlan(saveWeeklyReview(state, { weekStart: '2026-10-05', effort: 'more' }), monday);
    assert.equal(more.availableMinutes, usual.availableMinutes);
    assert.ok(more.plannedMinutes >= usual.plannedMinutes, `More effort reduced the ${minutes}-minute plan`);
    assert.ok(more.plannedMinutes <= more.availableMinutes);
    assert.ok(more.tasks.length <= 5);
    if (more.plannedMinutes > usual.plannedMinutes) usedSpareCapacity = true;
    for (const task of more.tasks) {
      assert.equal(task.sessions.reduce((sum, session) => sum + minuteOf(session.end) - minuteOf(session.start), 0), task.minutes);
      for (const session of task.sessions) assert.ok(more.freeWindows.some(window => session.start >= window.start && session.end <= window.end));
    }
    const sessions = more.tasks.flatMap(task => task.sessions).sort((a, b) => a.start.localeCompare(b.start));
    for (let index = 1; index < sessions.length; index++) assert.ok(sessions[index].start >= sessions[index - 1].end);
  }
  assert.equal(usedSpareCapacity, true);
});

test('weekly effort respects fixed activities and rest days even when the requested allowance is larger', () => {
  const monday = '2026-10-12';
  const state = saveSchedule(personal(), {
    weekly: personal().schedule.weekly.map(day => day.day === 1 ? { ...day, minutes: 180, windowStart: '16:00', windowEnd: '18:00' } : day),
    fixedActivities: [{ id: 'volley', title: 'Volleyball', days: [1], start: '16:30', end: '17:30' }],
  });
  for (const effort of ['lighter', 'same', 'more']) {
    const reviewed = saveWeeklyReview(state, { weekStart: '2026-10-05', effort });
    const plan = getDailyPlan(reviewed, monday);
    assert.equal(plan.availableMinutes, 60);
    assert.ok(plan.plannedMinutes <= (effort === 'lighter' ? 48 : 60));
    const sessions = plan.tasks.flatMap(task => task.sessions).sort((a, b) => a.start.localeCompare(b.start));
    for (const session of sessions) assert.ok(session.end <= '16:30' || session.start >= '17:30');
    for (let index = 1; index < sessions.length; index++) assert.ok(sessions[index].start >= sessions[index - 1].end);
    const rest = getDailyPlan(budget(reviewed, 0, monday), monday);
    assert.equal(rest.availableMinutes, 0);
    assert.deepEqual(rest.tasks, []);
    assert.match(rest.adjustment, /No study time/);
  }
});

test('a lighter review keeps one five-minute action and a saved draft on the next Monday', () => {
  const monday = '2026-10-12';
  let state = saveWeeklyReview(personal(), { weekStart: '2026-10-05', effort: 'lighter', focusSubjectId: 'mathematics' });
  state = ensureDailyPlan(budget(state, 120, monday), monday);
  const original = state.tasks.find(task => task.date === monday && task.subjectId === 'mathematics');
  assert.ok(original);
  assert.ok(original.minutes > 5);
  state = saveTaskNotes(state, original.id, 'Resume my integration explanation.');
  state = saveTaskReview(state, original.id, ['method']);
  state = ensureDailyPlan(budget(state, 5, monday), monday);
  const plan = getDailyPlan(state, monday);
  assert.equal(plan.availableMinutes, 5);
  assert.equal(plan.plannedMinutes, 5);
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.tasks[0].id, original.id);
  assert.equal(plan.tasks[0].minutes, 5);
  assert.equal(plan.tasks[0].notes, 'Resume my integration explanation.');
  assert.deepEqual(plan.tasks[0].selfReview, ['method']);
  assert.equal(plan.tasks[0].skipped, undefined);
  assert.equal(state.tasks.filter(task => task.id === original.id).length, 1);
  const reviewed = saveWeeklyReview(personal(), { weekStart: '2026-10-05', effort: 'lighter' });
  for (const minutes of [0, 1, 2, 3, 4, 5, 6]) {
    const small = getDailyPlan(budget(reviewed, minutes, monday), monday);
    assert.ok(small.plannedMinutes <= minutes);
    assert.equal(small.tasks.length, minutes >= 5 ? 1 : 0);
    if (minutes >= 5) assert.equal(small.plannedMinutes, 5);
  }
});

test('lighter regeneration retains completed work and custom commitments instead of erasing them', () => {
  const monday = '2026-10-12';
  let state = ensureDailyPlan(budget(personal(), 120, monday), monday);
  const original = state.tasks.find(task => task.date === monday);
  state = saveTaskNotes(state, original.id, 'Reviewed two errors with my teacher.');
  state = toggleTask(state, original.id, new Date(`${monday}T12:00:00`));
  state = addTask(state, { id: 'teacher', date: monday, title: 'Teacher feedback', category: 'academics', subjectId: 'english', minutes: 15, notes: 'Bring my paragraph.' });
  const completedAt = state.tasks.find(task => task.id === original.id).completedAt;
  state = ensureDailyPlan(saveWeeklyReview(state, { weekStart: '2026-10-05', effort: 'lighter' }), monday);
  const plan = getDailyPlan(state, monday);
  const retained = plan.tasks.find(task => task.id === original.id);
  assert.equal(retained.completed, true);
  assert.equal(retained.completedAt, completedAt);
  assert.equal(retained.notes, 'Reviewed two errors with my teacher.');
  assert.equal(plan.tasks.find(task => task.id === 'teacher').notes, 'Bring my paragraph.');
  assert.ok(plan.plannedMinutes <= 96);
  assert.ok(plan.tasks.length <= 5);
  const alreadyCommitted = saveWeeklyReview(addTask(budget(personal(), 120, monday), {
    id: 'existing-longer-work', date: monday, title: 'My fixed study commitment', minutes: 110, category: 'academics',
  }), { weekStart: '2026-10-05', effort: 'lighter' });
  const preserved = getDailyPlan(alreadyCommitted, monday);
  assert.equal(preserved.tasks.length, 1);
  assert.equal(preserved.plannedMinutes, 110);
  assert.match(preserved.adjustment, /saved work already uses the lighter target; no extra actions/);
});

test('same effort and reflection-only edits leave the existing next-week plan unchanged', () => {
  const monday = '2026-10-12';
  const initial = ensureDailyPlan(personal(), monday);
  const same = saveWeeklyReview(initial, { weekStart: '2026-10-05', effort: 'same', reflection: 'The balance works.' });
  assert.strictEqual(ensureDailyPlan(same, monday), same);
  assert.deepEqual(getDailyPlan(same, monday).tasks, getDailyPlan(initial, monday).tasks);
  const lighter = ensureDailyPlan(saveWeeklyReview(initial, { weekStart: '2026-10-05', effort: 'lighter', focusSubjectId: 'german', reflection: 'First reflection.' }), monday);
  const edited = saveWeeklyReview(lighter, { weekStart: '2026-10-05', effort: 'LIGHTER', focusSubjectId: 'german', reflection: 'More detail about the same decision.' });
  assert.strictEqual(ensureDailyPlan(edited, monday), edited);
  assert.deepEqual(getDailyPlan(edited, monday).tasks, getDailyPlan(lighter, monday).tasks);
});

test('name and theme edits preserve remaining actions and notes after an exam milestone is completed', () => {
  let state = ensureDailyPlan(saveExam(personal(), { id: 'exam', title: 'English Klausur', subjectId: 'english', date: shiftDate(TODAY, 12) }), TODAY);
  const examTask = state.tasks.find(task => task.examId === 'exam');
  const remaining = state.tasks.find(task => task.id !== examTask.id);
  state = saveTaskNotes(state, remaining.id, 'A question to finish later today.');
  state = toggleTask(state, examTask.id, new Date(`${TODAY}T12:00:00`));
  const before = getDailyPlan(state, TODAY).tasks;
  state = saveProfile(state, { name: 'Eric', theme: 'dark' });
  assert.strictEqual(ensureDailyPlan(state, TODAY), state);
  assert.deepEqual(getDailyPlan(state, TODAY).tasks, before);
  assert.equal(state.tasks.find(task => task.id === remaining.id).notes, 'A question to finish later today.');
  assert.equal(getExamPlan(state, 'exam', TODAY).find(step => step.stage === 'understand').completed, true);
});

test('saving the Sunday review guides Monday without replacing Sunday remaining actions', () => {
  const sunday = '2026-10-11';
  const monday = '2026-10-12';
  let state = ensureDailyPlan(saveExam(personal(), { id: 'exam', title: 'English Klausur', subjectId: 'english', date: shiftDate(sunday, 12) }), sunday);
  const examTask = state.tasks.find(task => task.date === sunday && task.examId === 'exam');
  const remaining = state.tasks.find(task => task.date === sunday && task.id !== examTask.id);
  state = saveTaskNotes(state, remaining.id, 'Keep this action for this afternoon.');
  state = toggleTask(state, examTask.id, new Date(`${sunday}T12:00:00`));
  const sundayBefore = getDailyPlan(state, sunday).tasks;
  const mondayBefore = getDailyPlan(state, monday);
  state = saveWeeklyReview(state, { weekStart: '2026-10-05', focusSubjectId: 'german', effort: 'lighter', reflection: 'A lighter week with more German practice.' });
  assert.strictEqual(ensureDailyPlan(state, sunday), state);
  assert.deepEqual(getDailyPlan(state, sunday).tasks, sundayBefore);
  const mondayAfter = getDailyPlan(state, monday);
  const sameFocus = getDailyPlan(saveWeeklyReview(state, { weekStart: '2026-10-05', focusSubjectId: 'german', effort: 'same' }), monday);
  assert.ok(mondayAfter.plannedMinutes < sameFocus.plannedMinutes);
  assert.ok(mondayAfter.tasks.some(task => task.subjectId === 'german' && /weekly review/.test(task.reason)));
  assert.equal(mondayAfter.availableMinutes, mondayBefore.availableMinutes);
  assert.ok(mondayAfter.plannedMinutes <= Math.floor(mondayAfter.availableMinutes * .8));
});

test('actual weekly minutes and consistency use completion day, including overdue work', () => {
  let state = completed(personal(), { date: '2026-10-01', title: 'Old actual work', minutes: 30, category: 'university' }, new Date(`${TODAY}T12:00:00`));
  state = completed(state, { date: TODAY, title: 'Today maths', subjectId: 'mathematics', minutes: 25, category: 'academics' });
  state = addTask(state, { date: TODAY, title: 'Still incomplete', minutes: 10, category: 'language' });
  const review = getWeeklyReview(state, TODAY);
  assert.equal(review.completed, 2);
  assert.equal(review.total, 3);
  assert.equal(review.minutes, 55);
  assert.equal(review.consistency, 1);
  assert.equal(review.universityProgress, 1);
  assert.equal(review.completionRate, 67);
  assert.equal(review.days.find(day => day.date === TODAY).minutes, 55);
  assert.equal(getWeeklyReview(state, '2026-10-01').completed, 0);
});

test('a saved focus session counts as a study day and streak without completing its task', () => {
  let state = ensureDailyPlan(personal(), TODAY);
  const task = state.tasks[0];
  state = startStudy(state, task, `${TODAY}T12:00:00Z`, 5);
  state = finishStudy(state, `${TODAY}T12:01:00Z`);
  const review = getWeeklyReview(state, TODAY);
  assert.equal(review.completed, 0);
  assert.equal(review.minutes, 0, 'Estimated completed-task minutes stay separate from measured time');
  assert.equal(review.measuredSeconds, 60);
  assert.equal(review.measuredSessions, 1);
  assert.equal(review.consistency, 1);
  assert.equal(review.days.find(day => day.date === TODAY).timedSeconds, 60);
  assert.equal(getProgress(state, TODAY).streak, 1);
  assert.equal(state.tasks.find(item => item.id === task.id).completed, false);
  state = removeStudySession(state, state.study.sessions[0].id);
  assert.equal(getWeeklyReview(state, TODAY).consistency, 0);
  assert.equal(getProgress(state, TODAY).streak, 0);
});

test('unfinished active focus time does not establish study consistency or a streak', () => {
  const state = ensureDailyPlan(personal(), TODAY);
  const running = startStudy(state, state.tasks[0], `${TODAY}T12:00:00Z`, 5);
  assert.equal(getWeeklyReview(running, TODAY).consistency, 0);
  assert.equal(getWeeklyReview(running, TODAY).measuredSeconds, 0);
  assert.equal(getProgress(running, TODAY).streak, 0);
  assert.ok(getWeeklyReview(running, TODAY).days.every(day => day.timedSeconds === 0));
});

test('task completion and focus time on the same day count only one study day', () => {
  let state = ensureDailyPlan(personal(), TODAY);
  const task = state.tasks[0];
  state = finishStudy(startStudy(state, task, `${TODAY}T12:00:00Z`, 5), `${TODAY}T12:01:00Z`);
  state = toggleTask(state, task.id, `${TODAY}T12:01:00Z`);
  const review = getWeeklyReview(state, TODAY);
  assert.equal(review.consistency, 1);
  assert.equal(review.completed, 1);
  assert.equal(review.minutes, task.minutes);
  state = removeStudySession(state, state.study.sessions[0].id);
  assert.equal(getWeeklyReview(state, TODAY).consistency, 1);
  assert.equal(getProgress(state, TODAY).streak, 1);
});

test('focus time crossing local midnight counts both genuine study days without inventing completions', () => {
  let state = ensureDailyPlan(personal(), TODAY);
  state = startStudy(state, state.tasks[0], '2026-10-08T23:58:00+02:00', 5);
  state = { ...state, study: { ...state.study, active: { ...state.study.active, timeZone: 'Europe/Berlin' } } };
  state = finishStudy(state, '2026-10-09T00:03:00+02:00');
  const review = getWeeklyReview(state, '2026-10-09');
  assert.equal(review.consistency, 2);
  assert.equal(review.days.find(day => day.date === TODAY).timedSeconds, 120);
  assert.equal(review.days.find(day => day.date === '2026-10-09').timedSeconds, 180);
  assert.equal(review.completed, 0);
  assert.equal(review.minutes, 0);
  assert.equal(getProgress(state, '2026-10-09').streak, 2);
  assert.ok(state.tasks.every(task => !task.completed));
});

test('written and oral grade history supports real zero and fifteen points and updates means', () => {
  let state = personal();
  state = addGrade(state, { id: 'zero', subjectId: 'mathematics', points: 0, type: 'written', date: TODAY });
  state = addGrade(state, { id: 'full', subjectId: 'mathematics', points: 15, type: 'written', date: TODAY });
  state = addGrade(state, { id: 'oral', subjectId: 'mathematics', points: 11, type: 'oral', date: TODAY });
  const maths = getProgress(state, TODAY).subjects.find(subject => subject.id === 'mathematics');
  assert.equal(maths.written, 7.5);
  assert.equal(maths.oral, 11);
  assert.equal(maths.current, 9.25);
  state = removeGrade(state, 'full');
  assert.equal(state.subjects.find(subject => subject.id === 'mathematics').written, 0);
  state = removeGrade(state, 'zero');
  assert.equal(state.subjects.find(subject => subject.id === 'mathematics').written, null);
  for (const points of [-1, 16, '', null, true, 'no']) assert.throws(() => addGrade(state, { subjectId: 'english', points, date: TODAY }), /between 0 and 15/);
});

test('deleting the last assessment restores the entered baseline without erasing oral grades', () => {
  let state = saveSubject(personal(), { id: 'mathematics', written: 6, oral: 11 });
  state = addGrade(state, { id: 'new-result', subjectId: 'mathematics', points: 0, type: 'written', date: TODAY });
  assert.equal(state.subjects.find(subject => subject.id === 'mathematics').written, 0);
  state = normalizeData(JSON.parse(JSON.stringify(state)), TODAY);
  state = removeGrade(state, 'new-result');
  const maths = state.subjects.find(subject => subject.id === 'mathematics');
  assert.equal(maths.written, 6);
  assert.equal(maths.oral, 11);
  assert.equal(maths.baselineWritten, 6);
  assert.equal(maths.baselineOral, 11);
});

test('roadmap distinguishes pathways, includes test policy and uses explicit completion rather than elapsed time', () => {
  let state = personal();
  const usa = getRoadmap(state, 'USA', TODAY);
  const germany = getRoadmap(state, 'Germany', TODAY);
  assert.deepEqual(usa.map(phase => phase.label), ['Today', 'Q1', 'Q2', 'University preparation', 'Q3', 'Applications', 'Q4', 'Abitur preparation', 'Admission', 'Abitur', 'University']);
  assert.ok(usa.findIndex(phase => phase.label === 'Applications') < usa.findIndex(phase => phase.label === 'Abitur'));
  assert.equal(usa.find(phase => phase.label === 'Q1').status, 'current');
  assert.match(usa.flatMap(phase => phase.items).find(item => item.category === 'tests').description, /SAT\/ACT are not considered for UC/);
  assert.ok(germany.flatMap(phase => phase.items).some(item => item.description.includes('Hochschulstart')));
  const first = usa[0].items[0];
  state = toggleRoadmapItem(state, first.id);
  assert.equal(getProgress(state, TODAY).roadmap.USA.completed, 1);
  assert.equal(getProgress(state, TODAY).roadmap.Germany.completed, 0);
  assert.ok(getRoadmap(state, 'USA', '2027-09-01').find(phase => phase.label === 'Q1').items.some(item => !item.completed));
});

test('roadmap application dates honor a gap year and preserve the different USA and Germany cycles', () => {
  const phase = (state, path, label) => getRoadmap(state, path, TODAY).find(item => item.label === label);
  const defaults = personal();
  assert.equal(phase(defaults, 'USA', 'Applications').start, '2027-08-01');
  assert.equal(phase(defaults, 'USA', 'Applications').end, '2028-07-31');
  assert.equal(phase(defaults, 'Germany', 'Applications').start, '2028-05-01');
  assert.equal(phase(defaults, 'Germany', 'Applications').end, '2028-09-30');
  assert.equal(phase(defaults, 'USA', 'University').start, '2028-09-01');
  const gap = saveProfile(defaults, { applicationYear: '2029', universityStartYear: '2030' });
  assert.equal(phase(gap, 'USA', 'Applications').start, '2029-08-01');
  assert.equal(phase(gap, 'USA', 'Applications').end, '2030-07-31');
  assert.doesNotMatch(phase(gap, 'USA', 'Applications').items.find(item => item.title === 'Submit and track each application').description, /2028/);
  assert.equal(phase(gap, 'Germany', 'Applications').start, '2029-05-01');
  assert.equal(phase(gap, 'Germany', 'Applications').end, '2029-09-30');
  assert.equal(phase(gap, 'USA', 'University').start, '2030-09-01');
  assert.equal(phase(gap, 'Germany', 'University').start, '2030-09-01');
  assert.equal(phase(gap, 'USA', 'Abitur').start, '2028-05-01');
  const entryOnly = saveProfile(defaults, { universityStartYear: '2030' });
  assert.equal(phase(entryOnly, 'USA', 'Applications').start, '2029-08-01');
  assert.equal(phase(entryOnly, 'Germany', 'Applications').start, '2030-05-01');
  const applicationOnly = saveProfile(defaults, { applicationYear: '2029' });
  assert.equal(phase(applicationOnly, 'USA', 'University').start, '2030-09-01');
  assert.equal(phase(applicationOnly, 'Germany', 'University').start, '2029-09-01');
});

test('after graduation generic school revision stops, while language and application development continue', () => {
  let state = saveSubject(personal(), { id: 'mathematics', written: 2, oral: 3, target: 12, weakTopics: ['Derivatives'] });
  assert.equal(getDailyPlan(saveProfile(state, { schoolYear: 'Q4' }), TODAY).tasks[0].subjectId, 'mathematics');
  state = saveProfile(state, { schoolYear: 'Graduated' });
  const plan = getDailyPlan(state, TODAY);
  assert.ok(plan.tasks.length >= 3);
  assert.ok(plan.tasks.every(task => !['mathematics', 'physics'].includes(task.subjectId)));
  assert.ok(plan.tasks.some(task => task.category === 'language'));
  const writing = plan.tasks.find(task => task.id.includes('subject-') && task.category === 'language');
  assert.match(writing.title, /academic writing/);
  assert.match(writing.steps[0], /current practice material/);
  assert.doesNotMatch(writing.reason, /recorded average|next assessment/);
  assert.ok(plan.tasks.some(task => ['university', 'activity'].includes(task.category)));
  const goals = getGoals(state, TODAY);
  assert.doesNotMatch(goals.longTerm, /Finish your Abitur/);
  assert.ok(goals.monthly.every(goal => goal.category !== 'academics'));
  state = saveExam(state, { id: 'further-exam', title: 'Physics assessment', subjectId: 'physics', date: shiftDate(TODAY, 5) });
  const withExam = getDailyPlan(state, TODAY);
  assert.equal(withExam.tasks[0].examId, 'further-exam');
  assert.ok(withExam.tasks.every(task => task.subjectId !== 'mathematics'));
  assert.ok(getGoals(state, TODAY).monthly.some(goal => goal.category === 'academics' && goal.title.includes('Physics assessment')));
});

test('long-term goals become monthly and weekly actions with actual completion progress', () => {
  let state = ensureDailyPlan(personal(), TODAY);
  const first = state.tasks.find(task => task.date === TODAY);
  const before = getGoals(state, TODAY);
  assert.match(before.longTerm, /2028.*USA \+ Germany/);
  assert.equal(before.monthly.length, 5);
  assert.equal(before.weekly.length, 5);
  assert.ok(before.weekly.every(goal => goal.progress === 0));
  state = toggleTask(state, first.id, new Date(`${TODAY}T12:00:00`));
  const after = getGoals(state, TODAY);
  assert.ok(after.weekly.find(goal => goal.category === first.category).progress > 0);
  assert.ok(after.monthly.find(goal => goal.category === first.category).progress > 0);
  const chain = getDailyPlan(state, TODAY).goalChain;
  assert.ok(chain.longTerm && chain.monthly && chain.weekly);
});

test('the entire university coaching chain is causal: profile, roadmap, day, completion, missed work and a new exam', () => {
  let state = saveProfile(personal(), { pathways: ['USA'], targetFields: ['Computer Science'], graduationYear: '2028' });
  state = { ...state, subjects: state.subjects.map(subject => ({ ...subject, enabled: false })) };
  state = saveActivity(state, { id: 'restaurant', name: 'Restaurant management', startDate: '2026-01-01', responsibilities: 'Manage a weekly shift', hoursPerWeek: 4, weeksPerYear: 40 });
  state = ensureDailyPlan(budget(state, 120), TODAY);
  const day = getDailyPlan(state, TODAY);
  const action = day.tasks.find(task => task.category === 'university' && task.roadmapStepId);
  assert.ok(action && action.linkedGoal.startsWith('USA'));
  const goals = getGoals(state, TODAY);
  assert.equal(goals.yearly.length, 1);
  assert.equal(goals.semester.length, 1);
  assert.ok(goals.yearly[0].roadmapItemIds.includes(action.roadmapItemId));
  assert.ok(goals.monthly.some(goal => goal.roadmapItemIds.includes(action.roadmapItemId)));
  assert.ok(goals.weekly.some(goal => goal.roadmapItemIds.includes(action.roadmapItemId)));
  assert.ok(day.goalChain.yearly && day.goalChain.semester);
  const taskIds = day.tasks.map(task => task.id);
  const oldItem = getRoadmap(state, 'USA', TODAY).flatMap(phase => phase.items).find(item => item.id === action.roadmapItemId);
  state = toggleTask(state, action.id, `${TODAY}T12:00:00Z`);
  state = ensureDailyPlan(state, TODAY);
  assert.deepEqual(getDailyPlan(state, TODAY).tasks.map(task => task.id), taskIds, 'Completing one action must not fill today with the next step');
  const afterItem = getRoadmap(state, 'USA', TODAY).flatMap(phase => phase.items).find(item => item.id === action.roadmapItemId);
  assert.equal(afterItem.completedSteps, oldItem.completedSteps + 1);
  assert.equal(afterItem.confirmed, false);
  assert.ok(getProgress(state, TODAY).roadmap.USA.actionProgress > 0);
  assert.equal(getProgress(state, TODAY).roadmap.USA.completed, 0);
  assert.ok(getGoals(state, TODAY).yearly[0].progress > goals.yearly[0].progress);
  assert.ok(getGoals(state, TODAY).monthly.find(goal => goal.category === 'university').progress > 0);
  const tomorrow = shiftDate(TODAY, 1);
  state = ensureDailyPlan(state, tomorrow);
  const fresh = getDailyPlan(state, tomorrow);
  assert.ok(fresh.tasks.length <= 5);
  assert.ok(fresh.tasks.every(task => !taskIds.includes(task.id)));
  assert.ok(fresh.tasks.every(task => task.roadmapStepId !== action.roadmapStepId));
  assert.match(fresh.adjustment, /fresh plan.*backlog/);
  state = saveSubject(state, { id: 'english', enabled: true, written: 7, oral: 9, target: 11, weakTopics: ['Analysis'] });
  state = saveExam(state, { id: 'new-klausur', subjectId: 'english', title: 'English Klausur', date: shiftDate(tomorrow, 12), createdDate: tomorrow, topics: ['American Dream', 'Analysis'], format: 'written' });
  state = ensureDailyPlan(state, tomorrow);
  const revision = getDailyPlan(state, tomorrow).tasks[0];
  assert.equal(revision.examId, 'new-klausur');
  assert.equal(revision.eventId, 'exam:new-klausur');
  assert.ok(revision.revisionPlanId && revision.linkedGoal);
  assert.equal(getProgress(state, tomorrow).exams[0].readiness, 0);
  assert.equal(state.tasks.find(task => task.id === action.id).completed, true);
  assert.equal(getRoadmap(state, 'USA', tomorrow).flatMap(phase => phase.items).find(item => item.id === action.roadmapItemId).completedSteps, afterItem.completedSteps);
});

test('a 45-minute day protects the weakest written subject; a three-hour day expands the focused work', () => {
  let state = saveSubject(personal(), { id: 'mathematics', written: 5, oral: 15, target: 10, weakTopics: ['Integration'] });
  state = saveSubject(state, { id: 'physics', written: 10, oral: 10, target: 10 });
  const short = getDailyPlan(budget(state, 45), TODAY);
  const long = getDailyPlan(budget(state, 180), TODAY);
  assert.equal(short.tasks[0].subjectId, 'mathematics');
  assert.match(short.tasks[0].title, /Integration/);
  assert.equal(short.tasks.length, 3);
  assert.equal(short.plannedMinutes, 45);
  assert.equal(long.tasks.length, 5);
  assert.ok(long.plannedMinutes >= 150);
  assert.ok(long.plannedMinutes <= 180);
  assert.ok(long.tasks[0].minutes > short.tasks[0].minutes);
  assert.ok(short.tasks.every(task => task.linkedGoal && task.roadmapItemId));
});

test('a project deadline and internship preparation join the same priority system as school exams', () => {
  let state = saveEvent(personal(), { id: 'project', title: 'Restaurant marketing results', type: 'project', intent: 'deadline', date: shiftDate(TODAY, 2), minutes: 30, pathway: 'USA', priority: 'high' });
  state = saveEvent(state, { id: 'internship', title: 'Technology internship', type: 'internship', date: shiftDate(TODAY, 10), minutes: 20, pathway: 'Both' });
  const day = getDailyPlan(state, TODAY);
  assert.equal(day.tasks[0].eventId, 'custom:project');
  assert.ok(day.tasks[0].linkedGoal);
  assert.ok(day.tasks.some(task => task.eventId === 'custom:internship'));
  const germany = getDailyPlan(saveProfile(state, { pathways: ['Germany'] }), TODAY);
  assert.ok(germany.tasks.every(task => task.eventId !== 'custom:project'));
  assert.ok(germany.tasks.every(task => !task.roadmapItemId.startsWith('USA-')));
});

test('prior week performance restarts the neglected subject rather than carrying an overdue stack', () => {
  let state = personal();
  state = addTask(state, { id: 'german-1', date: '2026-10-05', title: 'German argumentation', category: 'language', subjectId: 'german', minutes: 25 });
  state = addTask(state, { id: 'german-2', date: '2026-10-07', title: 'German grammar', category: 'language', subjectId: 'german', minutes: 25 });
  const monday = getDailyPlan(state, '2026-10-12');
  assert.equal(monday.tasks[0].subjectId, 'german');
  assert.equal(monday.tasks[0].minutes, 20);
  assert.match(monday.tasks[0].reason, /smaller restart/);
  assert.ok(monday.tasks.length <= 5);
  assert.ok(monday.tasks.every(task => !['german-1', 'german-2'].includes(task.id)));
});

test('saving a review recalculates an already previewed next week while preserving finished work', () => {
  const monday = '2026-10-12';
  let state = ensureDailyPlan(budget(personal(), 120, monday), monday, TODAY);
  const before = getDailyPlan(state, monday, TODAY);
  state = saveWeeklyReview(state, { weekStart: '2026-10-05', focusSubjectId: 'english', effort: 'lighter' });
  state = ensureDailyPlan(state, monday, TODAY);
  const after = getDailyPlan(state, monday, TODAY);
  assert.ok(after.plannedMinutes < before.plannedMinutes);
  assert.equal(after.tasks[0].subjectId, 'english');
  assert.ok(after.tasks[0].reason.includes('weekly review'));
  assert.notEqual(after.tasks[0].planSignature, before.tasks[0].planSignature);
  assert.equal(getProgress(state, TODAY).weekly.completed, 0, 'Previewing and recalculating next week is not completed work');
});

test('achievement maintenance is periodic and real profile edits defer it', () => {
  let state = saveActivity(personal(), { id: 'restaurant', name: 'Restaurant management', responsibilities: 'Manage a shift', achievements: 'Trained a new colleague', impact: 'Reduced closing time by 10 minutes', updatedDate: shiftDate(TODAY, -8) });
  const quiet = { ...state, subjects: state.subjects.map(subject => ({ ...subject, enabled: false })), roadmapCompleted: state.profile.pathways.flatMap(path => getRoadmap(state, path, TODAY).flatMap(phase => phase.items.map(item => item.id))) };
  state = ensureDailyPlan(quiet, TODAY);
  const maintenance = state.tasks.find(task => task.id.includes('activity-impact-restaurant'));
  assert.ok(maintenance);
  state = toggleTask(state, maintenance.id, `${TODAY}T12:00:00Z`);
  assert.ok(getDailyPlan(state, shiftDate(TODAY, 1)).tasks.every(task => !task.id.includes('activity-impact-restaurant')));
  assert.ok(getDailyPlan(state, shiftDate(TODAY, 7)).tasks.some(task => task.id.includes('activity-impact-restaurant')));
  state = saveActivity(state, { id: 'restaurant', updatedDate: shiftDate(TODAY, 7), notes: 'Updated the real outcome.' });
  assert.ok(getDailyPlan(state, shiftDate(TODAY, 8)).tasks.every(task => !task.id.includes('activity-impact-restaurant')));
});

test('unrelated custom completed work does not pretend to advance a specific university milestone', () => {
  let state = personal();
  state = addTask(state, { id: 'unrelated', title: 'Read general news', date: TODAY, category: 'university', minutes: 10 });
  state = toggleTask(state, 'unrelated', `${TODAY}T12:00:00Z`);
  const goals = getGoals(state, TODAY);
  assert.equal(goals.monthly.find(goal => goal.category === 'university').progress, 0);
  assert.equal(getProgress(state, TODAY).roadmap.USA.actionsCompleted, 0);
  assert.equal(getProgress(state, TODAY).weekly.completed, 1);
});

test('finishing and confirming a roadmap milestone preserves its earned monthly and weekly progress', () => {
  let state = saveProfile(personal(), { pathways: ['USA'] });
  const items = getRoadmap(state, 'USA', TODAY).flatMap(phase => phase.items);
  const baseline = items.find(item => item.id === 'USA-now-baseline');
  const research = items.find(item => item.id === 'USA-now-list');
  for (const item of [baseline, research]) for (const action of item.steps) {
    const id = `recorded-${action.id}`;
    state = addTask(state, { id, title: action.title, date: TODAY, category: item.category === 'grades' ? 'academics' : 'university', minutes: action.minutes, roadmapItemId: item.id, roadmapStepId: action.id, goalId: item.goalId });
    state = toggleTask(state, id, `${TODAY}T12:00:00Z`);
  }
  const completed = getGoals(state, TODAY);
  for (const period of ['monthly', 'weekly']) {
    const academic = completed[period].find(goal => goal.category === 'academics');
    const university = completed[period].find(goal => goal.category === 'university');
    assert.ok(academic.roadmapItemIds.includes(baseline.id));
    assert.ok(university.roadmapItemIds.includes(research.id));
    assert.equal(university.completed, 2);
    assert.ok(university.progress > 0);
  }
  state = toggleRoadmapItem(toggleRoadmapItem(state, baseline.id), research.id);
  const confirmed = getGoals(state, TODAY);
  for (const period of ['monthly', 'weekly']) for (const category of ['academics', 'university']) {
    const before = completed[period].find(goal => goal.category === category);
    const after = confirmed[period].find(goal => goal.category === category);
    assert.equal(after.completed, before.completed);
    assert.equal(after.progress, before.progress);
    assert.ok(after.roadmapItemIds.includes(category === 'academics' ? baseline.id : research.id));
  }
});

test('a scheduled language-test rehearsal split by fixed activities is labelled section practice', () => {
  let state = saveProfile(personal(), { testPlans: [{ id: 'ielts', name: 'IELTS', status: 'Preparing', targetDate: shiftDate(TODAY, 7) }] });
  state = saveSchedule(state, { weekly: state.schedule.weekly.map(day => day.day === 4 ? { ...day, minutes: 60, windowStart: '16:00', windowEnd: '17:00' } : day), fixedActivities: [{ id: 'appointment', title: 'Appointment', days: [4], start: '16:20', end: '16:40' }] });
  state = ensureDailyPlan(state, TODAY);
  const task = getDailyPlan(state, TODAY).tasks.find(item => item.eventStage === 'rehearsal');
  assert.equal(task.minutes, 30);
  assert.equal(task.sessions.length, 2);
  assert.match(task.title, /part of a timed test section/);
  assert.ok(task.steps.some(value => value.includes('one uninterrupted 30-minute session')));
  state = toggleTask(state, task.id, `${TODAY}T12:00:00Z`);
  const stage = getEventPlan(state, task.eventId, shiftDate(TODAY, 1)).find(item => item.stage === 'rehearsal');
  assert.equal(stage.completed, false);
  assert.equal(stage.remainingMinutes, 30);
});

test('subject practice links to improving results and writing rather than the profile-setup milestone', () => {
  let state = saveProfile(personal(), { pathways: ['USA'] });
  state = saveSubject(state, { id: 'mathematics', written: 6, oral: 11, target: 10, weakTopics: ['Integration'] });
  const normal = getDailyPlan(state, TODAY).tasks.find(task => task.subjectId === 'mathematics');
  assert.equal(normal.roadmapItemId, 'USA-q1-grades');
  assert.match(normal.linkedGoal, /Improve written.*grades/);
  assert.match(normal.reason, /Written 6 points; oral 11 points/);
  assert.match(normal.reason, /written result needs improvement toward 10/);
  assert.equal(normal.roadmapStepId, '', 'Practising a topic is not evidence that a separate feedback action happened');
  state = saveExam(state, { id: 'english-purpose', title: 'English Klausur', subjectId: 'english', date: shiftDate(TODAY, 12), topics: ['Analysis'] });
  const exam = getDailyPlan(state, TODAY).tasks.find(task => task.examId === 'english-purpose');
  assert.equal(exam.roadmapItemId, 'USA-q1-english');
  assert.match(exam.linkedGoal, /Improve English writing and exam performance/);
  const german = getDailyPlan(state, TODAY).tasks.find(task => task.subjectId === 'german');
  if (german) assert.equal(german.roadmapItemId, 'USA-q1-german');
  const baseline = getRoadmap(state, 'USA', TODAY).flatMap(phase => phase.items).find(item => item.id === 'USA-now-baseline');
  assert.match(baseline.steps[0].title, /Record written and oral points/);
  assert.equal(baseline.confirmed, false);
  assert.equal(getProgress(state, TODAY).roadmap.USA.completed, 0);
});

test('English exams belong to language goals and mathematics completion cannot advance their period progress', () => {
  let state = saveExam(personal(), { id: 'english-goal', title: 'English Klausur', subjectId: 'english', date: shiftDate(TODAY, 12), topics: ['Analysis'] });
  state = saveSubject(state, { id: 'mathematics', written: 6, oral: 11, target: 10, weakTopics: ['Integration'] });
  state = ensureDailyPlan(state, TODAY);
  const goals = getGoals(state, TODAY);
  assert.match(goals.monthly.find(goal => goal.category === 'language').title, /English Klausur/);
  assert.doesNotMatch(goals.monthly.find(goal => goal.category === 'academics').title, /English Klausur/);
  const math = state.tasks.find(task => task.subjectId === 'mathematics');
  state = toggleTask(state, math.id, `${TODAY}T12:00:00Z`);
  assert.equal(getGoals(state, TODAY).monthly.find(goal => goal.category === 'language').progress, 0);
  assert.ok(getGoals(state, TODAY).monthly.find(goal => goal.category === 'academics').progress > 0);
  state = saveExam(state, { id: 'math-goal', title: 'Mathematics Klausur', subjectId: 'mathematics', date: shiftDate(TODAY, 15) });
  assert.match(getGoals(state, TODAY).monthly.find(goal => goal.category === 'academics').title, /Mathematics Klausur/);
});

test('the planner revision upgrades old cached parent links while preserving completed and active work', () => {
  let state = ensureDailyPlan(personal(), TODAY);
  // Saved fingerprint from this exact personal profile before the explicit
  // planner revision was added. Inputs have not changed during the upgrade.
  const oldSignature = 'd2353cef-925dd1ff';
  state.tasks = state.tasks.map(task => ({ ...task, planSignature: oldSignature, roadmapItemId: 'USA-now-baseline', linkedGoal: 'USA · Record grades and weak topics' }));
  const completedTask = state.tasks[0];
  const activeTask = state.tasks[1];
  const remaining = state.tasks.find(task => task.subjectId === 'english');
  state = saveTaskNotes(state, remaining.id, 'Keep my unfinished paragraph notes.');
  state = toggleTask(state, completedTask.id, `${TODAY}T12:00:00Z`);
  state = startStudy(state, activeTask, `${TODAY}T12:10:00Z`);
  const retainedCompleted = state.tasks.find(task => task.id === completedTask.id);
  const retainedActive = state.tasks.find(task => task.id === activeTask.id);
  state = ensureDailyPlan(state, TODAY);
  const upgraded = state.tasks.find(task => task.id === remaining.id);
  assert.notEqual(upgraded.planSignature, oldSignature);
  assert.equal(upgraded.roadmapItemId, 'USA-q1-english');
  assert.match(upgraded.linkedGoal, /English writing and exam performance/);
  assert.equal(upgraded.notes, 'Keep my unfinished paragraph notes.');
  assert.equal(state.tasks.find(task => task.id === completedTask.id).completedAt, retainedCompleted.completedAt);
  assert.equal(state.tasks.find(task => task.id === completedTask.id).linkedGoal, retainedCompleted.linkedGoal);
  assert.equal(state.tasks.find(task => task.id === activeTask.id).linkedGoal, retainedActive.linkedGoal);
  assert.equal(state.study.active.taskId, activeTask.id);
});

test('normalization rejects invalid dates / duplicate IDs and unverifiable completions', () => {
  const initial = personal();
  const state = normalizeData({ ...initial, tasks: [
    { id: 'a', title: 'Valid', date: TODAY, completed: true, completedAt: null },
    { id: 'b', title: 'Impossible', date: '2026-02-30' },
    { id: 'a', title: 'Duplicate', date: TODAY },
  ], grades: [{ id: 'g', subjectId: 'english', points: 16, date: TODAY }] }, TODAY);
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].completed, false);
  assert.equal(state.tasks[0].completedAt, null);
  assert.equal(state.grades.length, 0);
});

test('legacy migration preserves custom subjects, real tasks, zero grades, reflections and milestone achievements', () => {
  const legacy = {
    version: 1, profile: { schoolYear: 'Grade 12', subjects: 'Biology, English', major: 'Biology', gradeGoal: 'Reach 11 points', dailyMinutes: 45 },
    tasks: [{ id: 'old-task', title: 'Real completed work', category: 'languages', date: TODAY, minutes: 20, completed: true, completedAt: new Date(`${TODAY}T12:00:00`).toISOString() }],
    grades: [{ id: 'biology-zero', subject: 'Biology', points: 0, date: TODAY, note: 'Actual result' }],
    reflections: [{ date: TODAY, achieved: 'My actual reflection' }],
    milestones: [{ id: 'academic-baseline', title: 'Know your starting point', completed: true }],
  };
  const state = migrateLegacy(legacy, TODAY);
  assert.equal(state.demo, false);
  assert.equal(state.onboardingCompleted, true);
  assert.equal(state.profile.schoolYear, 'Q1');
  assert.deepEqual(state.profile.targetFields, ['Biology']);
  assert.equal(state.profile.academicGoalNotes, 'Reach 11 points');
  assert.ok(state.subjects.some(subject => subject.name === 'Biology'));
  assert.equal(state.grades[0].points, 0);
  assert.equal(state.subjects.find(subject => subject.name === 'Biology').written, 0);
  assert.equal(state.subjects.find(subject => subject.name === 'Biology').baselineWritten, null);
  assert.equal(state.tasks[0].completed, true);
  assert.equal(state.tasks[0].category, 'language');
  assert.equal(state.tasks[0].origin, 'custom');
  assert.equal(state.reflections[0].achieved, 'My actual reflection');
  assert.equal(state.legacyMilestones[0].completed, true);
  assert.ok(state.roadmapCompleted.includes('USA-now-baseline'));
  assert.ok(state.schedule.weekly.every(day => day.minutes === 45));
});

test('activity fields are optional, unsafe resource URLs rejected and deleted exams keep historical completions', () => {
  let state = saveActivity(personal(), { id: 'volley', name: 'Volleyball' });
  assert.equal(state.activities[0].hoursPerWeek, null);
  assert.equal(state.activities[0].weeksPerYear, null);
  state = saveUniversity(state, { id: 'unsafe', name: 'Saved target', url: 'javascript:alert(1)' });
  assert.equal(state.universities.find(university => university.id === 'unsafe').url, '');
  state = saveExam(state, { id: 'exam', title: 'English', subjectId: 'english', date: shiftDate(TODAY, 5) });
  state = ensureDailyPlan(state, TODAY);
  const task = state.tasks.find(task => task.examId === 'exam');
  state = toggleTask(state, task.id, new Date(`${TODAY}T12:00:00`));
  state = removeExam(state, 'exam');
  assert.equal(state.exams.length, 0);
  assert.equal(state.tasks.find(item => item.id === task.id).completed, true);
});

test('completion day and revision intervals respect device timezone and daylight-saving calendar dates', () => {
  const moduleURL = new URL('./coach.js', import.meta.url).href;
  const script = `
    import {createInitialData,addTask,toggleTask,getWeeklyReview,shiftDate,localDateKey} from ${JSON.stringify(moduleURL)};
    const instant = new Date('2026-10-05T00:30:00Z');
    let state=createInitialData({today:'2026-10-05',demo:false});
    state=addTask(state,{title:'Actual work',date:'2026-10-05',minutes:15,category:'academics'});
    state=toggleTask(state,state.tasks[0].id,instant);
    process.stdout.write(JSON.stringify({key:localDateKey(instant),previous:getWeeklyReview(state,'2026-10-04').completed,next:getWeeklyReview(state,'2026-10-05').completed,dst:shiftDate('2026-11-01',1)}));
  `;
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: 'America/Los_Angeles' }, encoding: 'utf8' }));
  assert.deepEqual(result, { key: '2026-10-04', previous: 1, next: 0, dst: '2026-11-02' });
});
