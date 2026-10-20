/** User-supplied Q1 documents. Nothing becomes a saved record without review. */
import { GRADE_TYPES } from './grades.js';
import { normalizeLessons, timetableConflicts } from './timetable.js';

export const SCHOOL_IMPORT_ID = 'q1-hessen-2026';
export const SCHOOL_IMPORT_NOTICE = 'Die neun persönlich bestätigten Termine haben Vorrang. Der Foto-Aushang enthält mehrere Kurse; nicht eindeutig zuordenbare Einträge werden nicht übernommen. Uhrzeiten, Räume und Themen der Klausuren sind noch offen.';
export const CONFIRMED_Q1_EXAMS = [
  ['2026-10-26', 'english', 'Englisch', 'GK'],
  ['2026-11-12', 'computer-science', 'Informatik', 'GK'],
  ['2026-11-13', 'politics', 'Politik und Wirtschaft', 'GK'],
  ['2026-11-20', 'history', 'Geschichte', 'GK'],
  ['2026-11-25', 'religion', 'Religion', 'GK'],
  ['2026-12-07', 'physics', 'Physik', 'LK'],
  ['2026-12-09', 'german', 'Deutsch', 'GK'],
  ['2026-12-16', 'art', 'Kunst', 'GK'],
  ['2026-12-17', 'mathematics', 'Mathematik', 'LK'],
].map(([date, subjectId, name, level]) => ({ id: `${SCHOOL_IMPORT_ID}-exam-${subjectId}`, importKey: `${SCHOOL_IMPORT_ID}-exam-${subjectId}`, date, subjectId, title: `${name} · Q1-Klausur`, level, topics: [], format: 'written', target: null, time: '', room: '', importance: 'normal', preparation: '', notes: 'Persönlich bestätigter Q1-Termin · Schuljahr 2026/2027. Themen, Uhrzeit und Raum noch offen.' }));

export const SCHOOL_PERIODS = [
  ['08:05', '08:50'], ['08:55', '09:40'], ['09:55', '10:40'], ['10:45', '11:30'],
  ['11:45', '12:30'], ['12:30', '13:10'], ['13:30', '14:15'], ['14:15', '15:00'],
  ['15:00', '15:45'], ['15:45', '16:30'],
];
const BLOCKS = [
  [1, 3, 4, 'physics', 'PH-LK-1', 'NiG', 'PHL'],
  [1, 7, 8, 'german', 'D-GK-3', 'DiM', 'M124'],
  [2, 3, 4, 'mathematics', 'M-LK-1', 'Lip', 'C052'],
  [2, 5, 5, 'politics', 'POWI-GK-5', 'Sne', 'M127'],
  [2, 7, 8, 'history', 'G-GK-3', 'Sne', 'M120'],
  [2, 9, 9, 'sport', 'SPO-PF-1', 'Hks', ''],
  [3, 1, 2, 'german', 'D-GK-3', 'DiM', 'M124'],
  [3, 3, 4, 'mathematics', 'M-LK-1', 'Lip', 'C052'],
  [3, 5, 6, 'english', 'E-GK-5', 'Sta', 'M122'],
  [3, 7, 8, 'art', 'KU-GK-3', 'Kss', 'Ku1'],
  [4, 1, 2, 'politics', 'POWI-GK-5', 'Sne', 'M124'],
  [4, 3, 4, 'physics', 'PH-LK-1', 'NiG', 'PHUE'],
  [4, 7, 8, 'computer-science', 'INFO-GK-1', 'Lip', 'C030'],
  [5, 1, 1, 'history', 'G-GK-3', 'Sne', 'M120'],
  [5, 2, 2, 'physics', 'PH-LK-1', 'NiG', 'PHL'],
  [5, 3, 4, 'mathematics', 'M-LK-1', 'Lip', 'C052'],
  [5, 5, 5, 'english', 'E-GK-5', 'Sta', 'M122'],
  [5, 7, 8, 'religion', 'REV-GK-2', 'Esg', 'M120'],
  [5, 9, 10, 'sport', 'SPO-PF-1', 'Hks', 'TMBG'],
];
export const Q1_TIMETABLE_DRAFT = BLOCKS.map(([day, periodStart, periodEnd, subjectId, courseCode, teacher, room]) => ({
  id: `${SCHOOL_IMPORT_ID}-lesson-${day}-${periodStart}`, importKey: `${SCHOOL_IMPORT_ID}-lesson-${day}-${periodStart}`,
  subjectId, title: '', day, start: SCHOOL_PERIODS[periodStart - 1][0], end: SCHOOL_PERIODS[periodEnd - 1][1],
  courseCode, courseType: courseCode.split('-')[1], periodStart, periodEnd, teacher, room, cycle: 'all', term: 'Q1 · 1. Halbjahr 2026/2027',
}));

const sameKey = (existing, candidate) => existing.id === candidate.id || (candidate.importKey && existing.importKey === candidate.importKey);
const lessonIdentity = (a, b) => a.subjectId === b.subjectId && a.day === b.day && a.start === b.start && a.end === b.end && (a.cycle || 'all') === (b.cycle || 'all');
const missingSubject = (data, record) => !data.subjects?.some(subject => subject.id === record.subjectId);

export function previewExamImport(data, drafts = CONFIRMED_Q1_EXAMS) {
  return drafts.map(draft => {
    const existing = (data.exams || []).find(record => sameKey(record, draft)) || (data.exams || []).find(record => record.subjectId === draft.subjectId && record.date === draft.date);
    if (existing) return { draft, existing, status: 'existing', reason: existing.date === draft.date ? 'Bereits vorhanden; deine Angaben bleiben erhalten.' : `Bereits importiert und auf ${existing.date} geändert; deine Änderung bleibt erhalten.` };
    if (missingSubject(data, draft)) return { draft, status: 'missing-subject', reason: 'Das zugehörige Fach fehlt. Lege es vor dem Import an.' };
    return { draft, status: 'new', reason: 'Wird als neue Klausur ergänzt.' };
  });
}

/** Exact matches receive only a provenance key; no verified user details change. */
export function applyExamImport(data, drafts = CONFIRMED_Q1_EXAMS, { includeSubjects = false } = {}) {
  const exams = [...(data.exams || [])];
  for (const item of previewExamImport({ ...data, exams }, drafts)) {
    if (item.status === 'new') exams.push(structuredClone(item.draft));
    else if (item.status === 'existing' && !item.existing.importKey) {
      const index = exams.findIndex(exam => exam.id === item.existing.id);
      exams[index] = { ...exams[index], importKey: item.draft.importKey };
    }
  }
  const selectedSubjects = new Set(drafts.map(draft => draft.subjectId));
  return { ...data, exams, ...(includeSubjects ? { subjects: data.subjects.map(subject => selectedSubjects.has(subject.id) ? { ...subject, enabled: true } : subject) } : {}) };
}

export function previewTimetableImport(data, drafts = Q1_TIMETABLE_DRAFT) {
  const existing = normalizeLessons(data.schedule?.lessons);
  return drafts.map(draft => {
    const normalized = normalizeLessons([draft])[0];
    if (!normalized || !Number.isInteger(draft.periodStart) || !Number.isInteger(draft.periodEnd) || draft.periodStart < 1 || draft.periodEnd < draft.periodStart || draft.periodEnd > 20 || !String(draft.courseCode || '').trim()) return { draft, status: 'invalid', reason: 'Prüfe Fach, Stunden, Kursbezeichnung und Uhrzeiten.' };
    if (missingSubject(data, draft)) return { draft, status: 'missing-subject', reason: 'Das zugehörige Fach fehlt.' };
    const match = existing.find(record => sameKey(record, draft)) || existing.find(record => lessonIdentity(record, draft));
    if (match) return { draft, existing: match, status: 'existing', reason: 'Bereits vorhanden; deine Korrekturen bleiben erhalten.' };
    const conflicts = timetableConflicts([...existing, ...drafts.filter(other => other.id !== draft.id && !existing.some(record => sameKey(record, other) || lessonIdentity(record, other)))], normalized);
    if (conflicts.length) return { draft, status: 'conflict', reason: 'Überschneidet sich mit einer Stunde. Korrigiere die Uhrzeit oder lasse diesen Block aus.' };
    return { draft: normalized, status: 'new', reason: 'Wird nach deiner Bestätigung ergänzt.' };
  });
}

/** Only selected, conflict-free lessons are added. Existing lessons are never overwritten. */
export function applyTimetableImport(data, drafts = Q1_TIMETABLE_DRAFT) {
  const lessons = [...normalizeLessons(data.schedule?.lessons)];
  for (const item of previewTimetableImport(data, drafts)) {
    if (item.status === 'new') lessons.push(structuredClone(item.draft));
    else if (item.status === 'existing' && !item.existing.importKey) {
      const index = lessons.findIndex(lesson => lesson.id === item.existing.id);
      lessons[index] = { ...lessons[index], importKey: item.draft.importKey };
    }
  }
  return { ...data, schedule: { ...data.schedule, lessons } };
}

export function hasGermanFourResult(data) {
  return (data.grades || []).some(grade => grade.id === `${SCHOOL_IMPORT_ID}-german-four` || (grade.subjectId === 'german' && grade.points === 4));
}

/** An undated 4-point statement is not a confirmed assessment. */
export function confirmGermanGradeDraft(data, details, today) {
  if (hasGermanFourResult(data)) throw new TypeError('Dieses Ergebnis wurde bereits erfasst. Prüfe den Eintrag und mögliche Korrekturen in deinen Noten.');
  if (!data.subjects?.some(subject => subject.id === 'german')) throw new TypeError('Lege zuerst das Fach Deutsch an.');
  if (!GRADE_TYPES.includes(details?.type)) throw new TypeError('Wähle die tatsächliche Leistungsart.');
  const date = details?.date;
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > today) throw new TypeError('Ergänze das tatsächliche Datum bis heute.');
  const weight = details?.weight === '' || details?.weight == null || typeof details?.weight === 'boolean' ? null : Number(details.weight);
  if (weight === null || !Number.isFinite(weight) || weight <= 0 || weight > 100000) throw new TypeError('Bestätige ein positives relatives Gewicht für diese Leistung.');
  if (details?.confirmed !== true) throw new TypeError('Bestätige die Angaben und die geltende Berechnungsregel.');
  return { id: `${SCHOOL_IMPORT_ID}-german-four`, subjectId: 'german', points: 4, type: details.type, date, semester: ['Q1', 'Q2', 'Q3', 'Q4'].includes(details.semester) ? details.semester : 'Q1', weight, note: typeof details.note === 'string' ? details.note.trim().slice(0, 3000) : '' };
}
