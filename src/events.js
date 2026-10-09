/**
 * One calendar view over canonical exams, tests and university records plus
 * personal milestones. Calendar entries do not duplicate their source data.
 * Event minutes describe a preparation action, never the duration of an event.
 */
export const EVENT_TYPES = ['internship', 'project', 'application', 'university', 'test', 'appointment'];
export const EVENT_PATHWAYS = ['USA', 'Germany', 'Both'];
export const EVENT_INTENTS = ['deadline', 'start', 'milestone'];
const DAY = 86400000;
const string = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const records = value => Array.isArray(value) ? value.slice(0, 10000) : [];
const identifier = () => `event-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
const standardizedTest = name => /\b(?:sat|act)\b/i.test(name);

function candidateId(value) {
  if (value.length <= 110) return value;
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return `${value.slice(0, 85)}-${hash.toString(36)}`;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 2200 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
function calendarNumber(date) {
  if (!validDate(date)) throw new TypeError('A real YYYY-MM-DD calendar date is required.');
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY;
}
function completionDate(task) {
  if (typeof task.completedAt === 'string') {
    const date = new Date(task.completedAt);
    if (Number.isFinite(date.getTime())) return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  return validDate(task.date) ? task.date : '';
}
function shiftDate(date, days) { return new Date((calendarNumber(date) + days) * DAY).toISOString().slice(0, 10); }
function webURL(value) {
  const url = string(value, 1000);
  if (!url) return '';
  try { return ['http:', 'https:'].includes(new URL(url).protocol) ? url : ''; } catch { return ''; }
}
function intentFor(type) { return type === 'internship' ? 'start' : ['project', 'application', 'university'].includes(type) ? 'deadline' : 'milestone'; }
function normalizeEvent(event) {
  if (!event || typeof event !== 'object' || !string(event.id, 200) || !string(event.title, 300) || !validDate(event.date)) return null;
  const type = EVENT_TYPES.includes(event.type) ? event.type : 'project';
  const minutes = Number(event.minutes);
  const endDate = validDate(event.endDate) && event.endDate >= event.date ? event.endDate : '';
  return {
    id: string(event.id, 200), title: string(event.title, 300), type, date: event.date, endDate,
    ...(validDate(event.createdDate) ? { createdDate: event.createdDate } : {}),
    intent: EVENT_INTENTS.includes(event.intent) ? event.intent : intentFor(type),
    pathway: EVENT_PATHWAYS.includes(event.pathway) ? event.pathway : 'Both',
    minutes: Number.isFinite(minutes) && event.minutes !== '' && event.minutes !== null ? Math.max(5, Math.min(120, Math.round(minutes))) : 20,
    priority: ['high', 'medium', 'low'].includes(event.priority) ? event.priority : 'medium',
    status: event.status === 'completed' ? 'completed' : 'planned', notes: string(event.notes, 4000),
    goalId: string(event.goalId, 200), resource: webURL(event.resource),
  };
}

/** Optional new state data: old v2 installations simply have no custom events. */
export function normalizeEvents(value) {
  const seen = new Set();
  return records(value).map(normalizeEvent).filter(event => {
    if (!event || seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}

export function saveEvent(state, value) {
  const id = string(value?.id, 200) || identifier();
  const existing = records(state.events).find(event => event.id === id);
  const input = { ...existing, ...value, id };
  if (!string(input.title, 300)) throw new TypeError('Give the event a title.');
  if (!validDate(input.date)) throw new TypeError('Choose a valid event date.');
  if (input.endDate && (!validDate(input.endDate) || input.endDate < input.date)) throw new TypeError('The end date must be on or after the event date.');
  if (input.resource && !webURL(input.resource)) throw new TypeError('Use a full HTTP or HTTPS resource address.');
  const event = normalizeEvent(input);
  return { ...state, events: [...normalizeEvents(state.events).filter(item => item.id !== id), event] };
}

export function removeEvent(state, id) { return { ...state, events: normalizeEvents(state.events).filter(event => event.id !== id) }; }

function testResource(name) {
  if (/ielts/i.test(name)) return 'https://ielts.org/take-a-test/preparation-resources';
  if (/toefl/i.test(name)) return 'https://www.ets.org/toefl/test-takers/ibt/prepare.html';
  if (/cambridge/i.test(name)) return 'https://www.cambridgeenglish.org/learning-english/exam-preparation/';
  if (/\bsat\b/i.test(name)) return 'https://satsuite.collegeboard.org/practice';
  return '';
}
const finishedTest = status => ['completed', 'not needed', 'not-needed'].includes(string(status, 100).toLowerCase());
const preparingTest = status => ['preparing', 'booked'].includes(string(status, 100).toLowerCase());

/**
 * IDs include their source namespace so an exam and internship sharing a local
 * ID remain distinct. Dates are saved user dates, not assumed official dates.
 */
export function getUpcomingEvents(state, date, { includePast = false, includeCompleted = false, pathway } = {}) {
  const today = calendarNumber(date);
  const events = [];
  for (const exam of records(state.exams)) {
    if (!validDate(exam?.date)) continue;
    events.push({ id: `exam:${exam.id}`, source: 'exam', sourceId: exam.id, title: exam.title, type: 'exam', date: exam.date, endDate: '', intent: 'milestone', pathway: 'Both', subjectId: exam.subjectId || '', minutes: 25, priority: 'high', status: 'planned', notes: records(exam.topics).join(', '), resource: '', format: exam.format || 'written', goalId: 'grades' });
  }
  for (const test of records(state.profile?.testPlans)) {
    if (!validDate(test?.targetDate)) continue;
    events.push({ id: `test:${test.id}`, source: 'test', sourceId: test.id, title: preparingTest(test.status) || finishedTest(test.status) ? test.name : `${test.name}: requirement decision`, type: 'test', date: test.targetDate, endDate: '', intent: preparingTest(test.status) ? 'milestone' : 'deadline', pathway: standardizedTest(test.name) ? 'USA' : 'Both', subjectId: '', minutes: 25, priority: preparingTest(test.status) ? 'high' : 'low', status: finishedTest(test.status) ? 'completed' : 'planned', preparationStatus: string(test.status, 100), notes: string(test.notes, 2000), resource: testResource(test.name), goalId: 'tests', testName: test.name });
  }
  for (const university of records(state.universities)) {
    if (!validDate(university?.deadline)) continue;
    events.push({ id: `university:${university.id}`, source: 'university', sourceId: university.id, title: `${university.name}: application deadline`, type: 'university', date: university.deadline, endDate: '', intent: 'deadline', pathway: university.country === 'Germany' ? 'Germany' : 'USA', subjectId: '', minutes: 20, priority: 'high', status: university.status === 'applied' ? 'completed' : 'planned', notes: string(university.requirements, 4000), resource: webURL(university.url), goalId: 'applications', universityName: university.name });
  }
  for (const event of normalizeEvents(state.events)) events.push({ ...event, id: `custom:${event.id}`, source: 'custom', sourceId: event.id, subjectId: '' });
  return events.map(event => ({ ...event, daysUntil: calendarNumber(event.date) - today }))
    .filter(event => (includePast || event.daysUntil >= 0) && (includeCompleted || event.status !== 'completed') && (!pathway || event.pathway === 'Both' || event.pathway === pathway))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

function matchesPathway(state, event) {
  const selected = records(state.profile?.pathways);
  return event.pathway === 'Both' || selected.includes(event.pathway);
}
function goalFor(event) {
  return event.goalId || (['internship', 'project'].includes(event.type) ? 'activities' : event.type === 'test' ? 'tests' : ['application', 'university'].includes(event.type) ? 'applications' : 'research');
}

function preparationStages(event) {
  const name = event.universityName || event.testName || event.title;
  const test = event.source === 'test' || event.type === 'test';
  const deadline = ['application', 'university'].includes(event.type);
  if (test) return [
    { stage: 'baseline', before: 30, title: `${name}: identify your weakest test section`, minutes: 25, steps: ['Use a short official sample to identify one weak section.', 'Record your baseline and choose a preparation focus.'] },
    { stage: 'practice', before: 14, title: `${name}: practise one weak section`, minutes: 25, steps: ['Complete a short official practice task.', 'Review every error and record the next action.'] },
    { stage: 'rehearsal', before: 7, title: `${name}: rehearse one timed test section`, minutes: 30, steps: ['Keep one uninterrupted 30-minute block for this timed rehearsal; use the official format.', 'Check the marking criteria and save your two biggest mistakes.'] },
    { stage: 'final', before: 2, title: `${name}: review mistakes and test-day arrangements`, minutes: 15, steps: ['Review your existing error notes with light practice.', 'Confirm booking, identification, location and arrival time.'] },
    { stage: 'today', before: 0, title: `${name}: confirm today’s test arrangements`, minutes: 10, steps: ['Confirm your test booking and required identification.', 'Keep preparation light and arrive with time to spare.'] },
  ];
  if (deadline) return [
    { stage: 'checklist', before: 45, title: `Check the application checklist for ${name}`, minutes: 15, steps: ['Verify this saved deadline on the official source.', 'List required forms, essays, translations and documents in your notes.'] },
    { stage: 'prepare', before: 21, title: `Prepare the next document for ${name}`, minutes: event.minutes, steps: ['Choose one unfinished application item.', 'Prepare that document or one essay section and record the next step.'] },
    { stage: 'review', before: 7, title: `Review the application to ${name}`, minutes: event.minutes, steps: ['Compare your prepared materials with the official checklist.', 'Check names, dates, translations and remaining requirements.'] },
    { stage: 'submit', before: 2, title: `Finish and verify your ${name} application`, minutes: 20, steps: ['Complete remaining items and submit when your materials are ready.', 'Save the submission receipt; only mark the application applied after actual submission.'] },
    { stage: 'today', before: 0, title: `Confirm submission before today’s ${name} deadline`, minutes: 15, steps: ['Check the official deadline time and time zone.', 'Confirm submission and save the receipt; update the application status.'] },
  ];
  if (event.type === 'internship') return [
    { stage: 'arrange', before: 30, title: `${name}: clarify your internship ${event.intent === 'deadline' ? 'application requirements' : 'arrangements'}`, minutes: event.minutes, steps: [event.intent === 'deadline' ? 'Verify the internship application deadline and required documents.' : 'Confirm your internship role, start date, contact and any required documents.', 'Record a learning goal linked to your study interests.'] },
    { stage: 'prepare', before: 14, title: `${name}: prepare one internship ${event.intent === 'deadline' ? 'application item' : 'requirement'}`, minutes: event.minutes, steps: [event.intent === 'deadline' ? 'Prepare one missing CV, cover-letter section or required form.' : 'Complete one required form or prepare a relevant skill.', 'Write two questions about the role and the experience you hope to gain.'] },
    { stage: 'confirm', before: 2, title: `${name}: ${event.intent === 'deadline' ? 'check your internship application' : 'confirm your start-day plan'}`, minutes: 15, steps: [event.intent === 'deadline' ? 'Check your prepared documents against the application checklist.' : 'Confirm location, transport, start time and required equipment.', 'Decide how to document responsibilities and impact in your activity profile.'] },
    { stage: 'today', before: 0, title: `${name}: ${event.intent === 'deadline' ? 'confirm internship application submission' : 'record your first internship goal'}`, minutes: 10, steps: [event.intent === 'deadline' ? 'Confirm submission before the deadline and save the receipt.' : 'Confirm today’s arrangements.', 'Add the internship and a concrete learning goal to your application profile when the role is confirmed.'] },
  ];
  if (event.type === 'project') return [
    { stage: 'scope', before: 30, title: `${name}: define one measurable project result`, minutes: 15, steps: ['Define the deliverable, audience and a realistic measure of impact.', 'Break the remaining work into three concrete steps.'] },
    { stage: 'build', before: 14, title: `${name}: complete the next project step`, minutes: event.minutes, steps: ['Work on the next unfinished deliverable.', 'Save evidence of your contribution and what remains.'] },
    { stage: 'check', before: 3, title: `${name}: check the deliverable and record impact`, minutes: event.minutes, steps: ['Review the deliverable against your original goal.', 'Record your responsibilities, evidence and measurable impact.'] },
    { stage: 'today', before: 0, title: `${name}: finish today’s project milestone`, minutes: event.minutes, steps: ['Complete or submit today’s deliverable.', 'Save the result in your activity profile and mark this event complete when achieved.'] },
  ];
  return [
    { stage: 'prepare', before: 7, title: `${name}: prepare the next action`, minutes: event.minutes, steps: ['Confirm what you need for this milestone.', 'Complete one preparation step and note what remains.'] },
    { stage: 'confirm', before: 1, title: `${name}: confirm tomorrow’s arrangements`, minutes: 10, steps: ['Confirm the time, place and any required materials.', 'Record one intended result.'] },
    { stage: 'today', before: 0, title: `${name}: take today’s next action`, minutes: event.minutes, steps: ['Complete the specific next action in your event notes.', 'Mark this milestone complete only after it is achieved.'] },
  ];
}

/** An inspectable, dated preparation sequence; completion reflects actual tasks. */
export function getEventPlan(state, eventId, date) {
  const event = getUpcomingEvents(state, date, { includePast: true, includeCompleted: true }).find(item => item.id === eventId);
  if (!event || event.source === 'exam' || (event.source === 'test' && !preparingTest(event.preparationStatus))) return [];
  const stages = preparationStages(event);
  return stages.map(stage => {
    const tasks = records(state.tasks).filter(task => task.eventId === event.id && task.eventStage === stage.stage && task.completed && completionDate(task) && completionDate(task) <= date);
    const practiceMinutes = tasks.reduce((sum, task) => sum + (Number(task.minutes) || 0), 0);
    const requiresContiguous = stage.stage === 'rehearsal';
    const creditedMinutes = requiresContiguous ? tasks.reduce((longest, task) => {
      const sessions = records(task.sessions);
      const largestBlock = sessions.length ? Math.max(0, ...sessions.map(session => {
        if (!/^\d{2}:\d{2}$/.test(session.start) || !/^\d{2}:\d{2}$/.test(session.end)) return 0;
        const minute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
        return Math.max(0, minute(session.end) - minute(session.start));
      })) : Number(task.minutes) || 0;
      return Math.max(longest, Math.min(Number(task.minutes) || 0, largestBlock));
    }, 0) : practiceMinutes;
    const completedMinutes = Math.min(stage.minutes, creditedMinutes);
    const completed = completedMinutes >= stage.minutes;
    const proposedDate = shiftDate(event.date, -stage.before);
    const startDate = validDate(event.createdDate) ? event.createdDate : validDate(state.createdDate) ? state.createdDate : proposedDate;
    return { ...stage, id: `${event.id}:${stage.stage}`, eventId: event.id, date: proposedDate < startDate && startDate <= event.date ? startDate : proposedDate, requiredMinutes: stage.minutes, requiresContiguous, practiceMinutes, completedMinutes, remainingMinutes: requiresContiguous && !completed ? stage.minutes : Math.max(0, stage.minutes - completedMinutes), completed };
  });
}

/** Candidates plug into the daily planner; exams have their own revision model. */
export function getEventCandidates(state, date) {
  calendarNumber(date);
  const candidates = [];
  const priorCompletionState = { ...state, tasks: records(state.tasks).map(task => task.completed && completionDate(task) >= date ? { ...task, completed: false } : task) };
  const events = getUpcomingEvents(state, date).filter(event => event.source !== 'exam' && matchesPathway(state, event));
  const add = (event, stage, score, reason) => candidates.push({
    key: event.source === 'university' ? `deadline-${candidateId(event.sourceId)}-${stage.stage}` : `event-${event.source}-${candidateId(event.sourceId)}-${stage.stage}`,
    title: string(stage.title, 300), category: event.type === 'test' && !standardizedTest(event.testName || event.title) ? 'language' : event.type === 'internship' || event.type === 'project' ? 'activity' : 'university',
    minutes: Math.max(5, stage.remainingMinutes || stage.minutes), score, priority: score >= 80 ? 'high' : score >= 40 ? 'medium' : 'low',
    reason: string(reason, 1200), steps: stage.steps, resource: event.resource, goalId: goalFor(event),
    eventId: event.id, eventSourceId: event.sourceId, eventStage: stage.stage,
  });
  for (const event of events) {
    if (event.daysUntil > 60) continue;
    if (event.source === 'test' && !preparingTest(event.preparationStatus)) continue;
    const plan = getEventPlan(priorCompletionState, event.id, date);
    const due = plan.filter(stage => stage.date <= date);
    // Near the date, use the most time-sensitive unfinished phase. A missed
    // old phase does not create a backlog of every earlier preparation action.
    const next = due.at(-1);
    if (!next || next.completed) continue;
    const until = event.daysUntil;
    const deadline = event.intent === 'deadline';
    const urgency = until <= 2 ? (deadline ? 180 : 150) : until <= 7 ? (deadline ? 170 : 115) : until <= 14 ? 98 : until <= 30 ? 68 : 43;
    const score = urgency + (event.priority === 'high' ? 8 : event.priority === 'low' ? -12 : 0);
    const timing = until === 0 ? 'today' : `in ${until} days`;
    let reason = `${event.source === 'university' ? `Your saved ${event.universityName} deadline is` : event.intent === 'start' ? `${event.title} starts` : `${event.title} is`} ${timing}. This ${next.stage} step prepares the next milestone without carrying a backlog.`;
    if (event.source === 'university') reason += ' Verify the deadline and requirements on the official university page.';
    if (event.type === 'test') reason += standardizedTest(event.testName || event.title) ? ' Confirm this test is useful for your non-UC targets; UC does not consider SAT/ACT for admission.' : ' Follow the official test format and check the scoring criteria.';
    add(event, next, score, reason);
  }
  // Optional tests without an agreed need never cause preparation tasks. Their
  // dated entries and undated plans instead ask for a deliberate policy check.
  for (const test of records(state.profile?.testPlans)) {
    if (finishedTest(test.status) || preparingTest(test.status)) continue;
    const sat = standardizedTest(test.name);
    if (sat && !records(state.profile?.pathways).includes('USA')) continue;
    if (validDate(test.targetDate) && test.targetDate < date) continue;
    const event = { id: `test:${test.id}`, source: 'test', sourceId: test.id, type: 'test', pathway: sat ? 'USA' : 'Both', testName: test.name, resource: '', goalId: 'tests' };
    const until = validDate(test.targetDate) ? calendarNumber(test.targetDate) - calendarNumber(date) : null;
    add(event, { stage: 'research', title: sat ? 'Verify whether a standardized test is useful' : 'Verify accepted English-test policies', minutes: 10, steps: ['Check the official requirements for one target programme.', 'Update the test status only after deciding whether preparation is necessary.'] }, until !== null && until <= 7 ? 75 : 31,
      `${test.name} is still ${test.status || 'under consideration'}.${until !== null ? ` Your saved decision date is ${until === 0 ? 'today' : `in ${until} days`}.` : ''} Confirm whether it is accepted or required before scheduling preparation. ${sat ? 'UC does not consider SAT/ACT for admission.' : 'Check accepted tests, minimum scores and validity periods on official university pages.'}`);
  }
  return candidates.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}
