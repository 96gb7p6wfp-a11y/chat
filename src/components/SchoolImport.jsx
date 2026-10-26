import React, { useMemo, useState } from 'react';
import { BookOpen, CalendarDays, Check, ChevronRight, ClipboardCheck } from 'lucide-react';
import { addGrade } from '../coach.js';
import { GRADE_LABELS, GRADE_TYPES, normalizeGrading } from '../grades.js';
import { CONFIRMED_Q1_EXAMS, Q1_TIMETABLE_DRAFT, SCHOOL_IMPORT_NOTICE, applyExamImport, applyTimetableImport, confirmGermanGradeDraft, hasGermanFourResult, previewExamImport, previewTimetableImport } from '../school-import.js';
import { subjectLabel } from '../i18n.js';
import { Button, Field, Modal, formatDate } from './UI.jsx';
import './school-import.css';

const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const labelFor = (data, record) => subjectLabel(data.subjects.find(subject => subject.id === record.subjectId) || record.subjectId);
const titles = { overview: 'Deine Q1-Unterlagen', timetable: 'Stundenplan prüfen', exams: 'Bestätigte Klausuren', grade: 'Deutsch-Ergebnis ergänzen' };

/** Mount on demand; the document pack never replaces a user's saved records. */
export default function SchoolImport({ data, today, onChange, notify, onClose, initialSection = 'overview' }) {
  const [section, setSection] = useState(['overview', 'timetable', 'exams', 'grade'].includes(initialSection) ? initialSection : 'overview');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const back = () => { setSection('overview'); setError(''); };
  const done = value => { setMessage(value); notify?.(value); back(); };
  const lessonPreview = previewTimetableImport(data);
  const examPreview = previewExamImport(data);
  const newLessons = lessonPreview.filter(item => item.status === 'new').length;
  const newExams = examPreview.filter(item => item.status === 'new').length;
  return <Modal title={titles[section]} onClose={onClose} className="school-import-modal"><div className="stack school-import">
    {section === 'overview' ? <>
      <p className="muted">Q1 · Hessen · 1. Halbjahr 2026/2027. Prüfe deine Unterlagen, bevor du sie in deinen Plan übernimmst.</p>
      {message && <p className="school-import-success" role="status"><Check size={17} />{message}</p>}
      <div className="school-import-choices">
        <button type="button" className="school-import-choice" onClick={() => setSection('timetable')}><CalendarDays size={20}/><span><strong>Deinen Stundenplan prüfen</strong><small>{newLessons ? `${newLessons} neue Unterrichtsblöcke` : '19 Blöcke mit deinem Plan vergleichen'} · Doppelstunden bleiben zusammen</small></span><ChevronRight size={18}/></button>
        <button type="button" className="school-import-choice" onClick={() => setSection('exams')}><ClipboardCheck size={20}/><span><strong>9 bestätigte Klausuren</strong><small>{newExams ? `${newExams} Termine ergänzen` : 'Alle Termine bereits vorhanden'} · Oktober bis Dezember 2026</small></span><ChevronRight size={18}/></button>
        {!hasGermanFourResult(data) ? <button type="button" className="school-import-choice" onClick={() => setSection('grade')}><BookOpen size={20}/><span><strong>Deutsch · 4 von 15 Punkten</strong><small>Entwurf: Art, Datum und Gewicht noch ergänzen</small></span><ChevronRight size={18}/></button> : <div className="school-import-existing"><Check size={17}/><p>Das Deutsch-Ergebnis ist bereits erfasst. Deine späteren Korrekturen bleiben erhalten. Prüfe den Eintrag unter Lernen → Noten.</p></div>}
      </div>
      <details className="product-details"><summary>So bleiben deine Angaben erhalten</summary><p className="field-help">Es werden nur fehlende Einträge ergänzt. Bereits gespeicherte Termine und Stunden bleiben auch dann erhalten, wenn du sie nach einem Import geändert hast. Überschneidungen werden zur Prüfung angezeigt. Du kannst anschließend alles im Lernplan bearbeiten.</p></details>
    </> : section === 'timetable' ? <TimetableReview data={data} onBack={back} onSave={drafts => {
      onChange(current => applyTimetableImport(current, drafts)); done('Stundenplan übernommen. Dein Lernplan hält die Unterrichtszeiten frei.');
    }} /> : section === 'exams' ? <ExamReview data={data} onBack={back} onSave={(drafts, options) => {
      onChange(current => applyExamImport(current, drafts, options)); done('Klausuren übernommen. Die Vorbereitung berücksichtigt deine Termine.');
    }} /> : <GermanDraft data={data} today={today} error={error} onBack={back} onSave={details => {
      try {
        // Validate against the currently displayed state; validate again within
        // the update so a second open tab cannot insert a duplicate silently.
        confirmGermanGradeDraft(data, details, today);
        onChange(current => addGrade(current, confirmGermanGradeDraft(current, details, today)));
        done('Deutsch-Ergebnis gespeichert. Es ist eine Einzelleistung, keine bestätigte Kursnote.');
      } catch (cause) { setError(cause.message || 'Prüfe die fehlenden Angaben.'); }
    }} />}
  </div></Modal>;
}

function TimetableReview({ data, onBack, onSave }) {
  const [drafts, setDrafts] = useState(() => structuredClone(Q1_TIMETABLE_DRAFT));
  const [selected, setSelected] = useState(() => Q1_TIMETABLE_DRAFT.map(lesson => lesson.id));
  const [confirmed, setConfirmed] = useState(false);
  const included = drafts.filter(lesson => selected.includes(lesson.id));
  const preview = useMemo(() => previewTimetableImport(data, included), [data, drafts, selected]);
  const statuses = new Map(preview.map(item => [item.draft.id, item]));
  const blocked = preview.some(item => ['conflict', 'invalid', 'missing-subject'].includes(item.status));
  const newCount = preview.filter(item => item.status === 'new').length;
  const set = (id, key, value) => { setConfirmed(false); setDrafts(current => current.map(lesson => lesson.id === id ? { ...lesson, [key]: value } : lesson)); };
  function toggle(id) { setConfirmed(false); setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }
  return <form className="stack" onSubmit={event => { event.preventDefault(); if (confirmed && !blocked && included.length) onSave(included); }}>
    <p className="muted">Aus deinem Foto: 19 Unterrichtsblöcke. Vergleiche besonders Räume, Kürzel und die Uhrzeiten am Nachmittag.</p>
    <p className="field-help">Dienstag Sport: Raum unbekannt. Die 6. Stunde ist als 12:30–13:10 Uhr abgelesen. Der Plan nennt keine A/B-Wochen. Es werden keine Ferien- oder Semesterdaten angenommen.</p>
    {[1, 2, 3, 4, 5].map(day => <section className="school-import-day" key={day}><h3>{DAYS[day]}</h3>{drafts.filter(lesson => lesson.day === day).map(lesson => {
      const item = statuses.get(lesson.id) || previewTimetableImport(data, [lesson])[0];
      const existing = item.status === 'existing';
      return <div className={`school-import-record ${['conflict', 'invalid', 'missing-subject'].includes(item.status) ? 'school-import-warning' : ''}`} key={lesson.id}>
        <label className="checkbox-label school-import-select"><input type="checkbox" checked={selected.includes(lesson.id)} onChange={() => toggle(lesson.id)} /><span><strong>{labelFor(data, lesson)}</strong><small>{lesson.start}–{lesson.end} · {lesson.periodStart === lesson.periodEnd ? `${lesson.periodStart}. Stunde` : `${lesson.periodStart}.–${lesson.periodEnd}. Stunde`}</small></span></label>
        <p className="field-help school-import-status">{existing ? '✓ Bereits gespeichert. Deine vorhandenen Angaben gelten.' : selected.includes(lesson.id) ? item.reason : 'Wird ausgelassen.'}</p>
        {existing ? <p className="field-help">Gespeichert: {DAYS[item.existing.day]} · {item.existing.start}–{item.existing.end}{item.existing.room ? ` · ${item.existing.room}` : ''}</p> : <details className="school-import-correction"><summary>{lesson.courseCode} · {lesson.room || 'Raum offen'} · Prüfen / korrigieren</summary><div className="stack compact">
          <Field label="Fach"><select value={lesson.subjectId} onChange={event => set(lesson.id, 'subjectId', event.target.value)}>{data.subjects.map(subject => <option value={subject.id} key={subject.id}>{subjectLabel(subject)}</option>)}</select></Field>
          <Field label="Wochentag"><select value={lesson.day} onChange={event => set(lesson.id, 'day', Number(event.target.value))}>{DAYS.map((value, index) => <option value={index} key={value}>{value}</option>)}</select></Field>
          <div className="form-grid"><Field label="Beginn"><input type="time" value={lesson.start} onChange={event => set(lesson.id, 'start', event.target.value)} /></Field><Field label="Ende"><input type="time" value={lesson.end} onChange={event => set(lesson.id, 'end', event.target.value)} /></Field></div>
          <div className="form-grid"><Field label="Erste Stunde"><input type="number" min="1" max="20" value={lesson.periodStart} onChange={event => set(lesson.id, 'periodStart', Number(event.target.value))} /></Field><Field label="Letzte Stunde"><input type="number" min={lesson.periodStart} max="20" value={lesson.periodEnd} onChange={event => set(lesson.id, 'periodEnd', Number(event.target.value))} /></Field></div>
          <Field label="Kursbezeichnung"><input value={lesson.courseCode} maxLength={100} onChange={event => set(lesson.id, 'courseCode', event.target.value)} /></Field>
          <Field label="Kursart laut Stundenplan"><select value={lesson.courseType} onChange={event => set(lesson.id, 'courseType', event.target.value)}><option value="GK">GK</option><option value="LK">LK</option><option value="PF">PF</option></select></Field>
          <div className="form-grid"><Field label="Raum · optional"><input value={lesson.room} maxLength={100} onChange={event => set(lesson.id, 'room', event.target.value)} /></Field><Field label="Lehrkraft · Kürzel"><input value={lesson.teacher} maxLength={150} onChange={event => set(lesson.id, 'teacher', event.target.value)} /></Field></div>
        </div></details>}
      </div>;
    })}</section>)}
    {blocked && <p className="form-error" role="alert">Korrigiere die markierten Blöcke oder wähle sie ab. Vorhandene Stunden werden nicht überschrieben.</p>}
    <label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Ich habe die ausgewählten Stunden geprüft. Sie gelten als mein aktueller Wochenplan, bis ich sie ändere.</span></label>
    <div className="sheet-footer"><Button variant="secondary" onClick={onBack}>Zurück</Button><Button type="submit" disabled={!confirmed || blocked || !included.length}>{newCount ? `${newCount} Blöcke übernehmen` : 'Abgleich bestätigen'}</Button></div>
  </form>;
}

function ExamReview({ data, onBack, onSave }) {
  const [includeSubjects, setIncludeSubjects] = useState(true);
  const [selected, setSelected] = useState(() => CONFIRMED_Q1_EXAMS.map(exam => exam.id));
  const [confirmed, setConfirmed] = useState(false);
  const preview = previewExamImport(data);
  const included = CONFIRMED_Q1_EXAMS.filter(exam => selected.includes(exam.id));
  const newCount = preview.filter(item => selected.includes(item.draft.id) && item.status === 'new').length;
  const missing = preview.some(item => selected.includes(item.draft.id) && item.status === 'missing-subject');
  return <form className="stack" onSubmit={event => { event.preventDefault(); if (confirmed && !missing && included.length) onSave(included, { includeSubjects }); }}>
    <p className="muted">Nur deine neun bestätigten Klausuren · alle Termine 2026.</p>
    <div className="school-import-exams">{preview.map(({ draft, existing, status, reason }) => <div className="school-import-record" key={draft.id}><label className="checkbox-label school-import-select"><input type="checkbox" checked={selected.includes(draft.id)} onChange={() => { setConfirmed(false); setSelected(current => current.includes(draft.id) ? current.filter(value => value !== draft.id) : [...current, draft.id]); }} /><span><strong>{labelFor(data, draft)} · {draft.level}</strong><small>{formatDate(draft.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</small></span></label><p className="field-help school-import-status">{status === 'existing' ? `✓ ${reason}` : reason}</p>{existing?.date !== undefined && existing.date !== draft.date && <p className="field-help">Dein gespeicherter Termin bleibt: {formatDate(existing.date)}.</p>}</div>)}</div>
    <details className="product-details"><summary>Abgleich mit dem Foto</summary><p className="field-help">{SCHOOL_IMPORT_NOTICE}</p><p className="field-help">Eine Abweichung lässt sich aus dem klassenübergreifenden Foto nicht zuverlässig einem deiner Kurse zuordnen. Es wurde deshalb kein persönlicher Termin aus dem Foto geändert.</p></details>
    <label className="checkbox-label"><input type="checkbox" checked={includeSubjects} onChange={event => { setIncludeSubjects(event.target.checked); setConfirmed(false); }} /><span>Prüfungsfächer im Lernplan berücksichtigen</span></label>
    <p className="field-help">Dabei werden ausgewählte, bisher ausgeblendete Fächer für den Lernplan wieder aktiviert. Noten und Ziele bleiben erhalten. Ohne diese Auswahl bleiben ausgeblendete Fächer von der täglichen Planung ausgenommen.</p>
    <label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Diese ausgewählten Termine entsprechen meiner bestätigten Liste.</span></label>
    {missing && <p className="form-error">Ergänze zuerst das fehlende Fach oder wähle den betroffenen Termin ab.</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={onBack}>Zurück</Button><Button type="submit" disabled={!confirmed || missing || !included.length}>{newCount ? `${newCount} Klausuren übernehmen` : 'Abgleich bestätigen'}</Button></div>
  </form>;
}

function GermanDraft({ data, today, onBack, onSave, error }) {
  const subject = data.subjects.find(value => value.id === 'german');
  const grading = normalizeGrading(subject?.grading);
  const [form, setForm] = useState({ type: '', date: '', semester: 'Q1', weight: '', note: '', confirmed: false });
  const set = key => event => setForm(current => ({ ...current, [key]: key === 'confirmed' ? event.target.checked : event.target.value }));
  const rule = grading.mode === 'weighted' ? 'Es gilt deine Gewichtung je Einzelleistung.' : grading.mode === 'category' ? 'Es gelten deine Gewichte je Leistungsart; innerhalb einer Art zählen Leistungen gleich.' : 'Aktuell wird ein einfacher Mittelwert gezeigt; jede Leistung zählt gleich. Das gespeicherte Einzelgewicht wirkt erst bei Berechnung nach Einzelgewichten.';
  return <form className="stack" onSubmit={event => { event.preventDefault(); onSave(form); }}>
    <div className="school-import-grade-draft"><span className="page-kicker">UNBESTÄTIGTER ENTWURF</span><h3>Deutsch · 4 / 15 Punkte</h3><p className="muted">Ein einzelnes Ergebnis, kein bestätigter Deutsch-Schnitt. Erst mit deinen fehlenden Angaben wird es gespeichert.</p></div>
    <Field label="Tatsächliche Leistungsart"><select required value={form.type} onChange={set('type')}><option value="">Bitte auswählen</option>{GRADE_TYPES.map(type => <option value={type} key={type}>{GRADE_LABELS[type]}</option>)}</select></Field>
    <div className="form-grid"><Field label="Tatsächliches Datum"><input required type="date" max={today} value={form.date} onChange={set('date')} /></Field><Field label="Halbjahr"><select value={form.semester} onChange={set('semester')}>{['Q1', 'Q2', 'Q3', 'Q4'].map(value => <option key={value}>{value}</option>)}</select></Field></div>
    <Field label="Relatives Gewicht dieser Leistung" help="Trage nur eine dir bekannte Gewichtung ein. Gewicht 2 zählt bei Einzelgewichtung doppelt so stark wie 1. Wenn du es nicht weißt, frage zuerst deine Lehrkraft."><input required type="number" min="0.01" max="100000" step="any" inputMode="decimal" value={form.weight} onChange={set('weight')} placeholder="Noch zu bestätigen" /></Field>
    <p className="field-help">{rule} Die Berechnungsregel kannst du unter Lernen → Noten → Deutsch ändern.</p>
    <Field label="Thema / Feedback · optional"><textarea rows="3" maxLength={3000} value={form.note} onChange={set('note')} /></Field>
    <label className="checkbox-label"><input type="checkbox" required checked={form.confirmed} onChange={set('confirmed')} /><span>Art, Datum und Gewicht sind richtig. Ich habe die geltende Berechnungsregel geprüft.</span></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={onBack}>Später ergänzen</Button><Button type="submit">Ergebnis bestätigen</Button></div>
  </form>;
}
