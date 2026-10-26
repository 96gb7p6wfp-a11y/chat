import React, { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clock3, Trash2 } from 'lucide-react';
import { Modal, Button, EmptyState, SectionHeading, formatMinutes } from './UI.jsx';
import { getDailyPlan, getProgress, getWeeklyReview, saveWeeklyReview, shiftDate, startOfWeek } from '../coach.js';
import { getStudyStats, removeStudySession } from '../study.js';
import AcademicGrades from './AcademicGrades.jsx';
import { getIELTSSummary } from '../ielts.js';
import { getSATSummary } from '../sat.js';
import { subjectLabel } from '../i18n.js';

const formatDate = (date, options = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat('de-DE', options).format(new Date(`${date}T12:00:00`));
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
  return <><section className="card timed-study-card" aria-label="Gemessene Lernzeit">
    <SectionHeading title="Fokuszeit" subtitle="Gespeicherte Lerneinheiten" />
    <div className="row spread timed-study-summary"><strong className="metric" data-testid="timed-study-total">{formatStudyTime(stats.seconds)}</strong><span className="muted" data-testid="timed-study-session-count">{stats.sessions} {stats.sessions === 1 ? 'Einheit' : 'Einheiten'}</span></div>
    <details className="product-details focus-history"><summary>Fokusverlauf</summary>{visible.length ? <div className="timed-study-history stack compact">{visible.map((session) => <div className="list-row timed-study-row" key={session.id}>
      <div className="grow"><strong>{session.taskTitle || 'Lerneinheit'}</strong><p className="muted small">{sessionDate(session)}{session.subjectId && data.subjects.find((subject) => subject.id === session.subjectId) ? ` · ${data.subjects.find((subject) => subject.id === session.subjectId).name}` : ''}</p></div>
      <span className="timed-study-duration">{formatStudyTime(session.weekSeconds)}</span>
      <button className="icon-button" type="button" aria-label={`Lerneinheit löschen ${session.taskTitle || 'Lerneinheit'} am ${sessionDate(session)}`} onClick={() => setPendingRemoval(session)}><Trash2 size={16} /></button>
    </div>)}</div> : <p className="muted small">Starte den Fokusmodus einer Aufgabe und speichere deine Lerneinheit.</p>}
    {sessions.length > 3 && <Button variant="ghost" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Letzte Einheiten zeigen' : `Alle Lerneinheiten (${sessions.length})`}</Button>}
    </details>
  </section>{pendingRemoval && <Modal title="Lerneinheit löschen?" onClose={() => setPendingRemoval(null)}>
    <div className="stack"><p><strong>{pendingRemoval.taskTitle || 'Lerneinheit'}</strong></p><p className="muted">{formatStudyTime(pendingRemoval.seconds)} aus dem Fokusverlauf entfernen? Deine erledigte Aufgabe bleibt erhalten.</p><div className="sheet-footer"><Button variant="secondary" onClick={() => setPendingRemoval(null)}>Behalten</Button><Button onClick={() => { onChange((current) => removeStudySession(current, pendingRemoval.id)); setPendingRemoval(null); notify?.('Lerneinheit gelöscht. Deine Fokuszeit wurde aktualisiert.'); }}>Einheit löschen</Button></div></div>
  </Modal>}</>;
}

function FormField({ label, help, children }) {
  const id = React.useId();
  return <label className="field"><span id={`${id}-label`} className="field-label">{label}</span>{React.cloneElement(children, { 'aria-labelledby': `${id}-label`, 'aria-describedby': help ? `${id}-help` : undefined })}{help && <span id={`${id}-help`} className="field-help">{help}</span>}</label>;
}

function ReviewForm({ data, review, previous, onSave, onClose }) {
  const [reflection, setReflection] = useState(previous?.reflection || '');
  const [focusSubjectId, setFocusSubjectId] = useState(previous?.focusSubjectId || '');
  const [effort, setEffort] = useState(previous?.effort || 'same');
  const study = getStudyStats(data, review.weekStart, review.weekEnd);
  return <Modal title="Dein Wochenrückblick" onClose={onClose}><form className="stack" onSubmit={(event) => { event.preventDefault(); onSave({ weekStart: review.weekStart, reflection: reflection.trim(), focusSubjectId, effort }); }}>
    <p className="muted">{formatDate(review.weekStart, { month: 'short', day: 'numeric' })} – {formatDate(review.weekEnd, { month: 'short', day: 'numeric' })}</p>
    <div className="review-summary"><p><strong>{review.completed} von {review.total} Aufgaben erledigt</strong> · {formatMinutes(review.minutes)} geplante Lernzeit</p><p><strong>{formatStudyTime(study.seconds)} Fokuszeit</strong> · {study.sessions} gespeicherte {study.sessions === 1 ? 'Einheit' : 'Einheiten'}</p><p className="muted">Gut gelaufen: {review.strong || 'Jeder erledigte Schritt zählt.'}</p><p className="muted">Im Blick behalten: {review.needsAttention || 'Plane die nächste Woche realistisch.'}</p></div>
    <FormField label="Was hat funktioniert? Was möchtest du ändern?" help="Eine kurze, ehrliche Notiz reicht."><textarea rows="4" maxLength={1500} value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="Was hat dir beim Lernen geholfen? Was möchtest du nächste Woche früher beginnen?" /></FormField>
    <FormField label="Schwerpunkt für die nächste Woche"><select value={focusSubjectId} onChange={(event) => setFocusSubjectId(event.target.value)}><option value="">Lernplan entscheiden lassen</option>{data.subjects.filter((subject) => subject.enabled).map((subject) => <option key={subject.id} value={subject.id}>{subjectLabel(subject)}</option>)}</select></FormField>
    <FormField label="Lernumfang nächste Woche" help="Stundenplan und feste Termine bleiben berücksichtigt."><select value={effort} onChange={(event) => setEffort(event.target.value)}><option value="lighter">Etwas weniger</option><option value="same">So beibehalten</option><option value="more">Etwas mehr</option></select></FormField>
    <div className="sheet-footer"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit">Speichern und nächste Woche anpassen</Button></div>
  </form></Modal>;
}

export default function Progress({ data, today, onChange, notify, onOpenPlan, onOpenProfile, initialSubjectId = '' }) {
  const [week, setWeek] = useState(startOfWeek(today));
  const [modal, setModal] = useState(null);
  const progress = getProgress(data, today);
  const ielts = getIELTSSummary(data, today);
  const sat = getSATSummary(data, today);
  const review = getWeeklyReview(data, week);
  const currentWeek = startOfWeek(today);
  const savedReview = (data.weeklyReviews || []).find((entry) => entry.weekStart === review.weekStart);
  const isSunday = dateObject(today).getDay() === 0;
  const upcomingExams = (progress.exams || []).filter((exam) => exam.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const weekGrades = (data.grades || []).filter((grade) => grade.date >= review.weekStart && grade.date <= review.weekEnd);
  const nextWeekPriorities = week === currentWeek ? getDailyPlan(data, shiftDate(week, 7), today).tasks.filter((task) => !task.completed).slice(0, 3) : [];

  return <div className="screen progress-screen">
    <header className="page-header"><p className="page-kicker">DEINE ENTWICKLUNG</p><h1 className="page-title">Fortschritt</h1></header>
    <div className="stack">
      <AcademicGrades initialSubjectId={initialSubjectId} data={data} today={today} onChange={onChange} notify={notify} onOpenProfile={onOpenProfile} />
      <section className="card"><div className="week-heading row"><button className="icon-button" aria-label="Vorherige Fortschrittswoche" onClick={() => setWeek((value) => shiftDate(value, -7))}><ChevronLeft size={20} /></button><div className="grow text-center"><h2>{week === currentWeek ? 'Diese Woche' : 'Deine Woche'}</h2><p className="muted small">{formatDate(review.weekStart, { month: 'short', day: 'numeric' })} – {formatDate(review.weekEnd, { month: 'short', day: 'numeric' })}</p></div><button className="icon-button" aria-label="Nächste Fortschrittswoche" disabled={week >= currentWeek} onClick={() => setWeek((value) => shiftDate(value, 7))}><ChevronRight size={20} /></button></div>
        <div className="stats-grid"><div className="stat"><span className="metric">{percent(review.completionRate)}<small>%</small></span><span className="muted">Erledigt</span><span className="field-help">{review.completed} / {review.total} Aufgaben</span></div><div className="stat"><span className="metric">{formatMinutes(review.minutes)}</span><span className="muted">Geplante Lernzeit</span><span className="field-help">Aus erledigten Aufgaben</span></div><div className="stat"><span className="metric">{review.consistency}<small>/7</small></span><span className="muted">Lerntage</span><span className="field-help">Tage mit Lernaktivität</span></div></div>
        <div className="consistency-strip" aria-label="Lernaktivität pro Tag">{review.days.map((day) => <div className="consistency-day" key={day.date} title={`${formatDate(day.date, { weekday: 'long' })}: ${day.completed} erledigte Aufgaben · ${formatStudyTime(day.timedSeconds || 0)} gemessene Lernzeit`}><span className={`consistency-dot ${day.completed > 0 || day.timedSeconds > 0 ? 'completed' : ''} ${day.date === today ? 'is-today' : ''}`}>{day.completed > 0 ? <Check size={13} /> : day.timedSeconds > 0 ? <Clock3 size={13}/> : null}</span><span className="field-help">{dateObject(day.date).toLocaleDateString('de-DE', { weekday: 'short' })}</span></div>)}</div>
        {progress.streak > 0 && <p className="field-help">{progress.streak} {progress.streak === 1 ? 'Lerntag' : 'Lerntage'} in Folge</p>}
      </section>

      <TimedStudy key={review.weekStart} data={data} startDate={review.weekStart} endDate={review.weekEnd} onChange={onChange} notify={notify} />

      <section className={`card weekly-review-card ${isSunday && week === currentWeek && !savedReview ? 'review-due' : ''}`}><SectionHeading title={isSunday && week === currentWeek ? 'Sonntagsrückblick' : 'Wochenrückblick'} action={<Button variant="secondary" onClick={() => setModal({ type: 'review' })}>{savedReview ? 'Rückblick bearbeiten' : 'Woche reflektieren'}</Button>} /><details className="product-details" open={isSunday && week === currentWeek}><summary>Deine Woche im Überblick</summary><div className="review-insights"><div><span className="field-help">GUT GELAUFEN</span><p>{review.strong || 'Jeder erledigte Schritt zählt.'}</p></div><div><span className="field-help">IM BLICK BEHALTEN</span><p>{review.needsAttention || 'Gib der nächsten Woche einen realistischen Schwerpunkt.'}</p></div><div><span className="field-help">SCHULISCHE ERGEBNISSE</span><p>{weekGrades.length ? `${weekGrades.length} ${weekGrades.length === 1 ? 'Note erfasst' : 'Noten erfasst'} · ${weekGrades.map((grade) => `${data.subjects.find((subject) => subject.id === grade.subjectId)?.name || 'Fach'} ${points(grade.points)}/15`).join(', ')}` : 'Diese Woche keine neuen Noten.'}</p></div><div><span className="field-help">UNIVERSITÄTSVORBEREITUNG</span><p>{review.universityProgress} {review.universityProgress === 1 ? 'Schritt erledigt' : 'Schritte erledigt'}</p></div></div></details>{savedReview?.reflection && <p className="review-reflection">“{savedReview.reflection}”</p>}<p className="muted small">{review.adjustment || 'Reflektiere deine Woche für die nächsten Prioritäten.'}</p>{nextWeekPriorities.length > 0 && <div className="next-week-priorities"><span className="field-help">NÄCHSTE WOCHE ZUERST</span><ol>{nextWeekPriorities.map((task) => <li key={task.id}>{task.title} <span className="muted small">· {formatMinutes(task.minutes)}</span></li>)}</ol><p className="field-help">Passt sich an deine aktuellen Prioritäten an.</p></div>}</section>


      {ielts.configured && <section className="card"><SectionHeading title="IELTS Academic" action={<Button variant="secondary" onClick={() => onOpenProfile?.('IELTS')}>Ergebnisse</Button>} /><div className="academic-overview"><div><span className="field-help">Letztes vollständiges Ergebnis</span><strong>{points(ielts.overall)}</strong></div><div><span className="field-help">Mein Bandziel</span><strong>{points(ielts.data.targetOverall)}</strong></div></div><p className="muted small">{ielts.readiness}</p>{ielts.weakest && <p className="field-help">Im Fokus: {ielts.weakest.label}{ielts.weakest.gap > 0 ? ` · ${points(ielts.weakest.gap)} Bandpunkte bis zum Ziel` : ''}. Erledigte Aufgaben belegen keinen Bandwert.</p>}</section>}
      {sat.configured && <section className="card"><SectionHeading title="SAT" action={<Button variant="secondary" onClick={() => onOpenProfile?.('SAT')}>Ergebnisse</Button>} /><div className="academic-overview"><div><span className="field-help">Letztes vollständiges Ergebnis</span><strong>{points(sat.overall)}</strong></div><div><span className="field-help">Mein Ziel</span><strong>{points(sat.data.targetTotal)}</strong></div></div><p className="muted small">{sat.readiness}</p>{sat.weakest && <p className="field-help">Im Fokus: {sat.weakest.label}. Erledigte Aufgaben sind kein Testergebnis.</p>}</section>}

      <section className="card"><SectionHeading title="Prüfungsvorbereitung" />{upcomingExams.length ? <div className="stack">{upcomingExams.map((exam) => <div className="exam-progress" key={exam.id}><div className="row spread"><div className="grow"><strong>{exam.title}</strong><p className="muted small">{formatDate(exam.date, { month: 'short', day: 'numeric' })} · {exam.completed}/{exam.total} Vorbereitungsschritte</p></div><strong>{percent(exam.readiness)}%</strong></div><div className="progress-track" role="progressbar" aria-label={`${exam.title} Fortschritt der Vorbereitung`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent(exam.readiness)}><span style={{ width: `${percent(exam.readiness)}%` }} /></div></div>)}</div> : <EmptyState title="Deine nächste Prüfung erscheint hier" description="Trage eine Prüfung ein, um ihre Vorbereitung zu sehen." action={onOpenPlan && <Button onClick={() => onOpenPlan('exams')}>Prüfung hinzufügen</Button>} />}</section>

      <section className="card"><SectionHeading title="Dein Weg zur Universität" /><div className="stack">{['USA', 'Germany'].filter((country) => data.profile.pathways.includes(country)).map((country) => { const pathway = progress.roadmap?.[country] || { completed: 0, total: 0, actionsCompleted: 0, actionsTotal: 0, actionProgress: 0 }; const actionPercent = percent(pathway.actionProgress); return <div className="roadmap-progress" key={country}><div className="row spread"><strong>{country === 'Germany' ? 'Deutschland' : country}</strong><span className="muted small">{pathway.actionsCompleted}/{pathway.actionsTotal} Schritte</span></div><div className="progress-track" role="progressbar" aria-label={`${country} Fortschritt der Vorbereitung`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={actionPercent}><span style={{ width: `${actionPercent}%` }} /></div><p className="field-help">{actionPercent}% der verknüpften Vorbereitung · {pathway.completed}/{pathway.total} Meilensteine bestätigt</p></div>; })}</div><Button variant="ghost" onClick={() => onOpenPlan?.('roadmap')}>Fahrplan ansehen</Button></section>
    </div>
    {modal?.type === 'review' && <ReviewForm data={data} review={review} previous={savedReview} onClose={() => setModal(null)} onSave={(entry) => { onChange((current) => saveWeeklyReview(current, entry)); setModal(null); notify?.('Wochenrückblick gespeichert. Der nächste Wochenplan wurde angepasst.'); }} />}
  </div>;
}
