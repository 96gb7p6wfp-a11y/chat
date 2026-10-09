import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Edit3, Plus, Trash2, X } from 'lucide-react';
import { Modal, Button, EmptyState, Segmented, SectionHeading, formatDate, formatMinutes } from './UI.jsx';
import {
  getDailyPlan, getAvailability, getGoals, getExamPlan, getRoadmap,
  saveExam, removeExam, saveSchedule, toggleRoadmapItem, shiftDate, startOfWeek, uid,
} from '../coach.js';
import Events, { UpcomingEvents } from './Events.jsx';
import { shortTaskReason } from '../presentation.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DATE_OPTIONS = { month: 'short', day: 'numeric' };
const timeMinutes = (time) => { const [h, m] = String(time || '').split(':').map(Number); return h * 60 + m; };
const inputDate = (date) => new Date(`${date}T12:00:00`);
const numberOrNull = (value) => value === '' ? null : Number(value);
const percent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const topicList = (value) => [...new Set((Array.isArray(value) ? value : String(value || '').split(/\n|,/)).map((item) => String(item).trim()).filter(Boolean))];

function FormField({ label, help, children }) {
  const id = React.useId();
  return <label className="field"><span id={`${id}-label`} className="field-label">{label}</span>{React.cloneElement(children, { 'aria-labelledby': `${id}-label`, 'aria-describedby': help ? `${id}-help` : undefined })}{help && <span id={`${id}-help`} className="field-help">{help}</span>}</label>;
}

function GoalContent({ value, onOpenRoadmap }) {
  const render = (goal, index) => <div className="goal-item" key={goal.id || index}><p><strong>{typeof goal === 'string' ? goal : goal.title || goal.label}</strong></p>{goal.description && <p className="muted small">{goal.description}</p>}{typeof goal.progress === 'number' && <div className="row spread small"><span className="field-help">{goal.completed || 0} / {goal.target || 0} focused steps</span><span className="muted">{percent(goal.progress)}%</span></div>}{goal.roadmapItemIds?.length > 0 && onOpenRoadmap && <button className="text-button" onClick={() => onOpenRoadmap(goal)}>Linked university milestones <ArrowRight size={13} /></button>}</div>;
  if (Array.isArray(value)) return <>{value.slice(0, 2).map(render)}{value.length > 2 && <details><summary>{value.length - 2} more goals</summary>{value.slice(2).map(render)}</details>}</>;
  return <p><strong>{typeof value === 'string' ? value : value?.title || value?.label || 'Build a sustainable academic and university preparation routine.'}</strong>{value?.description && <span className="muted"> {value.description}</span>}</p>;
}

function RoadmapPhase({ phase, onToggle, onOpenToday }) {
  const items = phase.items || [];
  const complete = items.filter((item) => item.completed).length;
  const totalSteps = items.reduce((total, item) => total + (item.totalSteps || item.steps?.length || 0), 0);
  const completedSteps = items.reduce((total, item) => total + (item.completedSteps || 0), 0);
  const progress = totalSteps ? completedSteps / totalSteps * 100 : items.length ? complete / items.length * 100 : 0;
  return <section className={`card roadmap-phase ${phase.status === 'current' || phase.status === 'active' ? 'is-current' : ''}`} data-phase-id={phase.id} data-phase-start={phase.start} data-phase-end={phase.end}>
    <div className="row spread"><div><span className="page-kicker">{phase.start ? `${formatDate(phase.start, { month: 'short', year: 'numeric' })}${phase.end ? ` – ${formatDate(phase.end, { month: 'short', year: 'numeric' })}` : ''}` : 'YOUR PATHWAY'}</span><h2>{phase.label}</h2></div><span className="muted small">{complete}/{items.length}</span></div>
    <div className="progress-track" role="progressbar" aria-label={`${phase.label} action progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(progress)}><span style={{ width: `${percent(progress)}%` }} /></div>
    {!!totalSteps && <p className="field-help">{completedSteps}/{totalSteps} actions completed · {complete}/{items.length} milestones reached</p>}
    <div className="stack compact">{items.map((item) => {
      const confirmed = item.confirmed ?? item.completed;
      const steps = item.steps || [];
      const actionProgress = item.actionProgress ?? (item.totalSteps ? item.completedSteps / item.totalSteps * 100 : item.completed ? 100 : 0);
      return <div className="roadmap-item list-row align-start" key={item.id} data-milestone-id={item.id}>
        <button className={`task-check ${confirmed ? 'completed' : ''}`} aria-label={`${confirmed ? 'Unmark' : 'Complete'} roadmap: ${item.title}`} aria-pressed={!!confirmed} onClick={() => onToggle(item.id)}>{confirmed && <Check size={16} />}</button>
        <div className="grow"><strong>{item.title}</strong><p className="muted small">{item.description}</p>
          <div className="event-meta row wrap">{item.category && <span className="field-help">{item.category}</span>}{item.dueDate && <span className="field-help">{item.dateVerified ? 'Saved deadline' : 'Planning target'}: {formatDate(item.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}</div>
          {!!steps.length && <><div className="row spread small milestone-step-progress"><span className="field-help">{item.completedSteps || 0}/{item.totalSteps || steps.length} linked actions</span><span className="muted">{percent(actionProgress)}%</span></div><div className="progress-track" role="progressbar" aria-label={`${item.title} linked actions`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(actionProgress)}><span style={{ width: `${percent(actionProgress)}%` }} /></div></>}
          {!!steps.length && <details className="milestone-details"><summary>{item.nextStep ? `Next action: ${item.nextStep.title}` : 'Completed actions'}</summary><div className="stack compact milestone-next-step">{item.nextStep && <><p><strong>{item.nextStep.title}</strong></p><p className="muted small">{item.nextStep.minutes} min</p>{(item.nextStep.instructions || item.nextStep.steps)?.length > 0 && <ol className="muted small">{(item.nextStep.instructions || item.nextStep.steps).map((instruction, index) => <li key={index}>{instruction}</li>)}</ol>}<Button variant="secondary" onClick={onOpenToday}>View today’s actions <ArrowRight size={15} /></Button></>}{steps.map((step) => <div className="list-row" key={step.id}><span className={`preview-check ${step.completed ? 'completed' : ''}`}>{step.completed && <Check size={12} />}</span><div className="grow"><p className="small">{step.title}</p></div><span className="muted small nowrap">{step.minutes} min</span></div>)}</div></details>}
          {item.link && <a className="text-link" href={item.link} target="_blank" rel="noreferrer">Official requirements <ArrowRight size={13} /></a>}
        </div>
      </div>;
    })}</div>
  </section>;
}

function ExamForm({ data, exam, today, onSave, onClose }) {
  const [form, setForm] = useState({ id: exam?.id, createdDate: exam ? exam.createdDate || data.createdDate || today : today, subjectId: exam?.subjectId || data.subjects.find((s) => s.enabled)?.id || data.subjects[0]?.id || '', title: exam?.title || '', date: exam?.date || shiftDate(today, 14), topics: topicList(exam?.topics).join('\n'), format: exam?.format || 'written', target: exam?.target ?? '' });
  const [error, setError] = useState('');
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  if (!data.subjects.length) return <Modal title="Add a subject first" onClose={onClose}><EmptyState title="A revision plan needs a subject" description="Open Profile → Subjects to add your subject, then create its exam." action={<Button onClick={onClose}>Got it</Button>} /></Modal>;
  function submit(event) {
    event.preventDefault();
    if (!form.subjectId || !form.title.trim() || !form.date) { setError('Choose a subject, an exam title and a date.'); return; }
    if (form.target !== '' && (!Number.isFinite(Number(form.target)) || Number(form.target) < 0 || Number(form.target) > 15)) { setError('Target points must be between 0 and 15.'); return; }
    onSave({ ...form, title: form.title.trim(), topics: topicList(form.topics), target: numberOrNull(form.target) });
  }
  return <Modal title={exam ? 'Edit exam' : 'Add an exam'} onClose={onClose}><form className="stack" onSubmit={submit}>
    <FormField label="Subject"><select value={form.subjectId} onChange={set('subjectId')} required>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}{subject.level === 'LK' ? ' · LK' : ''}</option>)}</select></FormField>
    <FormField label="Exam title"><input value={form.title} onChange={set('title')} placeholder="English Klausur" maxLength={150} required /></FormField>
    <div className="form-grid"><FormField label="Exam date"><input type="date" value={form.date} onChange={set('date')} required /></FormField><FormField label="Target points"><input type="number" value={form.target} onChange={set('target')} min="0" max="15" placeholder="10" /></FormField></div>
    <FormField label="Topics" help="One topic per line. Specific topics lead to more useful revision tasks."><textarea rows="5" value={form.topics} onChange={set('topics')} placeholder={'American Dream\nSummary\nAnalysis\nComment'} maxLength={2500} /></FormField>
    <FormField label="Format"><select value={form.format} onChange={set('format')}><option value="written">Written exam</option><option value="oral">Oral exam</option><option value="practical">Practical / project</option></select></FormField>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">{exam ? 'Save exam' : 'Create revision plan'}</Button></div>
  </form></Modal>;
}

function ActivityForm({ activity, today, onSave, onClose }) {
  const [form, setForm] = useState({ id: activity?.id || uid(), title: activity?.title || '', recurrence: activity?.date ? 'once' : 'weekly', days: activity?.days || [1], date: activity?.date || today, start: activity?.start || '17:00', end: activity?.end || '18:00', category: activity?.category || 'activity' });
  const [error, setError] = useState('');
  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }));
  function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) { setError('Give this activity a name.'); return; }
    if (!(timeMinutes(form.end) > timeMinutes(form.start))) { setError('The end time must be after the start time.'); return; }
    if (form.recurrence === 'weekly' && !form.days.length) { setError('Choose at least one day.'); return; }
    if (form.recurrence === 'once' && !form.date) { setError('Choose a date.'); return; }
    const { recurrence, ...activityData } = form;
    onSave({ ...activityData, title: form.title.trim(), days: recurrence === 'weekly' ? form.days : [], date: recurrence === 'once' ? form.date : '' });
  }
  return <Modal title={activity ? 'Edit fixed activity' : 'Add a fixed activity'} onClose={onClose}><form className="stack" onSubmit={submit}>
    <FormField label="Activity name"><input value={form.title} onChange={set('title')} placeholder="Volleyball training" required maxLength={150} /></FormField>
    <FormField label="Repeats"><select value={form.recurrence} onChange={set('recurrence')}><option value="weekly">Every week</option><option value="once">One date only</option></select></FormField>
    {form.recurrence === 'weekly' ? <fieldset className="field"><legend className="field-label">Days</legend><div className="day-selector">{DAY_ORDER.map((day) => <button key={day} type="button" className={`button button-secondary ${form.days.includes(day) ? 'is-selected' : ''}`} aria-pressed={form.days.includes(day)} aria-label={DAYS[day]} onClick={() => setForm((current) => ({ ...current, days: current.days.includes(day) ? current.days.filter((d) => d !== day) : [...current.days, day] }))}>{DAYS[day].slice(0, 3)}</button>)}</div></fieldset> : <FormField label="Date"><input type="date" value={form.date} onChange={set('date')} required /></FormField>}
    <div className="form-grid"><FormField label="Start time"><input type="time" value={form.start} onChange={set('start')} required /></FormField><FormField label="End time"><input type="time" value={form.end} onChange={set('end')} required /></FormField></div>
    <FormField label="Type"><select value={form.category} onChange={set('category')}><option value="school">School</option><option value="sport">Sport / gym</option><option value="work">Work</option><option value="appointment">Appointment</option><option value="activity">Other activity</option></select></FormField>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Save activity</Button></div>
  </form></Modal>;
}

export default function Plan({ data, today, onChange, notify, onSelectDay, onOpenProfile, initialView = 'week', initialPathway }) {
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
      if (!Number.isFinite(Number(day.minutes)) || Number(day.minutes) < 0 || Number(day.minutes) > 720) { setScheduleError('Daily study time must be between 0 and 720 minutes.'); return; }
      if (!(timeMinutes(day.windowEnd) > timeMinutes(day.windowStart))) { setScheduleError('Each study window must end after it starts.'); return; }
    }
    onChange((current) => saveSchedule(current, { ...current.schedule, weekly: activeWeekly.map((day) => ({ ...day, minutes: Number(day.minutes) })) }));
    setWeeklyDraft(null); setScheduleError(''); notify?.('Timetable saved. Your plan is updated.');
  }
  function saveOverride(event) {
    event.preventDefault();
    const minutes = Number(overrideMinutes);
    if (!overrideDate || overrideMinutes === '' || !Number.isFinite(minutes) || minutes < 0 || minutes > 720) { setScheduleError('Choose a date and 0–720 available minutes. Zero is a rest day.'); return; }
    onChange((current) => saveSchedule(current, { ...current.schedule, timeOverrides: [...current.schedule.timeOverrides.filter((entry) => entry.date !== overrideDate), { date: overrideDate, minutes }] }));
    setOverrideMinutes(''); setScheduleError(''); notify?.('Time for this day updated.');
  }
  function saveFixedActivity(activity) {
    onChange((current) => saveSchedule(current, { ...current.schedule, fixedActivities: [...current.schedule.fixedActivities.filter((entry) => entry.id !== activity.id), activity] }));
    setModal(null); notify?.('Activity saved. Study time is planned around it.');
  }

  return <div className="screen plan-screen">
    <header className="page-header"><p className="page-kicker">YOUR NEXT STEPS</p><h1 className="page-title">Plan</h1></header>
    <div className="tabs-scroll"><Segmented value={tab} onChange={setTab} options={[{ value: 'week', label: 'Week' }, { value: 'exams', label: 'Exams' }, { value: 'events', label: 'Events' }, { value: 'roadmap', label: 'Roadmap' }, { value: 'schedule', label: 'Schedule' }]} /></div>

    {tab === 'week' && <div className="stack">
      <div className="week-heading row"><button className="icon-button" aria-label="Previous week" onClick={() => changeWeek(-1)}><ChevronLeft size={20} /></button><h2>{formatDate(week, DATE_OPTIONS)} – {formatDate(shiftDate(week, 6), DATE_OPTIONS)}</h2><button className="icon-button" aria-label="Next week" onClick={() => changeWeek(1)}><ChevronRight size={20} /></button></div>
      <div className="week-strip" aria-label="Choose a day">{days.map((date) => { const plan = getDailyPlan(data, date, today); const tasks = Array.isArray(plan) ? plan : plan.tasks || []; return <button className={`week-day ${date === selectedDay ? 'selected' : ''} ${date === today ? 'is-today' : ''}`} key={date} aria-label={formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })} aria-pressed={date === selectedDay} onClick={() => setSelectedDay(date)}><span>{inputDate(date).toLocaleDateString('en', { weekday: 'short' })}</span><strong>{inputDate(date).getDate()}</strong><span className={`day-indicator ${tasks.some((task) => task.completed) ? 'done' : tasks.length ? 'planned' : ''}`} /></button>; })}</div>
      <section className="card"><SectionHeading title={selectedDay === today ? 'Today’s plan' : formatDate(selectedDay, { weekday: 'long', month: 'short', day: 'numeric' })} action={<Button variant="ghost" onClick={() => onSelectDay(selectedDay)}>Open day <ArrowRight size={16} /></Button>} />{isHistory ? <p className="muted">{previewTasks.filter((task) => task.completed).length}/{previewTasks.length} completed · {formatMinutes(completedMinutes)} estimated study</p> : <><p className="muted">{formatMinutes(availability.minutes ?? availability.availableMinutes ?? 0)} available · {formatMinutes(previewTasks.reduce((total, task) => total + task.minutes, 0))} planned</p>{!!availability.freeWindows?.length && <p className="field-help">Study windows: {availability.freeWindows.map((window) => `${window.start}–${window.end}`).join(' · ')}</p>}</>}
        {previewTasks.length ? <div className="stack compact">{previewTasks.map((task) => <div className="list-row" key={task.id}><span className={`preview-check ${task.completed ? 'completed' : ''}`}>{task.completed && <Check size={14} />}</span><div className="grow"><strong>{task.title}</strong><p className="muted small">{shortTaskReason(task, data)}</p></div><span className="muted nowrap">{task.minutes} min</span></div>)}</div> : isHistory ? <EmptyState title="No recorded plan" description="You didn’t record a plan on this day." action={<Button variant="secondary" onClick={() => { setWeek(startOfWeek(today)); setSelectedDay(today); }}>Back to today</Button>} /> : <EmptyState title="A little breathing room" description="No study time is available. Your next plan will pick up from here." action={<Button variant="secondary" onClick={() => setTab('schedule')}>Adjust study time</Button>} />}
      </section>
      <UpcomingEvents data={data} today={today} onOpenEvents={() => setTab('events')} />
      <details className="card goal-hierarchy product-details"><summary>The bigger picture</summary><div className="goal-ladder">
        <div className="goal-step"><span className="chip">Long term</span><GoalContent value={goals.longTerm} /></div>
        <details className="goal-period-details"><summary>Year and semester priorities</summary><div className="goal-ladder">{[{ label: 'This year', value: goals.yearly }, { label: 'This semester', value: goals.semester }].filter(({ value }) => value?.length).map(({ label, value }) => <div className="goal-step" key={label}><span className="chip">{label}</span><GoalContent value={value} onOpenRoadmap={openRoadmapGoal} /></div>)}</div></details>
        {[{ label: 'This month', value: goals.monthly }, { label: 'This week', value: goals.weekly }].map(({ label, value }) => <div className="goal-step" key={label}><span className="chip">{label}</span><GoalContent value={value} onOpenRoadmap={openRoadmapGoal} /></div>)}
        <div className="goal-step"><span className="chip">{selectedDay === today ? 'Today' : 'Selected day'}</span><p><strong>{preview.goal || previewTasks.find((task) => !task.completed)?.title || 'Protect time for your next priorities'}</strong></p><p className="muted small">{previewTasks.length} focused actions · {formatMinutes(previewTasks.reduce((total, task) => total + task.minutes, 0))}</p><button className="text-button" onClick={() => onSelectDay(selectedDay)}>Open these actions <ArrowRight size={13} /></button></div>
      </div><Button variant="ghost" onClick={() => setTab('roadmap')}>View roadmap <ArrowRight size={15} /></Button></details>
    </div>}

    {tab === 'events' && <Events data={data} today={today} onChange={onChange} notify={notify} onAddExam={() => setModal({ type: 'exam' })} onEditExam={(id) => { const exam = data.exams.find((item) => item.id === id); if (exam) setModal({ type: 'exam', exam }); }} onOpenProfile={onOpenProfile} />}

    {tab === 'exams' && <div className="stack"><SectionHeading title="Your exams" action={exams.length ? <Button onClick={() => setModal({ type: 'exam' })}><Plus size={17} /> Add exam</Button> : undefined} />
      {!exams.length && <EmptyState icon={CalendarDays} title="No exams yet" description="Add your next Klausur to get a revision plan." action={<Button onClick={() => setModal({ type: 'exam' })}><Plus size={17} /> Add exam</Button>} />}
      {exams.map((exam) => { const subject = data.subjects.find((item) => item.id === exam.subjectId); const plan = getExamPlan(data, exam.id, today); const stages = Array.isArray(plan) ? plan : plan.stages || plan.sessions || []; const readiness = percent(stages.length ? stages.filter((stage) => stage.completed).length / stages.length * 100 : 0); const isPast = exam.date < today; return <section className="card exam-card" key={exam.id}><div className="row align-start"><div className="grow"><span className="chip">{subject?.name || 'Subject'}{subject?.level === 'LK' ? ' · LK' : ''}</span><h2>{exam.title}</h2><p className="muted">{formatDate(exam.date, { weekday: 'short', month: 'long', day: 'numeric' })}{exam.target !== null && exam.target !== undefined && exam.target !== '' ? ` · Target ${exam.target} points` : ''}</p></div><button className="icon-button" aria-label={`Edit ${exam.title}`} onClick={() => setModal({ type: 'exam', exam })}><Edit3 size={17} /></button><button className="icon-button" aria-label={`Delete ${exam.title}`} onClick={() => setDeleteExamId(exam.id)}><Trash2 size={17} /></button></div>
        <div className="exam-readiness"><div className="row spread"><span className="small">Revision completed</span><strong className="small">{readiness}%</strong></div><div className="progress-track" role="progressbar" aria-label={`${exam.title} revision completed`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={readiness}><span style={{ width: `${readiness}%` }} /></div><p className="field-help">Your completed preparation steps.</p></div>
        {!!topicList(exam.topics).length && <div className="topic-tags">{topicList(exam.topics).map((topic) => <span className="chip" key={topic}>{topic}</span>)}</div>}
        <details className="revision-details"><summary>Revision plan{isPast ? ' · past exam' : ''}</summary><div className="revision-timeline">{stages.map((stage, index) => <div className={`revision-stage ${stage.completed ? 'completed' : ''}`} key={stage.id || `${stage.date}-${index}`}><span className="timeline-dot">{stage.completed && <Check size={12} />}</span><div><span className="field-help">{stage.date ? formatDate(stage.date, DATE_OPTIONS) : stage.daysBefore != null ? `${stage.daysBefore} days before` : `Step ${index + 1}`}</span><strong>{stage.title || stage.label}</strong>{(stage.description || stage.reason) && <p className="muted small">{stage.description || stage.reason}</p>}{stage.minutes && <span className="field-help">{stage.minutes} min</span>}</div></div>)}</div>{!stages.length && <p className="muted">No preparation sessions remain. Add future exams to plan ahead.</p>}</details>
      </section>; })}
    </div>}

    {tab === 'roadmap' && <div className="stack"><Segmented value={country} onChange={setCountry} options={[{ value: 'USA', label: 'USA' }, { value: 'Germany', label: 'Germany' }]} /><p className="muted">{country === 'USA' ? 'Build strong grades, meaningful experiences and a researched university list. Admissions and testing requirements vary by institution.' : 'Build your Abitur foundation and research programs, admission rules and documents for each university.'}</p>
      <p className="field-help">Daily actions move your preparation forward. Check a milestone when you have achieved it.</p>
      <div className="roadmap-timeline">{phases.map((phase) => <RoadmapPhase key={phase.id} phase={phase} onToggle={(id) => onChange((current) => toggleRoadmapItem(current, id))} onOpenToday={() => onSelectDay(today)} />)}</div>
      <details className="product-details"><summary>About dates and requirements</summary><p className="field-help">Roadmap dates are planning targets. Verify application deadlines and requirements on each university’s website. UCLA and UC Berkeley do not consider SAT/ACT for admission. Germany’s NC and Hochschulstart rules depend on the program.</p></details>
    </div>}

    {tab === 'schedule' && <div className="stack"><section className="card"><SectionHeading title="Weekly study time" /><p className="muted">Choose how much time you can study and when. Your plan leaves room for fixed activities.</p><form className="stack" onSubmit={saveWeekly}><div className="weekly-schedule">{DAY_ORDER.map((dayNumber) => { const day = activeWeekly.find((item) => item.day === dayNumber) || { day: dayNumber, minutes: 60, windowStart: '16:00', windowEnd: '21:00' }; const update = (key, value) => setWeeklyDraft((current) => (current || data.schedule.weekly).map((item) => item.day === dayNumber ? { ...item, [key]: value } : item)); return <div className="schedule-day" key={dayNumber}><strong>{DAYS[dayNumber]}</strong><div className="form-grid schedule-fields"><FormField label={`${DAYS[dayNumber]} study minutes`}><input type="number" min="0" max="720" value={day.minutes} onChange={(event) => update('minutes', event.target.value)} required /></FormField><FormField label={`${DAYS[dayNumber]} window start`}><input type="time" value={day.windowStart} onChange={(event) => update('windowStart', event.target.value)} required /></FormField><FormField label={`${DAYS[dayNumber]} window end`}><input type="time" value={day.windowEnd} onChange={(event) => update('windowEnd', event.target.value)} required /></FormField></div></div>; })}</div><Button type="submit" disabled={!weeklyDraft}>Save weekly timetable</Button></form></section>
      <section className="card"><SectionHeading title="Fixed activities" action={<Button variant="secondary" onClick={() => setModal({ type: 'activity' })}><Plus size={17} /> Add activity</Button>} /><p className="muted">School, training, work and appointments come first.</p>{data.schedule.fixedActivities.length ? <div className="stack compact">{data.schedule.fixedActivities.map((activity) => <div className="list-row" key={activity.id}><div className="grow"><strong>{activity.title}</strong><p className="muted small">{activity.date ? formatDate(activity.date, DATE_OPTIONS) : (activity.days || []).slice().sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)).map((day) => DAYS[day].slice(0, 3)).join(', ')} · {activity.start}–{activity.end}</p></div><button className="icon-button" aria-label={`Edit activity ${activity.title}`} onClick={() => setModal({ type: 'activity', activity })}><Edit3 size={17} /></button><button className="icon-button" aria-label={`Delete activity ${activity.title}`} onClick={() => { onChange((current) => saveSchedule(current, { ...current.schedule, fixedActivities: current.schedule.fixedActivities.filter((entry) => entry.id !== activity.id) })); notify?.('Activity removed.'); }}><Trash2 size={17} /></button></div>)}</div> : <p className="muted">No fixed activities added.</p>}</section>
      <section className="card"><SectionHeading title="A different kind of day" /><p className="muted">Set time for a busy day or holiday. Enter 0 for a rest day.</p><form className="stack" onSubmit={saveOverride}><div className="form-grid"><FormField label="Override date"><input type="date" value={overrideDate} onChange={(event) => setOverrideDate(event.target.value)} required /></FormField><FormField label="Available minutes"><input type="number" value={overrideMinutes} onChange={(event) => setOverrideMinutes(event.target.value)} min="0" max="720" placeholder="85" required /></FormField></div><Button type="submit" variant="secondary">Set day’s study time</Button></form>{!!data.schedule.timeOverrides.length && <div className="stack compact">{[...data.schedule.timeOverrides].sort((a, b) => a.date.localeCompare(b.date)).map((entry) => <div className="list-row" key={entry.date}><div className="grow"><strong>{formatDate(entry.date, { month: 'short', day: 'numeric', year: 'numeric' })}</strong><p className="muted small">{entry.minutes === 0 ? 'Rest day' : formatMinutes(entry.minutes)}</p></div><button className="icon-button" aria-label={`Remove time override ${entry.date}`} onClick={() => onChange((current) => saveSchedule(current, { ...current.schedule, timeOverrides: current.schedule.timeOverrides.filter((item) => item.date !== entry.date) }))}><X size={17} /></button></div>)}</div>}</section>
      {scheduleError && <p className="form-error" role="alert">{scheduleError}</p>}
    </div>}

    {modal?.type === 'exam' && <ExamForm key={modal.exam?.id || 'new'} data={data} exam={modal.exam} today={today} onClose={() => setModal(null)} onSave={(exam) => { onChange((current) => saveExam(current, exam)); setModal(null); notify?.('Exam saved. Revision tasks are now part of your plan.'); }} />}
    {modal?.type === 'activity' && <ActivityForm activity={modal.activity} today={today} onClose={() => setModal(null)} onSave={saveFixedActivity} />}
    {deleteExamId && <Modal title="Remove this exam?" onClose={() => setDeleteExamId(null)}><p className="muted">Future revision tasks for this exam will be removed. Your completed work stays in your study history.</p><div className="sheet-footer"><Button variant="secondary" onClick={() => setDeleteExamId(null)}>Keep exam</Button><Button onClick={() => { onChange((current) => removeExam(current, deleteExamId)); setDeleteExamId(null); notify?.('Exam removed.'); }}>Remove exam</Button></div></Modal>}
  </div>;
}
