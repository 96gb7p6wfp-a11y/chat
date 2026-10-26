import React, { useState } from 'react';
import { ArrowRight, BookOpen, BriefcaseBusiness, CalendarDays, Check, ChevronRight, ClipboardCheck, Clock3, Code2, GraduationCap, Languages, Plus, Target, Trophy } from 'lucide-react';
import { getSubjectPriorities } from '../recommendations.js';
import { getUpcomingEvents } from '../events.js';
import { getGuidedSession } from '../guided-learning.js';
import { subjectLabel, categoryLabel, pointLabel } from '../i18n.js';
import { Button, EmptyState, Modal, formatDate, formatMinutes } from './UI.jsx';
import ExamRecovery from './ExamRecovery.jsx';
import { getExamReflection } from '../recovery.js';
import { getUniversityGoalDeadlines } from '../university-goals.js';
import './today.css';
import './action-home.css';

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
  if (exam) return exam.date < date ? 'Deinen Klausurfehler gezielt verbessern' : `Klausur ${countdown(dayDistance(date, exam.date)).toLocaleLowerCase('de-DE')}`;
  if (task.ieltsSkill) return 'Für dein IELTS-Ziel';
  if (task.satSkill) return 'Für dein SAT-Ziel';
  if (task.reviewDate) return 'Deinen früheren Fehler erneut prüfen';
  const priority = priorities.find(item => item.subjectId === task.subjectId);
  if (priority?.gap > 0) return `${pointLabel(priority.gap)} Punkte Abstand zu deinem Ziel`;
  if (priority?.override === 'high') return 'Dein gewählter Schwerpunkt';
  if (task.category === 'university' || task.category === 'activity') return 'Dein nächster Bewerbungsschritt';
  return task.category === 'language' || task.category === 'academics' ? 'Dein aktuelles Thema gezielt verbessern' : 'Ein überprüfbarer nächster Schritt';
}

export default function Today({ data, today, date, plan, onChange, onOpenTask, onComplete, onTime, onAdd, onPlan, onProgress, onProfile, onChooseDay, onFuture }) {
  const [reflectionExamId, setReflectionExamId] = useState('');
  const history = plan.isHistory || date < today, preview = date > today;
  const tasks = plan.tasks || [], complete = tasks.filter(task => task.completed).length;
  const pending = tasks.filter(task => !task.completed), primary = pending[0];
  const skipped = data.tasks.filter(task => task.date === date && task.skipped);
  const displayed = history ? tasks : pending;
  const priorities = getSubjectPriorities(data, date), priority = priorities[0];
  const goals = (data.universityGoals?.goals || []).filter(goal => goal.active !== false).sort((a,b) => ({high:0,normal:1,low:2}[a.priority] ?? 1) - ({high:0,normal:1,low:2}[b.priority] ?? 1));
  const goal = goals[0];
  const goalName = goal ? `${({ucl:'UCL',ucla:'UCLA',berkeley:'UC Berkeley'}[goal.institutionId] || goal.name)} · ${goal.programme}` : `Abitur ${data.profile.graduationYear || '2028'}`;
  const upcoming = [...getUpcomingEvents(data, date),...getUniversityGoalDeadlines(data,date)].filter(event => event.date >= date && event.status !== 'completed').sort((a,b)=>a.date.localeCompare(b.date));
  const nextEvent = upcoming[0];
  const nextSubject = nextEvent && data.subjects.find(subject => subject.id === nextEvent.subjectId);
  const recentExam = [...data.exams].filter(exam => exam.date <= today && dayDistance(exam.date, today) <= 14 && !getExamReflection(data, exam.id)?.mood).sort((a,b) => b.date.localeCompare(a.date))[0];
  const reflectionExam = data.exams.find(exam => exam.id === reflectionExamId);
  const view = primary ? taskPresentation(data, primary, date) : null;
  const hour = new Date().getHours(), greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const noTime = !history && plan.availableMinutes === 0;
  const renderTask = task => {
    const item = taskPresentation(data, task, date), {key,Icon} = taskCategory(task);
    return <article className={`coach-task task-card task-kind-${key} ${task.completed ? 'is-complete' : ''}`} key={task.id} data-roadmap-id={task.roadmapItemId || undefined}>
      <button className="task-complete" aria-label={`${task.completed ? 'Abschluss rückgängig' : 'Aufgabe abschließen'}: ${task.title}`} aria-pressed={task.completed} disabled={preview} onClick={() => onComplete(task)}><Check size={17}/></button>
      <button className="coach-task-open task-content" aria-label={`Lernaufgabe öffnen: ${task.title}`} onClick={() => onOpenTask(task)}><span className="coach-task-top"><span className="coach-task-category"><Icon size={13}/>{item.subject}</span><span className="coach-task-duration">{task.minutes} Min.</span></span><h3>{item.title}</h3><span className="coach-task-reason">{taskReason(data,task,date,priorities)}</span></button><ChevronRight size={15} className="task-open-chevron"/>
    </article>;
  };
  return <section className="coach-today action-home" aria-label="Dein Tagesplan">
    <header className="action-header"><div><p className="coach-greeting">{history ? 'Dein Rückblick' : preview ? 'Deine Vorschau' : greeting}</p><h1>{date === today ? 'Heute' : formatDate(date,{weekday:'long'})}</h1><p className="coach-date">{formatDate(date,{weekday:'long',day:'numeric',month:'long'})}</p></div><button className="icon-button" aria-label="Wochenplan öffnen" onClick={() => onPlan('week')}><CalendarDays size={21}/></button></header>
    {date !== today && <button className="text-button" onClick={() => onChooseDay(today)}>Zurück zu heute <ArrowRight size={14}/></button>}
    <section className="next-action" aria-label="Dein wichtigster nächster Schritt">
      <button className="destination-link" onClick={() => onFuture?.('goals')}><GraduationCap size={15}/><span>{goalName}</span><ChevronRight size={13}/></button>
      <p className="action-motivation">{noTime ? 'Erholung hat ihren Platz.' : primary ? 'Ein klarer Schritt. Dann der nächste.' : 'Für heute ist genug geschafft.'}</p>
      {primary ? <><span className="eyebrow">JETZT WICHTIG · {view.subject}</span><h2>{view.title}</h2><p className="action-why">{taskReason(data,primary,date,priorities)}</p><Button className="action-start" onClick={() => onOpenTask(primary)} aria-label={`Lernaufgabe öffnen: ${primary.title}`}>{history || preview ? 'Lernschritte ansehen' : 'Starten'} · {primary.minutes} Min.<ArrowRight size={17}/></Button></> : <><h2>{history ? 'Dein gespeicherter Tag' : noTime ? 'Heute bleibt frei.' : 'Dein Plan ist erledigt.'}</h2><button className="text-button" onClick={onTime}>Lernzeit anpassen <Clock3 size={14}/></button></>}
    </section>
    {nextEvent && <button className="next-deadline" onClick={() => nextEvent.source === 'university' ? onFuture?.('goals') : onPlan(nextEvent.source === 'exam' ? 'exams' : 'events')}><CalendarDays size={18}/><span><small>{nextEvent.source === 'exam' ? 'NÄCHSTE KLAUSUR' : 'NÄCHSTER TERMIN'}</small><strong>{nextSubject ? subjectLabel(nextSubject) : nextEvent.title}</strong></span><span className="next-deadline-date">{countdown(nextEvent.daysUntil)}<small>{formatDate(nextEvent.date)}</small></span><ChevronRight size={15}/></button>}
    <section className="coach-priorities" aria-label="Deine weiteren Prioritäten"><div className="task-list-heading"><h2>{history ? 'Deine Schritte' : 'Danach'}</h2><span>{complete} / {tasks.length}</span></div><div className="daily-tasks" data-testid="daily-tasks">{displayed.slice(history ? 0 : 1, history ? 3 : 3).map(renderTask)}</div>
      <div className="today-completion" role="progressbar" aria-label="Heutige Aufgaben" aria-valuemin={0} aria-valuemax={Math.max(1,tasks.length)} aria-valuenow={complete}><span style={{width:`${tasks.length ? complete/tasks.length*100 : 0}%`}}/></div>
      <details className="quiet-details full-day"><summary>Tagesplan & Verlauf <span>{formatMinutes(plan.availableMinutes)} verfügbar</span></summary><div className="stack compact">{(history ? tasks.slice(3) : [...pending.slice(3),...tasks.filter(task => task.completed)]).map(renderTask)}{primary && <button className="text-button" disabled={preview} onClick={() => onComplete(primary)}>Wichtigsten Schritt als erledigt markieren <Check size={15}/></button>}<div className="row wrap"><button className="text-button" onClick={onTime}>Lernzeit ändern</button><button className="text-button" onClick={onAdd}>Eigene Aufgabe</button><button className="text-button" onClick={onProgress}>Fortschritt ansehen</button></div>{priority && <button className="text-button" onClick={() => onProgress(priority.subjectId)}>{subjectLabel(data.subjects.find(subject => subject.id === priority.subjectId))}: Ziel berechnen <ChevronRight size={14}/></button>}{recentExam && onChange && <button className="text-button" onClick={() => setReflectionExamId(recentExam.id)}>Klausur nachbesprechen <ArrowRight size={14}/></button>}<p className="field-help">{plan.adjustment}</p>{skipped.length > 0 && <details className="quiet-details"><summary>Für später gespeichert ({skipped.length})</summary><p className="field-help">Deine Entwürfe bleiben erhalten.</p>{skipped.map(task => <button className="saved-task-row" key={task.id} onClick={() => onOpenTask(task)}>{task.title}<ChevronRight size={15}/></button>)}</details>}</div></details>
    </section>
    {reflectionExam && onChange && <Modal title="Deine Klausur" onClose={() => setReflectionExamId('')}><ExamRecovery data={data} exam={reflectionExam} today={today} onChange={onChange}/></Modal>}
  </section>;
}
