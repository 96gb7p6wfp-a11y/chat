import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventCandidates, getEventPlan, getUpcomingEvents, normalizeEvents, removeEvent, saveEvent } from './events.js';

const TODAY = '2026-10-09';
function personal() { return { createdDate: '2026-09-01', profile: { pathways: ['USA', 'Germany'], testPlans: [] }, exams: [], universities: [], events: [], tasks: [] }; }
function custom(values = {}) { return { id: 'project', title: 'Restaurant marketing project', type: 'project', date: '2026-10-11', pathway: 'Both', minutes: 25, priority: 'high', status: 'planned', notes: 'Publish the campaign and measure bookings.', ...values }; }

test('one dated agenda aggregates canonical exams, tests, deadlines and personal milestones without duplicating IDs', () => {
  const state = personal();
  state.exams = [{ id: 'same', title: 'English Klausur', subjectId: 'english', date: '2026-10-26', topics: ['Analysis'] }];
  state.profile.testPlans = [{ id: 'same', name: 'IELTS', status: 'Booked', targetDate: '2026-11-01' }];
  state.universities = [{ id: 'same', name: 'UCLA', country: 'USA', deadline: '2027-11-30', status: 'shortlisted', url: 'https://admission.ucla.edu/' }];
  state.events = [custom({ id: 'same' })];
  const before = structuredClone(state);
  const agenda = getUpcomingEvents(state, TODAY);
  assert.deepEqual(agenda.map(event => event.id), ['custom:same', 'exam:same', 'test:same', 'university:same']);
  assert.deepEqual(agenda.map(event => event.daysUntil), [2, 17, 23, 417]);
  assert.equal(agenda[1].subjectId, 'english');
  assert.equal(agenda[2].preparationStatus, 'Booked');
  assert.equal(agenda[3].resource, 'https://admission.ucla.edu/');
  assert.deepEqual(state, before);
});

test('upcoming defaults omit past and completed entries, with explicit history and pathway filters', () => {
  const state = personal();
  state.events = [custom({ id: 'past', date: '2026-10-08' }), custom({ id: 'done', status: 'completed' }), custom({ id: 'us', pathway: 'USA' }), custom({ id: 'de', pathway: 'Germany' })];
  assert.equal(getUpcomingEvents(state, TODAY).length, 2);
  assert.equal(getUpcomingEvents(state, TODAY, { includePast: true, includeCompleted: true }).length, 4);
  assert.deepEqual(getUpcomingEvents(state, TODAY, { pathway: 'Germany' }).map(event => event.id), ['custom:de']);
});

test('optional tests under consideration produce a decision reminder, never automatic test preparation', () => {
  const state = personal();
  state.profile.testPlans = [{ id: 'sat', name: 'SAT', status: 'Considering', targetDate: '2026-10-12' }];
  const agenda = getUpcomingEvents(state, TODAY);
  assert.equal(agenda[0].title, 'SAT: requirement decision');
  assert.deepEqual(getEventPlan(state, 'test:sat', TODAY), []);
  const candidates = getEventCandidates(state, TODAY);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].eventStage, 'research');
  assert.match(candidates[0].reason, /UC does not consider SAT\/ACT/);
  assert.ok(!candidates[0].title.startsWith('SAT:'));
  state.profile.pathways = ['Germany'];
  assert.deepEqual(getEventCandidates(state, TODAY), []);
});

test('booked test preparation escalates by date and completed or unnecessary tests never generate actions', () => {
  const state = personal();
  state.profile.testPlans = [{ id: 'test', name: 'IELTS', status: 'bOoKeD', targetDate: '2026-10-13' }];
  const near = getEventCandidates(state, TODAY)[0];
  assert.equal(near.eventStage, 'rehearsal');
  assert.match(near.title, /^IELTS:/);
  assert.equal(near.category, 'language');
  assert.match(near.resource, /^https:\/\/ielts.org/);
  const earlier = getEventCandidates(state, '2026-09-15')[0];
  assert.equal(earlier.eventStage, 'baseline');
  assert.ok(near.score > earlier.score);
  for (const status of ['Completed', 'Not needed', 'NOT-NEEDED']) {
    state.profile.testPlans[0].status = status;
    assert.deepEqual(getEventCandidates(state, TODAY), []);
    assert.deepEqual(getUpcomingEvents(state, TODAY), []);
  }
});

test('custom project preparation changes with proximity and never carries every missed phase into today', () => {
  const state = saveEvent(personal(), custom({ date: '2026-11-06' }));
  const early = getEventCandidates(state, TODAY);
  assert.equal(early.length, 1);
  assert.equal(early[0].eventStage, 'scope');
  assert.equal(early[0].goalId, 'activities');
  const near = getEventCandidates(state, '2026-11-04');
  assert.equal(near.length, 1);
  assert.equal(near[0].eventStage, 'check');
  assert.ok(near[0].score > early[0].score);
  assert.equal(near[0].priority, 'high');
  assert.deepEqual(getEventCandidates(state, '2026-11-07'), []);
});

test('internship dates distinguish starting the role from submitting an application', () => {
  let state = saveEvent(personal(), custom({ type: 'internship', title: 'Engineering internship' }));
  let candidate = getEventCandidates(state, TODAY)[0];
  assert.match(candidate.title, /start-day plan/);
  assert.match(candidate.reason, /starts in 2 days/);
  assert.ok(candidate.steps.every(step => !/submit|application checklist/i.test(step)));
  state = saveEvent(state, { id: 'project', intent: 'deadline' });
  candidate = getEventCandidates(state, TODAY)[0];
  assert.match(candidate.title, /internship application/);
  assert.match(candidate.steps[0], /application checklist/);
});

test('late-added milestones compress preparation from their creation date without inventing past work', () => {
  const state = saveEvent(personal(), custom({ createdDate: TODAY }));
  const plan = getEventPlan(state, 'custom:project', TODAY);
  assert.ok(plan.length >= 3);
  assert.ok(plan.every(stage => stage.date >= TODAY));
  assert.ok(plan.every(stage => !stage.completed));
  assert.equal(getEventCandidates(state, TODAY).length, 1);
});

test('partial task completion advances a milestone only after the full preparation duration is recorded', () => {
  const state = saveEvent(personal(), custom());
  state.tasks = [{ id: 'part-one', date: '2026-10-08', eventId: 'custom:project', eventStage: 'check', minutes: 5, completed: true }];
  let stage = getEventPlan(state, 'custom:project', TODAY).find(item => item.stage === 'check');
  assert.equal(stage.completed, false);
  assert.equal(stage.remainingMinutes, 20);
  assert.equal(getEventCandidates(state, TODAY)[0].minutes, 20);
  state.tasks.push({ id: 'part-two', date: TODAY, eventId: 'custom:project', eventStage: 'check', minutes: 20, completed: true });
  stage = getEventPlan(state, 'custom:project', TODAY).find(item => item.stage === 'check');
  assert.equal(stage.completed, true);
  // Display progress now, but avoid replacing the current day's plan instantly.
  assert.equal(getEventCandidates(state, TODAY)[0].eventStage, 'check');
  assert.deepEqual(getEventCandidates(state, '2026-10-10'), []);
  // Earlier missed phases do not reappear after the current phase is complete.
  assert.equal(getEventCandidates(state, '2026-10-11')[0].eventStage, 'today');
});

test('overdue preparation completed today updates visible progress without silently changing today’s next action', () => {
  const state = saveEvent(personal(), custom());
  state.tasks = [{ id: 'overdue', date: '2026-10-08', completedAt: `${TODAY}T12:00:00Z`, eventId: 'custom:project', eventStage: 'check', minutes: 25, completed: true }];
  assert.equal(getEventPlan(state, 'custom:project', TODAY).find(stage => stage.stage === 'check').completed, true);
  assert.equal(getEventCandidates(state, TODAY)[0].eventStage, 'check');
  assert.deepEqual(getEventCandidates(state, '2026-10-10'), []);
});

test('partial or split timed test attempts remain practice until one full uninterrupted rehearsal is complete', () => {
  const state = personal();
  state.profile.testPlans = [{ id: 'ielts', name: 'IELTS', status: 'Booked', targetDate: '2026-10-13' }];
  state.tasks = [
    { id: 'short', eventId: 'test:ielts', eventStage: 'rehearsal', date: '2026-10-07', minutes: 5, completed: true, sessions: [{ start: '16:00', end: '16:05' }] },
    { id: 'split', eventId: 'test:ielts', eventStage: 'rehearsal', date: '2026-10-08', minutes: 30, completed: true, sessions: [{ start: '16:00', end: '16:15' }, { start: '18:00', end: '18:15' }] },
    { id: 'partial', eventId: 'test:ielts', eventStage: 'rehearsal', date: '2026-10-08', minutes: 25, completed: true, sessions: [{ start: '18:30', end: '18:55' }] },
  ];
  let stage = getEventPlan(state, 'test:ielts', TODAY).find(item => item.stage === 'rehearsal');
  assert.equal(stage.practiceMinutes, 60);
  assert.equal(stage.completedMinutes, 25);
  assert.equal(stage.completed, false);
  assert.equal(stage.remainingMinutes, 30);
  assert.equal(stage.requiresContiguous, true);
  assert.equal(getEventCandidates(state, TODAY)[0].minutes, 30);
  state.tasks.push({ id: 'full', eventId: 'test:ielts', eventStage: 'rehearsal', date: TODAY, minutes: 30, completed: true, sessions: [{ start: '16:00', end: '16:30' }] });
  stage = getEventPlan(state, 'test:ielts', TODAY).find(item => item.stage === 'rehearsal');
  assert.equal(stage.completed, true);
  assert.equal(stage.completedMinutes, 30);
  assert.equal(stage.remainingMinutes, 0);
});

test('saved university deadlines use official links and selected pathways, then stop after actual submission', () => {
  const state = personal();
  state.universities = [{ id: 'ucla', name: 'UCLA', country: 'USA', deadline: '2026-10-13', status: 'shortlisted', url: 'https://admission.ucla.edu/' }];
  const candidate = getEventCandidates(state, TODAY)[0];
  assert.match(candidate.reason, /deadline is in 4 days/);
  assert.equal(candidate.goalId, 'applications');
  assert.equal(candidate.eventId, 'university:ucla');
  state.profile.pathways = ['Germany'];
  assert.deepEqual(getEventCandidates(state, TODAY), []);
  state.profile.pathways = ['USA'];
  state.universities[0].status = 'applied';
  assert.deepEqual(getEventCandidates(state, TODAY), []);
});

test('event CRUD is pure, retains independent history, and completed or postponed milestones remove urgency', () => {
  const original = personal();
  original.tasks = [{ id: 'history', date: '2026-10-08', completed: true, eventId: 'custom:project' }];
  const added = saveEvent(original, custom());
  assert.equal(original.events.length, 0);
  const postponed = saveEvent(added, { id: 'project', date: '2027-01-01' });
  assert.deepEqual(getEventCandidates(postponed, TODAY), []);
  const completed = saveEvent(added, { id: 'project', status: 'completed' });
  assert.deepEqual(getEventCandidates(completed, TODAY), []);
  const removed = removeEvent(completed, 'project');
  assert.deepEqual(removed.events, []);
  assert.deepEqual(removed.tasks, original.tasks);
});

test('invalid input fails with actionable errors while normalization removes corrupt optional records', () => {
  for (const values of [{ title: '' }, { date: '2027-02-29' }, { endDate: '2026-10-01' }, { resource: 'javascript:alert(1)' }]) {
    assert.throws(() => saveEvent(personal(), custom(values)), /title|date|address/i);
  }
  const normalized = normalizeEvents([custom(), custom(), custom({ id: 'invalid', date: '2026-02-30' }), null]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].intent, 'deadline');
  assert.deepEqual(normalizeEvents(undefined), []);
});

test('calendar distance stays correct across DST and long source IDs yield bounded deterministic task keys', () => {
  const state = saveEvent(personal(), custom({ date: '2026-10-26', id: 'x'.repeat(200) }));
  const agenda = getUpcomingEvents(state, '2026-10-24');
  assert.equal(agenda[0].daysUntil, 2);
  const first = getEventCandidates(state, TODAY)[0];
  assert.ok(first.key.length < 170);
  assert.equal(first.key, getEventCandidates(state, TODAY)[0].key);
  assert.equal(first.eventId, `custom:${'x'.repeat(200)}`);
});
