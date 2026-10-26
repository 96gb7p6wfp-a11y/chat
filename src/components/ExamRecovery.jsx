import React, { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Button, Field } from './UI.jsx';
import { addGrade } from '../coach.js';
import { GRADE_LABELS, GRADE_TYPES } from '../grades.js';
import SemesterEstimate from './SemesterEstimate.jsx';
import { RECOVERY_MOODS, RECOVERY_CAUSES, getExamReflection, saveExamReflection, getReturnedExamGrade, getPossibleExamGradeMatches, linkReturnedExamGrade, buildReturnedExamGrade, getRecoveryPlan } from '../recovery.js';
import './exam-recovery.css';

const fmt = value => value == null ? '—' : Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 });
export default function ExamRecovery({ data, exam, today, onChange, onPractice }) {
  const stored = getExamReflection(data, exam.id), grade = getReturnedExamGrade(data, exam.id);
  const [form, setForm] = useState(stored || { mood: '', causes: [], teacherFeedback: '', lostPoints: '', goal: '', outcome: '' });
  const [gradeForm, setGradeForm] = useState(grade || { points: '', type: '', date: '', semester: '', weight: '', note: '', confirmNew: false });
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const subject = data.subjects.find(item => item.id === exam.subjectId);
  const plan = getRecoveryPlan(data, exam.id, today), completed = plan.filter(stage => stage.completed).length;
  const matches = getPossibleExamGradeMatches(data, exam.id).filter(item => item.id !== grade?.id);
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const setGrade = key => event => setGradeForm(current => ({ ...current, [key]: event.target.value }));
  const save = (start = false) => {
    try {
      if (!form.mood) { setError('Wähle zuerst, wie die Prüfung für dich lief.'); return; }
      const patch = { ...form, ...(start && !stored?.startDate ? { startDate: today } : {}) };
      onChange(saveExamReflection(data, exam.id, patch, today));
      setError(''); setMessage(start ? 'Verbesserungsplan aktiv. Die nächste Einheit wird in deine verfügbare Lernzeit eingeordnet.' : 'Nachbesprechung gespeichert.');
    } catch (err) { setError(err.message); }
  };
  return <div className="exam-recovery stack">
    <header className="recovery-heading"><span className="eyebrow">NACH DER KLAUSUR</span><h3>Wie lief deine Klausur?</h3><p className="muted small">{grade ? `Zurückgegeben: ${fmt(grade.points)} / 15 Punkte` : 'Das Ergebnis ist noch offen. Dein Eindruck wird nicht als Note gespeichert.'}</p></header>
    <div className="recovery-moods" role="group" aria-label="Wie lief deine Klausur?">{Object.entries(RECOVERY_MOODS).map(([value, label]) => <button type="button" key={value} aria-pressed={form.mood === value} onClick={() => setForm(current => ({ ...current, mood: value }))}>{form.mood === value && <Check size={15}/>} {label}</button>)}</div>
    <details className="product-details" open={form.mood === 'poor' || undefined}><summary>Was war schwierig?</summary><div className="stack"><p className="field-help">Wähle nur, was du selbst beobachtet hast. Ohne Feedback beginnt der Plan mit einer vorläufigen Diagnose.</p><div className="recovery-causes">{Object.entries(RECOVERY_CAUSES).map(([value, label]) => <label key={value}><input type="checkbox" checked={form.causes.includes(value)} onChange={event => setForm(current => ({ ...current, causes: event.target.checked ? [...current.causes, value] : current.causes.filter(cause => cause !== value) }))}/><span>{label}</span></label>)}</div><Field label="Feedback der Lehrkraft · optional"><textarea rows="3" maxLength="3000" value={form.teacherFeedback} onChange={set('teacherFeedback')} placeholder="Konkreter Hinweis aus deiner Klausur"/></Field><Field label="Wo gingen Punkte verloren? · optional"><textarea rows="2" maxLength="2000" value={form.lostPoints} onChange={set('lostPoints')}/></Field><Field label="Dein nächstes Verbesserungsziel · optional"><input maxLength="500" value={form.goal} onChange={set('goal')} placeholder="z. B. Textbeleg und Wirkung verbinden"/></Field></div></details>
    <div className="recovery-actions"><Button variant="secondary" onClick={() => save(false)}>Eindruck speichern</Button><Button onClick={() => save(true)}>{stored?.startDate ? 'Plan aktualisieren' : 'Verbesserungsplan starten'} <ArrowRight size={15}/></Button></div>
    {stored?.causes?.length > 0 && <p className="field-help">Aktueller Übungsschwerpunkt: {RECOVERY_CAUSES[stored.causes[0]]}.{stored.causes.length > 1 ? ' Weitere beobachtete Schwierigkeiten bleiben gespeichert.' : ''}</p>}
    {stored?.startDate && exam.subjectId !== 'english' && <p className="field-help">Wähle vor der Übung dein konkretes Fehlerthema. Für dieses Fach ist noch kein ursachenspezifisches Diagnosemodul hinterlegt.</p>}
    {message && <p className="field-help" role="status">{message}</p>}
    {plan.length > 0 && <section className="recovery-plan"><div className="recovery-plan-top"><h4>Dein nächster Schritt</h4><span>{completed} / {plan.length}</span></div><ol>{plan.map(stage => <li key={stage.id} className={stage.completed ? 'is-complete' : ''}><span>{stage.completed ? '✓' : `${stage.minutes} Min.`}</span><div><strong>{stage.label}</strong><small>{stage.date < today && !stage.completed ? 'Wird neu eingeordnet' : new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(new Date(`${stage.date}T12:00:00`))}{stage.provisional && stage.id.endsWith('-diagnose') ? ' · vorläufig' : ''}</small></div></li>)}</ol><p className="field-help">Die Tage sind eine Reihenfolge, keine zusätzlichen Pflichtstunden. Klausuren und deine verfügbare Lernzeit haben Vorrang.</p>{onPractice && <Button variant="secondary" onClick={onPractice}>Nächste eingeplante Übung öffnen</Button>}</section>}
    <details className="product-details"><summary>{grade ? 'Zurückgegebene Note bearbeiten' : 'Offizielle Note ist zurück'}</summary><form className="stack" onSubmit={event => {
      event.preventDefault();
      try {
        const record = buildReturnedExamGrade(data, exam.id, gradeForm, today);
        const next = addGrade(data, record);
        onChange(saveExamReflection(next, exam.id, { ...form, gradeId: record.id, startDate: stored?.startDate || ((subject?.target != null && record.points < subject.target) || form.mood === 'poor' ? today : '') }, today));
        setMessage('Note gespeichert. Berechnung und Lernplan berücksichtigen das Ergebnis.'); setError('');
      } catch (err) { setError(err.message); }
    }}>
      {matches.length > 0 && <div className="recovery-existing"><p className="field-help">Mögliche vorhandene Note: Bitte verknüpfen, um doppelte Einträge zu vermeiden.</p>{matches.map(item => <Button key={item.id} variant="secondary" onClick={() => { onChange(linkReturnedExamGrade(data, exam.id, item.id, today)); setMessage('Vorhandene Note verknüpft.'); }}>{fmt(item.points)} Punkte · {item.date} verknüpfen</Button>)}<label className="checkbox-field"><input type="checkbox" checked={gradeForm.confirmNew} onChange={event => setGradeForm(current => ({ ...current, confirmNew: event.target.checked }))}/>Es ist tatsächlich eine andere Leistung</label></div>}
      <p className="field-help">Trage nur die tatsächlich zurückgegebene Note ein. Leistungsdatum und Gewicht bleiben bis zu deiner Bestätigung offen.</p>
      <div className="form-grid"><Field label="Punkte (0–15)"><input type="number" min="0" max="15" step="0.1" value={gradeForm.points} onChange={setGrade('points')} required/></Field><Field label="Leistungsart"><select value={gradeForm.type} onChange={setGrade('type')} required><option value="">Bitte bestätigen</option>{GRADE_TYPES.map(type => <option key={type} value={type}>{GRADE_LABELS[type]}</option>)}</select></Field></div>
      <div className="form-grid"><Field label="Tatsächliches Leistungsdatum"><input type="date" max={today} value={gradeForm.date} onChange={setGrade('date')} required/></Field><Field label="Halbjahr"><select value={gradeForm.semester} onChange={setGrade('semester')} required><option value="">Bitte bestätigen</option>{['Q1', 'Q2', 'Q3', 'Q4'].map(value => <option key={value}>{value}</option>)}</select></Field></div>
      <Field label="Bestätigtes relatives Einzelgewicht" help="Gewicht 2 zählt doppelt wie 1, falls du nach Einzelgewichten rechnest. Deine Fachregelung wird dadurch nicht geändert."><input type="number" min="0.001" max="100000" step="any" value={gradeForm.weight} onChange={setGrade('weight')} required/></Field><Field label="Notiz · optional"><textarea rows="2" maxLength="3000" value={gradeForm.note} onChange={setGrade('note')}/></Field><Button type="submit">Bestätigte Note speichern</Button>
    </form></details>
    <details className="product-details"><summary>Was kann Mitarbeit noch verändern?</summary><SemesterEstimate data={data} subjectId={exam.subjectId} semester={exam.semester || grade?.semester || data.profile?.schoolYear || 'Q1'} onChange={onChange}/></details>
    {completed === plan.length && plan.length > 0 && <Field label="Verbesserung prüfen"><textarea rows="3" value={form.outcome} onChange={set('outcome')} placeholder="Was klappt jetzt besser? Welche konkrete Rückmeldung oder spätere Leistung zeigt das?"/></Field>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
