import React, { useId, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Plus, Trash2 } from 'lucide-react';
import { createPersonalProfile, ensureDailyPlan, saveExam } from '../coach.js';
import { Modal } from './UI.jsx';

const FIELDS = ['Business Informatics', 'Data / Computer Science', 'Business', 'Engineering / Technology'];
const LEVELS = ['Not sure yet', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native / fluent', 'Native / near-native'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STEP_TITLES = ['Deine Richtung', 'Deine Ausgangslage', 'Zeit für Fortschritt', 'Was steht als Nächstes an?'];
const FIELD_LABELS = { 'Business Informatics': 'Wirtschaftsinformatik', 'Data / Computer Science': 'Informatik / Data Science / KI', Business: 'Wirtschaft', 'Engineering / Technology': 'Ingenieurwesen / Technologie' };
const LEVEL_LABELS = { 'Not sure yet': 'Noch nicht eingeschätzt', 'Native / fluent': 'Fließend / muttersprachlich', 'Native / near-native': 'Muttersprachlich / nahezu muttersprachlich' };
const SUBJECT_LABELS = { Mathematics: 'Mathematik', Physics: 'Physik', English: 'Englisch', German: 'Deutsch', History: 'Geschichte', 'Computer Science': 'Informatik', 'Politics / Economics': 'Politik / Wirtschaft', Art: 'Kunst', Religion: 'Religion', Sport: 'Sport' };
const subjectLabel = subject => SUBJECT_LABELS[subject.name] || subject.name;
const DAY_LABELS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const split = text => text.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
const id = () => globalThis.crypto?.randomUUID?.() || `setup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function Field({ label, help, children }) { const generatedId = useId(); const fieldId = children.props.id || generatedId; return <div className="field"><label className="field-label" htmlFor={fieldId}>{label}</label>{React.cloneElement(children, { id: fieldId, 'aria-describedby': help ? `${fieldId}-help` : children.props['aria-describedby'] })}{help && <span id={`${fieldId}-help`} className="field-help">{help}</span>}</div>; }

export default function Onboarding({ data, today, onFinish, onClose }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [state, setState] = useState(() => {
    const clean = createPersonalProfile({ today });
    // Fresh storage already carries the starting profile. Reopening setup must
    // preserve personal edits even if setup has not yet been marked complete.
    const source = data && !data.demo && !data.demoData && !data.isDemo ? data : clean;
    return { ...source, profile: { ...source.profile }, subjects: source.subjects.map(subject => ({ ...subject, weakTopics: [...(subject.weakTopics || [])] })), schedule: { ...source.schedule, weekly: source.schedule.weekly.map(day => ({ ...day })), fixedActivities: source.schedule.fixedActivities.map(activity => ({ ...activity, days: [...(activity.days || [])] })) } };
  });
  const [examDraft, setExamDraft] = useState({ subjectId: '', title: '', date: '', topics: '', format: 'written' });
  const [fixedDraft, setFixedDraft] = useState({ title: '', days: [1], start: '16:00', end: '17:00', category: 'activity' });
  const [fixedOpen, setFixedOpen] = useState(false);
  const [examOpen, setExamOpen] = useState(false);
  const [otherFields, setOtherFields] = useState(() => (state.profile.targetFields || []).filter(field => !FIELDS.includes(field)).join(', '));
  const [universityDrafts, setUniversityDrafts] = useState(() => ({ USA: state.universities.filter(u => u.country === 'USA').map(u => u.name).join('\n'), Germany: state.universities.filter(u => u.country === 'Germany').map(u => u.name).join('\n') }));
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  const [topicDrafts, setTopicDrafts] = useState({});
  const patchProfile = patch => setState(s => ({ ...s, profile: { ...s.profile, ...patch } }));
  const patchSubject = (subjectId, patch) => setState(s => ({ ...s, subjects: s.subjects.map(subject => subject.id === subjectId ? { ...subject, ...patch } : subject) }));
  const patchWeekly = (day, key, value) => setState(s => ({ ...s, schedule: { ...s.schedule, weekly: s.schedule.weekly.map(item => item.day === day ? { ...item, [key]: value } : item) } }));
  const enabledSubjects = state.subjects.filter(s => s.enabled !== false);

  function next(event) {
    event.preventDefault(); setError('');
    if (step === 0) {
      if (!state.profile.pathways?.length) return setError('Wähle mindestens einen Hochschulweg. Beide Wege sind möglich.');
      if (!Number.isInteger(Number(state.profile.graduationYear)) || Number(state.profile.graduationYear) < 2026 || Number(state.profile.graduationYear) > 2040) return setError('Wähle ein Abiturjahr zwischen 2026 und 2040.');
      for (const key of ['applicationYear', 'universityStartYear']) if (state.profile[key] && (!Number.isInteger(Number(state.profile[key])) || Number(state.profile[key]) < 2026 || Number(state.profile[key]) > 2042)) return setError('Wähle ein Bewerbungs- oder Studienbeginnjahr zwischen 2026 und 2042 oder lasse es offen.');
    }
    if (step === 1) {
      if (state.profile.targetAverage != null && state.profile.targetAverage !== '' && (!Number.isFinite(Number(state.profile.targetAverage)) || Number(state.profile.targetAverage) < 0 || Number(state.profile.targetAverage) > 15)) return setError('Dein Zielschnitt muss zwischen 0 und 15 Punkten liegen.');
      const invalid = enabledSubjects.some(subject => ['written', 'oral', 'target'].some(key => subject[key] != null && subject[key] !== '' && (!Number.isFinite(Number(subject[key])) || Number(subject[key]) < 0 || Number(subject[key]) > 15)));
      if (invalid) return setError('Nutze 0–15 Punkte. Unbekannte Ergebnisse bleiben leer.');
    }
    if (step === 2 && state.schedule.weekly.some(day => day.minutes < 0 || day.minutes > 720 || (day.windowStart && day.windowEnd && day.windowEnd <= day.windowStart))) return setError('Nutze 0–720 Minuten pro Tag und ein Lernfenster, dessen Ende nach dem Beginn liegt.');
    if (step === 2 && fixedOpen && fixedDraft.title.trim()) return setError('Speichere die feste Aktivität, bevor du fortfährst.');
    if (step === 3 && examOpen && (examDraft.title.trim() || examDraft.date || examDraft.topics.trim())) return setError('Speichere die Prüfung, bevor du deinen Plan erstellst.');
    if (step < 3) { setStep(step + 1); return; }
    finish();
  }
  function finish() {
    const universities = ['USA', 'Germany'].flatMap(country => [...new Set(split(universityDrafts[country]))].map(name => state.universities.find(u => u.name.toLowerCase() === name.toLowerCase() && u.country === country) || { id: id(), name, country, program: '', deadline: '', requirements: '', notes: '', url: '', status: 'researching' }));
    const personal = { ...state, universities, onboardingCompleted: true, demo: false, demoData: false, isDemo: false, profile: { language: 'de', ...state.profile, targetAverage: state.profile.targetAverage === '' || state.profile.targetAverage == null ? null : Number(state.profile.targetAverage), graduationYear: Number(state.profile.graduationYear), applicationYear: state.profile.applicationYear ? Number(state.profile.applicationYear) : '', universityStartYear: state.profile.universityStartYear ? Number(state.profile.universityStartYear) : '', targetFields: [...new Set([...state.profile.targetFields.filter(field => FIELDS.includes(field)), ...split(otherFields)])] }, subjects: state.subjects.map(subject => {
      const grade = value => value === '' || value == null ? null : Number(value);
      const written = grade(subject.written), oral = grade(subject.oral);
      const existing = data && !data.demo && !data.demoData && !data.isDemo ? data.subjects.find(item => item.id === subject.id) : null;
      return { ...subject, written, oral, target: grade(subject.target),
        baselineWritten: existing && written === existing.written ? (existing.baselineWritten === undefined ? existing.written : existing.baselineWritten) : written,
        baselineOral: existing && oral === existing.oral ? (existing.baselineOral === undefined ? existing.oral : existing.baselineOral) : oral };
    }) };
    onFinish(ensureDailyPlan(personal, today));
  }
  function skip() {
    if (data?.onboardingCompleted && !data.demo && !data.demoData && !data.isDemo) {
      onFinish(ensureDailyPlan({ ...data, onboardingCompleted: true }, today));
      return;
    }
    if (!state.profile.pathways?.length || !Number.isInteger(Number(state.profile.graduationYear)) || Number(state.profile.graduationYear) < 2026 || Number(state.profile.graduationYear) > 2040) {
      setStep(0); setError('Wähle ein Abiturjahr und mindestens einen Hochschulweg für deinen Plan.'); return;
    }
    if (['applicationYear', 'universityStartYear'].some(key => state.profile[key] && (!Number.isInteger(Number(state.profile[key])) || Number(state.profile[key]) < 2026 || Number(state.profile[key]) > 2042))) {
      setStep(0); setError('Prüfe Bewerbungs- und Studienbeginnjahr oder lasse sie offen.'); return;
    }
    if (state.profile.targetAverage != null && state.profile.targetAverage !== '' && (!Number.isFinite(Number(state.profile.targetAverage)) || Number(state.profile.targetAverage) < 0 || Number(state.profile.targetAverage) > 15)) { setStep(1); setError('Dein Zielschnitt muss zwischen 0 und 15 Punkten liegen.'); return; }
    if (enabledSubjects.some(subject => ['written', 'oral', 'target'].some(key => subject[key] != null && subject[key] !== '' && (!Number.isFinite(Number(subject[key])) || Number(subject[key]) < 0 || Number(subject[key]) > 15)))) {
      setStep(1); setError('Nutze 0–15 Punkte oder lasse die Ergebnisse offen.'); return;
    }
    if (state.schedule.weekly.some(day => day.minutes < 0 || day.minutes > 720 || (day.windowStart && day.windowEnd && day.windowEnd <= day.windowStart))) {
      setStep(2); setError('Prüfe deine verfügbaren Minuten und Lernzeiten.'); return;
    }
    finish();
  }
  function addFixed() {
    if (!fixedDraft.title.trim()) return setError('Gib einen Namen für die Aktivität ein.');
    if (!fixedDraft.days.length || fixedDraft.end <= fixedDraft.start) return setError('Wähle die Tage und einen Zeitraum, dessen Ende nach dem Beginn liegt.');
    setState(s => ({ ...s, schedule: { ...s.schedule, fixedActivities: [...s.schedule.fixedActivities, { ...fixedDraft, id: id(), title: fixedDraft.title.trim() }] } }));
    setFixedOpen(false); setFixedDraft({ title: '', days: [1], start: '16:00', end: '17:00', category: 'activity' }); setError('');
  }
  function addExam() {
    if (!examDraft.subjectId || !examDraft.title.trim() || !examDraft.date) return setError('Wähle das Fach und ergänze Titel und Datum der Prüfung.');
    if (examDraft.date < today) return setError('Wähle heute oder ein zukünftiges Datum.');
    setState(s => saveExam(s, { ...examDraft, createdDate: today, topics: split(examDraft.topics), target: s.subjects.find(item => item.id === examDraft.subjectId)?.target ?? null }));
    setExamOpen(false); setExamDraft({ subjectId: '', title: '', date: '', topics: '', format: 'written' }); setError('');
  }

  return <Modal title="Dein persönlicher Lernplan" onClose={onClose} wide>
    <form className="onboarding stack" onSubmit={next}>
      <div className="onboarding-progress" aria-label={`Einrichtung: Schritt ${step + 1} von 4`}>{STEP_TITLES.map((title, i) => <span className={i <= step ? 'active' : ''} key={title}/>)}</div>
      <div><p className="page-kicker">SCHRITT {step + 1} VON 4</p><h2 className="onboarding-title">{STEP_TITLES[step]}</h2><p className="muted">{step === 0 ? 'Beginne mit deinen Zielen. Du kannst später alles ändern.' : step === 1 ? 'Trage nur aktuelle Angaben ein. Unbekanntes bleibt offen.' : step === 2 ? 'Plane realistisch und lass Raum für Erholung.' : 'Ergänze deine nächste Prüfung oder fahre ohne sie fort.'}</p></div>
      {step === 0 && <div className="stack">
        <Field label="Dein Name (optional)"><input value={state.profile.name || ''} onChange={e => patchProfile({ name: e.target.value })} maxLength={80} autoComplete="given-name" placeholder="Wie dürfen wir dich nennen?"/></Field>
        <div className="form-grid"><Field label="Aktuelle Schulphase"><select value={state.profile.schoolYear || 'Q1'} onChange={e => patchProfile({ schoolYear: e.target.value })}>{['E1', 'E2', 'Q1', 'Q2', 'Q3', 'Q4', 'Graduated'].map(value => <option key={value} value={value}>{value === 'Graduated' ? 'Abitur abgeschlossen' : value}</option>)}</select></Field><Field label="Voraussichtliches Abiturjahr"><input type="number" min="2026" max="2040" required value={state.profile.graduationYear} onChange={e => patchProfile({ graduationYear: e.target.value })}/></Field></div>
        <Field label="Schulsystem"><input value={state.profile.schoolSystem || 'Gymnasium · Hessen'} onChange={e => patchProfile({ schoolSystem: e.target.value })} maxLength={120}/></Field>
        <fieldset className="field"><legend className="field-label">Hochschulwege</legend><div className="row wrap">{['USA', 'Germany'].map(value => <label key={value} className="checkbox-label"><input type="checkbox" checked={state.profile.pathways.includes(value)} onChange={e => patchProfile({ pathways: e.target.checked ? [...state.profile.pathways, value] : state.profile.pathways.filter(p => p !== value) })}/>{value === 'Germany' ? 'Deutschland' : FIELD_LABELS[value] || value}</label>)}</div></fieldset>
        <div className="form-grid">{['USA', 'Germany'].map(country => <Field label={`${country === 'Germany' ? 'Deutschland' : country}: Wunschhochschulen (optional)`} help="Eine pro Zeile." key={country}><textarea rows="2" value={universityDrafts[country]} onChange={e => { const value = e.target.value; setUniversityDrafts(s => ({ ...s, [country]: value })); }} maxLength={1000} placeholder={country === 'USA' ? 'UCLA\nUC Berkeley' : 'Noch in Orientierung'}/></Field>)}</div>
        <fieldset className="field"><legend className="field-label">Deine Studieninteressen</legend><div className="stack">{FIELDS.map(value => <label className="checkbox-label" key={value}><input type="checkbox" checked={state.profile.targetFields.includes(value)} onChange={e => patchProfile({ targetFields: e.target.checked ? [...state.profile.targetFields, value] : state.profile.targetFields.filter(p => p !== value) })}/>{value === 'Germany' ? 'Deutschland' : FIELD_LABELS[value] || value}</label>)}</div></fieldset>
        <Field label="Weitere Interessen (optional)"><input value={otherFields} onChange={e => setOtherFields(e.target.value)} maxLength={300} placeholder="Mit Komma trennen"/></Field>
        <details><summary>Bewerbungszeitraum (optional)</summary><div className="stack"><p className="field-help">Lasse dies offen, solange du noch nicht entschieden hast.</p><div className="form-grid"><Field label="Bewerbungsjahr (optional)"><input type="number" min="2026" max="2042" value={state.profile.applicationYear || ''} placeholder="Noch offen" onChange={e => patchProfile({ applicationYear: e.target.value })}/></Field><Field label="Studienbeginn (optional)"><input type="number" min="2026" max="2042" value={state.profile.universityStartYear || ''} placeholder="Noch offen" onChange={e => patchProfile({ universityStartYear: e.target.value })}/></Field></div></div></details>
      </div>}
      {step === 1 && <div className="stack">
        <Field label="Zielschnitt in Kurspunkten (optional)" help="0–15 Punkte. Ein persönliches Kursziel, keine Abiturprognose."><input type="number" min="0" max="15" step="0.5" placeholder="Noch offen" value={state.profile.targetAverage ?? ''} onChange={e => patchProfile({ targetAverage: e.target.value })}/></Field>
        <div className="form-grid"><Field label="Englischniveau"><select value={state.profile.englishLevel || 'Not sure yet'} onChange={e => patchProfile({ englishLevel: e.target.value })}>{LEVELS.map(level => <option key={level} value={level}>{LEVEL_LABELS[level] || level}</option>)}</select></Field><Field label="Deutschniveau"><select value={state.profile.germanLevel || 'Not sure yet'} onChange={e => patchProfile({ germanLevel: e.target.value })}>{LEVELS.map(level => <option key={level} value={level}>{LEVEL_LABELS[level] || level}</option>)}</select></Field></div>
        <div className="setup-subjects">{enabledSubjects.filter(subject => showAllSubjects || ['Mathematics', 'Physics', 'English', 'German'].includes(subject.name)).map(subject => <div className="setup-subject" key={subject.id}><div className="section-heading"><strong>{subjectLabel(subject)}</strong><span className="chip">{subject.level || 'GK'}</span></div><Field label={`${subjectLabel(subject)}: Kursart`}><select value={subject.level || 'GK'} onChange={e => patchSubject(subject.id, { level: e.target.value })}><option value="GK">Grundkurs</option><option value="LK">Leistungskurs</option></select></Field><div className="form-grid">{[['written', 'Schriftlich'], ['oral', 'Mündlich'], ['target', 'Ziel']].map(([key, label]) => <Field label={`${subjectLabel(subject)}: ${label} (Punkte)`} key={key}><input type="number" min="0" max="15" step="0.5" value={subject[key] ?? ''} placeholder="—" onChange={e => patchSubject(subject.id, { [key]: e.target.value })}/></Field>)}</div><Field label={`${subjectLabel(subject)}: schwierige Themen`}><input value={topicDrafts[subject.id] ?? (subject.weakTopics || []).join(', ')} onChange={e => { const value = e.target.value; setTopicDrafts(s => ({ ...s, [subject.id]: value })); patchSubject(subject.id, { weakTopics: split(value) }); }} maxLength={600} placeholder="Themen mit Komma trennen"/></Field></div>)}</div>
        <button type="button" className="button button-ghost" onClick={() => setShowAllSubjects(!showAllSubjects)}>{showAllSubjects ? 'Nur Kernfächer anzeigen' : 'Weitere Fächer anzeigen (optional)'}</button>
        <p className="field-help">Noten bleiben offen, bis du sie einträgst. Ziele kannst du frei festlegen.</p>
      </div>}
      {step === 2 && <div className="stack">
        <p className="field-help">Lernzeitfenster sind bearbeitbare Planungsvorschläge. Trage feste Zeiten nur ein, wenn du sie kennst.</p>
        <div className="setup-week">{[1, 2, 3, 4, 5, 6, 0].map(day => { const item = state.schedule.weekly.find(d => d.day === day) || { minutes: 60, windowStart: '16:00', windowEnd: '20:00' }; return <div key={day} className="setup-day"><strong>{DAY_LABELS[day]}</strong><div className="form-grid"><Field label={`${DAY_LABELS[day]}: verfügbare Lernminuten`}><input type="number" min="0" max="720" step="5" value={item.minutes} onChange={e => patchWeekly(day, 'minutes', Number(e.target.value))}/></Field><Field label={`${DAY_LABELS[day]}: Lernbeginn`}><input type="time" value={item.windowStart || '16:00'} onChange={e => patchWeekly(day, 'windowStart', e.target.value)}/></Field><Field label={`${DAY_LABELS[day]}: Lernende`}><input type="time" value={item.windowEnd || '20:00'} onChange={e => patchWeekly(day, 'windowEnd', e.target.value)}/></Field></div></div>; })}</div>
        <div className="section-heading"><h3>Feste wöchentliche Aktivitäten</h3><button type="button" className="button button-secondary" onClick={() => { setFixedOpen(!fixedOpen); setError(''); }}><Plus size={16}/>Hinzufügen</button></div>
        {state.schedule.fixedActivities.map(activity => <div className="list-row" key={activity.id}><div><strong>{activity.title}</strong><p className="muted">{activity.days.map(d => DAY_LABELS[d].slice(0, 2)).join(', ')} · {activity.start}–{activity.end}</p></div><button type="button" className="icon-button" aria-label={`${activity.title} entfernen`} onClick={() => setState(s => ({ ...s, schedule: { ...s.schedule, fixedActivities: s.schedule.fixedActivities.filter(a => a.id !== activity.id) } }))}><Trash2 size={17}/></button></div>)}
        {fixedOpen && <div className="card stack"><Field label="Name der Aktivität"><input value={fixedDraft.title} onChange={e => setFixedDraft(s => ({ ...s, title: e.target.value }))} maxLength={100} placeholder="Schule, Volleyball, Arbeit …"/></Field><fieldset className="field"><legend className="field-label">Tage</legend><div className="row wrap">{DAYS.map((day, index) => <label className="checkbox-label" key={day}><input type="checkbox" checked={fixedDraft.days.includes(index)} onChange={e => setFixedDraft(s => ({ ...s, days: e.target.checked ? [...s.days, index] : s.days.filter(d => d !== index) }))}/>{DAY_LABELS[index].slice(0, 2)}</label>)}</div></fieldset><div className="form-grid"><Field label="Aktivität: Beginn"><input type="time" value={fixedDraft.start} onChange={e => setFixedDraft(s => ({ ...s, start: e.target.value }))}/></Field><Field label="Aktivität: Ende"><input type="time" value={fixedDraft.end} onChange={e => setFixedDraft(s => ({ ...s, end: e.target.value }))}/></Field></div><button type="button" className="button button-secondary" onClick={addFixed}>Feste Aktivität speichern</button></div>}
      </div>}
      {step === 3 && <div className="stack">
        <div className="section-heading"><h3>Nächste Prüfungen</h3><button type="button" className="button button-secondary" onClick={() => { setExamOpen(!examOpen); setError(''); }}><Plus size={16}/>Prüfung hinzufügen</button></div>
        {state.exams.filter(e => e.date >= today).map(exam => <div className="list-row" key={exam.id}><div><strong>{exam.title}</strong><p className="muted">{subjectLabel(state.subjects.find(s => s.id === exam.subjectId) || { name: '' })} · {new Date(`${exam.date}T12:00:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}</p><p className="field-help">{exam.topics?.join(' · ')}</p></div><button type="button" className="icon-button" aria-label={`${exam.title} entfernen`} onClick={() => setState(s => ({ ...s, exams: s.exams.filter(e => e.id !== exam.id) }))}><Trash2 size={17}/></button></div>)}
        {!state.exams.length && !examOpen && <div className="empty-state"><CalendarDays size={25}/><h3>Noch kein Prüfungstermin?</h3><p className="muted">Du kannst ihn später unter Plan hinzufügen.</p></div>}
        {examOpen && <div className="card stack"><Field label="Prüfungsfach"><select value={examDraft.subjectId} onChange={e => setExamDraft(s => ({ ...s, subjectId: e.target.value }))}><option value="">Fach wählen</option>{enabledSubjects.map(subject => <option key={subject.id} value={subject.id}>{subjectLabel(subject)}</option>)}</select></Field><Field label="Prüfungstitel"><input value={examDraft.title} onChange={e => setExamDraft(s => ({ ...s, title: e.target.value }))} maxLength={160} placeholder="z. B. Englisch-Klausur"/></Field><div className="form-grid"><Field label="Prüfungsdatum"><input type="date" min={today} value={examDraft.date} onChange={e => setExamDraft(s => ({ ...s, date: e.target.value }))}/></Field><Field label="Prüfungsformat"><select value={examDraft.format} onChange={e => setExamDraft(s => ({ ...s, format: e.target.value }))}><option value="written">Klausur / schriftlich</option><option value="oral">Mündlich</option><option value="test">Kurztest</option></select></Field></div><Field label="Prüfungsthemen" help="Eine Zeile pro Thema oder mit Komma trennen. Ohne bekannte Themen bleibt der Plan vorläufig."><textarea rows="4" maxLength={1500} value={examDraft.topics} onChange={e => setExamDraft(s => ({ ...s, topics: e.target.value }))} placeholder="Nur bekannte Themen eintragen …"/></Field><button type="button" className="button button-secondary" onClick={addExam}>Prüfung speichern</button></div>}
        <div className="setup-summary"><Check size={18}/><p>Dein Lernplan wird an deine Ziele und verfügbare Zeit angepasst.</p></div>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="sheet-footer onboarding-footer">{step > 0 ? <button type="button" className="button button-secondary" onClick={() => { setStep(step - 1); setError(''); }}><ArrowLeft size={16}/>Zurück</button> : <button type="button" className="button button-ghost" onClick={skip}>Später einrichten</button>}<button type="submit" className="button button-primary">{step === 3 ? 'Meinen Plan erstellen' : 'Weiter'}{step === 3 ? <Check size={16}/> : <ArrowRight size={16}/>}</button></div>
      {step > 0 && <button type="button" className="button button-ghost setup-skip" onClick={skip}>Später einrichten und {data?.onboardingCompleted && !data.demo && !data.demoData && !data.isDemo ? 'aktuellen Plan behalten' : 'meinen Plan starten'}</button>}
      <p className="field-help setup-privacy">Auf diesem Gerät gespeichert. Kein Konto nötig.</p>
    </form>
  </Modal>;
}
