import React, { useState } from 'react';
import { ArrowRight, ChevronRight, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { Button, EmptyState, Field, Modal, SectionHeading } from './UI.jsx';
import { addGrade, removeGrade } from '../coach.js';
import { calculateSubject, GRADE_LABELS, GRADE_TYPES, getAcademicOverview, normalizeGrading, normalizeGradeForecast, getGradeForecast, getGradeEvidence, SEMESTERS } from '../grades.js';
import './academic-grades.css';
import { subjectLabel } from '../i18n.js';

const points = value => value === null || value === undefined || value === '' ? '—' : Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 });
const calculationNumber = value => Number(value).toLocaleString('de-DE', { maximumFractionDigits: 4 });
const dateLabel = value => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
const optionalNumber = value => value === '' ? null : Number(value);
const trendLabel = trend => trend.direction === 'unknown' ? 'Trend noch offen' : trend.direction === 'steady' ? 'Zuletzt stabil' : `${trend.direction === 'up' ? '↑' : '↓'} ${points(Math.abs(trend.difference))} Punkte im Vergleich`;

function GradeEntry({ data, today, subjectId, record, onClose, onSave }) {
  const [form, setForm] = useState(record || { subjectId: subjectId || data.subjects.find(subject => subject.enabled !== false)?.id || '', points: '', type: 'written', date: today, semester: SEMESTERS.includes(data.profile.schoolYear) ? data.profile.schoolYear : '', weight: '', note: '' });
  const [error, setError] = useState('');
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const subject = data.subjects.find(entry => entry.id === form.subjectId);
  const grading = normalizeGrading(subject?.grading);
  return <Modal title={record ? 'Note bearbeiten' : 'Note eintragen'} onClose={onClose}><form className="stack academic-grade-form" onSubmit={event => {
    event.preventDefault();
    if (form.points === '' || form.points == null || !Number.isFinite(Number(form.points)) || Number(form.points) < 0 || Number(form.points) > 15) { setError('Gib 0 bis 15 Punkte ein. Auch 0 ist ein gültiges Ergebnis.'); return; }
    if (!form.subjectId || !form.date || form.date > today) { setError('Wähle ein Fach und ein Datum bis heute.'); return; }
    if (grading.mode === 'weighted' && (!(Number(form.weight) > 0) || !Number.isFinite(Number(form.weight)))) { setError('Trage für diese Leistung ein positives Gewicht ein.'); return; }
    onSave({ ...form, points: Number(form.points), weight: optionalNumber(form.weight ?? ''), note: form.note.trim() });
  }}>
    <Field label="Fach"><select value={form.subjectId} onChange={set('subjectId')} required>{data.subjects.map(entry => <option key={entry.id} value={entry.id}>{subjectLabel(entry)}{entry.level === 'LK' ? ' · LK' : ''}</option>)}</select></Field>
    <div className="form-grid"><Field label="Punkte (0–15)"><input autoFocus inputMode="decimal" type="number" min="0" max="15" step="0.1" required value={form.points} onChange={set('points')} placeholder="z. B. 10" /></Field><Field label="Leistungsart"><select value={form.type} onChange={set('type')}>{GRADE_TYPES.map(type => <option key={type} value={type}>{GRADE_LABELS[type]}</option>)}</select></Field></div>
    <div className="form-grid"><Field label="Datum"><input type="date" max={today} required value={form.date} onChange={set('date')} /></Field><Field label="Halbjahr"><select value={form.semester || ''} onChange={set('semester')}><option value="">Nicht zugeordnet</option>{SEMESTERS.map(semester => <option key={semester}>{semester}</option>)}</select></Field></div>
    {grading.mode === 'weighted' && <Field label="Gewicht dieser Leistung" help="Relativ: Gewicht 2 zählt doppelt so stark wie Gewicht 1."><input inputMode="decimal" type="number" min="0.01" max="100000" step="any" required value={form.weight ?? ''} onChange={set('weight')} placeholder="Gewicht laut deiner Regelung" /></Field>}
    {grading.mode === 'category' && <p className="field-help">Es gilt deine Gewichtung nach Leistungsarten. Innerhalb einer Art zählt jede Leistung gleich.</p>}
    <Field label="Notiz · optional"><textarea rows="2" maxLength="3000" value={form.note} onChange={set('note')} placeholder="Thema oder konkretes Feedback" /></Field>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Note speichern</Button></div>
  </form></Modal>;
}

function GradeSettings({ subject, overallTarget, onClose, onSave }) {
  const grading = normalizeGrading(subject.grading);
  const [form, setForm] = useState({ ...grading, target: subject.target ?? '', level: subject.level || 'GK', overallTarget: overallTarget ?? '' });
  const [error, setError] = useState('');
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  return <Modal title="Noten und Ziele" onClose={onClose}><form className="stack" onSubmit={event => {
    event.preventDefault();
    const target = optionalNumber(form.target);
    const overall = optionalNumber(form.overallTarget);
    if ([target, overall].some(value => value !== null && (!Number.isFinite(value) || value < 0 || value > 15))) { setError('Zielwerte müssen zwischen 0 und 15 Punkten liegen.'); return; }
    if (!(Number(form.courseWeight) > 0)) { setError('Das Kursgewicht muss positiv sein.'); return; }
    const weights = Object.fromEntries(GRADE_TYPES.map(type => [type, optionalNumber(form.weights[type] ?? '')]));
    if (Object.values(weights).some(value => value !== null && (!Number.isFinite(value) || value <= 0))) { setError('Verwendete Gewichte müssen positiv sein. Nicht benötigte Leistungsarten bleiben leer.'); return; }
    if (form.mode === 'category' && !Object.values(weights).some(value => value > 0)) { setError('Lege mindestens ein Gewicht für eine Leistungsart fest.'); return; }
    onSave({ target, level: form.level, grading: normalizeGrading({ ...form, weights }) }, overall);
  }}>
    <p className="muted small">{subjectLabel(subject)} · Verwende die Regelung deiner Schule. Die App setzt keine schulrechtliche Gewichtung voraus.</p>
    <div className="form-grid"><Field label="Mein Fachziel · Punkte"><input type="number" min="0" max="15" step="0.1" value={form.target} onChange={set('target')} /></Field><Field label="Kursart"><select value={form.level} onChange={set('level')}><option value="GK">Grundkurs</option><option value="LK">Leistungskurs</option></select></Field></div>
    <Field label="Berechnung"><select value={form.mode} onChange={set('mode')}><option value="simple">Einfacher Mittelwert</option><option value="weighted">Gewicht je Einzelleistung</option><option value="category">Gewicht je Leistungsart</option></select></Field>
    {form.mode === 'simple' && <p className="field-help">Alle eingetragenen Leistungen zählen gleich. Das ist eine Orientierung, keine bestätigte offizielle Kursnote.</p>}
    {form.mode === 'weighted' && <p className="field-help">Bei jeder Note und jedem Zukunftsszenario trägst du ein relatives Gewicht ein. Ohne Gewicht bleibt der Schnitt offen.</p>}
    {form.mode === 'category' && <div className="stack compact"><p className="field-help">Zum Beispiel schriftlich 2 und mündlich 1, falls das deiner Regelung entspricht. Nicht verwendete Arten bleiben leer. Fehlende Ergebnisse werden nicht stillschweigend umgewichtet.</p>{GRADE_TYPES.map(type => <Field key={type} label={`${GRADE_LABELS[type]} · Gewicht`}><input type="number" min="0.01" step="any" inputMode="decimal" value={form.weights[type] ?? ''} onChange={event => setForm(current => ({ ...current, weights: { ...current.weights, [type]: event.target.value } }))} placeholder="Nicht verwendet" /></Field>)}</div>}
    <details className="product-details"><summary>Gesamtschnitt und Gesamtziel</summary><div className="stack compact"><Field label="Gewicht dieses Kurses im Gesamtschnitt" help="Standard: 1 für jeden Kurs. Ein LK wird nicht automatisch doppelt gezählt."><input type="number" min="0.01" max="100000" step="any" required value={form.courseWeight} onChange={set('courseWeight')} /></Field><Field label="Mein Ziel für den Kursschnitt · optional"><input type="number" min="0" max="15" step="0.1" value={form.overallTarget} onChange={set('overallTarget')} placeholder="Noch offen" /></Field></div></details>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Einstellungen speichern</Button></div>
  </form></Modal>;
}

function GradeSparkline({ records, target }) {
  const values = [...records].sort((a, b) => a.date.localeCompare(b.date)).slice(-8);
  if (values.length < 2) return null;
  const x = index => 8 + index * 204 / (values.length - 1);
  const y = value => 46 - value * 2.55;
  return <svg className="grade-sparkline" viewBox="0 0 220 52" role="img" aria-label={`Letzte ${values.length} Ergebnisse: ${values.map(value => points(value.points)).join(', ')} Punkte`}><line x1="8" x2="212" y1="46" y2="46" className="sparkline-axis" />{target != null && <line x1="8" x2="212" y1={y(target)} y2={y(target)} className="sparkline-target" />}<polyline points={values.map((value, index) => `${x(index)},${y(value.points)}`).join(' ')} className="sparkline-path" />{values.map((value, index) => <circle key={value.id} cx={x(index)} cy={y(value.points)} r="3" />)}</svg>;
}

function Forecast({ analysis, nextExam, scope, onSave, onGrade, onSettings }) {
  const saved = normalizeGradeForecast(analysis.subject?.forecast);
  const [form, setForm] = useState(() => saved.semester === scope ? saved : normalizeGradeForecast({ semester: scope }));
  const result = getGradeForecast(analysis, form);
  const hasRecords = analysis.records.length > 0;
  const valid = result.status !== 'missing-data';
  const [setupOpen, setSetupOpen] = useState(!valid);
  const completeSetup = patch => { const next = { ...form, ...patch, semester: scope }; setForm(next); onSave?.(normalizeGradeForecast(next)); };
  const changeCount = count => completeSetup({ future: Array.from({ length: Number(count) }, (_, index) => form.future[index] || { id: `future-${index}`, type: index === 0 && nextExam?.format === 'oral' ? 'oral' : 'written', points: null, weight: null }) });
  const patchFuture = (index, key, value) => completeSetup({ future: form.future.map((entry, row) => row === index ? { ...entry, [key]: value } : entry) });
  const required = result.minimumWholePoints;
  const status = !valid ? 'Angaben ergänzen' : result.achievable ? required >= 13 ? 'Erreichbar · hoher Punktwert nötig' : 'Unter deinen Annahmen erreichbar' : 'Unter deinen Annahmen nicht erreichbar';
  return <section className="grade-forecast" aria-label="Zielnoten berechnen">
    <div className="grade-next-date"><span>{form.mode === 'next' ? 'NÄCHSTE PRÜFUNG' : 'VERBLEIBENDE LEISTUNGEN'}</span><strong>{nextExam ? dateLabel(nextExam.date) : 'Datum noch offen'}</strong>{nextExam && <span>{nextExam.title}</span>}</div>
    <div className={`forecast-result forecast-main ${result.status === 'impossible' ? 'forecast-impossible' : ''}`} aria-live="polite">
      <span className="forecast-heading">{form.mode === 'next' ? 'Das brauchst du als Nächstes' : 'Nötiger Schnitt der offenen Leistungen'}</span>
      <div className="forecast-required"><strong>{!valid ? 'Offen' : !result.achievable ? '>15' : required ?? 'Erreicht'}</strong>{valid && required !== null && <span>/ 15 Punkte</span>}</div>
      <span className={`forecast-status ${result.achievable ? 'forecast-status-ready' : ''}`}>{result.status === 'impossible' ? 'SO NICHT ERREICHBAR' : status}</span>
      <p>{result.explanation}</p>
    </div>
    {!hasRecords && <div className="forecast-setup"><span className="field-help">Für deine Zielrechnung fehlen:</span><ol><li>Datierte Noten mit Leistungsart.</li><li>Die Gewichtung deiner nächsten Prüfung.</li><li>Weitere verbleibende Leistungen.</li></ol><Button onClick={() => onGrade(null)}><Plus size={16}/>Erste Note eintragen</Button></div>}
    {hasRecords && <details className="product-details forecast-config" open={setupOpen} onToggle={event => setSetupOpen(event.currentTarget.open)}><summary>Zielnote berechnen <Settings2 size={15}/></summary><div className="stack compact">
      <div className="segmented" role="group" aria-label="Zielrechnung wählen"><button type="button" aria-pressed={form.mode === 'next'} className={form.mode === 'next' ? 'active' : ''} onClick={() => completeSetup({ mode: 'next' })}>Nächste Note</button><button type="button" aria-pressed={form.mode === 'remaining'} className={form.mode === 'remaining' ? 'active' : ''} onClick={() => completeSetup({ mode: 'remaining' })}>Alle offenen</button></div>
      <Field label="Offene Leistungen"><select value={form.future.length || ''} onChange={event => changeCount(event.target.value)}><option value="">Bitte festlegen</option>{[1, 2, 3, 4, 5, 6, 7, 8].map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
      {analysis.mode === 'simple' && <p className="grade-scenario-rule">Alle erfassten und geplanten Leistungen zählen gleich. <button className="text-button" onClick={onSettings}>Gewichtung ändern</button></p>}
      {form.future.map((entry, index) => <fieldset className="future-assessment" key={entry.id}><legend>{index === 0 ? 'Nächste Leistung · gesucht' : `Weitere Leistung ${index + 1}`}</legend><div className="form-grid"><Field label={index === 0 ? 'Art der nächsten Leistung' : `Leistungsart ${index + 1}`}><select value={entry.type} onChange={event => patchFuture(index, 'type', event.target.value)}>{GRADE_TYPES.map(value => <option value={value} key={value}>{GRADE_LABELS[value]}</option>)}</select></Field>{analysis.mode === 'weighted' && <Field label={index === 0 ? 'Gewicht der nächsten Leistung' : `Gewicht der Leistung ${index + 1}`}><input type="number" min="0.01" step="any" value={entry.weight ?? ''} onChange={event => patchFuture(index, 'weight', event.target.value)} placeholder="Festlegen" /></Field>}</div>{index > 0 && <Field label={`Angenommene Punkte der Leistung ${index + 1}`} help={form.mode === 'next' ? 'Für eine eindeutige nächste Note erforderlich.' : 'Leer lassen: Dieser Wert wird mitberechnet.'}><input type="number" min="0" max="15" step="0.1" value={entry.points ?? ''} onChange={event => patchFuture(index, 'points', event.target.value)} placeholder={form.mode === 'next' ? 'Bitte festlegen' : 'Offen · wird berechnet'} /></Field>}</fieldset>)}
      {result.missingFields.includes('weights') && <button className="text-button" onClick={onSettings}>Bestehende Noten und Gewichte prüfen <ChevronRight size={14}/></button>}
    </div></details>}
    {valid && <details className="product-details forecast-calculation"><summary>Detaillierte Rechnung ansehen <ArrowRight size={15}/></summary><div className="stack compact"><p>{analysis.mode === 'category' ? 'Zuerst wird je Leistungsart der Mittelwert gebildet, dann gelten deine Kategoriegewichte.' : 'Zielschnitt × Gesamtgewicht − bereits feststehende Punktesumme, geteilt durch das Gewicht der gesuchten Leistung(en).'}</p><div className="forecast-equation" aria-label="Rechnung mit deinen Werten">({calculationNumber(result.calculation.target)} × {calculationNumber(result.calculation.denominator)} − {calculationNumber(result.calculation.constant)}) ÷ {calculationNumber(result.calculation.coefficient)} ≈ {calculationNumber(result.requiredScore)}<span>Ziel × Gesamtgewicht − feste Punktesumme, geteilt durch das gesuchte Gewicht.</span></div><ul className="grade-assumptions">{result.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul><div className="grade-outcome-row"><span>Maximum unter deinen Annahmen</span><strong>{points(result.maxPossible)} / 15</strong></div>{result.bestCaseAverage !== null && <div className="grade-outcome-row"><span>Alle zukünftigen Leistungen mit 15</span><strong>{points(result.bestCaseAverage)} / 15</strong></div>}<Field label="Vergleich: angenommene Punkte" help="Deine eigene Annahme für die gesuchten Leistungen, keine Leistungsprognose."><input type="number" min="0" max="15" step="0.1" value={form.comparisonScore ?? ''} onChange={event => completeSetup({ comparisonScore: event.target.value })} placeholder="Noch nicht festgelegt" /></Field>{result.comparisonAverage !== null && <div className="grade-outcome-row"><span>Schnitt in deinem Vergleichsszenario</span><strong>{points(result.comparisonAverage)} / 15</strong></div>}<p className="field-help">Die Rechnung gilt für die eingetragenen Leistungen und Annahmen in {scope || 'diesem Zeitraum'}. Fehlende Leistungen verändern das Ergebnis. Keine offizielle Kurs- oder Abiturnote.</p></div></details>}
  </section>;
}

function SubjectDetail({ data, today, subjectId, onClose, onGrade, onSettings, onDelete, onForecast }) {
  const [semester, setSemester] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const analysis = calculateSubject(data, subjectId, semester);
  const subject = analysis.subject;
  const sorted = [...analysis.records].sort((a, b) => b.date.localeCompare(a.date));
  const evidence = getGradeEvidence(analysis);
  const nextExam = [...data.exams].filter(exam => exam.subjectId === subjectId && exam.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const scope = semester === 'all' ? 'all' : analysis.semester || (SEMESTERS.includes(data.profile.schoolYear) ? data.profile.schoolYear : '');
  return <Modal title={subjectLabel(subject)} onClose={onClose}><div className="stack academic-subject-detail">
    <div className="academic-subject-score"><div><span className="field-help">{analysis.source === 'baseline' ? 'Ausgangswert · unbestätigt' : 'Berechneter Schnitt'}</span><strong>{points(analysis.average)}<small> / 15</small></strong></div><span className="grade-target-arrow" aria-hidden="true">→</span><div><span className="field-help">Mein Ziel</span><strong>{points(analysis.target)}</strong></div><Button variant="secondary" onClick={onSettings} aria-label={`Noten und Ziele für ${subjectLabel(subject)} einstellen`}><Settings2 size={17}/></Button></div>
    <p className="grade-estimate-caption">{analysis.source === 'baseline' ? 'Undatierte Orientierung. Noch kein berechneter Schnitt aus Einzelleistungen.' : `${analysis.records.length} datierte Leistung${analysis.records.length === 1 ? '' : 'en'} · ${analysis.methodLabel} · Keine bestätigte Kursnote.`}</p>
    <GradeSparkline records={analysis.records} target={analysis.target}/>
    <Forecast key={`${subjectId}-${scope}`} analysis={analysis} nextExam={nextExam} scope={scope} onSave={onForecast} onGrade={onGrade} onSettings={onSettings}/>
    <details className="product-details grade-evidence"><summary>Was kann ich gezielt verbessern?</summary><div className="stack compact">
      {evidence.contrast && <p className="grade-evidence-comparison">Schriftlich <strong>{points(evidence.contrast.written)}</strong> · mündlich <strong>{points(evidence.contrast.oral)}</strong> Punkte. {Math.abs(evidence.contrast.difference) >= .5 ? `${evidence.contrast.difference > 0 ? 'Die schriftlichen' : 'Die mündlichen'} Ergebnisse liegen in deinen erfassten Leistungen niedriger. Wie stark eine Verbesserung wirkt, hängt von deiner Gewichtung ab.` : 'Die erfassten Ergebnisse liegen nah beieinander.'}</p>}
      {!!subject.weakTopics?.length && <p><span className="field-help">Von dir genannte Themen</span><br/>{subject.weakTopics.join(' · ')}</p>}
      {evidence.feedback.length ? <><span className="field-help">Deine gespeicherten Notizen · noch keine automatische Diagnose</span>{evidence.feedback.map(note => <blockquote className="grade-feedback" key={note.id}><p>{note.note}</p><cite>{dateLabel(note.date)} · {GRADE_LABELS[note.type]}</cite></blockquote>)}</> : <p>Aus einer Punktzahl lässt sich keine konkrete Schwäche ableiten. Ergänze das Feedback deiner letzten Arbeit, damit du einen tatsächlichen Fehler gezielt üben kannst.</p>}
      {evidence.teacherReviewSuggested && <p>Deine neueren Ergebnisse sind gefallen. Besprich zwei korrigierte Arbeiten mit deiner Lehrkraft und wähle ein wiederkehrendes Fehlermuster für die nächste Übung.</p>}
      <Button variant="secondary" onClick={() => onGrade(sorted[0] || null)}>{sorted.length ? 'Feedback zur letzten Note ergänzen' : 'Erste Note mit Feedback erfassen'}</Button>
    </div></details>
    <details className="product-details grade-history"><summary>Noten und Verlauf <span>{sorted.length}</span></summary><div className="stack compact">
      <Field label="Halbjahr anzeigen"><select value={semester} onChange={event => setSemester(event.target.value)}><option value="">Aktuelles Halbjahr</option><option value="all">Alle Halbjahre</option>{SEMESTERS.map(value => <option key={value}>{value}</option>)}</select></Field>
      {analysis.average === null && analysis.records.length > 0 && <p className="grade-caution">{analysis.reason}</p>}
      <div className="academic-trend"><span>{trendLabel(analysis.trend)}</span></div>
      {analysis.semesterAverages.some(entry => entry.average !== null) && <div className="semester-comparison" aria-label="Schnitt je Halbjahr">{analysis.semesterAverages.map(entry => <div key={entry.semester}><span className="field-help">{entry.semester}</span><strong>{points(entry.average)}</strong></div>)}</div>}
      <SectionHeading title="Einzelleistungen" action={<Button onClick={() => onGrade(null)}><Plus size={16}/>Note</Button>}/>
      {sorted.length ? <div className="grade-records">{sorted.map(record => <div className="academic-grade-record" key={record.id}><span className="grade-pill">{points(record.points)}</span><div className="grow"><strong>{GRADE_LABELS[record.type] || 'Leistung'}</strong><p className="muted small">{dateLabel(record.date)} · {record.semester || 'Halbjahr offen'}{analysis.mode === 'weighted' ? ` · Gewicht ${points(record.weight)}` : ''}</p>{record.note && <p className="muted small">{record.note}</p>}</div><button type="button" className="icon-button" aria-label={`Note ${points(record.points)} vom ${record.date} bearbeiten`} onClick={() => onGrade(record)}><Pencil size={16}/></button><button type="button" className="icon-button" aria-label={`Note ${points(record.points)} vom ${record.date} löschen`} onClick={() => setPendingDelete(record)}><Trash2 size={16}/></button></div>)}</div> : <EmptyState title="Noch keine Einzelleistungen" description="Deine Ausgangswerte bleiben erhalten. Trage bestätigte Noten mit Datum und Leistungsart ein."/>}
      <div className="grade-category-list">{evidence.categories.map(category => <div key={category.type}><span>{GRADE_LABELS[category.type]} · {category.count} Ergebnis{category.count > 1 ? 'se' : ''}</span><strong>{points(category.average)} / 15</strong></div>)}</div>
      {analysis.unassignedCount > 0 && <p className="field-help">{analysis.unassignedCount} ältere Ergebnisse haben noch kein Halbjahr. Ordne sie einzeln zu, bevor du die Rechnung als Halbjahresplanung verwendest.</p>}
      {pendingDelete && <div className="grade-delete-confirm" role="alert"><p>{points(pendingDelete.points)} Punkte wirklich löschen?</p><div className="row"><Button variant="secondary" onClick={() => setPendingDelete(null)}>Behalten</Button><Button onClick={() => { onDelete(pendingDelete); setPendingDelete(null); }}>Löschen</Button></div></div>}
    </div></details>
  </div></Modal>;
}

export default function AcademicGrades({ data, today, onChange, notify, onOpenProfile, initialSubjectId = '' }) {
  const [selected, setSelected] = useState(data.subjects.some(subject => subject.id === initialSubjectId) ? initialSubjectId : null);
  const [entry, setEntry] = useState(null);
  const [settings, setSettings] = useState(false);
  const overview = getAcademicOverview(data);
  const subjects = data.subjects.filter(subject => subject.enabled !== false);
  const subject = data.subjects.find(value => value.id === selected);
  const save = grade => {
    try { onChange(current => addGrade(current, grade)); setEntry(null); notify?.('Note gespeichert. Dein Lernplan wird angepasst.'); }
    catch { notify?.('Die Note konnte nicht gespeichert werden. Prüfe Fach, Datum und Punkte.'); }
  };
  return <section className="card academic-grades"><SectionHeading title="Meine Noten" subtitle="0–15 Punkte · echte Ergebnisse" action={subjects.length ? <Button onClick={() => setEntry({ subjectId: selected })}><Plus size={17} /> Note</Button> : undefined} />
    <div className="academic-overview"><div><span className="field-help">Mein Kursschnitt</span><strong>{points(overview.average)}<small> / 15</small></strong></div><div><span className="field-help">Mein Ziel</span><strong>{points(overview.target)}</strong></div>{overview.gap !== null && <p className="muted small">{overview.gap > 0 ? `${points(overview.gap)} Punkte bis zu deinem Ziel` : 'Aktueller Schnitt auf Zielniveau'}</p>}</div>
    <p className="field-help">{overview.subjectCount} von {overview.totalSubjects} Fächern mit bekannten Werten. {overview.weighted ? 'Deine Kursgewichte gelten.' : 'Alle Kurse zählen gleich.'}{overview.includesBaselines ? ' Enthält undatierte Ausgangswerte.' : ''} Keine offizielle Abiturnote.</p>
    {subjects.length ? <div className="academic-subjects">{subjects.map(value => { const analysis = calculateSubject(data, value.id); const latest = [...analysis.records].sort((a, b) => b.date.localeCompare(a.date))[0]; return <button className="academic-subject-row" type="button" key={value.id} onClick={() => setSelected(value.id)} aria-label={`${subjectLabel(value)}: Noten und Ziel berechnen`}><div className="grow"><strong>{subjectLabel(value)}{value.level === 'LK' && <span className="academic-lk">LK</span>}</strong><p>{latest ? `Zuletzt ${points(latest.points)} / 15 · ${GRADE_LABELS[latest.type]}` : analysis.source === 'baseline' ? 'Ausgangswerte · Datum offen' : 'Noch keine Ergebnisse'}</p><span className="academic-analysis-link">Zielrechnung öffnen</span></div><div className="academic-row-points"><span>{analysis.source === 'baseline' ? 'Ausgangswert' : analysis.average === null ? 'Schnitt offen' : 'Schnitt'}</span><strong>{points(analysis.average)}</strong><span>Ziel {points(analysis.target)}</span>{analysis.source === 'assessments' && analysis.average !== null && <span className="subject-point-bar" aria-hidden="true"><i style={{ width: `${analysis.average / 15 * 100}%` }}/>{analysis.target !== null && <b style={{ left: `${analysis.target / 15 * 100}%` }}/>}</span>}</div><ChevronRight size={16} /></button>; })}</div> : <EmptyState title="Deine Fächer fehlen noch" description="Ergänze deine Fächer, damit dein Lernplan gezielt auf deine Ziele eingehen kann." action={onOpenProfile && <Button onClick={() => onOpenProfile('Subjects')}>Fächer hinzufügen</Button>} />}
    {selected && subject && !entry && !settings && <SubjectDetail data={data} today={today} subjectId={selected} onClose={() => setSelected(null)} onGrade={record => setEntry({ subjectId: selected, record })} onSettings={() => setSettings(true)} onForecast={forecast => onChange(current => ({ ...current, subjects: current.subjects.map(value => value.id === selected ? { ...value, forecast } : value) }))} onDelete={record => { onChange(current => removeGrade(current, record.id)); notify?.('Note gelöscht. Deine übrigen Ergebnisse bleiben erhalten.'); }} />}
    {entry && <GradeEntry data={data} today={today} subjectId={entry.subjectId} record={entry.record} onClose={() => setEntry(null)} onSave={save} />}
    {settings && subject && <GradeSettings subject={subject} overallTarget={data.profile.targetAverage} onClose={() => setSettings(false)} onSave={(patch, targetAverage) => { onChange(current => ({ ...current, subjects: current.subjects.map(value => value.id === subject.id ? { ...value, ...patch } : value), profile: { ...current.profile, targetAverage } })); setSettings(false); notify?.('Notenberechnung und Ziele gespeichert.'); }} />}
  </section>;
}
