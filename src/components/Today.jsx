import React, { useState } from 'react';
import { ArrowRight, BookOpen, BriefcaseBusiness, CalendarDays, Check, ChevronRight, ClipboardCheck, Clock3, Code2, GraduationCap, Languages, Plus, Target, Trophy } from 'lucide-react';
import { getAcademicOverview } from '../grades.js';
import { getSubjectPriorities } from '../recommendations.js';
import { getUpcomingEvents } from '../events.js';
import { getGuidedSession } from '../guided-learning.js';
import { subjectLabel, categoryLabel, pointLabel } from '../i18n.js';
import { Button, EmptyState, Modal, formatDate, formatMinutes } from './UI.jsx';
import ExamRecovery from './ExamRecovery.jsx';
import { getExamReflection } from '../recovery.js';
import './today.css';

const dayDistance = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
const countdown = days => days === 0 ? 'Heute' : days === 1 ? 'Morgen' : `In ${days} Tagen`;

function taskPresentation(data, task, date) {
  const subject = data.subjects.find(item => item.id === task.subjectId);
  const testName = task.ieltsSkill || /ielts/i.test(task.title) ? 'IELTS' : task.satSkill || /\bsat\b/i.test(task.title) ? 'SAT' : '';
  if (task.origin === 'custom') return { title: task.title, subject: subject ? subjectLabel(subject) : categoryLabel(task.category) };
  const session = getGuidedSession(data, task, date);
  const tutor = session.tutor;
  const chooseTopic = tutor && ['choose-topic', 'unsupported'].includes(tutor.status);
  return { title: tutor?.status === 'ready' ? tutor.objective : chooseTopic ? task.examId ? 'Prüfungsthema auswählen und gezielt üben' : 'Dein Thema wählen und eine konkrete Aufgabe lösen' : session.objective || task.objective || task.title,
    subject: testName || (subject ? subjectLabel(subject) : categoryLabel(task.category)) };
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
  if (exam) return `Klausur ${countdown(dayDistance(date, exam.date)).toLocaleLowerCase('de-DE')}`;
  if (task.ieltsSkill) return 'Für dein IELTS-Ziel';
  if (task.satSkill) return 'Für dein SAT-Ziel';
  if (task.reviewDate) return 'Deinen früheren Fehler erneut prüfen';
  const priority = priorities.find(item => item.subjectId === task.subjectId);
  if (priority?.gap > 0) return `${pointLabel(priority.gap)} Punkte Abstand zu deinem Ziel`;
  if (priority?.override === 'high') return 'Dein gewählter Schwerpunkt';
  if (task.category === 'university' || task.category === 'activity') return 'Dein nächster Bewerbungsschritt';
  return task.linkedGoal || 'Ein überprüfbarer nächster Schritt';
}

function longTermPriority(priorities, data) {
  const preferences = data.profile.prioritySubjects || [];
  const value = item => item.gap * 8 + (preferences.includes(item.subjectId) ? 23 : 0) + (item.level === 'LK' ? 8 : 0) + (item.override === 'high' ? 45 : item.override === 'low' ? -30 : 0) + (item.trend !== null && item.trend < -1 ? Math.min(16, -item.trend * 4) : 0);
  return [...priorities].sort((a, b) => value(b) - value(a))[0];
}

export default function Today({ data, today, date, plan, onChange, onOpenTask, onComplete, onTime, onAdd, onPlan, onProgress, onProfile, onPurpose, onChooseDay }) {
  const [reflectionExamId, setReflectionExamId] = useState('');
  const recentExam = [...data.exams].filter(exam => exam.date <= today && dayDistance(exam.date, today) <= 14 && !getExamReflection(data, exam.id)?.mood).sort((a, b) => b.date.localeCompare(a.date))[0];
  const reflectionExam = data.exams.find(exam => exam.id === reflectionExamId);
  const history = plan.isHistory || date < today;
  const preview = date > today;
  const tasks = plan.tasks || [];
  const complete = tasks.filter(task => task.completed).length;
  const first = tasks.find(task => !task.completed);
  const displayTasks = history ? tasks : [...tasks.filter(task => !task.completed), ...tasks.filter(task => task.completed)];
  const priorities = getSubjectPriorities(data, date);
  const priority = priorities[0];
  const longTerm = longTermPriority(priorities, data);
  const academics = getAcademicOverview(data);
  const longTermAcademic = academics.subjects.find(item => item.subjectId === longTerm?.subjectId);
  const longTermName = longTerm ? subjectLabel(data.subjects.find(subject => subject.id === longTerm.subjectId)) : '';
  const priorityName = priority ? subjectLabel(data.subjects.find(subject => subject.id === priority.subjectId)) : first ? taskPresentation(data, first, date).subject : '';
  const upcoming = getUpcomingEvents(data, date).filter(event => event.date >= date && event.status !== 'completed');
  const nextExam = upcoming.find(event => event.source === 'exam');
  const nextEvent = nextExam || upcoming[0];
  const nextSubject = nextExam && data.subjects.find(item => item.id === nextExam.subjectId);
  const earlierEvent = nextExam && upcoming[0]?.date < nextExam.date ? upcoming[0] : null;
  const skipped = data.tasks.filter(task => task.date === date && task.skipped);
  const until = priority?.exam ? dayDistance(date, priority.exam.date) : null;
  const urgent = until !== null && until <= 14;
  const allDone = tasks.length > 0 && complete === tasks.length;
  const noTime = !history && plan.availableMinutes === 0;
  const shortDay = !history && plan.availableMinutes > 0 && plan.availableMinutes <= 45;
  const motivation = history ? 'Dein Tag im Rückblick.' : allDone ? 'Heute hast du etwas bewegt.' : noTime ? 'Erholung hat ihren Platz.' : until !== null && until <= 1 ? 'Festigen. Ruhig bleiben.' : shortDay ? 'Die verfügbare Zeit zählt.' : 'Konzentriert weiter.';
  const priorityReason = urgent ? `Deine Klausur ist ${until === 0 ? 'heute' : until === 1 ? 'morgen' : `in ${until} Tagen`}.` : priority?.gap > 0 ? `${pointLabel(priority.gap)} Punkte bis zu deinem Fachziel.` : priority?.override === 'high' || data.profile.prioritySubjects?.includes(priority?.subjectId) ? 'Dein persönlicher Schwerpunkt.' : first ? 'Dein erster Schritt im heutigen Plan.' : 'Heute ist kein Lernschritt eingeplant.';
  const baseline = longTermAcademic?.source === 'baseline';
  const score = longTermAcademic?.records.length === 1 ? longTermAcademic.records[0].points : longTerm?.current;
  const scoreLabel = baseline ? 'Ausgangswert' : longTermAcademic?.records.length === 1 ? 'Letzte Leistung' : 'Kursschnitt';
  const improvementReason = score == null ? longTermAcademic?.records.length ? 'Gewichtung noch ergänzen' : 'Aktuellen Lernstand erfassen' : longTerm?.gap > 0 ? 'Dein größtes Verbesserungsziel' : 'Deine Entwicklung im Blick';
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';

  const renderTask = (task, index) => {
    const view = taskPresentation(data, task, date);
    const { key, Icon } = taskCategory(task);
    return <article key={task.id} className={`coach-task task-card task-kind-${key} ${index === 0 ? 'is-first' : ''} ${task.completed ? 'is-complete' : ''}`} data-roadmap-id={task.roadmapItemId || undefined} data-event-id={task.eventId || undefined}>
      <button className="task-complete" aria-label={`${task.completed ? 'Abschluss rückgängig' : 'Aufgabe abschließen'}: ${task.title}`} aria-pressed={task.completed} disabled={preview} onClick={() => onComplete(task)}><Check size={17}/></button>
      <button className="coach-task-open task-content" aria-label={`Lernaufgabe öffnen: ${task.title}`} onClick={() => onOpenTask(task)}>
        <span className="coach-task-top"><span className="coach-task-category"><Icon size={13} aria-hidden="true"/>{view.subject}</span><span className="coach-task-duration">{task.minutes} Min.</span></span>
        <h3>{view.title}</h3><span className="coach-task-reason">{taskReason(data, task, date, priorities)}</span>
        {index === 0 && !task.completed && <span className="task-start">{history || preview ? 'Lernschritte ansehen' : 'Jetzt starten'}<ArrowRight size={14}/></span>}
      </button>
      <ChevronRight size={16} className="task-open-chevron" aria-hidden="true"/>
    </article>;
  };

  return <section className="coach-today stack" aria-label="Dein Tagesplan">
    {reflectionExam && onChange && <Modal title="Deine Klausur" onClose={() => setReflectionExamId('')}><ExamRecovery data={data} exam={reflectionExam} today={today} onChange={onChange}/></Modal>}
    <header className="coach-today-header"><div><p className="coach-greeting">{history ? 'Dein Rückblick' : preview ? 'Deine Vorschau' : `${greeting}${data.profile.name ? `, ${data.profile.name}` : ''}`}</p><div className="today-title-line"><h1>{date === today ? 'Heute' : formatDate(date, { weekday: 'long' })}</h1><p className="coach-date">{formatDate(date, { day: 'numeric', month: 'long' })}</p></div></div><button className="icon-button calendar-button" aria-label="Wochenplan öffnen" onClick={() => onPlan('week')}><CalendarDays size={21}/></button></header>
    {date !== today && <button className="text-button" onClick={() => onChooseDay(today)}>Zurück zu heute <ArrowRight size={15}/></button>}

    <section className="daily-mission" aria-label="Deine heutige Mission"><span className="eyebrow">{history ? 'DEIN GESPEICHERTER TAG' : 'HEUTE WICHTIG'}</span><h2>{motivation}</h2><div className="mission-priority"><span className="mission-priority-mark" aria-hidden="true"/><div><strong>{history ? 'Deine gespeicherten Schritte' : noTime || allDone ? 'Freiraum für dich' : priorityName || 'Ein guter nächster Schritt'}</strong>{(!urgent || history || noTime || allDone) && <p>{history ? `${tasks.length} Schritte im Verlauf` : noTime || allDone ? 'Dein Plan darf auch fertig sein.' : priorityReason}</p>}</div></div>
      {!history && <button className="mission-time" onClick={onTime} aria-label="Lernzeit anpassen"><Clock3 size={14}/><span>{formatMinutes(plan.availableMinutes)} verfügbar</span><ChevronRight size={14}/></button>}
    </section>

    {!history && !preview && recentExam && onChange && <div className="post-exam-prompt"><div><strong>{subjectLabel(data.subjects.find(subject => subject.id === recentExam.subjectId))} · Deine Klausur</strong><span>{recentExam.date === today ? 'Schon geschrieben? Halte deinen Eindruck fest.' : 'Wie lief deine Klausur?'}</span></div><Button variant="secondary" onClick={() => setReflectionExamId(recentExam.id)}>Nachbesprechen <ArrowRight size={14}/></Button></div>}

    {!history && <div className="today-insights"><section className="next-events" aria-label="Nächste Termine"><span className="eyebrow">{nextExam ? 'NÄCHSTE KLAUSUR' : 'NÄCHSTER TERMIN'}</span>{nextEvent ? <button className={`next-event ${nextExam ? 'is-exam' : ''}`} onClick={() => onPlan(nextEvent.source === 'exam' ? 'exams' : 'events')}><span className="exam-count"><strong>{nextEvent.daysUntil === 0 ? 'Heute' : nextEvent.daysUntil === 1 ? 'Morgen' : nextEvent.daysUntil}</strong>{nextEvent.daysUntil > 1 && <small>Tage</small>}</span><span className="exam-name">{nextSubject ? subjectLabel(nextSubject) : nextEvent.title}</span><span className="insight-caption">{formatDate(nextEvent.date, { day: 'numeric', month: 'long' })}{nextEvent.time ? ` · ${nextEvent.time}` : ''}</span><ChevronRight size={15} className="insight-chevron"/></button> : <div className="event-empty"><h2>Termin offen</h2><button className="text-button" onClick={() => onPlan('exams')}>Prüfung eintragen <Plus size={14}/></button></div>}{earlierEvent && <button className="earlier-event" onClick={() => onPlan('events')}><span>{earlierEvent.title}</span><small>{countdown(earlierEvent.daysUntil)}</small></button>}</section>
      {longTerm ? <section className="improvement-opportunity" aria-label="Deine größte Lernchance"><span className="eyebrow">{urgent && longTerm.subjectId !== priority?.subjectId ? 'LANGFRISTIG VERBESSERN' : 'VERBESSERUNGSZIEL'}</span><button className="improvement-open" onClick={() => onProgress(longTerm.subjectId)}><h2>{longTermName}{longTerm.level === 'LK' && <small>LK</small>}</h2><span className="opportunity-score">{score == null ? 'Stand offen' : <>{pointLabel(score)}{longTerm.target !== null && <><span> → </span>{pointLabel(longTerm.target)}</>}<small> / 15</small></>}</span><span className="insight-caption">{score == null ? improvementReason : scoreLabel}</span><span className="insight-link">Ziel berechnen <ChevronRight size={14}/></span></button></section> : <section className="improvement-opportunity"><span className="eyebrow">DEIN LERNSTAND</span><h2>Wo stehst du?</h2><button className="text-button" onClick={onProgress}>Erste Note eintragen <Plus size={14}/></button></section>}
    </div>}

    <section className="coach-priorities" aria-label="Deine wichtigsten Aufgaben"><div className="task-list-heading"><div><h2>{history ? 'Deine gespeicherten Schritte' : 'Deine nächsten Schritte'}</h2><span>{complete} von {tasks.length} geschafft</span></div>{!history && <button className="icon-button" aria-label="Eigene Priorität ergänzen" onClick={onAdd}><Plus size={20}/></button>}</div>{tasks.length > 0 && <div className="today-completion" role="progressbar" aria-label="Heutige Aufgaben" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={complete}><span style={{ width: `${complete / tasks.length * 100}%` }}/></div>}<div className="daily-tasks" data-testid="daily-tasks">{displayTasks.slice(0, 3).map(renderTask)}</div>
      {tasks.length > 3 && <details className="quiet-details further-tasks"><summary>Weitere geplante Schritte ({tasks.length - 3})</summary><div className="daily-tasks">{displayTasks.slice(3).map((task, index) => renderTask(task, index + 3))}</div></details>}
      {!tasks.length && <EmptyState title={history ? 'Kein gespeicherter Plan' : plan.availableMinutes === 0 ? 'Zeit für Erholung' : 'Heute ist noch Platz'} description={history ? 'Wähle einen anderen Tag für deinen Rückblick.' : 'Passe deine Lernzeit an oder wähle bewusst eine kleine Aufgabe.'} action={<Button variant="secondary" onClick={history ? () => onChooseDay(today) : onTime}>{history ? 'Zu heute' : 'Lernzeit anpassen'}</Button>}/>}
      {!history && <details className="quiet-details day-context"><summary>Dein Tag im Überblick</summary><div className="row spread"><span>Eingeplant {formatMinutes(plan.plannedMinutes)}</span><span>Frei {formatMinutes(plan.remainingMinutes)}</span></div><p>{plan.adjustment}</p><div className="row wrap"><button className="text-button" onClick={onPurpose}>Vom Ziel zu heute <Target size={14}/></button><button className="text-button" onClick={() => onProfile('Subjects')}>Schwerpunkte ändern <ChevronRight size={14}/></button><button className="text-button" onClick={onProgress}>Noten & Fortschritt <ChevronRight size={14}/></button></div>{new Date(`${today}T12:00:00`).getDay() === 0 && <button className="text-button" onClick={onProgress}>Dein Wochenrückblick <ArrowRight size={14}/></button>}</details>}
      {skipped.length > 0 && <details className="quiet-details"><summary>Für später gespeichert ({skipped.length})</summary><p>Deine Entwürfe bleiben erhalten.</p>{skipped.map(task => <button className="saved-task-row" key={task.id} onClick={() => onOpenTask(task)}>{task.title}<ChevronRight size={15}/></button>)}</details>}
    </section>
  </section>;
}
