import React, { useState } from 'react';
import { ArrowRight, BookOpen, ChevronRight, Trash2 } from 'lucide-react';
import { Button, Field, Modal, Segmented, SectionHeading } from './UI.jsx';
import { calculateAbitur, courseAssessmentPlan, normalizeHessen } from '../hessen.js';
import { subjectLabel } from '../i18n.js';
import './hessen-abitur.css';

const SEMESTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const number = value => value === '' || value === null || value === undefined ? null : Number(value);
const points = value => value === null || value === undefined ? 'Offen' : Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 });
const sourceName = source => source.title || source.label || source.name || 'Amtliche Quelle';
const sourceUrl = source => source.url || source.href;
const replacementNames = { presentation: 'Präsentation', 'oral-communication': 'Mündliche Kommunikationsprüfung', practical: 'Praktische Leistung', other: 'Andere Ersatzleistung' };
function updateHessen(onChange, transform) {
  onChange(current => ({ ...current, hessen: normalizeHessen(transform(normalizeHessen(current.hessen))) }));
}

/** Source-checked standard counts; editable teacher exceptions stay separate. */
export function CourseRequirements({ data, subjectId, semester = 'Q1', onChange }) {
  const config = normalizeHessen(data.hessen);
  const generic = config.courseSettings.find(entry => entry.subjectId === subjectId && !entry.semester);
  const setting = config.courseSettings.find(entry => entry.subjectId === subjectId && entry.semester === semester) || { subjectId, semester, weeklyHours: generic?.weeklyHours ?? null, countOverride: null, teacherConfirmed: false, replacements: [], note: generic?.note || '' };
  const plan = courseAssessmentPlan(data, subjectId, semester);
  const subject = data.subjects.find(entry => entry.id === subjectId);
  const set = patch => updateHessen(onChange, current => ({ ...current, courseSettings: current.courseSettings.some(entry => entry.subjectId === subjectId && entry.semester === semester) ? current.courseSettings.map(entry => entry.subjectId === subjectId && entry.semester === semester ? { ...entry, ...patch } : entry) : [...current.courseSettings, { ...setting, semester, ...patch }] }));
  return <details className="product-details hessen-course-requirements"><summary><strong>{subjectLabel(subject)} · {semester}</strong><span>{plan.expected === null ? 'Stunden offen' : `${plan.scheduledCount} / ${plan.expected} terminiert`}</span></summary><div className="stack compact">
    <p className="hessen-course-heading">{subjectLabel(subject)} · {plan.level} · {plan.weeklyHours === null ? 'Wochenstunden offen' : `${plan.weeklyHours} Wochenstunden`}</p>
    {plan.expected !== null && <p className="hessen-course-count"><strong>{plan.expected}</strong> Leistungsnachweis{plan.expected === 1 ? '' : 'e'} vorgesehen{plan.exceptionApplied ? ' · bestätigte Abweichung' : plan.provisional ? ' · Stundenangabe prüfen' : ' · OAVO § 9'}</p>}
    {plan.additionalMessage && <p className="hessen-open-date">{plan.additionalMessage}</p>}
    {plan.unassignedException && <p className="hessen-open-date">Eine ältere Ausnahme ist keinem Halbjahr zugeordnet. Bestätige sie hier für {semester}, bevor sie berücksichtigt wird.</p>}
    {plan.replacementCount > 0 && <p className="field-help">{plan.replacementCount} bestätigte Ersatzleistung{plan.replacementCount === 1 ? '' : 'en'} berücksichtigt.</p>}
    <div className="form-grid"><Field label="Wochenstunden" help="Unterrichtsstunden, keine Zeitstunden."><input type="number" inputMode="numeric" min="1" max="10" step="1" value={setting.weeklyHours ?? ''} onChange={event => set({ weeklyHours: number(event.target.value) })} placeholder={plan.weeklyHours === null ? 'Bitte festlegen' : String(plan.weeklyHours)} /></Field><Field label="Abweichende Anzahl · optional"><input type="number" inputMode="numeric" min="0" max="10" step="1" value={setting.countOverride ?? ''} onChange={event => set({ countOverride: number(event.target.value) })} placeholder="Regelplanung" /></Field></div>
    <label className="hessen-check"><input type="checkbox" checked={setting.teacherConfirmed} onChange={event => set({ teacherConfirmed: event.target.checked })}/><span>Abweichungen und Ersatzleistungen von der Lehrkraft bestätigt</span></label>
    {!!setting.replacements.length && <div className="hessen-replacements">{setting.replacements.map(replacement => <div key={replacement.id}><span>{replacementNames[replacement.kind] || 'Ersatzleistung'}</span><button type="button" className="icon-button" aria-label={`${replacementNames[replacement.kind]} entfernen`} onClick={() => set({ replacements: setting.replacements.filter(entry => entry.id !== replacement.id) })}><Trash2 size={16}/></button></div>)}</div>}
    <Field label="Ersatzleistung ergänzen" help="Die Zulässigkeit muss die Lehrkraft bestätigen."><select value="" onChange={event => { if (event.target.value) set({ replacements: [...setting.replacements, { id: `replacement-${Date.now()}-${setting.replacements.length}`, kind: event.target.value, count: 1, note: '' }] }); }}><option value="">Auswählen</option>{Object.entries(replacementNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field label="Absprache mit der Lehrkraft · optional"><textarea rows="2" value={setting.note} maxLength="2000" onChange={event => set({ note: event.target.value })} placeholder="Welche Leistung ersetzt welche Klausur?" /></Field>
    <p className="field-help">{plan.ruleNote} <a href={plan.sourceUrl} target="_blank" rel="noreferrer">{plan.citation}</a></p>
  </div></details>;
}

function SemesterEditor({ data, semester, onChange }) {
  const config = normalizeHessen(data.hessen);
  const subjects = data.subjects || [];
  const [pendingDelete, setPendingDelete] = useState(null);
  const [errors, setErrors] = useState({});
  const set = (subjectId, patch) => {
    const previous = config.semesterResults.find(entry => entry.subjectId === subjectId && entry.semester === semester);
    const candidate = { ...previous, ...patch };
    if (candidate.points !== null && candidate.points !== undefined && (!Number.isFinite(candidate.points) || candidate.points < 0 || candidate.points > 15 || (candidate.status === 'confirmed' && !Number.isInteger(candidate.points)))) {
      setErrors(current => ({ ...current, [subjectId]: candidate.status === 'confirmed' ? 'Bestätigte Halbjahresnoten brauchen 0–15 ganze Punkte. Passe zuerst den Szenariowert an; deine bisherige Annahme bleibt erhalten.' : 'Gib einen Wert zwischen 0 und 15 Punkten ein.' }));
      return;
    }
    setErrors(current => ({ ...current, [subjectId]: '' }));
    updateHessen(onChange, current => {
    const previous = current.semesterResults.find(entry => entry.subjectId === subjectId && entry.semester === semester);
    const record = { id: previous?.id || `semester-${subjectId}-${semester}`, subjectId, semester, points: null, status: 'scenario', inclusion: 'optional', included: false, ...previous, ...patch };
    return { ...current, semesterResults: previous ? current.semesterResults.map(entry => entry.id === previous.id ? record : entry) : [...current.semesterResults, record] };
    });
  };
  return <div className="hessen-semester-editor">
    <p className="field-help">Hier stehen Halbjahresnoten. Einzelne Klausuren und Ausgangswerte werden nicht automatisch übernommen.</p>
    {subjects.map(subject => {
      const record = config.semesterResults.find(entry => entry.subjectId === subject.id && entry.semester === semester);
      const result = record || { points: null, status: 'scenario', inclusion: 'optional', included: false };
      return <details className="hessen-subject-result" key={subject.id}><summary><span><strong>{subjectLabel(subject)}</strong><small>{subject.level === 'LK' ? 'LK · doppelt' : 'GK · einfach'}{record?.included ? ' · eingeplant' : ''}</small></span><span className="hessen-semester-points">{points(result.points)}<small>{record?.points !== null && record?.points !== undefined ? result.status === 'confirmed' ? 'bestätigt' : 'Szenario' : 'noch offen'}</small></span><ChevronRight size={16}/></summary><div className="stack compact">
        <div className="form-grid"><Field label={`${subjectLabel(subject)} · ${semester} · Punkte`}><input type="number" inputMode="decimal" min="0" max="15" step={result.status === 'confirmed' ? 1 : 0.1} value={result.points ?? ''} onChange={event => set(subject.id, { points: number(event.target.value) })} placeholder="Noch unbekannt" /></Field><Field label="Status der Halbjahresnote"><select value={result.status} onChange={event => set(subject.id, { status: event.target.value })}><option value="scenario">Szenario</option><option value="confirmed">Bestätigt</option></select></Field></div>
        {errors[subject.id] && <p className="field-error" role="alert">{errors[subject.id]}</p>}
        <Field label="Einbringung · eigene Zuordnung" help="Deine Auswahl wird gegen die hinterlegten Standardregeln geprüft. Beleglaufbahn und Sonderfälle mit der Schule abgleichen."><select value={result.inclusion} onChange={event => set(subject.id, { inclusion: event.target.value, included: event.target.value === 'mandatory' ? true : event.target.value === 'excluded' ? false : result.included })}><option value="optional">Optional</option><option value="mandatory">Pflicht</option><option value="excluded">Nicht einbringen</option></select></Field>
        {result.inclusion !== 'excluded' && <label className="hessen-check"><input type="checkbox" checked={result.inclusion === 'mandatory' || result.included} disabled={result.inclusion === 'mandatory'} onChange={event => set(subject.id, { included: event.target.checked })}/><span>Für Block I einplanen</span></label>}
        {record && (pendingDelete === record.id ? <div className="hessen-delete-confirm"><p>Die gespeicherte Halbjahresnote entfernen? Einzelnoten bleiben erhalten.</p><div className="row"><Button variant="secondary" onClick={() => setPendingDelete(null)}>Behalten</Button><Button onClick={() => { updateHessen(onChange, current => ({ ...current, semesterResults: current.semesterResults.filter(entry => entry.id !== record.id) })); setPendingDelete(null); }}>Entfernen</Button></div></div> : <button type="button" className="text-button" onClick={() => setPendingDelete(record.id)}><Trash2 size={15}/>Halbjahreswert entfernen</button>)}
      </div></details>;
    })}
  </div>;
}

function ExaminationEditor({ data, onChange }) {
  const config = normalizeHessen(data.hessen);
  const [expanded, setExpanded] = useState(() => Object.fromEntries(config.examinationSubjects.map(entry => [entry.slot, !entry.subjectId])));
  const [errors, setErrors] = useState({});
  const set = (slot, patch) => {
    const previous = config.examinationSubjects.find(entry => entry.slot === slot);
    const candidate = { ...previous, ...patch };
    if (candidate.points !== null && (!Number.isFinite(candidate.points) || candidate.points < 0 || candidate.points > 15 || (candidate.status === 'confirmed' && !Number.isInteger(candidate.points)))) {
      setErrors(current => ({ ...current, [slot]: candidate.status === 'confirmed' ? 'Bestätigte Prüfungsergebnisse brauchen 0–15 ganze Punkte. Passe zuerst den Szenariowert an; deine bisherige Annahme bleibt erhalten.' : 'Gib einen Wert zwischen 0 und 15 Punkten ein.' }));
      return;
    }
    setErrors(current => ({ ...current, [slot]: '' }));
    updateHessen(onChange, current => ({ ...current, examinationSubjects: current.examinationSubjects.map(entry => entry.slot === slot ? { ...entry, ...patch } : entry) }));
  };
  return <div className="hessen-examination-editor stack">
    <p className="field-help">Die Fächer 3–5 bleiben offen, bis du sie auswählst. Die Standardregeln werden geprüft; Beleglaufbahn und Sonderfälle bleiben separat offen.</p>
    {config.examinationSubjects.map(exam => <details key={exam.slot} className="hessen-exam-choice" open={expanded[exam.slot]} onToggle={event => { const isOpen = event.currentTarget.open; setExpanded(current => current[exam.slot] === isOpen ? current : { ...current, [exam.slot]: isOpen }); }}><summary><span><small>{exam.slot}. PRÜFUNGSFACH</small><strong>{exam.subjectId ? subjectLabel(data.subjects.find(subject => subject.id === exam.subjectId)) : 'Noch unentschieden'}</strong></span><span>{exam.points === null ? '—' : `${points(exam.points)} P.`}</span></summary><div className="stack compact">
      <Field label={`${exam.slot}. Prüfungsfach`}><select value={exam.subjectId} onChange={event => set(exam.slot, { subjectId: event.target.value })}><option value="">Noch unentschieden</option>{data.subjects.map(subject => <option key={subject.id} value={subject.id}>{subjectLabel(subject)} · {subject.level}</option>)}</select></Field>
      <Field label={`Prüfungsform · Fach ${exam.slot}`}><select value={exam.mode} onChange={event => set(exam.slot, { mode: event.target.value })}><option value="written">Schriftlich</option><option value="oral">Mündlich</option><option value="presentation">Präsentation</option></select></Field>
      <div className="form-grid"><Field label={`Punkte · Fach ${exam.slot}`}><input type="number" inputMode="decimal" min="0" max="15" step={exam.status === 'confirmed' ? 1 : 0.1} value={exam.points ?? ''} onChange={event => set(exam.slot, { points: number(event.target.value) })} placeholder="Noch unbekannt" /></Field><Field label={`Ergebnisstatus · Fach ${exam.slot}`}><select value={exam.status} onChange={event => set(exam.slot, { status: event.target.value })}><option value="scenario">Szenario</option><option value="confirmed">Bestätigt</option></select></Field></div>
      {errors[exam.slot] && <p className="field-error" role="alert">{errors[exam.slot]}</p>}
      <p className="field-help">{exam.points === null ? 'Beitrag bleibt offen.' : `${points(exam.points)} × 4 = ${points(exam.points * 4)} Punkte in Block II.`}</p>
    </div></details>)}
    <details className="product-details"><summary>Amtliche Termine 2028</summary><div className="stack compact"><p className="field-help">Q4 endet am 31. März. Schriftliche Prüfungen: 20. April bis 11. Mai. Die folgenden Termine gelten nur, wenn du das Fach schriftlich prüfst.</p>{config.examinationSubjects.filter(exam => exam.subjectId && exam.mode === 'written').map(exam => { const published = calculateAbitur(data).examSchedule.exams.find(entry => entry.subjectId === exam.subjectId && entry.level === (data.subjects.find(subject => subject.id === exam.subjectId)?.level || 'GK')); return published ? <p key={exam.slot}>{subjectLabel(data.subjects.find(subject => subject.id === exam.subjectId))}: {new Date(`${published.date}T12:00:00`).toLocaleDateString('de-DE')}</p> : null; })}<a href={calculateAbitur(data).examSchedule.sourceUrl} target="_blank" rel="noreferrer">Abiturerlass 2028 · geprüft am {calculateAbitur(data).examSchedule.verifiedAt}</a><p className="field-help">Gespeicherte Schultermine bleiben unverändert. Mündliche Termine legt die Schule fest.</p></div></details>
  </div>;
}

function AbiturDetail({ data, today, onChange, onClose }) {
  const config = normalizeHessen(data.hessen);
  const result = calculateAbitur(data);
  const [tab, setTab] = useState('semesters');
  const [semester, setSemester] = useState(SEMESTERS.includes(data.profile?.schoolYear) ? data.profile.schoolYear : 'Q1');
  const blockI = result.blockI;
  const blockII = result.blockII;
  return <Modal title="Mein Abitur 2028" onClose={onClose}><div className="hessen-abitur-detail stack">
    <div className="hessen-total"><span>{result.totalPoints === null ? 'Gesamtprognose' : blockI.scenarioCount || blockII.scenarioCount ? 'Dein Szenario' : 'Erfasste Gesamtpunkte'}</span><strong>{points(result.totalPoints)}{result.totalPoints !== null && <small> / 900</small>}</strong><p>{result.totalPoints === null ? 'Ergänze die eingebrachten Halbjahre und fünf Prüfungsergebnisse.' : 'Rechnerische Summe deiner Auswahl. Keine bestätigte Abiturnote oder Zulassung.'}</p></div>
    <div className="hessen-blocks"><div><span>BLOCK I</span><strong>{points(blockI.points)}<small> / 600</small></strong><p>{blockI.lkCount} / 8 LK · {blockI.gkCount} / 24 GK</p><small>{points(blockI.knownPoints)} bekannte Beitragspunkte</small></div><div><span>BLOCK II</span><strong>{points(blockII.points)}<small> / 300</small></strong><p>{blockII.count} / 5 Prüfungsfächer</p><small>{points(blockII.knownPoints)} bekannte Beitragspunkte</small></div></div>
    <Field label="Mein Ziel · Gesamtpunkte" help="Dein Zielwert. Fehlende Zukunftsnoten bleiben offen."><input type="number" inputMode="numeric" min="0" max="900" step="1" value={config.targetPoints ?? ''} placeholder="Noch nicht festgelegt" onChange={event => updateHessen(onChange, current => ({ ...current, targetPoints: number(event.target.value) }))}/></Field>
    {result.targetGap !== null && <p className="hessen-target-gap">{result.targetGap > 0 ? `Zum Ziel fehlen in deinem Szenario ${points(result.targetGap)} Punkte.` : 'Dein Szenario erreicht den gewählten Zielwert.'}</p>}
    <div className="hessen-timeline" aria-label="Q1 bis Q4">{result.timeline.map(item => <button type="button" key={item.semester} className={semester === item.semester && tab === 'semesters' ? 'is-active' : ''} onClick={() => { setSemester(item.semester); setTab('semesters'); }}><span>{item.semester}</span><strong>{item.confirmed}</strong><small>bestätigt</small><i>{item.scenarios} Annahmen</i></button>)}</div>
    <Segmented className="hessen-tabs" label="Abiturplan ansehen" value={tab} onChange={setTab} options={[{ value: 'semesters', label: 'Halbjahre' }, { value: 'exams', label: 'Prüfungen' }, { value: 'courses', label: 'Kursplan' }]}/>
    {tab === 'semesters' && <><div className="hessen-subheading"><h3>{semester} · Halbjahresnoten</h3><span>0–15 Punkte</span></div><SemesterEditor key={semester} data={data} semester={semester} onChange={onChange}/></>}
    {tab === 'exams' && <ExaminationEditor data={data} onChange={onChange}/>}
    {tab === 'courses' && <div className="stack compact"><Field label="Halbjahr für Leistungsnachweise"><select value={semester} onChange={event => setSemester(event.target.value)}>{SEMESTERS.map(value => <option key={value}>{value}</option>)}</select></Field>{data.subjects.map(subject => <CourseRequirements key={subject.id} data={data} subjectId={subject.id} semester={semester} onChange={onChange}/>)}</div>}
    <details className="product-details hessen-validation"><summary>Prüfung der Einbringung <span>{result.regulatoryValidation.risks.length ? `${result.regulatoryValidation.risks.length} Risiken` : 'Angaben offen'}</span></summary><div className="stack compact"><p>{result.regulatoryValidation.message}</p>{result.issues.length > 0 && <ul>{result.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul>}<ul>{result.regulatoryValidation.checks.filter(check => check.status !== 'met').map(check => <li key={check.code}>{check.status === 'risk' ? 'Prüfen: ' : 'Noch offen: '}{check.message} <small>({check.citation})</small></li>)}</ul>{result.regulatoryValidation.pending.map(message => <p className="field-help" key={message}>{message}</p>)}<p className="field-help">Die Punktesumme allein bedeutet nicht, dass du bestanden hast. Eine Zulassungsentscheidung trifft deine Schule.</p></div></details>
    <details className="product-details hessen-sources"><summary>Regeln und Quellen <BookOpen size={15}/></summary><div className="stack compact"><p>OAVO § 26: 8 LK-Halbjahre × 2 und 24 GK-Halbjahre × 1. Fünf Prüfungen zählen jeweils vierfach.</p><p className="hessen-source-status">Amtlich zuletzt verifiziert: {result.verifiedAt || 'noch nicht möglich'}</p><p className="field-help">Standardregeln zu Einbringung, Prüfungsfächern und Mindestpunkten sind geprüft. Der vollständige Fachlehrplan und Sonderfälle sind noch nicht vollständig abgebildet.</p><div className="hessen-source-links">{(Array.isArray(result.sources) ? result.sources : Object.values(result.sources || {})).map((source, index) => sourceUrl(source) && <a href={sourceUrl(source)} target="_blank" rel="noreferrer" key={source.id || index}>{sourceName(source)} · {source.status === 'verified' ? 'geprüft' : 'noch offen'}<ArrowRight size={14}/></a>)}</div></div></details>
  </div></Modal>;
}

export default function HessenAbitur({ data, today, onChange, notify }) {
  const [open, setOpen] = useState(false);
  const result = calculateAbitur(data);
  return <section className="hessen-abitur-entry card" aria-label="Hessen Abiturplan">
    <SectionHeading title="Mein Abitur 2028" subtitle="Q1 bis Q4 · Hessen"/>
    <div className="hessen-entry-summary"><div><strong>{result.totalPoints === null ? 'Dein Weg zum Abitur' : `${points(result.totalPoints)} / 900`}</strong><p>{result.blockI.lkCount} / 8 LK-Halbjahre · {result.blockI.gkCount} / 24 GK-Halbjahre eingeplant</p></div></div>
    <p className="hessen-entry-status">OAVO-Standardregeln geprüft · persönliche Beleglaufbahn offen</p>
    <Button variant="secondary" onClick={() => setOpen(true)}>Abiturplan öffnen<ArrowRight size={15}/></Button>
    {open && <AbiturDetail data={data} today={today} onChange={onChange} onClose={() => setOpen(false)}/>}
  </section>;
}
