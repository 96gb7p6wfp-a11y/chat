import React, { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clock3, Plus, Trash2 } from 'lucide-react';
import { Modal, Button, EmptyState, SectionHeading, formatDate, formatMinutes } from './UI.jsx';
import { getDailyPlan, getProgress, getWeeklyReview, addGrade, removeGrade, saveWeeklyReview, shiftDate, startOfWeek } from '../coach.js';
import { getStudyStats, removeStudySession } from '../study.js';

const dateObject = (date) => new Date(`${date}T12:00:00`);
const percent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const points = (value) => value === null || value === undefined || value === '' ? '—' : `${Math.round(Number(value) * 10) / 10}`;

const formatStudyTime = (value) => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = seconds % 60;
  if (hours) return `${hours}h${minutes ? ` ${minutes}m` : ''}${remainder ? ` ${remainder}s` : ''}`;
  if (minutes) return `${minutes} min${remainder ? ` ${remainder}s` : ''}`;
  return `${remainder}s`;
};

function sessionDate(session) {
  const dates = session.measuredDates;
  return dates.length > 1 ? `${formatDate(dates[0])} – ${formatDate(dates.at(-1))}` : formatDate(dates[0]);
}

function TimedStudy({ data, startDate, endDate, onChange, notify }) {
  const [showAll, setShowAll] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const stats = getStudyStats(data, startDate, endDate);
  const sessions = [...(data.study?.sessions || [])].map((session) => {
    const measured = getStudyStats({ study: { sessions: [session] } }, startDate, endDate);
    return { ...session, weekSeconds: measured.seconds, measuredDates: Object.keys(measured.byDay).sort() };
  })
    .filter((session) => session.weekSeconds > 0)
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  const visible = showAll ? sessions : sessions.slice(0, 3);
  if (!sessions.length) return null;
  return <><section className="card timed-study-card" aria-label="Timed study">
    <SectionHeading title="Study time" subtitle="Saved focus sessions" />
    <div className="row spread timed-study-summary"><strong className="metric" data-testid="timed-study-total">{formatStudyTime(stats.seconds)}</strong><span className="muted" data-testid="timed-study-session-count">{stats.sessions} {stats.sessions === 1 ? 'session' : 'sessions'}</span></div>
    <details className="product-details focus-history"><summary>Focus history</summary>{visible.length ? <div className="timed-study-history stack compact">{visible.map((session) => <div className="list-row timed-study-row" key={session.id}>
      <div className="grow"><strong>{session.taskTitle || 'Focus session'}</strong><p className="muted small">{sessionDate(session)}{session.subjectId && data.subjects.find((subject) => subject.id === session.subjectId) ? ` · ${data.subjects.find((subject) => subject.id === session.subjectId).name}` : ''}</p></div>
      <span className="timed-study-duration">{formatStudyTime(session.weekSeconds)}</span>
      <button className="icon-button" type="button" aria-label={`Delete timed session ${session.taskTitle || 'Focus session'} on ${sessionDate(session)}`} onClick={() => setPendingRemoval(session)}><Trash2 size={16} /></button>
    </div>)}</div> : <p className="muted small">Start focus from any task, then save your session.</p>}
    {sessions.length > 3 && <Button variant="ghost" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show recent sessions' : `View all timed sessions (${sessions.length})`}</Button>}
    </details>
  </section>{pendingRemoval && <Modal title="Remove this study session?" onClose={() => setPendingRemoval(null)}>
    <div className="stack"><p><strong>{pendingRemoval.taskTitle || 'Focus session'}</strong></p><p className="muted">Remove {formatStudyTime(pendingRemoval.seconds)} from your saved study history. Your task completion stays unchanged.</p><div className="sheet-footer"><Button variant="secondary" onClick={() => setPendingRemoval(null)}>Keep session</Button><Button onClick={() => { onChange((current) => removeStudySession(current, pendingRemoval.id)); setPendingRemoval(null); notify?.('Study session removed. Timed study totals updated.'); }}>Remove session</Button></div></div>
  </Modal>}</>;
}

function FormField({ label, help, children }) {
  const id = React.useId();
  return <label className="field"><span id={`${id}-label`} className="field-label">{label}</span>{React.cloneElement(children, { 'aria-labelledby': `${id}-label`, 'aria-describedby': help ? `${id}-help` : undefined })}{help && <span id={`${id}-help`} className="field-help">{help}</span>}</label>;
}

function GradeForm({ data, today, subjectId, onSave, onClose }) {
  const [form, setForm] = useState({ subjectId: subjectId || data.subjects.find((subject) => subject.enabled)?.id || data.subjects[0]?.id || '', points: '', type: 'written', date: today, note: '' });
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  if (!data.subjects.length) return <Modal title="Add a subject first" onClose={onClose}><EmptyState title="Where should this grade belong?" description="Open Profile → Subjects to add a subject before recording a grade." action={<Button onClick={onClose}>Got it</Button>} /></Modal>;
  function submit(event) {
    event.preventDefault();
    const value = Number(form.points);
    if (form.points === '' || !Number.isFinite(value) || value < 0 || value > 15) { setError('Enter a grade from 0 to 15 points. Zero is a valid grade.'); return; }
    if (!form.subjectId || !form.date) { setError('Choose a subject and date.'); return; }
    onSave({ ...form, points: value, note: form.note.trim() });
  }
  return <Modal title="Record a grade" onClose={onClose}><form className="stack" onSubmit={submit}>
    <FormField label="Grade subject"><select value={form.subjectId} onChange={set('subjectId')} required>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}{subject.level === 'LK' ? ' · LK' : ''}</option>)}</select></FormField>
    <div className="form-grid"><FormField label="Points (0–15)"><input autoFocus type="number" min="0" max="15" step="1" value={form.points} onChange={set('points')} required placeholder="10" /></FormField><FormField label="Grade type"><select value={form.type} onChange={set('type')}><option value="written">Written</option><option value="oral">Oral</option></select></FormField></div>
    <FormField label="Grade date"><input type="date" max={today} value={form.date} onChange={set('date')} required /></FormField>
    <FormField label="Note (optional)"><input value={form.note} onChange={set('note')} maxLength={300} placeholder="Analysis Klausur · ask for feedback on structure" /></FormField>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sheet-footer"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Save grade</Button></div>
  </form></Modal>;
}

function ReviewForm({ data, review, previous, onSave, onClose }) {
  const [reflection, setReflection] = useState(previous?.reflection || '');
  const [focusSubjectId, setFocusSubjectId] = useState(previous?.focusSubjectId || '');
  const [effort, setEffort] = useState(previous?.effort || 'same');
  const study = getStudyStats(data, review.weekStart, review.weekEnd);
  return <Modal title="Your weekly review" onClose={onClose}><form className="stack" onSubmit={(event) => { event.preventDefault(); onSave({ weekStart: review.weekStart, reflection: reflection.trim(), focusSubjectId, effort }); }}>
    <p className="muted">{formatDate(review.weekStart, { month: 'short', day: 'numeric' })} – {formatDate(review.weekEnd, { month: 'short', day: 'numeric' })}</p>
    <div className="review-summary"><p><strong>{review.completed} of {review.total} tasks completed</strong> · {formatMinutes(review.minutes)} estimated study</p><p><strong>{formatStudyTime(study.seconds)} focus time</strong> · {study.sessions} saved {study.sessions === 1 ? 'session' : 'sessions'}</p><p className="muted">Strong: {review.strong || 'Each completed step counts.'}</p><p className="muted">Needs attention: {review.needsAttention || 'Keep next week manageable.'}</p></div>
    <FormField label="What worked, and what would you change?" help="A brief, honest note is enough."><textarea rows="4" maxLength={1500} value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="Writing down my weak topics helped. Next week I want to start English earlier." /></FormField>
    <FormField label="Next week’s focus subject"><select value={focusSubjectId} onChange={(event) => setFocusSubjectId(event.target.value)}><option value="">Let the planner decide</option>{data.subjects.filter((subject) => subject.enabled).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></FormField>
    <FormField label="Next week’s study load" help="Your timetable and fixed activities still come first."><select value={effort} onChange={(event) => setEffort(event.target.value)}><option value="lighter">A little lighter</option><option value="same">Keep it steady</option><option value="more">A little more</option></select></FormField>
    <div className="sheet-footer"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Save & adjust next week</Button></div>
  </form></Modal>;
}

export default function Progress({ data, today, onChange, notify, onOpenPlan, onOpenProfile }) {
  const [week, setWeek] = useState(startOfWeek(today));
  const [modal, setModal] = useState(null);
  const [historySubject, setHistorySubject] = useState('all');
  const [showHistory, setShowHistory] = useState(false);
  const progress = getProgress(data, today);
  const review = getWeeklyReview(data, week);
  const currentWeek = startOfWeek(today);
  const savedReview = (data.weeklyReviews || []).find((entry) => entry.weekStart === review.weekStart);
  const isSunday = dateObject(today).getDay() === 0;
  const activeSubjects = (progress.subjects || []).filter((subject) => subject.enabled !== false);
  const upcomingExams = (progress.exams || []).filter((exam) => exam.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const history = [...(data.grades || [])].filter((grade) => historySubject === 'all' || grade.subjectId === historySubject).sort((a, b) => b.date.localeCompare(a.date));
  const weekGrades = (data.grades || []).filter((grade) => grade.date >= review.weekStart && grade.date <= review.weekEnd);
  const nextWeekPriorities = week === currentWeek ? getDailyPlan(data, shiftDate(week, 7), today).tasks.filter((task) => !task.completed).slice(0, 3) : [];

  return <div className="screen progress-screen">
    <header className="page-header"><p className="page-kicker">YOUR MOMENTUM</p><h1 className="page-title">Progress</h1></header>
    <div className="stack">
      <section className="card"><div className="week-heading row"><button className="icon-button" aria-label="Previous progress week" onClick={() => setWeek((value) => shiftDate(value, -7))}><ChevronLeft size={20} /></button><div className="grow text-center"><h2>{week === currentWeek ? 'This week' : 'Your week'}</h2><p className="muted small">{formatDate(review.weekStart, { month: 'short', day: 'numeric' })} – {formatDate(review.weekEnd, { month: 'short', day: 'numeric' })}</p></div><button className="icon-button" aria-label="Next progress week" disabled={week >= currentWeek} onClick={() => setWeek((value) => shiftDate(value, 7))}><ChevronRight size={20} /></button></div>
        <div className="stats-grid"><div className="stat"><span className="metric">{percent(review.completionRate)}<small>%</small></span><span className="muted">Completion</span><span className="field-help">{review.completed} / {review.total} tasks</span></div><div className="stat"><span className="metric">{formatMinutes(review.minutes)}</span><span className="muted">Estimated study time</span><span className="field-help">From completed tasks</span></div><div className="stat"><span className="metric">{review.consistency}<small>/7</small></span><span className="muted">Study days</span><span className="field-help">Days with activity</span></div></div>
        <div className="consistency-strip" aria-label="Daily study consistency">{review.days.map((day) => <div className="consistency-day" key={day.date} title={`${formatDate(day.date, { weekday: 'long' })}: ${day.completed} completed tasks · ${formatStudyTime(day.timedSeconds || 0)} timed study`}><span className={`consistency-dot ${day.completed > 0 || day.timedSeconds > 0 ? 'completed' : ''} ${day.date === today ? 'is-today' : ''}`}>{day.completed > 0 ? <Check size={13} /> : day.timedSeconds > 0 ? <Clock3 size={13}/> : null}</span><span className="field-help">{dateObject(day.date).toLocaleDateString('en', { weekday: 'short' })}</span></div>)}</div>
        {progress.streak > 0 && <p className="field-help">{progress.streak} study {progress.streak === 1 ? 'day' : 'days'} in a row</p>}
      </section>

      <TimedStudy key={review.weekStart} data={data} startDate={review.weekStart} endDate={review.weekEnd} onChange={onChange} notify={notify} />

      <section className={`card weekly-review-card ${isSunday && week === currentWeek && !savedReview ? 'review-due' : ''}`}><SectionHeading title={isSunday && week === currentWeek ? 'Sunday reset' : 'Weekly review'} action={<Button variant="secondary" onClick={() => setModal({ type: 'review' })}>{savedReview ? 'Edit review' : 'Review week'}</Button>} /><details className="product-details" open={isSunday && week === currentWeek}><summary>This week’s highlights</summary><div className="review-insights"><div><span className="field-help">STRONG</span><p>{review.strong || 'Every completed step counts.'}</p></div><div><span className="field-help">NEEDS ATTENTION</span><p>{review.needsAttention || 'Give your next week a realistic shape.'}</p></div><div><span className="field-help">ACADEMIC RESULTS</span><p>{weekGrades.length ? `${weekGrades.length} ${weekGrades.length === 1 ? 'grade recorded' : 'grades recorded'} · ${weekGrades.map((grade) => `${data.subjects.find((subject) => subject.id === grade.subjectId)?.name || 'Subject'} ${points(grade.points)}/15`).join(', ')}` : 'No new grades this week.'}</p></div><div><span className="field-help">UNIVERSITY PROGRESS</span><p>{review.universityProgress} {review.universityProgress === 1 ? 'step completed' : 'steps completed'}</p></div></div></details>{savedReview?.reflection && <p className="review-reflection">“{savedReview.reflection}”</p>}<p className="muted small">{review.adjustment || 'Review your week to set the next priorities.'}</p>{nextWeekPriorities.length > 0 && <div className="next-week-priorities"><span className="field-help">NEXT WEEK’S FIRST PRIORITIES</span><ol>{nextWeekPriorities.map((task) => <li key={task.id}>{task.title} <span className="muted small">· {formatMinutes(task.minutes)}</span></li>)}</ol><p className="field-help">Updated as your priorities change.</p></div>}</section>

      <section className="card"><SectionHeading title="Subject grades" subtitle="Points · 0 to 15" action={activeSubjects.length ? <Button onClick={() => setModal({ type: 'grade' })}><Plus size={17} /> Record grade</Button> : undefined} />{!activeSubjects.length && <EmptyState title="No subjects yet" description="Add your subjects and starting grades to track progress." action={onOpenProfile && <Button onClick={() => onOpenProfile('Subjects')}>Add subjects</Button>} />}<div className="stack compact">{activeSubjects.map((subject) => <div className="subject-progress" key={subject.id}><div className="row spread"><div><strong>{subject.name}</strong>{subject.level === 'LK' && <span className="chip inline-chip">LK</span>}</div><button className="button button-ghost small" aria-label={`Record grade for ${subject.name}`} onClick={() => setModal({ type: 'grade', subjectId: subject.id })}><Plus size={15} /> Grade</button></div><div className="grade-values"><span><span className="field-help">Written</span><strong>{points(subject.written)}</strong></span><span><span className="field-help">Oral</span><strong>{points(subject.oral)}</strong></span><span><span className="field-help">Current</span><strong>{points(subject.current)}</strong></span><span><span className="field-help">Target</span><strong>{points(subject.target)}</strong></span></div><div className="progress-track" role="progressbar" aria-label={`${subject.name} current points out of 15`} aria-valuemin="0" aria-valuemax="15" aria-valuenow={subject.current ?? 0}><span style={{ width: `${subject.current == null ? 0 : Math.max(0, Math.min(100, subject.current / 15 * 100))}%` }} /></div>{subject.gap !== null && subject.gap > 0 && <p className="field-help">{typeof subject.written === 'number' && (subject.oral == null || subject.written <= subject.oral) ? 'Written: ' : typeof subject.oral === 'number' ? 'Oral: ' : ''}{points(subject.gap)} {subject.gap === 1 ? 'point' : 'points'} to target</p>}</div>)}</div>{activeSubjects.length > 0 && <details className="product-details"><summary>How grades are shown</summary><p className="field-help">Written and oral points reflect your recorded results or starting grades. Current points are an average for planning, not an official course or Abitur grade.</p></details>}<Button variant="ghost" onClick={() => setShowHistory((value) => !value)}>{showHistory ? 'Hide grade history' : `View grade history (${data.grades?.length || 0})`}</Button>
        {showHistory && <div className="grade-history stack"><FormField label="Filter grade history"><select value={historySubject} onChange={(event) => setHistorySubject(event.target.value)}><option value="all">All subjects</option>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></FormField>{history.length ? history.map((grade) => <div className="list-row" key={grade.id}><div className="grade-pill">{points(grade.points)}</div><div className="grow"><strong>{data.subjects.find((subject) => subject.id === grade.subjectId)?.name || 'Subject'}</strong><p className="muted small">{grade.type === 'oral' ? 'Oral' : 'Written'} · {formatDate(grade.date, { month: 'short', day: 'numeric', year: 'numeric' })}</p>{grade.note && <p className="muted small">{grade.note}</p>}</div><button className="icon-button" aria-label={`Delete grade ${grade.points} in ${data.subjects.find((subject) => subject.id === grade.subjectId)?.name || 'subject'} on ${grade.date}`} onClick={() => { onChange((current) => removeGrade(current, grade.id)); notify?.('Grade removed. Subject estimates updated.'); }}><Trash2 size={17} /></button></div>) : <EmptyState title="No grade records yet" description="Record your next result to track your improvement." action={<Button onClick={() => setModal({ type: 'grade' })}>Record grade</Button>} />}</div>}
      </section>

      <section className="card"><SectionHeading title="Exam preparation" />{upcomingExams.length ? <div className="stack">{upcomingExams.map((exam) => <div className="exam-progress" key={exam.id}><div className="row spread"><div className="grow"><strong>{exam.title}</strong><p className="muted small">{formatDate(exam.date, { month: 'short', day: 'numeric' })} · {exam.completed}/{exam.total} revision steps</p></div><strong>{percent(exam.readiness)}%</strong></div><div className="progress-track" role="progressbar" aria-label={`${exam.title} revision progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent(exam.readiness)}><span style={{ width: `${percent(exam.readiness)}%` }} /></div></div>)}</div> : <EmptyState title="Your next exam will appear here" description="Add your next exam to track its revision plan." action={onOpenPlan && <Button onClick={() => onOpenPlan('exams')}>Add exam</Button>} />}</section>

      <section className="card"><SectionHeading title="Your university pathway" /><div className="stack">{['USA', 'Germany'].filter((country) => data.profile.pathways.includes(country)).map((country) => { const pathway = progress.roadmap?.[country] || { completed: 0, total: 0, actionsCompleted: 0, actionsTotal: 0, actionProgress: 0 }; const actionPercent = percent(pathway.actionProgress); return <div className="roadmap-progress" key={country}><div className="row spread"><strong>{country}</strong><span className="muted small">{pathway.actionsCompleted}/{pathway.actionsTotal} actions</span></div><div className="progress-track" role="progressbar" aria-label={`${country} pathway action progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={actionPercent}><span style={{ width: `${actionPercent}%` }} /></div><p className="field-help">{actionPercent}% of linked preparation · {pathway.completed}/{pathway.total} milestones confirmed</p></div>; })}</div><Button variant="ghost" onClick={() => onOpenPlan?.('roadmap')}>View roadmap</Button></section>
    </div>
    {modal?.type === 'grade' && <GradeForm data={data} today={today} subjectId={modal.subjectId} onClose={() => setModal(null)} onSave={(grade) => { onChange((current) => addGrade(current, grade)); setModal(null); notify?.('Grade saved. Your study priorities have been updated.'); }} />}
    {modal?.type === 'review' && <ReviewForm data={data} review={review} previous={savedReview} onClose={() => setModal(null)} onSave={(entry) => { onChange((current) => saveWeeklyReview(current, entry)); setModal(null); notify?.('Weekly review saved. Next week’s plan is adjusted.'); }} />}
  </div>;
}
