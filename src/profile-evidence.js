/** Documentation quality, not an admissions score or a claim of external verification. */
import { calculateSubject } from './grades.js';
const hasText = value => typeof value === 'string' && value.trim().length > 0;
export function safeEvidenceUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function getActivityEvidence(activity = {}) {
  const evidence = (Array.isArray(activity.evidence) ? activity.evidence : []).filter(item => item && (hasText(item.note) || safeEvidenceUrl(item.url)));
  const status = activity.evidenceStatus === 'planned' ? 'planned' : activity.evidenceStatus === 'verified' && evidence.length ? 'verified' : 'self-reported';
  return { status, evidence, label: status === 'planned' ? 'Geplant' : status === 'verified' ? 'Von dir belegt' : 'Selbstauskunft', documented: ['description', 'responsibilities', 'achievements', 'impact'].some(key => hasText(activity[key])), missing: ['responsibilities', 'achievements', 'impact'].filter(key => !hasText(activity[key])) };
}
function activityGroup(activity) {
  const type = String(activity.type || '').toLowerCase();
  if (/project|projekt|coding/.test(type)) return 'projects';
  if (/work|entrepreneur|internship|marketing|arbeit|praktikum/.test(type)) return 'work';
  if (/leadership|führung/.test(type)) return 'leadership';
  return 'activities';
}
export function getProfileEvidence(data = {}) {
  const activities = Array.isArray(data.activities) ? data.activities : [];
  const grades = Array.isArray(data.grades) ? data.grades : [];
  const actualGrades = grades.filter(grade => typeof grade.points === 'number' && grade.points >= 0 && grade.points <= 15 && /^\d{4}-\d{2}-\d{2}$/.test(grade.date || ''));
  const scores = (data.ielts?.scores || []).filter(score => score.source === 'official');
  const tests = (data.profile?.testPlans || []).filter(test => /completed|abgeschlossen/i.test(test.status || ''));
  const sections = [
    { id: 'academics', title: 'Akademische Entwicklung', count: actualGrades.length, state: actualGrades.length ? `${actualGrades.length} datierte Leistung${actualGrades.length === 1 ? '' : 'en'}` : 'Aktuelle Einzelleistungen fehlen', action: 'Subjects', explanation: 'Noten zeigen deine Entwicklung. Eingetragene Ergebnisse bleiben Selbstauskünfte, bis du Nachweise hinterlegst.' },
    { id: 'language', title: 'Sprachqualifikationen', count: scores.length + tests.length, state: scores.length ? `${scores.length} als offiziell erfasste IELTS-Ergebnisse` : tests.length ? 'Abschluss selbst angegeben' : 'Noch kein Abschluss dokumentiert', action: 'IELTS', explanation: 'Übung, Selbsteinschätzung und offizielle Prüfungsergebnisse sind verschiedene Arten von Nachweisen.' },
  ];
  const labels = { projects: 'Projekte & Technik', work: 'Arbeit & Praxiserfahrung', activities: 'Sport & Engagement', leadership: 'Verantwortung & Wirkung' };
  for (const [key, title] of Object.entries(labels)) {
    const records = activities.filter(activity => activityGroup(activity) === key || key === 'leadership' && (hasText(activity.responsibilities) || hasText(activity.impact)));
    const verified = records.filter(activity => getActivityEvidence(activity).status === 'verified').length;
    const planned = records.filter(activity => getActivityEvidence(activity).status === 'planned').length;
    sections.push({ id: key, title, count: records.length, state: verified ? `${verified} mit eigenen Belegen` : records.length && planned === records.length ? 'Bisher geplant' : records.length ? 'Erfasst · Nachweise ergänzen' : 'Noch nicht dokumentiert', action: 'Activities', explanation: key === 'leadership' ? 'Beschreibe deine tatsächliche Verantwortung und was sich dadurch verändert hat.' : 'Wenige gut belegte Erfahrungen sind hilfreicher als viele unbelegte Angaben.' });
  }
  return sections;
}
export function getProfileRecommendations(data = {}) {
  const result = [];
  const activities = (data.activities || []).filter(activity => getActivityEvidence(activity).status !== 'planned');
  for (const activity of activities) {
    const state = getActivityEvidence(activity);
    const group = activityGroup(activity);
    if (!hasText(activity.responsibilities) || !hasText(activity.impact)) result.push({ id: `document-${activity.id}`, activityId: activity.id, title: `${activity.name}: deine Rolle festhalten`, why: 'Ein Aktivitätsname zeigt noch nicht, welchen Beitrag du geleistet hast.', how: group === 'work' ? 'Notiere zwei echte Aufgaben und eine beobachtbare Veränderung. Nutze Zahlen nur, wenn du sie belegen kannst.' : 'Notiere deine konkrete Rolle, eine Herausforderung und was du daraus gelernt oder verändert hast.', minutes: 15, benefit: 'Eine nachvollziehbare Grundlage für spätere Bewerbungen.', priority: 2 });
    else if (!state.evidence.length) result.push({ id: `evidence-${activity.id}`, activityId: activity.id, title: `${activity.name}: einen Beleg ergänzen`, why: 'Deine Beschreibung ist vorhanden; ein Nachweis macht sie nachvollziehbarer.', how: 'Verlinke ein eigenes Ergebnis, eine Bestätigung oder notiere, wo du den Nachweis aufbewahrst. Keine vertraulichen Kundendaten.', minutes: 10, benefit: 'Die Erfahrung lässt sich später verlässlich belegen.', priority: 1 });
    if (group === 'projects' && !safeEvidenceUrl(activity.projectUrl)) result.push({ id: `project-${activity.id}`, activityId: activity.id, title: `${activity.name}: Ergebnis dokumentieren`, why: 'Ein Projekt wird durch das sichtbare Ergebnis und deine Entscheidungen verständlich.', how: 'Ergänze den Repository- oder Projektlink. Beschreibe im README das Problem, deinen Beitrag und den nächsten sinnvollen Schritt.', minutes: 20, benefit: 'Deine technischen Fähigkeiten werden konkret sichtbar.', priority: 1 });
  }
  const weak = (data.subjects || []).filter(subject => subject.enabled !== false).map(subject => calculateSubject(data, subject.id)).filter(result => result.source === 'assessments' && result.gap >= 3);
  if (weak.length) result.unshift({ id: 'academic-first', title: 'Zuerst deine schulische Basis stärken', why: 'Deine erfassten Einzelleistungen zeigen in mindestens einem Fach eine größere Ziellücke.', how: 'Nutze die nächste freie Lernzeit für das wichtigste Fach. Bitte bei wiederkehrenden Fehlern gezielt um Rückmeldung, bevor du eine neue Aktivität beginnst.', minutes: 20, benefit: 'Dein Engagement bleibt mit deiner schulischen Belastung vereinbar.', section: 'Subjects', priority: 3 });
  if (!activities.length) result.push({ id: 'first-activity', title: 'Eine vorhandene Erfahrung festhalten', why: 'Deine bisherigen Erfahrungen sind der Ausgangspunkt, nicht eine längere Liste neuer Verpflichtungen.', how: 'Erfasse Volleyball, eine tatsächliche Aufgabe im Restaurant oder ein eigenes Projekt. Beschreibe nur, was du wirklich gemacht hast.', minutes: 15, benefit: 'Dein Bewerbungsprofil bekommt eine ehrliche Grundlage.', section: 'Activities', priority: 1 });
  return result.toSorted((a, b) => b.priority - a.priority).slice(0, 5);
}
