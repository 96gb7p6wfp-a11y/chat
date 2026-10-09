/** Persistent focus sessions. Elapsed time comes from timestamps, never ticks. */
const CATEGORIES = ['academics', 'language', 'university', 'activity', 'review'];
const MAX_SECONDS = 180 * 60;
const MIN_SECONDS = 5 * 60;
const cleanText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const stamp = value => {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const milliseconds = value => new Date(value).getTime();
const makeId = () => `study-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;

function requireNow(now = new Date()) {
  const value = stamp(now);
  if (!value) throw new TypeError('A study session needs a valid timestamp.');
  return value;
}

function timeZone(value) {
  try {
    const zone = value || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    new Intl.DateTimeFormat('en', { timeZone: zone }).format(0);
    return zone;
  } catch { return 'UTC'; }
}

export function createStudyState() { return { active: null, sessions: [] }; }

function intervalMilliseconds(intervals) {
  return intervals.reduce((sum, interval) => sum + Math.max(0, milliseconds(interval.end) - milliseconds(interval.start)), 0);
}

function snapshot(value, completed = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanText(value.id, 200);
  const taskId = cleanText(value.taskId, 200);
  const taskTitle = cleanText(value.taskTitle, 300);
  const startedAt = stamp(value.startedAt);
  const targetSeconds = Number(value.targetSeconds);
  if (!id || !taskId || !taskTitle || !startedAt || !CATEGORIES.includes(value.category) || !Number.isInteger(targetSeconds) || targetSeconds < MIN_SECONDS || targetSeconds > MAX_SECONDS) return null;
  if (!Array.isArray(value.intervals) || value.intervals.length > 1000) return null;
  const intervals = [];
  let previousEnd = milliseconds(startedAt);
  for (const interval of value.intervals) {
    const start = stamp(interval?.start);
    const end = stamp(interval?.end);
    if (!start || !end || milliseconds(start) < previousEnd || milliseconds(end) <= milliseconds(start)) return null;
    intervals.push({ start, end });
    previousEnd = milliseconds(end);
  }
  const duration = intervalMilliseconds(intervals);
  if (duration > targetSeconds * 1000) return null;
  const result = { id, taskId, taskTitle, subjectId: cleanText(value.subjectId, 200), category: value.category, targetSeconds, startedAt, intervals, timeZone: timeZone(value.timeZone) };
  if (completed) {
    const endedAt = stamp(value.endedAt);
    const seconds = Number(value.seconds);
    if (!endedAt || milliseconds(endedAt) < previousEnd || !Number.isInteger(seconds) || seconds < 1 || seconds !== duration / 1000) return null;
    return { ...result, endedAt, seconds };
  }
  const runningSince = value.runningSince === null ? null : stamp(value.runningSince);
  if (value.runningSince !== null && (!runningSince || milliseconds(runningSince) < previousEnd)) return null;
  return { ...result, runningSince };
}

/** Backups are validated before this tolerant local model normalization runs. */
export function normalizeStudy(value, now = new Date()) {
  requireNow(now);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return createStudyState();
  const seen = new Set();
  const sessions = (Array.isArray(value.sessions) ? value.sessions : []).slice(0, 10000).map(value => snapshot(value, true)).filter(session => {
    if (!session || seen.has(session.id)) return false;
    seen.add(session.id);
    return true;
  });
  const active = snapshot(value.active);
  return { active: active && !seen.has(active.id) ? active : null, sessions };
}

function currentStudy(state) {
  return state.study || createStudyState();
}

function elapsedMilliseconds(active, now) {
  if (!active) return 0;
  const closed = intervalMilliseconds(active.intervals);
  const running = active.runningSince ? Math.max(0, milliseconds(now) - milliseconds(active.runningSince)) : 0;
  return Math.min(active.targetSeconds * 1000, closed + running);
}

export function getStudyTimer(state, now = new Date()) {
  const current = requireNow(now);
  const active = currentStudy(state).active;
  const targetSeconds = active?.targetSeconds || 0;
  const elapsedSeconds = Math.floor(elapsedMilliseconds(active, current) / 1000);
  return { active, elapsedSeconds, remainingSeconds: Math.max(0, targetSeconds - elapsedSeconds), finished: Boolean(active && elapsedSeconds >= targetSeconds), running: Boolean(active?.runningSince), targetSeconds };
}

export function startStudy(state, task, now = new Date(), durationMinutes) {
  const current = requireNow(now);
  if (currentStudy(state).active) {
    if (currentStudy(state).active.taskId === task?.id) return state;
    throw new TypeError('Finish or discard the current focus session before starting another task.');
  }
  if (!task || !cleanText(task.id, 200) || !cleanText(task.title, 300) || !CATEGORIES.includes(task.category)) throw new TypeError('Choose a valid task before starting a study session.');
  const requested = durationMinutes === undefined ? Number(task.minutes) : Number(durationMinutes);
  if (!Number.isFinite(requested) || requested <= 0) throw new TypeError('Choose a valid study duration.');
  const targetSeconds = Math.round(Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, requested * 60)));
  const active = {
    id: makeId(), taskId: cleanText(task.id, 200), taskTitle: cleanText(task.title, 300), subjectId: cleanText(task.subjectId, 200), category: task.category,
    targetSeconds, startedAt: current, runningSince: current, intervals: [], timeZone: timeZone(),
  };
  return { ...state, study: { ...currentStudy(state), active } };
}

function closeRunning(active, now) {
  if (!active.runningSince) return active;
  const duration = Math.max(0, milliseconds(now) - milliseconds(active.runningSince));
  const remaining = Math.max(0, active.targetSeconds * 1000 - intervalMilliseconds(active.intervals));
  const counted = Math.min(duration, remaining);
  const intervals = counted ? [...active.intervals, { start: active.runningSince, end: new Date(milliseconds(active.runningSince) + counted).toISOString() }] : active.intervals;
  return { ...active, intervals, runningSince: null };
}

export function pauseStudy(state, now = new Date()) {
  const current = requireNow(now);
  const study = currentStudy(state);
  if (!study.active?.runningSince) return state;
  return { ...state, study: { ...study, active: closeRunning(study.active, current) } };
}

export function resumeStudy(state, now = new Date()) {
  const current = requireNow(now);
  const study = currentStudy(state);
  if (!study.active || study.active.runningSince || getStudyTimer(state, current).finished) return state;
  const lastEnd = study.active.intervals.at(-1)?.end || study.active.startedAt;
  const runningSince = new Date(Math.max(milliseconds(current), milliseconds(lastEnd))).toISOString();
  return { ...state, study: { ...study, active: { ...study.active, runningSince } } };
}

export function finishStudy(state, now = new Date()) {
  const current = requireNow(now);
  const study = currentStudy(state);
  if (!study.active) return state;
  const { runningSince, ...closed } = closeRunning(study.active, current);
  const duration = intervalMilliseconds(closed.intervals);
  const seconds = Math.floor(duration / 1000);
  // Whole saved seconds keep aggregate totals exact. Only a fractional tail
  // shorter than one second is discarded; pauses never become study time.
  const intervals = closed.intervals.map(interval => ({ ...interval }));
  let fractional = duration - seconds * 1000;
  while (fractional > 0 && intervals.length) {
    const last = intervals.at(-1);
    const length = milliseconds(last.end) - milliseconds(last.start);
    const trim = Math.min(length, fractional);
    fractional -= trim;
    if (trim === length) intervals.pop();
    else last.end = new Date(milliseconds(last.end) - trim).toISOString();
  }
  const endedAt = new Date(Math.max(milliseconds(current), milliseconds(intervals.at(-1)?.end || closed.startedAt))).toISOString();
  const session = { ...closed, intervals, endedAt, seconds };
  const sessions = seconds && !study.sessions.some(item => item.id === session.id) ? [...study.sessions, session] : study.sessions;
  return { ...state, study: { active: null, sessions } };
}

export function discardStudy(state) {
  const study = currentStudy(state);
  return study.active ? { ...state, study: { ...study, active: null } } : state;
}

export function removeStudySession(state, id) {
  const study = currentStudy(state);
  const sessions = study.sessions.filter(session => session.id !== id);
  return sessions.length === study.sessions.length ? state : { ...state, study: { ...study, sessions } };
}

function dateFormatter(zone) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return value => {
    const parts = Object.fromEntries(formatter.formatToParts(value).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
}

function intervalDays(interval, zone) {
  const dateKey = dateFormatter(zone);
  const result = {};
  let cursor = milliseconds(interval.start);
  const end = milliseconds(interval.end);
  while (cursor < end) {
    const date = dateKey(cursor);
    let boundary = end;
    if (dateKey(end - 1) !== date) {
      // Search for the next local midnight in actual elapsed milliseconds.
      // This also handles 23/25-hour daylight-saving days correctly.
      let low = cursor + 1;
      let high = end;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (dateKey(middle) === date) low = middle + 1;
        else high = middle;
      }
      boundary = low;
    }
    result[date] = (result[date] || 0) + (boundary - cursor) / 1000;
    cursor = boundary;
  }
  return result;
}

/** Measured time from saved sessions only, grouped by the session's local days. */
export function getStudyStats(state, startDate = '0000-00-00', endDate = '9999-99-99') {
  const byDay = {};
  const bySubject = {};
  let seconds = 0;
  let sessions = 0;
  const sessionIds = [];
  for (const session of currentStudy(state).sessions) {
    let counted = 0;
    for (const interval of session.intervals) {
      for (const [date, duration] of Object.entries(intervalDays(interval, session.timeZone || timeZone()))) {
        if (date < startDate || date > endDate) continue;
        byDay[date] = (byDay[date] || 0) + duration;
        counted += duration;
      }
    }
    if (!counted) continue;
    seconds += counted;
    sessions++;
    sessionIds.push(session.id);
    const subject = session.subjectId || 'other';
    bySubject[subject] = (bySubject[subject] || 0) + counted;
  }
  return { seconds, sessions, byDay, bySubject, sessionIds };
}
