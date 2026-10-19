import React from 'react';
import { ArrowRight, CalendarDays, Check, ChevronRight, Clock3, Plus, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { getAcademicOverview } from '../grades.js';
import { getSubjectPriorities, getRecommendations } from '../recommendations.js';
import { getUpcomingEvents } from '../events.js';
import { getGuidedSession } from '../guided-learning.js';
import { subjectLabel, categoryLabel, pointLabel } from '../i18n.js';
import { Button, EmptyState, formatDate, formatMinutes } from './UI.jsx';
import './today.css';

function taskPresentation(data, task, date) {
  const subject = data.subjects.find(item => item.id === task.subjectId);
  if (task.origin === 'custom') return { title: task.title, result: task.expectedResult || 'Ein konkreter Fortschritt bei deiner gewählten Aufgabe.', subject: subjectLabel(subject) };
  const session = getGuidedSession(data, task, date);
  return { title: session.objective || task.objective || task.title, result: session.expectedResult || task.expectedResult || 'Ein überprüftes Ergebnis und ein klarer nächster Schritt.', subject: subject ? subjectLabel(subject) : task.ieltsSkill ? `IELTS · ${task.ieltsSkill[0].toUpperCase()}${task.ieltsSkill.slice(1)}` : categoryLabel(task.category) };
}

export default function Today({ data, today, date, plan, onOpenTask, onComplete, onTime, onAdd, onPlan, onProgress, onProfile, onPurpose, onChooseDay }) {
  const history = plan.isHistory || date < today;
  const preview = date > today;
  const tasks = plan.tasks || [];
  const complete = tasks.filter(task => task.completed).length;
  const first = tasks.find(task => !task.completed);
  const firstView = first ? taskPresentation(data, first, date) : null;
  const academics = getAcademicOverview(data);
  const priorities = getSubjectPriorities(data, date);
  const priority = priorities[0];
  const recommendations = getRecommendations(data, date);
  const upcoming = getUpcomingEvents(data, date).filter(event => event.date >= date && event.status !== 'completed').slice(0, 3);
  const skipped = data.tasks.filter(task => task.date === date && task.skipped);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const shortDay = !history && plan.availableMinutes > 0 && plan.availableMinutes <= 45;
  const mission = firstView?.title || (complete && complete === tasks.length ? 'Deine wichtigen Schritte sind heute geschafft.' : 'Plane bewusst Zeit für Lernen und Erholung ein.');
  const motivation = shortDay ? 'Wenig Zeit. Ein klarer nächster Schritt.' : first?.examId ? 'Heute Klarheit schaffen. In der Prüfung darauf aufbauen.' : priority?.subjectId === 'german' ? 'Ein klarer Gedanke. Ein besserer Absatz.' : priority?.gap > 0 ? 'Die größte Lücke ist dein nächster Ansatzpunkt.' : 'Wissen aufbauen. Möglichkeiten offenhalten.';
  const nextExam = upcoming[0];

  return <section className="coach-today stack" aria-label="Dein Tagesplan">
    <header className="coach-today-header"><div><p className="muted">{history ? 'Dein Rückblick' : preview ? 'Deine Vorschau' : `${greeting}${data.profile.name ? `, ${data.profile.name}` : ''}`}</p><h1>{date === today ? 'Heute' : formatDate(date, { weekday: 'long' })}</h1><p className="coach-date">{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div><button className="icon-button calendar-button" aria-label="Wochenplan öffnen" onClick={() => onPlan('week')}><CalendarDays size={22}/></button></header>
    {date !== today && <button className="text-button" onClick={() => onChooseDay(today)}>Zurück zu heute <ArrowRight size={15}/></button>}

    <section className="daily-mission" aria-label="Deine heutige Mission">
      <span className="eyebrow">{history ? 'DEIN GESPEICHERTER TAG' : `${first?.subjectId ? subjectLabel(data.subjects.find(subject => subject.id === first.subjectId)).toUpperCase() : first?.ieltsSkill ? 'IELTS' : 'HEUTE'} · DEIN NÄCHSTER SCHRITT`}</span>
      <h2>{history ? 'Was du dir vorgenommen hast.' : motivation}</h2>
      <p>{mission}</p>
      <div className="mission-actions">{first && <Button onClick={() => onOpenTask(first)}>{preview ? 'Lernschritte ansehen' : 'Jetzt anfangen'} <ArrowRight size={17}/></Button>}
      {!history && <button className="mission-time" onClick={onTime} aria-label="Lernzeit anpassen"><Clock3 size={16}/><span><strong>{formatMinutes(plan.availableMinutes)}</strong><small>Lernzeit anpassen</small></span></button>}</div>
    </section>

    {!history && <section className="academic-snapshot" aria-label="Dein Lernstand">
      <div className="row spread"><h2>Mein Lernstand</h2><button className="text-button" onClick={onProgress}>Noten <ChevronRight size={14}/></button></div>
      <div className="snapshot-values"><div><span>Mein Schnitt</span><strong>{pointLabel(academics.average)}</strong></div><div><span>Mein Ziel</span><strong>{pointLabel(academics.target)}</strong></div><div><span>Abstand</span><strong>{academics.gap === null ? 'Offen' : academics.gap <= 0 ? 'Erreicht' : `${pointLabel(academics.gap)} P.`}</strong></div></div>
      <p className="snapshot-caption">{academics.average === null ? 'Trage eine aktuelle Note ein, um deinen Lernstand zu sehen.' : `${academics.includesBaselines ? 'Undatierte Orientierung' : 'Geschätzter Kursschnitt'} · ${academics.subjectCount}/${academics.totalSubjects} Fächer · 0–15 Punkte`}</p>
      {nextExam && <button className="snapshot-next" onClick={() => onPlan('events')}><CalendarDays size={14}/><span>{nextExam.title}</span><strong>{formatDate(nextExam.date)}</strong></button>}
      <details className="quiet-details"><summary>{academics.trend.direction === 'up' ? <><TrendingUp size={14}/>Neuere Ergebnisse steigen</> : academics.trend.direction === 'down' ? <><TrendingDown size={14}/>Neuere Ergebnisse fallen</> : 'Trend und Berechnung'}</summary><p>{academics.trend.direction === 'unknown' ? 'Für einen belastbaren Trend fehlen noch vergleichbare Ergebnisse. ' : 'Vergleich deiner älteren und neueren erfassten Leistungen. '}{academics.disclaimer} {academics.weighted ? 'Deine eingetragenen Kursgewichte werden verwendet.' : 'Bekannte Fächer zählen gleich; Leistungskurse werden nicht stillschweigend doppelt gezählt.'}</p></details>
      {academics.average === null && <button className="text-button" onClick={onProgress}>Erste Note eintragen <Plus size={14}/></button>}
    </section>}

    {!history && priority && <section className="improvement-opportunity" aria-label="Deine größte Lernchance"><div className="row spread"><span className="eyebrow">HEUTE WICHTIG</span><button className="text-button" onClick={() => onProfile('Subjects')}>Schwerpunkt ändern</button></div><h2>{subjectLabel(data.subjects.find(subject => subject.id === priority.subjectId))}<span>{priority.level === 'LK' ? 'LK' : ''}</span></h2><p>{priority.reason}</p><div className="opportunity-meta"><span>Stand {pointLabel(priority.current)}</span><span>Ziel {pointLabel(priority.target)}</span>{priority.exam?.date && <span>Prüfung {formatDate(priority.exam.date)}</span>}</div><details className="quiet-details"><summary>Meine Empfehlung</summary>{recommendations.slice(0, 1).map(item => <div key={item.id}><strong>{item.title}</strong><p>{item.how}</p><p>{item.minutes} Min. · {item.benefit}</p></div>)}</details></section>}

    <section className="coach-priorities" aria-label="Deine wichtigsten Aufgaben"><div className="row spread"><h2>{history ? 'Deine gespeicherten Aufgaben' : 'Dein Lernplan'}</h2><span className="muted small">{complete}/{tasks.length} geschafft</span></div><div className="daily-tasks" data-testid="daily-tasks">
      {tasks.map((task, index) => { const view = taskPresentation(data, task, date); return <article key={task.id} className={`coach-task task-card ${task.completed ? 'is-complete' : ''}`} data-roadmap-id={task.roadmapItemId || undefined} data-event-id={task.eventId || undefined}>
        <div className="coach-task-top"><span>{view.subject}</span><span>{task.minutes} Min.</span></div><button className="coach-task-open task-content" aria-label={`Lernaufgabe öffnen: ${task.title}`} onClick={() => onOpenTask(task)}><h3>{view.title}</h3><p><span>Dein Ergebnis</span>{view.result}</p></button><div className="coach-task-bottom"><span className={`task-priority ${task.priority === 'high' ? 'priority-high' : ''}`}>{task.completed ? 'Geschafft' : task.examId ? 'Prüfungsvorbereitung' : index === 0 ? 'Zuerst' : 'Nächster Schritt'}</span><button className="task-complete" aria-label={`${task.completed ? 'Abschluss rückgängig' : 'Aufgabe abschließen'}: ${task.title}`} aria-pressed={task.completed} disabled={preview} onClick={() => onComplete(task)}><Check size={19}/></button></div>
      </article>; })}
    </div>
    {!tasks.length && <EmptyState title={history ? 'Kein gespeicherter Plan' : plan.availableMinutes === 0 ? 'Zeit für Erholung' : 'Heute ist noch Platz'} description={history ? 'Wähle einen anderen Tag für deinen Rückblick.' : 'Passe deine Lernzeit an oder wähle bewusst eine kleine Aufgabe.'} action={<Button variant="secondary" onClick={history ? () => onChooseDay(today) : onTime}>{history ? 'Zu heute' : 'Lernzeit anpassen'}</Button>}/>}
    {!history && <details className="quiet-details day-context"><summary>So passt dein Plan in den Tag</summary><div className="row spread"><span>Eingeplant {formatMinutes(plan.plannedMinutes)}</span><span>Frei {formatMinutes(plan.remainingMinutes)}</span></div><p>{plan.adjustment}</p><button className="text-button" onClick={onPurpose}>Vom Ziel zu heute <Target size={14}/></button></details>}
    {!history && tasks.length > 0 && <button className="text-button add-priority" onClick={onAdd}><Plus size={15}/>Eigene Priorität ergänzen</button>}
    {skipped.length > 0 && <details className="quiet-details"><summary>Für später gespeichert ({skipped.length})</summary><p>Notizen bleiben erhalten. Verschiebe eine Aufgabe im Lernplan oder passe deine Lernzeit an.</p>{skipped.map(task => <button className="saved-task-row" key={task.id} onClick={() => onOpenTask(task)}>{task.title}<ChevronRight size={15}/></button>)}</details>}
    </section>

    {!history && <section className="next-events" aria-label="Nächste Termine"><div className="row spread"><h2>Als Nächstes</h2><button className="text-button" onClick={() => onPlan('events')}>Alle Termine <ChevronRight size={14}/></button></div>{upcoming.length ? upcoming.map(event => <button key={event.id} className="next-event" onClick={() => onPlan(event.source === 'exam' ? 'exams' : 'events')}><span className="event-date"><strong>{formatDate(event.date, { day: 'numeric' })}</strong><span>{formatDate(event.date, { month: 'short' })}</span></span><span><strong>{event.title}</strong><small>{event.time || 'Uhrzeit offen'}</small></span><ChevronRight size={15}/></button>) : <div className="event-empty"><p>Noch kein Termin eingetragen.</p><button className="text-button" onClick={() => onPlan('exams')}>Prüfung hinzufügen <Plus size={14}/></button></div>}</section>}
    {!history && new Date(`${today}T12:00:00`).getDay() === 0 && <button className="review-link" onClick={onProgress}>Dein Wochenrückblick <ArrowRight size={16}/></button>}
  </section>;
}
