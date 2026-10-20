import React, { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Edit3, Plus, Trash2 } from 'lucide-react';
import { Button, EmptyState, Field, Modal, SectionHeading, Segmented, formatDate } from './UI.jsx';
import { saveSchedule, shiftDate, startOfWeek, uid } from '../coach.js';
import { cycleForDate, lessonsForDate, normalizeLessons, timetableConflicts } from '../timetable.js';
import '../timetable.css';
import { subjectLabel } from '../i18n.js';
import { Q1_TIMETABLE_DRAFT, SCHOOL_IMPORT_ID } from '../school-import.js';

const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const nameFor = (data, lesson) => subjectLabel(lesson.title || data.subjects.find(subject => subject.id === lesson.subjectId)?.name || 'Unterricht');
const clockMinute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

function LessonForm({ data, lesson, day, onSave, onClose }) {
  const [form, setForm] = useState({ ...lesson, id: lesson?.id || uid('lesson'), subjectId: lesson?.subjectId || data.subjects.find(subject => subject.enabled)?.id || data.subjects[0]?.id || '', title: lesson?.title || '', day: lesson?.day ?? day, start: lesson?.start || '08:00', end: lesson?.end || '08:45', room: lesson?.room || '', teacher: lesson?.teacher || '', cycle: lesson?.cycle || 'all', courseCode: lesson?.courseCode || '', courseType: lesson?.courseType || '', periodStart: lesson?.periodStart ?? '', periodEnd: lesson?.periodEnd ?? '', term: lesson?.term || '' });
  const [error, setError] = useState('');
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const conflicts = timetableConflicts(data, { ...form, day: Number(form.day) });
  function submit(event) {
    event.preventDefault();
    const periodStart = form.periodStart === '' ? undefined : Number(form.periodStart);
    const periodEnd = form.periodEnd === '' ? undefined : Number(form.periodEnd);
    if ([periodStart, periodEnd].some(value => value !== undefined && (!Number.isInteger(value) || value < 1 || value > 20)) || (periodStart !== undefined && periodEnd !== undefined && periodEnd < periodStart)) { setError('Die Stunden müssen zwischen 1 und 20 liegen. Die letzte Stunde darf nicht vor der ersten liegen.'); return; }
    const normalized = normalizeLessons([{ ...form, day: Number(form.day), periodStart, periodEnd }])[0];
    if (!normalized) { setError('Wähle ein Fach oder einen Titel und eine gültige Uhrzeit. Das Ende muss nach dem Beginn liegen.'); return; }
    if (conflicts.length) { setError('Diese Stunde überschneidet sich mit einer anderen. Passe Tag, Uhrzeit oder A/B-Woche an.'); return; }
    onSave(normalized);
  }
  return <Modal title={lesson ? 'Unterricht bearbeiten' : 'Unterricht hinzufügen'} onClose={onClose}><form className="stack" onSubmit={submit}>
    <Field label="Fach"><select value={form.subjectId} onChange={event => setForm(current => ({ ...current, subjectId: event.target.value, title: event.target.value ? '' : current.title }))}><option value="">Anderer Unterricht</option>{data.subjects.map(subject => <option value={subject.id} key={subject.id}>{subjectLabel(subject)}{subject.level === 'LK' ? ' · LK' : ''}</option>)}</select></Field>
    {!form.subjectId && <Field label="Titel"><input value={form.title} onChange={set('title')} maxLength={200} required /></Field>}
    <div className="form-grid"><Field label="Wochentag"><select value={form.day} onChange={set('day')}>{ORDER.map(value => <option value={value} key={value}>{DAYS[value]}</option>)}</select></Field><Field label="Wiederholung"><select value={form.cycle} onChange={set('cycle')}><option value="all">Jede Woche</option><option value="A">Nur A-Woche</option><option value="B">Nur B-Woche</option></select></Field></div>
    <div className="form-grid"><Field label="Beginn"><input type="time" value={form.start} onChange={set('start')} required /></Field><Field label="Ende"><input type="time" value={form.end} onChange={set('end')} required /></Field></div>
    <div className="form-grid"><Field label="Raum · optional"><input value={form.room} onChange={set('room')} maxLength={100} /></Field><Field label="Lehrkraft · optional"><input value={form.teacher} onChange={set('teacher')} maxLength={150} /></Field></div>
    <details className="product-details"><summary>Kurs und Stundenblock</summary><div className="stack"><div className="form-grid"><Field label="Kursbezeichnung · optional"><input value={form.courseCode} onChange={set('courseCode')} maxLength={100} placeholder="z. B. M-LK-1" /></Field><Field label="Kursart laut Stundenplan"><select value={form.courseType} onChange={set('courseType')}><option value="">Nicht angegeben</option><option value="LK">LK</option><option value="GK">GK</option><option value="PF">PF</option></select></Field></div><div className="form-grid"><Field label="Erste Stunde · optional"><input type="number" min="1" max="20" step="1" value={form.periodStart} onChange={set('periodStart')} /></Field><Field label="Letzte Stunde · optional"><input type="number" min="1" max="20" step="1" value={form.periodEnd} onChange={set('periodEnd')} /></Field></div><Field label="Halbjahr · optional"><input value={form.term} onChange={set('term')} maxLength={100} placeholder="Q1 · 1. Halbjahr 2026/2027" /></Field><p className="field-help">Ein Doppelblock bleibt ein gemeinsamer Termin. Die Uhrzeiten legen fest, wann dein Lernplan Unterricht freihält.</p></div></details>
    {form.cycle !== 'all' && !data.schedule.cycleAnchor && <p className="field-help">Lege anschließend eine bekannte A-Woche fest. Bis dahin hält der Lernplan vorsorglich beide möglichen Unterrichtszeiten frei.</p>}
    {conflicts.length > 0 && <p className="form-error" role="alert">Überschneidung: {conflicts.map(conflict => `${conflict.start}–${conflict.end}`).join(', ')}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Stunde speichern</Button></div>
  </form></Modal>;
}

export default function Timetable({ data, today, onChange, notify, onOpenSchoolImport }) {
  const [view, setView] = useState('day');
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const interval = window.setInterval(() => setClock(new Date()), 60000); return () => window.clearInterval(interval); }, []);
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [anchor, setAnchor] = useState(data.schedule.cycleAnchor || '');
  const lessons = normalizeLessons(data.schedule.lessons);
  const importedLessonCount = lessons.filter(lesson => lesson.importKey?.startsWith(`${SCHOOL_IMPORT_ID}-lesson-`)).length;
  const week = startOfWeek(date);
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(week, index)).filter(day => { const weekday = new Date(`${day}T12:00:00`).getDay(); return (weekday > 0 && weekday < 6) || lessonsForDate(data, day).length > 0; });
  const alternating = lessons.some(lesson => lesson.cycle !== 'all');
  const hasUnknownCycle = alternating && !data.schedule.cycleAnchor;
  const dayLessons = lessonsForDate(data, date);
  const cycle = cycleForDate(data, date);
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const nowMinutes = clock.getHours() * 60 + clock.getMinutes();
  const remainingLessons = date === today ? dayLessons.filter(lesson => clockMinute(lesson.end) > nowMinutes) : dayLessons;
  const pastLessons = date === today ? dayLessons.filter(lesson => clockMinute(lesson.end) <= nowMinutes) : [];
  const nextLesson = remainingLessons[0];
  function save(lesson) {
    onChange(current => saveSchedule(current, { lessons: [...normalizeLessons(current.schedule.lessons).filter(item => item.id !== lesson.id), lesson] }));
    setEditing(null); notify?.('Unterricht gespeichert. Dein Lernplan berücksichtigt die Stunde.');
  }
  function lessonRow(lesson, showDay = false) {
    return <div className="lesson-row" key={lesson.id}>
      <div className="lesson-time"><strong>{lesson.start}</strong><span>{lesson.end}</span></div>
      <div className="grow"><strong>{nameFor(data, lesson)}</strong>{lesson.courseCode && <span className="lesson-course">{lesson.courseCode}{lesson.periodStart ? ` · ${lesson.periodStart}${lesson.periodEnd && lesson.periodEnd !== lesson.periodStart ? `–${lesson.periodEnd}` : ""}. Stunde` : ""}</span>}<p className="muted small">{[showDay && DAYS[lesson.day], lesson.room && `Raum ${lesson.room}`, lesson.teacher, lesson.cycle !== 'all' && `${lesson.cycle}-Woche`].filter(Boolean).join(' · ') || 'Jede Woche'}</p></div>
      <button className="icon-button" aria-label={`${nameFor(data, lesson)} bearbeiten`} onClick={() => setEditing(lesson)}><Edit3 size={17} /></button>
    </div>;
  }
  return <div className="stack timetable-view">
    <SectionHeading title="Stundenplan" subtitle="Unterricht bleibt für deinen Lernplan frei." action={<Button onClick={() => setEditing({})}><Plus size={17} /> Stunde</Button>} />
    {onOpenSchoolImport && (importedLessonCount >= Q1_TIMETABLE_DRAFT.length ? <Button className="school-import-again" variant="ghost" onClick={() => onOpenSchoolImport('timetable')}>Q1-Import erneut prüfen</Button> : <div className="school-import-entry"><div><strong>Dein Stundenplan aus dem Foto</strong><p className="muted small">Unterrichtsblöcke prüfen, korrigieren und zusammenführen.</p></div><Button variant="secondary" onClick={() => onOpenSchoolImport('timetable')}>Import prüfen</Button></div>)}
    <Segmented label="Stundenplan-Ansicht" value={view} onChange={setView} options={[{ value: 'day', label: 'Tag' }, { value: 'week', label: 'Woche' }]} />
    {lessons.length ? <>
      <div className="week-heading row"><button className="icon-button" aria-label={view === 'day' ? 'Vorheriger Tag' : 'Vorherige Woche'} onClick={() => setDate(shiftDate(date, view === 'day' ? -1 : -7))}><ChevronLeft size={20} /></button><div className="grow"><h2>{view === 'day' ? new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`)) : `${formatDate(week)} – ${formatDate(shiftDate(week, 6))}`}</h2>{alternating && <span className="field-help">{cycle ? `${cycle}-Woche` : 'A/B-Woche noch offen'}</span>}</div><button className="icon-button" aria-label={view === 'day' ? 'Nächster Tag' : 'Nächste Woche'} onClick={() => setDate(shiftDate(date, view === 'day' ? 1 : 7))}><ChevronRight size={20} /></button></div>
      {view === 'day' ? <section className="card lesson-day">{dayLessons.length ? <>{nextLesson && <div className="next-lesson-heading"><span className="field-help">{date === today ? clockMinute(nextLesson.start) <= nowMinutes ? 'JETZT IM UNTERRICHT' : 'ALS NÄCHSTES' : 'ERSTE STUNDE'}</span><strong>{nameFor(data, nextLesson)}</strong><p>{nextLesson.start}–{nextLesson.end}{nextLesson.room ? ` · Raum ${nextLesson.room}` : ' · Raum offen'}</p></div>}{remainingLessons.length > 0 && <><p className="lesson-list-label field-help">{date === today ? 'Dein weiterer Tag' : 'Deine Stunden'}</p>{remainingLessons.map(lesson => lessonRow(lesson))}</>}{!remainingLessons.length && <p className="lesson-finished">Dein Unterricht ist für heute vorbei.</p>}{pastLessons.length > 0 && <details className="product-details past-lessons"><summary>Vergangene Stunden · {pastLessons.length}</summary>{pastLessons.map(lesson => lessonRow(lesson))}</details>}</> : <EmptyState title="Kein Unterricht eingetragen" description={hasUnknownCycle ? 'A/B-Stunden erscheinen nach Festlegen der A-Woche.' : 'Für diesen Tag sind keine Stunden gespeichert.'} action={<Button variant="secondary" onClick={() => setEditing({ day: weekday })}>Stunde hinzufügen</Button>} />}</section> : <div className="timetable-week">{days.map(day => { const entries = lessonsForDate(data, day); return <section className="card lesson-day" key={day}><SectionHeading title={DAYS[new Date(`${day}T12:00:00`).getDay()]} subtitle={formatDate(day)} action={<Button variant="ghost" onClick={() => { setDate(day); setView('day'); }}>Öffnen</Button>} />{entries.length ? entries.map(lesson => lessonRow(lesson)) : <p className="muted small">Kein Unterricht eingetragen</p>}</section>; })}</div>}
    </> : <EmptyState icon={CalendarDays} title="Dein Unterricht, dein Rhythmus" description="Trage deine Stunden ein. Der Coach plant außerhalb deines Unterrichts und deiner festen Termine." action={<Button onClick={() => setEditing({})}><Plus size={17} /> Erste Stunde hinzufügen</Button>} />}
    {alternating && <details className="product-details timetable-cycle" open={hasUnknownCycle || undefined}><summary>A/B-Wochen festlegen</summary><form className="stack" onSubmit={event => { event.preventDefault(); onChange(current => saveSchedule(current, { cycleAnchor: anchor })); notify?.(anchor ? 'A-Woche gespeichert. Dein Stundenplan wurde angepasst.' : 'A/B-Zuordnung entfernt.'); }}><Field label="Ein Datum in einer bekannten A-Woche" help="Wähle einen Tag, von dem du sicher weißt, dass er in einer A-Woche liegt."><input type="date" value={anchor} onChange={event => setAnchor(event.target.value)} /></Field>{hasUnknownCycle && <p className="field-help">Bis die A-Woche bekannt ist, hält dein Lernplan beide möglichen Unterrichtszeiten frei. Die Tagesansicht zeigt nur sicher zugeordnete Stunden.</p>}<Button variant="secondary" type="submit">Wochenrhythmus speichern</Button></form></details>}
    {!!lessons.length && <details className="product-details"><summary>Alle Stunden bearbeiten · {lessons.length}</summary><div className="stack compact">{[...lessons].sort((a, b) => ORDER.indexOf(a.day) - ORDER.indexOf(b.day) || a.start.localeCompare(b.start)).map(lesson => <div className="timetable-edit-row" key={lesson.id}>{lessonRow(lesson, true)}<button className="icon-button" aria-label={`${nameFor(data, lesson)} löschen`} onClick={() => setRemoving(lesson)}><Trash2 size={17} /></button></div>)}</div></details>}
    {editing && <LessonForm data={data} lesson={editing.id ? editing : null} day={editing.day ?? weekday} onSave={save} onClose={() => setEditing(null)} />}
    {removing && <Modal title="Stunde entfernen?" onClose={() => setRemoving(null)}><p className="muted">{nameFor(data, removing)} wird aus deinem Stundenplan entfernt. Deine Noten bleiben erhalten.</p><div className="sheet-footer"><Button variant="secondary" onClick={() => setRemoving(null)}>Behalten</Button><Button onClick={() => { onChange(current => saveSchedule(current, { lessons: normalizeLessons(current.schedule.lessons).filter(item => item.id !== removing.id) })); setRemoving(null); notify?.('Stunde entfernt.'); }}>Entfernen</Button></div></Modal>}
  </div>;
}
