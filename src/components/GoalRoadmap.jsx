import React,{useState} from 'react';
import {ArrowRight,Check} from 'lucide-react';
import {Button,Field} from './UI.jsx';
import {getUniversityGoalRoadmap,normalizeUniversityGoals} from '../university-goals.js';
export default function GoalRoadmap({data,today,onGoals}){
 const goals=normalizeUniversityGoals(data.universityGoals).goals.filter(goal=>goal.active);
 const [selected,setSelected]=useState(goals[0]?.id||'');
 const roadmap=getUniversityGoalRoadmap(data,selected,today);
 if(!roadmap)return <div className="stack"><h2>Dein Studiengang gibt den Weg vor.</h2><Button onClick={onGoals}>Studienziel wählen<ArrowRight size={16}/></Button></div>;
 return <section className="goal-roadmap stack" aria-label="Dein Studiengangsweg"><Field label="Weg für Studienziel"><select value={selected} onChange={event=>setSelected(event.target.value)}>{goals.map(goal=><option key={goal.id} value={goal.id}>{goal.name} · {goal.programme}</option>)}</select></Field><p className="field-help">Eintritt {roadmap.goal.entryYear} · {roadmap.goal.country==='UK'?'Fachliche Eignung und die konkrete Studiengangsbewerbung stehen im Mittelpunkt.':roadmap.goal.country==='USA'?'Studiengang, schulische Entwicklung und belegbare Erfahrungen gemeinsam prüfen.':'Studiengang, Abitur und Zulassungsweg zusammen prüfen.'} Allgemeine Planung ersetzt keine veröffentlichte Vorgabe.</p><ol className="goal-route-list">{roadmap.stages.map((stage,index)=><li key={stage.id}><span className="goal-route-index">{stage.checked===stage.total&&stage.total>0?<Check size={16}/>:index+1}</span><div><h2>{stage.title}</h2><small>{stage.checked} von {stage.total} Anforderungen quellengeprüft</small><p>{stage.next?`${stage.next.label}: ${stage.next.statusLabel.toLocaleLowerCase('de-DE')}`:'Anwendbarkeit deiner Nachweise prüfen.'}</p></div></li>)}</ol><Button onClick={onGoals}>Nächste Anforderung bearbeiten<ArrowRight size={16}/></Button></section>;
}
