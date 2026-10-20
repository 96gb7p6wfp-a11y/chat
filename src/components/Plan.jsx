import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Edit3, Plus, Trash2, X } from 'lucide-react';
import { Modal, Button, EmptyState, Segmented, SectionHeading, formatDate, formatMinutes } from './UI.jsx';
import {
  getDailyPlan, getAvailability, getGoals, getExamPlan, getRoadmap,
  saveExam, removeExam, saveSchedule, toggleRoadmapItem, shiftDate, startOfWeek, uid,
} from '../coach.js';
import Events, { UpcomingEvents } from './Events.jsx';
import { shortTaskReason } from '../presentation.js';
import Timetable from './Timetable.jsx';
import { subjectLabel } from '../i18n.js';
import { getGuidedSession } from '../guided-learning.js';
import './plan.css';
import { CONFIRMED_Q1_EXAMS, SCHOOL_IMPORT_ID } from '../school-import.js';

const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DATE_OPTIONS = { month: 'short', day: 'numeric' };
const timeMinutes = (time) => { const [h, m] = String(time || '').split(':').map(Number); return h * 60 + m; };
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
const countdownLabel = (from, to) => { const days = daysBetween(from, to); return days === 0 ? 'Heute' : days === 1 ? 'Morgen' : days > 0 ? `In ${days} Tagen` : 'Vergangen'; };
const inputDate = (date) => new Date(`${date}T12:00:00`);
const numberOrNull = (value) => value === '' ? null : Number(value);
const percent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const topicList = (value) => [...new Set((Array.isArray(value) ? value : String(value || '').split(/\n|,/)).map((item) => String(item).trim()).filter(Boolean))];

function FormField({ label, help, children }) {
  const id = React.useId();
  return <label className="field"><span id={`${id}-label`} className="field-label">{label}</span>{React.cloneElement(children, { 'aria-labelledby': `${id}-label`, 'aria-describedby': help ? `${id}-help` : undefined })}{help && <span id={`${id}-help`} className="field-help">{help}</span>}</label>;
}

function GoalContent({ value, onOpenRoadmap }) {
  const render = (goal, index) => <div className="goal-item" key={goal.id || index}><p><strong>{typeof goal === 'string' ? goal : goal.title || goal.label}</strong></p>{goal.description && <p className="muted small">{goal.description}</p>}{typeof goal.progress === 'number' && <div className="row spread small"><span className="field-help">{goal.completed || 0} / {goal.target || 0} Lernschritte</span><span className="muted">{percent(goal.progress)}%</span></div>}{goal.roadmapItemIds?.length > 0 && onOpenRoadmap && <button className="text-button" onClick={() => onOpenRoadmap(goal)}>Verknüpfte Studienziele <ArrowRight size={13} /></button>}</div>;
  if (Array.isArray(value)) return <>{value.slice(0, 2).map(render)}{value.length > 2 && <details><summary>{value.length - 2} weitere Ziele</summary>{value.slice(2).map(render)}</details>}</>;
  return <p><strong>{typeof value === 'string' ? value : value?.title || value?.label || 'Baue eine realistische Lernroutine auf und bereite dein Studium Schritt für Schritt vor.'}</strong>{value?.description && <span className="muted"> {value.description}</span>}</p>;
}

function RoadmapPhase({ phase, onToggle, onOpenToday }) {
  const items = phase.items || [];
  const complete = items.filter((item) => item.completed).length;
  const totalSteps = items.reduce((total, item) => total + (item.totalSteps || item.steps?.length || 0), 0);
  const completedSteps = items.reduce((total, item) => total + (item.completedSteps || 0), 0);
  const progress = totalSteps ? completedSteps / totalSteps * 100 : items.length ? complete / items.length * 100 : 0;
  return <details open={phase.status === 'current' || phase.status === 'active' || phase.key === 'now' || undefined} className={`card roadmap-phase ${phase.status === 'current' || phase.status === 'active' ? 'is-current' : ''}`} data-phase-id={phase.id} data-phase-start={phase.start} data-phase-end={phase.end}>
    <summary className="roadmap-phase-summary"><div className="row spread"><div><span className="page-kicker">{phase.start ? `${formatDate(phase.start, { month: 'short', year: 'numeric' })}${phase.end ? ` – ${formatDate(phase.end, { month: 'short', year: 'numeric' })}` : ''}` : 'DEIN STUDIENWEG'}</span><h2>{phase.label}</h2></div><span className="muted small">{complete}/{items.length}</span></div></summary>
    <div className="progress-track" role="progressbar" aria-label={`${phase.label} action progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(progress)}><span style={{ width: `${percent(progress)}%` }} /></div>
    {!!totalSteps && <p className="field-help">{completedSteps}/{totalSteps} Schritte erledigt · {complete}/{items.length} Meilensteine erreicht</p>}
    <div className="stack compact">{items.map((item) => {
      const confirmed = item.confirmed ?? item.completed;
      const steps = item.steps || [];
      const actionProgress = item.actionProgress ?? (item.totalSteps ? item.completedSteps / item.totalSteps * 100 : item.completed ? 100 : 0);
      return <div className="roadmap-item list-row align-start" key={item.id} data-milestone-id={item.id}>
        <button className={`task-check ${confirmed ? 'completed' : ''}`} aria-label={`${confirmed ? 'Meilenstein wieder öffnen' : 'Meilenstein abschließen'}: ${item.title}`} aria-pressed={!!confirmed} onClick={() => onToggle(item.id)}>{confirmed && <Check size={16} />}</button>
        <div className="grow"><strong>{item.title}</strong><p className="muted small">{item.description}</p>
          <div className="event-meta row wrap">{item.category && <span className="field-help">{item.category}</span>}{item.dueDate && <span className="field-help">{item.dateVerified ? 'Gespeicherte Frist' : 'Planungsziel'}: {formatDate(item.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}</div>
          {!!steps.length && <><div className="row spread small milestone-step-progress"><span className="field-help">{item.completedSteps || 0}/{item.totalSteps || steps.length} Lernschritte</span><span className="muted">{percent(actionProgress)}%</span></div><div className="progress-track" role="progressbar" aria-label={`${item.title} Lernschritte`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(actionProgress)}><span style={{ width: `${percent(actionProgress)}%` }} /></div></>}
          {!!steps.length && <details className="milestone-details"><summary>{item.nextStep ? `Nächster Schritt: ${item.nextStep.title}` : 'Erledigte Schritte'}</summary><div className="stack compact milestone-next-step">{item.nextStep && <><p><strong>{item.nextStep.title}</strong></p><p className="muted small">{item.nextStep.minutes} min</p>{(item.nextStep.instructions || item.nextStep.steps)?.length > 0 && <ol className="muted small">{(item.nextStep.instructions || item.nextStep.steps).map((instruction, index) => <li key={index}>{instruction}</li>)}</ol>}<Button variant="secondary" onClick={onOpenToday}>Heutige Aufgaben öffnen <ArrowRight size={15} /></Button></>}{steps.map((step) => <div className="list-row" key={step.id}><span className={`preview-check ${step.completed ? 'completed' : ''}`}>{step.completed && <Check size={12} />}</span><div className="grow"><p className="small">{step.title}</p></div><span className="muted small nowrap">{step.minutes} min</span></div>)}</div></details>}
          {item.link && <a className="text-link" href={item.link} target="_blank" rel="noreferrer">Offizielle Anforderungen <ArrowRight size={13} /></a>}
        </div>
      </div>;
    })}</div>
  </details>;
}

function ExamForm({ data, exam, today, onSave, onClose }) {
  const [form, setForm] = useState({ ...exam, id: exam?.id, createdDate: exam ? exam.createdDate || data.createdDate || today : today, subjectId: exam?.subjectId || data.subjects.find((s) => s.enabled)?.id || data.subjects[0]?.id || '', title: exam?.title || '', date: exam?.date || '', time: exam?.time || '', room: exam?.room || '', topics: topicList(exam?.topics).join('\n'), format: exam?.format || 'written', target: exam?.target ?? '', importance: exam?.importance || 'normal', preparation: exam?.preparation || '', notes: exam?.notes || '' });
  const [error, setError] = useState('');
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  if (!data.subjects.length) return <Modal title="Zuerst ein Fach hinzufügen" onClose={onClose}><EmptyState title="Ein Lernplan braucht ein Fach" description="Füge unter Profil → Fächer ein Fach hinzu. Danach kannst du die Prüfung planen." action={<Button onClick={onClose}>Verstanden</Button>} /></Modal>;
  function submit(event) {
    event.preventDefault();
    if (!form.subjectId || !form.title.trim() || !form.date) { setError('Wähle ein Fach, einen Titel und das tatsächliche Prüfungsdatum.'); return; }
    if (form.target !== '' && (!Number.isFinite(Number(form.target)) || Number(form.target) < 0 || Number(form.target) > 15)) { setError('Das Ziel muss zwischen 0 und 15 Punkten liegen.'); return; }
    try { onSave({ ...form, title: form.title.trim(), topics: topicList(form.topics), target: numberOrNull(form.target) }); }
    catch { setError('Die Prüfung konnte nicht gespeichert werden. Prüfe Datum und Angaben.'); }
  }
  return <Modal title={exam ? 'Prüfung bearbeiten' : 'Prüfung hinzufügen'} onClose={onClose}><form className="stack" onSubmit={submit}>
    <FormField label="Fach"><select value={form.subjectId} onChange={set('subjectId')} required>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subjectLabel(subject)}{subject.level === 'LK' ? ' · LK' : ''}</option>)}</select></FormField>
    <FormField label="Prüfungstitel"><input value={form.title} onChange={set('title')} placeholder="Mathematik-Klausur" maxLength={150} required /></FormField>
    <div className="form-grid"><FormField label="Prüfungsdatum"><input type="date" value={form.date} onChange={set('date')} required /></FormField><FormField label="Uhrzeit · optional"><input type="time" value={form.time} onChange={set('time')} /></FormField></div>
    <FormField label="Raum · optional"><input value={form.room} onChange={set('room')} maxLength={100} placeholder="Noch nicht bekannt" /></FormField>
    <div className="form-grid"><FormField label="Zielpunkte · optional"><input type="number" value={form.target} onChange={set('target')} min="0" max="15" step="0.5" /></FormField><FormField label="Bedeutung"><select value={form.importance} onChange={set('importance')}><option value="normal">Normal</option><option value="high">Besonders wichtig</option><option value="low">Geringer Umfang</option></select></FormField></div>
    <FormField label="Prüfungsthemen" help="Ein Thema pro Zeile. Ohne bekannte Themen bleibt der Lernplan vorläufig."><textarea rows="4" value={form.topics} onChange={set('topics')} maxLength={2500} /></FormField>
    <FormField label="Prüfungsform"><select value={form.format} onChange={set('format')}><option value="written">Klausur</option><option value="oral">Mündliche Prüfung</option><option value="test">Test</option><option value="practical">Praktische Prüfung / Projekt</option></select></FormField>
    <details className="product-details"><summary>Vorbereitung und Notizen</summary><div className="stack"><FormField label="Was musst du vorbereiten?"><textarea value={form.preparation} onChange={set('preparation')} rows="3" maxLength={2500} /></FormField><FormField label="Notizen"><textarea value={form.notes} onChange={set('notes')} rows="3" maxLength={4000} /></FormField></div></details>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">{exam ? 'Prüfung speichern' : 'Lernplan erstellen'}</Button></div>
  </form></Modal>;
}

function examPreparation(data, exam, today) {
  const stages = getExamPlan(data, exam.id, today);
  const remaining = stages.filter(stage => !stage.completed);
  const tasks = getDailyPlan(data, today, today).tasks || [];
  const scheduled = tasks.find(task => task.examId === exam.id && !task.completed);
  const next = (scheduled && remaining.find(stage => stage.id === scheduled.revisionPlanId)) || remaining[0];
  const topics = topicList(exam.topics);
  return { stages, remaining, scheduled, next, topics, readiness: percent(stages.length ? stages.filter(stage => stage.completed).length / stages.length * 100 : 0) };
}

function RevisionTimeline({ stages }) {
  return <div className="revision-timeline">{stages.map((stage, index) => <div className={`revision-stage ${stage.completed ? 'completed' : ''}`} key={stage.id || `${stage.date}-${index}`}><span className="timeline-dot">{stage.completed && <Check size={12} />}</span><div className="grow"><span className="field-help">{stage.date ? formatDate(stage.date, DATE_OPTIONS) : `Schritt ${index + 1}`}</span><strong>{stage.title || stage.label}</strong>{(stage.description || stage.reason) && <p className="muted small">{stage.description || stage.reason}</p>}{stage.minutes > 0 && <span className="field-help">{stage.remainingMinutes ?? stage.minutes} min{stage.completed ? ' · erledigt' : ' offen'}</span>}</div></div>)}</div>;
}

function ExamPreparation({ data, exam, today, onClose, onEdit, onToday }) {
  const subject = data.subjects.find(item => item.id === exam.subjectId);
  const { stages, remaining, scheduled, next, topics, readiness } = examPreparation(data, exam, today);
  const task = scheduled || (next && { id: `preview-${next.id}`, examId: exam.id, subjectId: exam.subjectId, title: next.title, date: today, minutes: next.remainingMinutes || next.minutes, reason: next.reason, revisionStage: next.stage, category: 'academics', steps: [next.reason] });
  const session = task && topics.length ? getGuidedSession(data, task, today) : null;
  const completed = stages.filter(stage => stage.completed).length;
  const weakTopics = subject?.weakTopics || [];
  const isPast = exam.date < today;
  return <Modal title={exam.title} onClose={onClose}><div className="stack exam-coach">
    <div className="exam-coach-heading"><span className="chip category-exam">{subjectLabel(subject)}{subject?.level === 'LK' ? ' · LK' : ''}</span><strong>{countdownLabel(today, exam.date)}</strong><p>{formatDate(exam.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{exam.time ? ` · ${exam.time}` : ''}{exam.room ? ` · Raum ${exam.room}` : ''}</p></div>
    <p className="field-help">{completed} von {stages.length} Bausteinen erledigt · {readiness}% Vorbereitung. Das bewertet deine Lernschritte, nicht dein Können.</p>
    {!topics.length ? <section className="exam-coach-next"><span className="field-help">ZUERST KLÄREN</span><h3>Welche Themen werden geprüft?</h3><p>Übernimm die Themen und das Prüfungsformat aus deinem Kurs oder frage deine Lehrkraft. Bis dahin bleibt die Vorbereitung vorläufig.</p><Button onClick={onEdit}>Prüfungsthemen ergänzen</Button></section> : <>
      <div className="topic-tags" aria-label="Bestätigte Prüfungsthemen">{topics.map(topic => <span className="chip" key={topic}>{topic}</span>)}</div>
      {session && !isPast && <section className="exam-coach-next"><span className="field-help">{scheduled ? 'HEUTE EINGEPLANT' : 'NÄCHSTER BAUSTEIN'}</span><h3>{session.objective}</h3><p>{session.expectedResult}</p><span className="field-help">{task.minutes} min · {session.method}</span><details className="product-details"><summary>So bereitest du dich vor</summary><ol className="exam-coach-method">{session.phases.map((phase, index) => <li key={index}><strong>{phase.title} · {phase.minutes} min</strong><p>{phase.action}</p></li>)}</ol>{session.resources?.map(resource => <p className="muted small" key={resource.title}>{resource.url ? <a className="text-link" href={resource.url} target="_blank" rel="noreferrer">{resource.title} <ArrowRight size={13} /></a> : <strong>{resource.title}</strong>}<br />{resource.hint}</p>)}</details>{scheduled ? <Button onClick={onToday}>Heutige Vorbereitung öffnen <ArrowRight size={15} /></Button> : <p className="field-help">Dein Tagesplan verteilt diese Bausteine gemeinsam mit Unterricht, anderen Prüfungen und Erholung.</p>}</section>}
    </>}
    {!!weakTopics.length && <details className="product-details"><summary>Persönliche Schwächen im Blick</summary><p className="muted small">{weakTopics.join(' · ')}</p><p className="field-help">Deine eingetragenen Schwächen sind keine bestätigte Themenliste für diese Prüfung. Übe sie, wenn sie tatsächlich geprüft werden.</p></details>}
    <details className="product-details"><summary>Gesamter Vorbereitungsplan</summary><p className="field-help">{remaining.reduce((sum, stage) => sum + (stage.remainingMinutes ?? stage.minutes), 0)} min offene Bausteine. Die Daten sind Lernziele; dein Tagesplan berücksichtigt die tatsächlich verfügbare Zeit.</p><RevisionTimeline stages={stages} /></details>
    {(exam.preparation || exam.notes) && <details className="product-details"><summary>Deine Prüfungsnotizen</summary>{exam.preparation && <p className="muted small">{exam.preparation}</p>}{exam.notes && <p className="muted small">{exam.notes}</p>}</details>}
    <Button variant="secondary" onClick={onEdit}>Prüfung bearbeiten</Button>
  </div></Modal>;
}

function ActivityForm({ activity, today, onSave, onClose }) {
  const [form, setForm] = useState({ id: activity?.id || uid(), title: activity?.title || '', recurrence: activity?.date ? 'once' : 'weekly', days: activity?.days || [1], date: activity?.date || today, start: activity?.start || '17:00', end: activity?.end || '18:00', category: activity?.category || 'activity' });
  const [error, setError] = useState('');
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) { setError('Gib dem Termin einen Namen.'); return; }
    if (!(timeMinutes(form.end) > timeMinutes(form.start))) { setError('Das Ende muss nach dem Beginn liegen.'); return; }
    if (form.recurrence === 'weekly' && !form.days.length) { setError('Wähle mindestens einen Tag.'); return; }
    if (form.recurrence === 'once' && !form.date) { setError('Wähle ein Datum.'); return; }
    const { recurrence, ...activityData } = form;
    onSave({ ...activityData, title: form.title.trim(), days: recurrence === 'weekly' ? form.days : [], date: recurrence === 'once' ? form.date : '' });
  }
  return <Modal title={activity ? 'Termin bearbeiten' : 'Festen Termin hinzufügen'} onClose={onClose}><form className="stack" onSubmit={submit}>
    <FormField label="Terminname"><input value={form.title} onChange={set('title')} placeholder="Volleyballtraining" required maxLength={150} /></FormField>
    <FormField label="Wiederholung"><select value={form.recurrence} onChange={set('recurrence')}><option value="weekly">Jede Woche</option><option value="once">Einmalig</option></select></FormField>
    {form.recurrence === 'weekly' ? <fieldset className="field"><legend className="field-label">Wochentage</legend><div className="day-selector">{DAY_ORDER.map((day) => <button key={day} type="button" className={`button button-secondary ${form.days.includes(day) ? 'is-selected' : ''}`} aria-pressed={form.days.includes(day)} aria-label={DAYS[day]} onClick={() => setForm((current) => ({ ...current, days: current.days.includes(day) ? current.days.filter((d) => d !== day) : [...current.days, day] }))}>{DAYS[day].slice(0, 3)}</button>)}</div></fieldset> : <FormField label="Datum"><input type="date" value={form.date} onChange={set('date')} required /></FormField>}
    <div className="form-grid"><FormField label="Beginn"><input type="time" value={form.start} onChange={set('start')} required /></FormField><FormField label="Ende"><input type="time" value={form.end} onChange={set('end')} required /></FormField></div>
    <FormField label="Art"><select value={form.category} onChange={set('category')}><option value="school">Schule</option><option value="sport">Sport / Fitness</option><option value="work">Arbeit</option><option value="appointment">Termin</option><option value="activity">Sonstiges</option></select></FormField>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Termin speichern</Button></div>
  </form></Modal>;
}

export default function Plan({ data, today, onChange, notify, onSelectDay, onOpenProfile, initialView = 'week', initialPathway, onOpenSchoolImport }) {
  const [tab, setTab] = useState(initialView);
  const [week, setWeek] = useState(startOfWeek(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const [country, setCountry] = useState(initialPathway || (data.profile.pathways?.[0] === 'Germany' ? 'Germany' : 'USA'));
  const [modal, setModal] = useState(null);
  const [deleteExamId, setDeleteExamId] = useState(null);
  const [weeklyDraft, setWeeklyDraft] = useState(null);
  const [scheduleError, setScheduleError] = useState('');
  const [overrideDate, setOverrideDate] = useState(today);
  const [overrideMinutes, setOverrideMinutes] = useState('');
  useEffect(() => { setTab(initialView); }, [initialView]);
  useEffect(() => { if (initialPathway) setCountry(initialPathway); }, [initialPathway]);
  const exams = [...data.exams].sort((a, b) => a.date.localeCompare(b.date));
  const importedExamCount = exams.filter(exam => exam.importKey?.startsWith(`${SCHOOL_IMPORT_ID}-exam-`)).length;
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(week, index));
  const preview = getDailyPlan(data, selectedDay, today);
  const isHistory = preview.isHistory || selectedDay < today;
  const previewTasks = Array.isArray(preview) ? preview : preview.tasks || [];
  const availability = isHistory ? null : getAvailability(data, selectedDay);
  const completedMinutes = previewTasks.filter((task) => task.completed).reduce((total, task) => total + task.minutes, 0);
  const goals = getGoals(data, selectedDay < today ? today : selectedDay);
  const roadmap = getRoadmap(data, country, today);
  const phases = Array.isArray(roadmap) ? roadmap : roadmap.phases || [];
  const activeWeekly = weeklyDraft || data.schedule.weekly;

  function changeWeek(offset) { const next = shiftDate(week, offset * 7); setWeek(next); setSelectedDay(next); }
  function openRoadmapGoal(goal) {
    const pathway = goal?.pathway || goal?.roadmapItemIds?.[0]?.split('-')[0];
    if (['USA', 'Germany'].includes(pathway)) setCountry(pathway);
    setTab('roadmap');
  }
  function saveWeekly(event) {
    event.preventDefault();
    for (const day of activeWeekly) {
      if (!Number.isFinite(Number(day.minutes)) || Number(day.minutes) < 0 || Number(day.minutes) > 720) { setScheduleError('Die tägliche Lernzeit muss zwischen 0 und 720 Minuten liegen.'); return; }
      if (!(timeMinutes(day.windowEnd) > timeMinutes(day.windowStart))) { setScheduleError('Das Lernfenster muss nach dem Beginn enden.'); return; }
    }
    onChange((current) => saveSchedule(current, { ...current.schedule, weekly: activeWeekly.map((day) => ({ ...day, minutes: Number(day.minutes) })) }));
    setWeeklyDraft(null); setScheduleError(''); notify?.('Lernzeiten gespeichert. Dein Plan wurde angepasst.');
  }
  function saveOverride(event) {
    event.preventDefault();
    const minutes = Number(overrideMinutes);
    if (!overrideDate || overrideMinutes === '' || !Number.isFinite(minutes) || minutes < 0 || minutes > 720) { setScheduleError('Wähle ein Datum und 0–720 Minuten. 0 Minuten bedeutet Pause.'); return; }
    onChange((current) => saveSchedule(current, { ...current.schedule, timeOverrides: [...current.schedule.timeOverrides.filter((entry) => entry.date !== overrideDate), { date: overrideDate, minutes }] }));
    setOverrideMinutes(''); setScheduleError(''); notify?.('Lernzeit für den Tag aktualisiert.');
  }
  function saveFixedActivity(activity) {
    onChange((current) => saveSchedule(current, { ...current.schedule, fixedActivities: [...current.schedule.fixedActivities.filter((entry) => entry.id !== activity.id), activity] }));
    setModal(null); notify?.('Termin gespeichert. Dein Lernplan berücksichtigt ihn.');
  }

  return <div className="screen plan-screen">
    <header className="page-header"><p className="page-kicker">DEINE NÄCHSTEN SCHRITTE</p><h1 className="page-title">Lernplan</h1></header>
    <div className="tabs-scroll"><Segmented value={tab} onChange={setTab} options={[{ value: 'week', label: 'Woche' }, { value: 'timetable', label: 'Stundenplan' }, { value: 'exams', label: 'Prüfungen' }, { value: 'events', label: 'Termine' }, { value: 'roadmap', label: 'Studienweg' }, { value: 'schedule', label: 'Lernzeiten' }]} /></div>

    {tab === 'week' && <div className="stack">
      <div className="week-heading row"><button className="icon-button" aria-label="Vorherige Woche" onClick={() => changeWeek(-1)}><ChevronLeft size={20} /></button><h2>{formatDate(week, DATE_OPTIONS)} – {formatDate(shiftDate(week, 6), DATE_OPTIONS)}</h2><button className="icon-button" aria-label="Nächste Woche" onClick={() => changeWeek(1)}><ChevronRight size={20} /></button></div>
      <div className="week-strip" aria-label="Tag auswählen">{days.map((date) => { const plan = getDailyPlan(data, date, today); const tasks = Array.isArray(plan) ? plan : plan.tasks || []; return <button className={`week-day ${date === selectedDay ? 'selected' : ''} ${date === today ? 'is-today' : ''}`} key={date} aria-label={formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })} aria-pressed={date === selectedDay} onClick={() => setSelectedDay(date)}><span>{inputDate(date).toLocaleDateString('de', { weekday: 'short' })}</span><strong>{inputDate(date).getDate()}</strong><span className={`day-indicator ${tasks.some((task) => task.completed) ? 'done' : tasks.length ? 'planned' : ''}`} /></button>; })}</div>
      <section className="card"><SectionHeading title={selectedDay === today ? 'Dein heutiger Plan' : formatDate(selectedDay, { weekday: 'long', month: 'short', day: 'numeric' })} action={<Button variant="ghost" onClick={() => onSelectDay(selectedDay)}>Tag öffnen <ArrowRight size={16} /></Button>} />{isHistory ? <p className="muted">{previewTasks.filter((task) => task.completed).length}/{previewTasks.length} erledigt · {formatMinutes(completedMinutes)} geschätzte Lernzeit</p> : <><p className="muted">{formatMinutes(availability.minutes ?? availability.availableMinutes ?? 0)} frei · {formatMinutes(previewTasks.reduce((total, task) => total + task.minutes, 0))} geplant</p>{!!availability.freeWindows?.length && <p className="field-help">Lernfenster: {availability.freeWindows.map((window) => `${window.start}–${window.end}`).join(' · ')}</p>}</>}
        {previewTasks.length ? <div className="stack compact">{previewTasks.map((task) => <div className="list-row" key={task.id}><span className={`preview-check ${task.completed ? 'completed' : ''}`}>{task.completed && <Check size={14} />}</span><div className="grow"><strong>{task.title}</strong><p className="muted small">{shortTaskReason(task, data)}</p></div><span className="muted nowrap">{task.minutes} min</span></div>)}</div> : isHistory ? <EmptyState title="Kein gespeicherter Plan" description="Für diesen Tag sind keine Aufgaben gespeichert." action={<Button variant="secondary" onClick={() => { setWeek(startOfWeek(today)); setSelectedDay(today); }}>Zurück zu heute</Button>} /> : <EmptyState title="Zeit zum Durchatmen" description="Heute ist keine Lernzeit frei. Dein nächster Plan berücksichtigt deine Ziele weiter." action={<Button variant="secondary" onClick={() => setTab('schedule')}>Lernzeit anpassen</Button>} />}
      </section>
      <UpcomingEvents data={data} today={today} onOpenEvents={() => setTab('events')} />
      <button type="button" className="preparation-entry" onClick={() => onOpenProfile?.('IELTS')}><div><strong>IELTS & SAT</strong><span>Ziele, Anmeldung und dein abgestimmter Lernplan</span></div><ArrowRight size={17} aria-hidden="true" /></button>
      <details className="card goal-hierarchy product-details"><summary>Dein Weg zum Ziel</summary><div className="goal-ladder">
        <div className="goal-step"><span className="chip">Langfristig</span><GoalContent value={goals.longTerm} /></div>
        <details className="goal-period-details"><summary>Jahres- und Semesterziele</summary><div className="goal-ladder">{[{ label: 'Dieses Jahr', value: goals.yearly }, { label: 'Dieses Semester', value: goals.semester }].filter(({ value }) => value?.length).map(({ label, value }) => <div className="goal-step" key={label}><span className="chip">{label}</span><GoalContent value={value} onOpenRoadmap={openRoadmapGoal} /></div>)}</div></details>
        {[{ label: 'Diesen Monat', value: goals.monthly }, { label: 'Diese Woche', value: goals.weekly }].map(({ label, value }) => <div className="goal-step" key={label}><span className="chip">{label}</span><GoalContent value={value} onOpenRoadmap={openRoadmapGoal} /></div>)}
        <div className="goal-step"><span className="chip">{selectedDay === today ? 'Heute' : 'Gewählter Tag'}</span><p><strong>{preview.goal || previewTasks.find((task) => !task.completed)?.title || 'Schaffe Zeit für deine nächsten Schritte'}</strong></p><p className="muted small">{previewTasks.length} konkrete Schritte · {formatMinutes(previewTasks.reduce((total, task) => total + task.minutes, 0))}</p><button className="text-button" onClick={() => onSelectDay(selectedDay)}>Aufgaben öffnen <ArrowRight size={13} /></button></div>
      </div><Button variant="ghost" onClick={() => setTab('roadmap')}>Studienweg ansehen <ArrowRight size={15} /></Button></details>
    </div>}

    {tab === 'timetable' && <Timetable data={data} today={today} onChange={onChange} notify={notify} onOpenSchoolImport={onOpenSchoolImport} />}

    {tab === 'events' && <Events data={data} today={today} onChange={onChange} notify={notify} onAddExam={() => setModal({ type: 'exam' })} onEditExam={(id) => { const exam = data.exams.find((item) => item.id === id); if (exam) setModal({ type: 'exam', exam }); }} onOpenProfile={onOpenProfile} />}

    {tab === 'exams' && <div className="stack"><SectionHeading title="Deine Prüfungen" action={exams.length ? <Button onClick={() => setModal({ type: 'exam' })}><Plus size={17} /> Prüfung hinzufügen</Button> : undefined} />
      {onOpenSchoolImport && (importedExamCount >= CONFIRMED_Q1_EXAMS.length ? <Button className="school-import-again" variant="ghost" onClick={() => onOpenSchoolImport('exams')}>Q1-Import erneut prüfen</Button> : <div className="school-import-entry"><div><strong>Deine bestätigten Q1-Prüfungen</strong><p className="muted small">Neun Termine prüfen und mit deinen Einträgen zusammenführen.</p></div><Button variant="secondary" onClick={() => onOpenSchoolImport('exams')}>Import prüfen</Button></div>)}
      {!exams.length && <EmptyState icon={CalendarDays} title="Noch keine Prüfungen" description="Trage deine nächste Klausur ein und erhalte einen Lernplan." action={<Button onClick={() => setModal({ type: 'exam' })}><Plus size={17} /> Prüfung hinzufügen</Button>} />}
      {exams.map(exam => { const subject = data.subjects.find(item => item.id === exam.subjectId); const { stages, scheduled, next, topics } = examPreparation(data, exam, today); const isPast = exam.date < today; const pending = stages.filter(stage => !stage.completed).length; return <section className={`card exam-card ${isPast ? 'exam-past' : ''}`} key={exam.id}>
        <div className="exam-card-heading"><div className="grow"><span className="exam-subject-label"><CalendarDays size={14} aria-hidden="true" />{subjectLabel(subject)}{subject?.level === 'LK' ? ' · LK' : ''}</span><h2>{exam.title}</h2><p className="muted small">{formatDate(exam.date, { weekday: 'short', month: 'long', day: 'numeric' })}{exam.time ? ` · ${exam.time}` : ''}{exam.room ? ` · ${exam.room}` : ''}</p></div><span className="exam-countdown">{countdownLabel(today, exam.date)}</span></div>
        {!isPast && <p className="exam-next-action"><span>{!topics.length ? 'Themen noch offen' : scheduled ? 'Heute' : 'Nächster Schritt'}</span><strong>{!topics.length ? 'Prüfungsthemen mit deinem Kurs abgleichen' : scheduled?.objective || scheduled?.title || next?.title || 'Vorbereitung abgeschlossen – leicht wiederholen'}</strong>{(scheduled || next) && topics.length > 0 && <span>{scheduled?.minutes || next?.remainingMinutes || next?.minutes} min</span>}</p>}
        <div className="exam-card-actions"><Button variant="secondary" onClick={() => setModal({ type: 'preparation', exam })}>Vorbereitung öffnen <ArrowRight size={15} /></Button><button className="icon-button" aria-label={`${exam.title} bearbeiten`} onClick={() => setModal({ type: 'exam', exam })}><Edit3 size={17} /></button><button className="icon-button" aria-label={`${exam.title} löschen`} onClick={() => setDeleteExamId(exam.id)}><Trash2 size={17} /></button></div>
        <details className="revision-details"><summary>Vorbereitungsplan{isPast ? ' · vergangene Prüfung' : ` · ${pending} Bausteine offen`}</summary><p className="field-help">Zieltermine für deine Vorbereitung. Der Tagesplan verteilt die Arbeit nach verfügbarer Zeit.{!topics.length ? ' Vorläufig, bis deine Themen feststehen.' : ''}</p><RevisionTimeline stages={stages} />{!stages.length && <p className="muted">Noch keine Vorbereitungsschritte vorhanden.</p>}</details>
      </section>; })}
    </div>}

    {tab === 'roadmap' && <div className="stack"><Segmented value={country} onChange={setCountry} options={[{ value: 'USA', label: 'USA' }, { value: 'Germany', label: 'Deutschland' }]} /><p className="muted">{country === 'USA' ? 'Stärke deine Noten, dokumentiere Erfahrungen und recherchiere passende Hochschulen. Zulassung und Testanforderungen unterscheiden sich je Hochschule.' : 'Bereite dein Abitur vor und prüfe Studiengänge, Zulassungsregeln und Unterlagen für jede Hochschule.'}</p>
      <p className="field-help">Deine täglichen Schritte bauen aufeinander auf. Bestätige einen Meilenstein, wenn du ihn erreicht hast.</p>
      <div className="roadmap-timeline">{phases.map((phase) => <RoadmapPhase key={phase.id} phase={phase} onToggle={(id) => onChange((current) => toggleRoadmapItem(current, id))} onOpenToday={() => onSelectDay(today)} />)}</div>
      <details className="product-details"><summary>Termine und Anforderungen</summary><p className="field-help">Die Zeitachse enthält Planungsziele. Prüfe Fristen und Anforderungen auf den offiziellen Hochschulseiten. UCLA und UC Berkeley berücksichtigen SAT/ACT nicht für die Zulassung. NC und Hochschulstart hängen vom Studiengang ab.</p></details>
    </div>}

    {tab === 'schedule' && <div className="stack"><section className="card"><SectionHeading title="Wöchentliche Lernzeit" /><p className="muted">Lege realistische Lernzeiten fest. Unterricht, Termine und Erholung haben weiterhin Platz.</p><form className="stack" onSubmit={saveWeekly}><div className="weekly-schedule">{DAY_ORDER.map((dayNumber) => { const day = activeWeekly.find((item) => item.day === dayNumber) || { day: dayNumber, minutes: 60, windowStart: '16:00', windowEnd: '21:00' }; const update = (key, value) => setWeeklyDraft((current) => (current || data.schedule.weekly).map((item) => item.day === dayNumber ? { ...item, [key]: value } : item)); return <div className="schedule-day" key={dayNumber}><strong>{DAYS[dayNumber]}</strong><div className="form-grid schedule-fields"><FormField label={`${DAYS[dayNumber]} Lernminuten`}><input type="number" min="0" max="720" value={day.minutes} onChange={(event) => update('minutes', event.target.value)} required /></FormField><FormField label={`${DAYS[dayNumber]} Lernbeginn`}><input type="time" value={day.windowStart} onChange={(event) => update('windowStart', event.target.value)} required /></FormField><FormField label={`${DAYS[dayNumber]} Lernende`}><input type="time" value={day.windowEnd} onChange={(event) => update('windowEnd', event.target.value)} required /></FormField></div></div>; })}</div><Button type="submit" disabled={!weeklyDraft}>Lernzeiten speichern</Button></form></section>
      <section className="card"><SectionHeading title="Feste Termine" action={<Button variant="secondary" onClick={() => setModal({ type: 'activity' })}><Plus size={17} /> Termin hinzufügen</Button>} /><p className="muted">Training, Arbeit und persönliche Termine werden freigehalten.</p>{data.schedule.fixedActivities.length ? <div className="stack compact">{data.schedule.fixedActivities.map((activity) => <div className={`list-row commitment-row commitment-${activity.category || 'activity'}`} key={activity.id}><div className="grow"><strong>{activity.title}</strong><p className="muted small">{activity.date ? formatDate(activity.date, DATE_OPTIONS) : (activity.days || []).slice().sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)).map((day) => DAYS[day].slice(0, 3)).join(', ')} · {activity.start}–{activity.end}</p></div><button className="icon-button" aria-label={`${activity.title} bearbeiten`} onClick={() => setModal({ type: 'activity', activity })}><Edit3 size={17} /></button><button className="icon-button" aria-label={`${activity.title} löschen`} onClick={() => { onChange((current) => saveSchedule(current, { ...current.schedule, fixedActivities: current.schedule.fixedActivities.filter((entry) => entry.id !== activity.id) })); notify?.('Termin entfernt.'); }}><Trash2 size={17} /></button></div>)}</div> : <p className="muted">Noch keine festen Termine.</p>}</section>
      <section className="card"><SectionHeading title="Ein anderer Tagesrhythmus" /><p className="muted">Passe deine Lernzeit für einzelne Tage an. 0 Minuten bedeutet Pause.</p><form className="stack" onSubmit={saveOverride}><div className="form-grid"><FormField label="Datum"><input type="date" value={overrideDate} onChange={(event) => setOverrideDate(event.target.value)} required /></FormField><FormField label="Verfügbare Minuten"><input type="number" value={overrideMinutes} onChange={(event) => setOverrideMinutes(event.target.value)} min="0" max="720" placeholder="85" required /></FormField></div><Button type="submit" variant="secondary">Lernzeit für den Tag speichern</Button></form>{!!data.schedule.timeOverrides.length && <div className="stack compact">{[...data.schedule.timeOverrides].sort((a, b) => a.date.localeCompare(b.date)).map((entry) => <div className="list-row" key={entry.date}><div className="grow"><strong>{formatDate(entry.date, { month: 'short', day: 'numeric', year: 'numeric' })}</strong><p className="muted small">{entry.minutes === 0 ? 'Pausentag' : formatMinutes(entry.minutes)}</p></div><button className="icon-button" aria-label={`Tageslernzeit vom ${entry.date} entfernen`} onClick={() => onChange((current) => saveSchedule(current, { ...current.schedule, timeOverrides: current.schedule.timeOverrides.filter((item) => item.date !== entry.date) }))}><X size={17} /></button></div>)}</div>}</section>
      {scheduleError && <p className="form-error" role="alert">{scheduleError}</p>}
    </div>}

    {modal?.type === 'preparation' && <ExamPreparation data={data} exam={modal.exam} today={today} onClose={() => setModal(null)} onEdit={() => setModal({ type: 'exam', exam: modal.exam })} onToday={() => { setModal(null); onSelectDay(today); }} />}
    {modal?.type === 'exam' && <ExamForm key={modal.exam?.id || 'new'} data={data} exam={modal.exam} today={today} onClose={() => setModal(null)} onSave={(exam) => { onChange((current) => saveExam(current, exam)); setModal(null); notify?.('Prüfung gespeichert. Dein Lernplan wurde angepasst.'); }} />}
    {modal?.type === 'activity' && <ActivityForm activity={modal.activity} today={today} onClose={() => setModal(null)} onSave={saveFixedActivity} />}
    {deleteExamId && <Modal title="Prüfung entfernen?" onClose={() => setDeleteExamId(null)}><p className="muted">Künftige Vorbereitung entfällt. Bereits erledigte Aufgaben bleiben erhalten.</p><div className="sheet-footer"><Button variant="secondary" onClick={() => setDeleteExamId(null)}>Behalten</Button><Button onClick={() => { onChange((current) => removeExam(current, deleteExamId)); setDeleteExamId(null); notify?.('Prüfung entfernt.'); }}>Prüfung entfernen</Button></div></Modal>}
  </div>;
}
