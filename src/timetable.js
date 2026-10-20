/** School lessons are busy time, not an invitation to fill every free hour. */
const DAY = 86400000;
const text = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const minute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? Math.floor(parsed.getTime() / DAY) : null;
}
const monday = value => value - ((new Date(value * DAY).getUTCDay() + 6) % 7);

export function normalizeLessons(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).slice(0, 500).flatMap(lesson => {
    if (!lesson || typeof lesson !== 'object' || !text(lesson.id, 150) || seen.has(text(lesson.id, 150)) || !Number.isInteger(lesson.day) || lesson.day < 0 || lesson.day > 6 || !validTime(lesson.start) || !validTime(lesson.end) || minute(lesson.end) <= minute(lesson.start) || (!text(lesson.subjectId, 150) && !text(lesson.title))) return [];
    seen.add(text(lesson.id, 150));
    return [{ id: text(lesson.id, 150), subjectId: text(lesson.subjectId, 150), title: text(lesson.title), day: lesson.day, start: lesson.start, end: lesson.end, room: text(lesson.room, 100), teacher: text(lesson.teacher, 150), cycle: ['A', 'B'].includes(lesson.cycle) ? lesson.cycle : 'all',
      ...(text(lesson.importKey, 150) ? { importKey: text(lesson.importKey, 150) } : {}),
      ...(text(lesson.courseCode, 100) ? { courseCode: text(lesson.courseCode, 100) } : {}),
      ...(['LK', 'GK', 'PF'].includes(lesson.courseType) ? { courseType: lesson.courseType } : {}),
      ...(Number.isInteger(lesson.periodStart) && lesson.periodStart >= 1 && lesson.periodStart <= 20 ? { periodStart: lesson.periodStart } : {}),
      ...(Number.isInteger(lesson.periodEnd) && lesson.periodEnd >= (lesson.periodStart || 1) && lesson.periodEnd <= 20 ? { periodEnd: lesson.periodEnd } : {}),
      ...(text(lesson.term, 100) ? { term: text(lesson.term, 100) } : {}),
    }];
  });
}

/** The user chooses a known A-week; calendar parity alone never invents it. */
export function cycleForDate(state, date) {
  const day = dayNumber(date);
  const anchor = dayNumber(state?.schedule?.cycleAnchor);
  if (day === null || anchor === null) return null;
  return ((Math.round((monday(day) - monday(anchor)) / 7) % 2) + 2) % 2 === 0 ? 'A' : 'B';
}

export function lessonsForDate(state, date) {
  const day = dayNumber(date);
  if (day === null) return [];
  const cycle = cycleForDate(state, date);
  const weekday = new Date(day * DAY).getUTCDay();
  return normalizeLessons(state?.schedule?.lessons).filter(lesson => lesson.day === weekday && (lesson.cycle === 'all' || lesson.cycle === cycle))
    .map(lesson => ({ ...lesson, title: lesson.title || state?.subjects?.find(subject => subject.id === lesson.subjectId)?.name || 'Unterricht' }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

export function lessonBlocks(state, date) {
  const confirmed = lessonsForDate(state, date).map(lesson => ({ ...lesson, category: 'school', source: 'lesson' }));
  const day = dayNumber(date);
  if (day === null || cycleForDate(state, date)) return confirmed;
  // Until the real A-week is known, reserve both possible alternatives. This
  // is a cautious time constraint, never a claim about which class takes place.
  const alternatives = normalizeLessons(state?.schedule?.lessons).filter(lesson => lesson.day === new Date(day * DAY).getUTCDay() && lesson.cycle !== 'all');
  return [...confirmed, ...alternatives.map(lesson => ({ ...lesson, title: `${lesson.title || state?.subjects?.find(subject => subject.id === lesson.subjectId)?.name || 'Unterricht'} · A/B-Zeit vorsorglich frei`, category: 'school', source: 'lesson', provisional: true }))].sort((a, b) => a.start.localeCompare(b.start));
}

/** Adjacent lessons are fine. A/B lessons conflict only in the same cycle. */
export function timetableConflicts(value, candidate) {
  const lessons = normalizeLessons(Array.isArray(value) ? value : value?.schedule?.lessons);
  const selected = candidate ? normalizeLessons([candidate])[0] : null;
  if (candidate && !selected) return [];
  const pairs = [];
  const left = selected ? [selected] : lessons;
  for (let i = 0; i < left.length; i++) {
    for (let j = selected ? 0 : i + 1; j < lessons.length; j++) {
      const a = left[i], b = lessons[j];
      if (a.id === b.id || a.day !== b.day || (a.cycle !== 'all' && b.cycle !== 'all' && a.cycle !== b.cycle)) continue;
      if (minute(a.start) < minute(b.end) && minute(b.start) < minute(a.end)) pairs.push({ lessonId: a.id, otherId: b.id, day: a.day, start: a.start > b.start ? a.start : b.start, end: a.end < b.end ? a.end : b.end, kind: 'lesson' });
    }
  }
  return pairs;
}
