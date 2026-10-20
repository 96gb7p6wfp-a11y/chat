import React from 'react';
import { ArrowRight, BookOpen, BriefcaseBusiness, CalendarDays, Check, ChevronRight, ClipboardCheck, Clock3, Code2, GraduationCap, Languages, Plus, Target, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { getAcademicOverview } from '../grades.js';
import { getSubjectPriorities, getRecommendations } from '../recommendations.js';
import { getUpcomingEvents } from '../events.js';
import { getGuidedSession } from '../guided-learning.js';
import { subjectLabel, categoryLabel, pointLabel } from '../i18n.js';
import { Button, EmptyState, formatDate, formatMinutes } from './UI.jsx';
import './today.css';

const dayDistance = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
const countdown = days => days === 0 ? 'Heute' : days === 1 ? 'Morgen' : `In ${days} Tagen`;

function taskPresentation(data, task, date) {
  const subject = data.subjects.find(item => item.id === task.subjectId);
  const testName = task.ieltsSkill || /ielts/i.test(task.title) ? 'IELTS' : task.satSkill || /\bsat\b/i.test(task.title) ? 'SAT' : '';
  if (task.origin === 'custom') return { title: task.title, result: task.expectedResult || 'Ein konkreter Fortschritt bei deiner gewählten Aufgabe.', subject: subject ? subjectLabel(subject) : categoryLabel(task.category) };
  const session = getGuidedSession(data, task, date);
  return { title: session.objective || task.objective || task.title, result: session.expectedResult || task.expectedResult || 'Ein überprüftes Ergebnis und ein klarer nächster Schritt.', subject: testName || (subject ? subjectLabel(subject) : categoryLabel(task.category)) };
}

function taskCategory(task) {
  if (task.ieltsSkill || task.satSkill || /\b(?:ielts|sat)\b/i.test(task.title)) return { key: 'test', Icon: Languages };
  if (task.examId) return { key: 'exam', Icon: CalendarDays };
  if (/volleyball|training|sportverein/i.test(`${task.title} ${task.reason}`)) return { key: 'personal', Icon: Trophy };
  if (/coding|github|programmier|software/i.test(`${task.title} ${task.reason}`)) return { key: 'project', Icon: Code2 };
  if (/restaurant|business|arbeit|work|marketing/i.test(`${task.title} ${task.reason}`)) return { key: 'work', Icon: BriefcaseBusiness };
  if (task.category === 'university' || task.category === 'activity') return { key: 'university', Icon: GraduationCap };
  if (task.category === 'review') return { key: 'review', Icon: ClipboardCheck };
  return { key: 'school', Icon: BookOpen };
}

function taskReason(data, task, date, priorities) {
  const exam = data.exams.find(item => item.id === task.examId);
  if (exam) return `${countdown(dayDistance(date, exam.date))} ist ${exam.title}.`;
  if (task.ieltsSkill) return 'Ein gezielter Schritt für dein IELTS-Ziel.';
  if (task.satSkill) return 'Gezielte Vorbereitung auf dein SAT-Ziel.';
  const subjectPriority = priorities.find(item => item.subjectId === task.subjectId);
  if (task.reviewDate) return 'Die Wiederholung deines früheren Fehlers ist fällig.';
  if (subjectPriority) return subjectPriority.reason;
  if (task.linkedGoal) return `Für dein Ziel: ${task.linkedGoal}.`;
  if (task.reason) return task.reason;
  return task.category === 'university' || task.category === 'activity' ? 'Deinen nächsten Bewerbungsschritt vorbereiten.' : 'Eine konkrete Lücke schließen und das Ergebnis prüfen.';
}

function longTermPriority(priorities, data) {
  const preferences = data.profile.prioritySubjects || [];
  const value = item => item.gap * 8 + (preferences.includes(item.subjectId) ? 23 : 0) + (item.level === 'LK' ? 8 : 0) + (item.override === 'high' ? 45 : item.override === 'low' ? -30 : 0) + (item.trend !== null && item.trend < -1 ? Math.min(16, -item.trend * 4) : 0);
  return [...priorities].sort((a, b) => value(b) - value(a))[0];
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
  const longTerm = longTermPriority(priorities, data);
  const recommendations = getRecommendations(data, date);
  const upcoming = getUpcomingEvents(data, date).filter(event => event.date >= date && event.status !== 'completed');
  const nextExam = upcoming.find(event => event.source === 'exam');
  const nextEvent = nextExam || upcoming[0];
  const earlierEvent = nextExam && upcoming[0]?.date < nextExam.date ? upcoming[0] : null;
  const skipped = data.tasks.filter(task => task.date === date && task.skipped);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const shortDay = !history && plan.availableMinutes > 0 && plan.availableMinutes <= 45;
  const urgent = priority?.exam && dayDistance(date, priority.exam.date) <= 14;
  const priorityName = priority ? subjectLabel(data.subjects.find(subject => subject.id === priority.subjectId)) : '';
  const longTermName = longTerm ? subjectLabel(data.subjects.find(subject => subject.id === longTerm.subjectId)) : '';
  const mission = firstView?.title || (complete && complete === tasks.length ? 'Deine wichtigen Schritte sind heute geschafft.' : 'Heute bewusst Zeit für Lernen und Erholung lassen.');
  const motivation = shortDay ? 'Heute zählt der wichtigste Schritt.' : urgent ? `Fokus auf ${priorityName}.` : priority?.gap > 0 ? 'Beginne bei deiner größten Lernchance.' : 'Ein klarer Schritt für heute.';
  const longTermAcademic = academics.subjects.find(item => item.subjectId === longTerm?.subjectId);
  const baselineSubject = longTermAcademic?.source === 'baseline' ? longTermAcademic.subject : null;
  const baselineWritten = baselineSubject?.baselineWritten ?? baselineSubject?.written;
  const baselineOral = baselineSubject?.baselineOral ?? baselineSubject?.oral;
  const baselineArea = typeof baselineWritten === 'number' && (typeof baselineOral !== 'number' || baselineWritten <= baselineOral) ? 'schriftlicher' : 'mündlicher';
  const longTermReason = longTerm?.gap > 0 ? baselineSubject ? `Dein undatierter ${baselineArea} Ausgangswert liegt ${pointLabel(longTerm.gap)} Punkte unter deinem Ziel.` : `Die erfassten Leistungen liegen ${pointLabel(longTerm.gap)} Punkte unter deinem Ziel.` : longTerm?.current === null ? longTermAcademic?.records.length ? 'Für einen berechneten Schnitt fehlen noch Angaben zur Gewichtung.' : data.profile.prioritySubjects?.includes(longTerm.subjectId) ? 'Dein gewählter Schwerpunkt. Eine aktuelle Note fehlt noch.' : longTerm.level === 'LK' ? 'Dein Leistungskurs verdient regelmäßige Übung. Eine aktuelle Note fehlt noch.' : 'Kläre deinen Lernstand mit einer kurzen Übung und Rückmeldung.' : 'Regelmäßig üben und die nächste Entwicklung beobachten.';
  const longTermScoreLabel = baselineSubject ? 'Orientierung' : longTermAcademic?.records.length === 1 ? 'Letzte Leistung' : 'Erfasster Schnitt';
  const longTermScore = longTermAcademic?.records.length === 1 ? longTermAcademic.records[0].points : longTerm?.current;

  const renderTask = (task, index) => {
    const view = taskPresentation(data, task, date);
    const { key, Icon } = taskCategory(task);
    return <article key={task.id} className={`coach-task task-card task-kind-${key} ${task.completed ? 'is-complete' : ''}`} data-roadmap-id={task.roadmapItemId || undefined} data-event-id={task.eventId || undefined}>
      <div className="coach-task-top"><span className="coach-task-category"><Icon size={14} aria-hidden="true"/><span>{view.subject}</span></span><span className="coach-task-duration">{task.minutes} Min.</span></div>
      <button className="coach-task-open task-content" aria-label={`Lernaufgabe öffnen: ${task.title}`} onClick={() => onOpenTask(task)}><h3>{view.title}</h3><p>{taskReason(data, task, date, priorities)}</p></button>
      <div className="coach-task-bottom"><button className="task-start" onClick={() => onOpenTask(task)}>{task.completed ? 'Ergebnis ansehen' : index === 0 ? 'Zuerst starten' : 'So lernst du'}<ArrowRight size={14}/></button><button className="task-complete" aria-label={`${task.completed ? 'Abschluss rückgängig' : 'Aufgabe abschließen'}: ${task.title}`} aria-pressed={task.completed} disabled={preview} onClick={() => onComplete(task)}><Check size={19}/></button></div>
    </article>;
  };

  return <section className="coach-today stack" aria-label="Dein Tagesplan">
    <header className="coach-today-header"><div><p className="muted">{history ? 'Dein Rückblick' : preview ? 'Deine Vorschau' : `${greeting}${data.profile.name ? `, ${data.profile.name}` : ''}`}</p><h1>{date === today ? 'Heute' : formatDate(date, { weekday: 'long' })}</h1><p className="coach-date">{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div><button className="icon-button calendar-button" aria-label="Wochenplan öffnen" onClick={() => onPlan('week')}><CalendarDays size={22}/></button></header>
    {date !== today && <button className="text-button" onClick={() => onChooseDay(today)}>Zurück zu heute <ArrowRight size={15}/></button>}

    <section className="daily-mission" aria-label="Deine heutige Mission">
      <span className="eyebrow">{history ? 'DEIN GESPEICHERTER TAG' : 'DEIN FOKUS'}</span>
      <h2>{history ? 'Was du dir vorgenommen hast.' : motivation}</h2>
      <p>{mission}</p>
      <div className="mission-actions">{first && <Button onClick={() => onOpenTask(first)}>{preview || history ? 'Lernschritte ansehen' : 'Jetzt anfangen'} <ArrowRight size={17}/></Button>}
      {!history && <button className="mission-time" onClick={onTime} aria-label="Lernzeit anpassen"><Clock3 size={16}/><span><strong>{formatMinutes(plan.availableMinutes)} verfügbar</strong><small>Lernzeit anpassen</small></span></button>}</div>
    </section>

    {!history && <section className="academic-snapshot" aria-label="Dein Lernstand">
      <div className="row spread"><h2>Mein Lernstand</h2><button className="text-button" onClick={onProgress}>Noten <ChevronRight size={14}/></button></div>
      <div className="snapshot-values"><div><span>Mein Schnitt</span><strong>{pointLabel(academics.average)}{academics.average !== null && <small> / 15</small>}</strong></div><div><span>Mein Ziel</span><strong>{pointLabel(academics.target)}{academics.target !== null && <small> / 15</small>}</strong></div></div>
      <p className="snapshot-caption">{academics.average === null ? 'Trage eine aktuelle Note ein, um deinen Lernstand zu sehen.' : `${academics.includesBaselines ? 'Undatierte Orientierung' : 'Geschätzter Kursschnitt'} · ${academics.subjectCount}/${academics.totalSubjects} Fächer`}{academics.gap !== null && <span className="snapshot-gap">{academics.gap <= 0 ? 'Ziel derzeit erreicht' : `${pointLabel(academics.gap)} Punkte bis zum Ziel`}</span>}</p>
      <details className="quiet-details"><summary>{academics.trend.direction === 'up' ? <><TrendingUp size={14}/>Neuere Ergebnisse steigen</> : academics.trend.direction === 'down' ? <><TrendingDown size={14}/>Neuere Ergebnisse fallen</> : 'Trend und Berechnung'}</summary><p>{academics.trend.direction === 'unknown' ? 'Für einen belastbaren Trend fehlen noch vergleichbare Ergebnisse. ' : 'Vergleich deiner älteren und neueren erfassten Leistungen. '}{academics.disclaimer} {academics.weighted ? 'Deine eingetragenen Kursgewichte werden verwendet.' : 'Bekannte Fächer zählen gleich; Leistungskurse werden nicht stillschweigend doppelt gezählt.'}</p></details>
      {academics.average === null && <button className="text-button" onClick={onProgress}>Erste Note eintragen <Plus size={14}/></button>}
    </section>}

    {!history && <section className="next-events" aria-label="Nächste Termine"><div className="row spread"><h2>{nextExam ? 'Nächste Klausur' : 'Nächster Termin'}</h2><button className="text-button" onClick={() => onPlan('events')}>Alle Termine <ChevronRight size={14}/></button></div>{nextEvent ? <button className={`next-event ${nextExam ? 'is-exam' : ''}`} onClick={() => onPlan(nextEvent.source === 'exam' ? 'exams' : 'events')}><span className="event-date"><strong>{formatDate(nextEvent.date, { day: 'numeric' })}</strong><span>{formatDate(nextEvent.date, { month: 'short' })}</span></span><span><strong>{nextEvent.title}</strong><small>{countdown(nextEvent.daysUntil)}{nextEvent.time ? ` · ${nextEvent.time}` : ''}</small></span><ChevronRight size={15}/></button> : <div className="event-empty"><p>Noch kein Termin eingetragen.</p><button className="text-button" onClick={() => onPlan('exams')}>Prüfung hinzufügen <Plus size={14}/></button></div>}{earlierEvent && <button className="earlier-event" onClick={() => onPlan('events')}><span>Vorher: {earlierEvent.title}</span><small>{countdown(earlierEvent.daysUntil)}</small><ChevronRight size={14}/></button>}</section>}

    {!history && longTerm && <section className="improvement-opportunity" aria-label="Deine größte Lernchance"><span className="eyebrow">{urgent && longTerm.subjectId !== priority.subjectId ? 'LANGFRISTIG VERBESSERN' : 'DEINE LERNCHANCE'}</span><h2>{longTermName}<span>{longTerm.level === 'LK' ? 'LK' : ''}</span></h2><p>{longTermReason}</p>
      <details className="quiet-details"><summary>Warum dieser Schwerpunkt?</summary><div className="opportunity-meta"><span>{longTermScoreLabel} {pointLabel(longTermScore)} / 15</span><span>Ziel {pointLabel(longTerm.target)} / 15</span></div>{recommendations.filter(item => item.subjectId === longTerm.subjectId).slice(0, 1).map(item => <div key={item.id}><p>{item.how}</p><p>{item.minutes} Min. · {item.benefit}</p></div>)}<button className="text-button" onClick={() => onProfile('Subjects')}>Schwerpunkt ändern <ChevronRight size={14}/></button></details></section>}

    <section className="coach-priorities" aria-label="Deine wichtigsten Aufgaben"><div className="row spread"><h2>{history ? 'Deine gespeicherten Aufgaben' : 'Deine nächsten Schritte'}</h2><span className="muted small">{complete}/{tasks.length} geschafft</span></div><div className="daily-tasks" data-testid="daily-tasks">{tasks.slice(0, 3).map(renderTask)}</div>
    {tasks.length > 3 && <details className="quiet-details further-tasks"><summary>Weitere geplante Schritte ({tasks.length - 3})</summary><div className="daily-tasks">{tasks.slice(3).map((task, index) => renderTask(task, index + 3))}</div></details>}
    {!tasks.length && <EmptyState title={history ? 'Kein gespeicherter Plan' : plan.availableMinutes === 0 ? 'Zeit für Erholung' : 'Heute ist noch Platz'} description={history ? 'Wähle einen anderen Tag für deinen Rückblick.' : 'Passe deine Lernzeit an oder wähle bewusst eine kleine Aufgabe.'} action={<Button variant="secondary" onClick={history ? () => onChooseDay(today) : onTime}>{history ? 'Zu heute' : 'Lernzeit anpassen'}</Button>}/>}
    {!history && <details className="quiet-details day-context"><summary>So passt dein Plan in den Tag</summary><div className="row spread"><span>Eingeplant {formatMinutes(plan.plannedMinutes)}</span><span>Frei {formatMinutes(plan.remainingMinutes)}</span></div><p>{plan.adjustment}</p><button className="text-button" onClick={onPurpose}>Vom Ziel zu heute <Target size={14}/></button></details>}
    {!history && tasks.length > 0 && <button className="text-button add-priority" onClick={onAdd}><Plus size={15}/>Eigene Priorität ergänzen</button>}
    {skipped.length > 0 && <details className="quiet-details"><summary>Für später gespeichert ({skipped.length})</summary><p>Notizen bleiben erhalten. Verschiebe eine Aufgabe im Lernplan oder passe deine Lernzeit an.</p>{skipped.map(task => <button className="saved-task-row" key={task.id} onClick={() => onOpenTask(task)}>{task.title}<ChevronRight size={15}/></button>)}</details>}
    </section>
    {!history && new Date(`${today}T12:00:00`).getDay() === 0 && <button className="review-link" onClick={onProgress}>Dein Wochenrückblick <ArrowRight size={16}/></button>}
  </section>;
}
