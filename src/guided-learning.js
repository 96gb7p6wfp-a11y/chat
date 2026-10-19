import { getExercise } from './exercises.js';
import { getIELTSPractice } from './ielts.js';

const DAY = 86_400_000;
const clean = (value, max = 8000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const identifier = () => `learning-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;

/** Recorded practice is self-reported evidence, never a generated school grade. */
export function normalizeLearning(value) {
  const seen = new Set();
  return { attempts: (Array.isArray(value?.attempts) ? value.attempts : []).slice(0, 10000).map(entry => {
    if (!entry || typeof entry !== 'object' || !clean(entry.id, 200) || !validDate(entry.date) || !['again', 'hard', 'good'].includes(entry.rating)) return null;
    const id = clean(entry.id, 200);
    if (seen.has(id)) return null;
    seen.add(id);
    return { id, taskId: clean(entry.taskId, 200), subjectId: clean(entry.subjectId, 200), topic: clean(entry.topic, 200), questionId: clean(entry.questionId, 200), answer: clean(entry.answer, 20000), date: entry.date, rating: entry.rating, mistake: clean(entry.mistake), nextReviewDate: validDate(entry.nextReviewDate) ? entry.nextReviewDate : shift(entry.date, entry.rating === 'good' ? 4 : entry.rating === 'hard' ? 2 : 1) };
  }).filter(Boolean) };
}

export function nextLearningReview(attempts, entry) {
  if (!validDate(entry.date) || !['again', 'hard', 'good'].includes(entry.rating)) throw new TypeError('Wähle ein gültiges Datum und eine Einschätzung.');
  const previous = [...(attempts || [])].filter(item => item.subjectId === entry.subjectId && item.topic === entry.topic && item.id !== entry.id && item.date <= entry.date).sort((a, b) => b.date.localeCompare(a.date));
  let good = 0;
  for (const item of previous) { if (item.rating !== 'good') break; good++; }
  const interval = entry.rating === 'again' ? 1 : entry.rating === 'hard' ? 2 : [4, 7, 14, 28][Math.min(good, 3)];
  return shift(entry.date, interval);
}

export function saveLearningAttempt(state, input) {
  if (!input || !validDate(input.date) || !clean(input.topic, 200) || !['again', 'hard', 'good'].includes(input.rating)) throw new TypeError('Wähle ein Thema, ein Datum und deine Einschätzung.');
  const learning = normalizeLearning(state.learning);
  const entry = { ...input, id: input.id || identifier(), nextReviewDate: nextLearningReview(learning.attempts, input) };
  return { ...state, learning: normalizeLearning({ attempts: [...learning.attempts.filter(item => item.id !== entry.id), entry] }) };
}

export function removeLearningAttempt(state, id) {
  return { ...state, learning: { attempts: normalizeLearning(state.learning).attempts.filter(entry => entry.id !== id) } };
}

/** Only the latest evidence for a topic can require another review. */
export function getLearningReviews(data, today) {
  if (!validDate(today)) return [];
  const latest = new Map();
  for (const attempt of normalizeLearning(data.learning).attempts.filter(item => item.date <= today)) {
    const key = `${attempt.subjectId}:${attempt.topic}`;
    if (!latest.has(key) || latest.get(key).date <= attempt.date) latest.set(key, attempt);
  }
  return [...latest.values()].filter(item => item.nextReviewDate <= today).sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));
}

/** Largest-remainder allocation keeps even a five-minute session honest. */
export function allocateLearningPhases(minutes, phases) {
  const budget = Number.isFinite(Number(minutes)) ? Math.max(0, Math.min(720, Math.floor(Number(minutes)))) : 0;
  if (!budget || !phases?.length) return [];
  const total = phases.reduce((sum, phase) => sum + Math.max(0, phase.weight || 1), 0);
  const assigned = phases.map((phase, index) => {
    const exact = budget * Math.max(0, phase.weight || 1) / total;
    return { ...phase, index, minutes: Math.floor(exact), remainder: exact % 1 };
  });
  const order = [...assigned].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0, remaining = budget - assigned.reduce((sum, phase) => sum + phase.minutes, 0); i < remaining; i++) order[i % order.length].minutes++;
  return assigned.filter(phase => phase.minutes > 0).map(({ weight, index, remainder, ...phase }) => phase);
}

const RESOURCES = {
  math: [{ title: 'Serlo Mathematik', url: 'https://de.serlo.org/mathe', hint: 'Suche dort dein Thema und nutze Aufgaben mit Lösungen.' }],
  physics: [{ title: 'LEIFIphysik', url: 'https://www.leifiphysik.de/', hint: 'Wähle das passende Gebiet und vergleiche Modell, Einheiten und Lösungsweg.' }],
  german: [{ title: 'Dein Unterrichtstext', hint: 'Nutze für die Klausur den behandelten Text und die Kriterien deiner Lehrkraft.' }],
  ielts: [{ title: 'IELTS · offizielle Vorbereitung', url: 'https://ielts.org/', hint: 'Preparation resources → IELTS Academic. Nutze die aktuellen Aufgaben und Bewertungskriterien.' }, { title: 'British Council · IELTS', url: 'https://takeielts.britishcouncil.org/', hint: 'Prepare → kostenlose Academic-Übungen und Lösungen.' }],
  english: [{ title: 'Cambridge English', url: 'https://www.cambridgeenglish.org/', hint: 'Learning English → passende kostenlose Übungen; nicht jedes Material entspricht deiner Schulklausur.' }],
};

const mathExponential = minutes => {
  const count = Number(minutes) < 15 ? 1 : Number(minutes) < 30 ? 2 : 4;
  const number = count === 1 ? 'Eine' : count === 2 ? 'Zwei' : 'Vier';
  const content = {
  topic: 'math-exponential', objective: 'Vier Exponentialaufgaben lösen und jeden Rechenschritt prüfen.', expectedResult: 'Vier Lösungen mit Rechenweg und eine Regel für deinen häufigsten Fehler.', firstStep: 'Schreibe die Potenz- und Logarithmusregeln aus dem Gedächtnis auf.', method: 'Abrufen → rechnen → Fehler erklären',
  phaseActions: ['Rufe Potenz-, Ableitungs- und Logarithmusregeln ohne Hilfe ab.', 'Löse die Aufgaben unten. Rechne erst selbst, bevor du eine Lösung öffnest.', 'Vergleiche jeden Rechenschritt. Markiere die erste Stelle, an der dein Weg abweicht.', 'Notiere eine korrigierte Regel und löse die schwierigste Teilaufgabe erneut.'],
  questions: [
    { id: 'exp-values', prompt: 'Für f(x) = 3 · 2ˣ: Berechne f(0) und f(3). Was bedeutet die 3?', solution: 'f(0) = 3; f(3) = 24. Die 3 ist der Anfangswert bei x = 0.', explanation: '2⁰ = 1. Der Faktor vor der Potenz skaliert jeden Funktionswert.' },
    { id: 'exp-derivative', prompt: 'Leite f(x) = 5e⁰·⁴ˣ ab. Begründe den zusätzlichen Faktor.', solution: 'f′(x) = 2e⁰·⁴ˣ.', explanation: 'Die Kettenregel liefert 5 · 0,4 · e⁰·⁴ˣ. Die innere Ableitung ist 0,4.' },
    { id: 'exp-equation', prompt: 'Löse 2e⁰·⁵ˣ = 10 exakt und näherungsweise.', solution: 'x = 2 ln(5) ≈ 3,22.', explanation: 'Erst durch 2 teilen, dann logarithmieren: 0,5x = ln(5). Prüfe durch Einsetzen.' },
    { id: 'exp-growth', prompt: 'N(t) = 200e⁰·¹⁵ᵗ, t in Tagen. Berechne N(4) und die Verdopplungszeit.', solution: 'N(4) ≈ 364,42. Die Verdopplungszeit ist ln(2)/0,15 ≈ 4,62 Tage.', explanation: 'Für die Verdopplung gilt 400 = 200e⁰·¹⁵ᵗ. Das Modell ist kontinuierlich; runde erst am Ende.' },
  ], resources: RESOURCES.math,
  };
  return { ...content, objective: `${number} Exponentialaufgabe${count === 1 ? '' : 'n'} lösen und jeden Rechenschritt prüfen.`, expectedResult: `${number} Lösung${count === 1 ? '' : 'en'} mit Rechenweg und eine Regel für deinen häufigsten Fehler.`, questions: content.questions.slice(0, count) };
};

const physicsRC = minutes => {
  const count = Number(minutes) < 20 ? 1 : Number(minutes) < 30 ? 2 : 3;
  const number = count === 1 ? 'eine' : count === 2 ? 'zwei' : 'drei';
  const content = {
  topic: 'physics-rc', objective: 'Die Entladung eines Kondensators erklären und drei Aufgaben lösen.', expectedResult: 'Drei Rechnungen mit Einheiten und eine beschriftete Entladekurve.', firstStep: 'Skizziere einen geladenen Kondensator, der über einen Widerstand entladen wird.', method: 'Modell erklären → rechnen → Graph deuten',
  phaseActions: ['Erkläre den Entladevorgang ohne Formelsammlung und skizziere den Stromkreis.', 'Löse die drei Aufgaben. Schreibe vor jeder Rechnung die Größen in SI-Einheiten auf.', 'Prüfe Einheiten und Grenzwerte. Skizziere U(t) mit Anfangswert und Zeitkonstante.', 'Erkläre laut, warum die Spannung nicht linear fällt, und notiere eine offene Frage.'],
  questions: [
    { id: 'rc-tau', prompt: 'Ein idealer RC-Kreis hat R = 100 kΩ, C = 100 µF und U₀ = 12 V. Berechne τ und U(10 s).', solution: 'τ = RC = 10 s; U(10 s) = 12e⁻¹ V ≈ 4,41 V.', explanation: '100 kΩ = 100 000 Ω und 100 µF = 0,0001 F. Beim Entladen gilt U(t) = U₀e⁻ᵗ/ᴿᶜ.' },
    { id: 'rc-time', prompt: 'Wann ist die Spannung desselben Kondensators auf 3 V gefallen?', solution: 't = 10 ln(4) s ≈ 13,86 s.', explanation: '3/12 = e⁻ᵗ/¹⁰; logarithmieren ergibt t = −10 ln(1/4). Die Zeit muss positiv sein.' },
    { id: 'rc-energy', prompt: 'Berechne die anfängliche Energie und den Betrag des anfänglichen Entladestroms. Wie sieht der Spannungsgraph aus?', solution: 'E₀ = ½CU₀² = 0,0072 J = 7,2 mJ; |I₀| = U₀/R = 0,00012 A = 0,12 mA. U(t) fällt exponentiell von 12 V gegen 0 V.', explanation: 'Die Stromrichtung hängt von der Vorzeichenkonvention ab; hier ist der Betrag gefragt. Nach einer Zeitkonstante bleiben rund 36,8 % der Spannung, nicht null.' },
  ], resources: RESOURCES.physics,
  };
  return { ...content, objective: `Die Entladung eines Kondensators erklären und ${number} Aufgabe${count === 1 ? '' : 'n'} lösen.`, questions: content.questions.slice(0, count), expectedResult: `${count === 1 ? 'Eine Rechnung' : count === 2 ? 'Zwei Rechnungen' : 'Drei Rechnungen'} mit Einheiten und eine beschriftete Entladekurve.` };
};

const germanAnalysis = () => ({
  topic: 'de-analysis', objective: 'Einen Analyseabsatz mit Deutung, Beleg und Wirkung schreiben.', expectedResult: 'Ein überarbeiteter Absatz mit einer begründeten Deutung und einem kurzen Textbeleg.', firstStep: 'Lies den Übungstext zweimal. Markiere eine Stelle, die den inneren Konflikt zeigt.', method: 'Textbeleg → Deutung → gezielte Überarbeitung',
  passage: 'Vor der Tür blieb Mara stehen. Drinnen klirrten Tassen, und ihr Name fiel, als gehöre er jemand anderem. Sie strich den Zettel in ihrer Tasche glatt. Dann faltete sie ihn wieder, kleiner als zuvor. Als die Tür aufging, sagte sie: „Ich wollte nur kurz etwas abgeben.“ Den Zettel behielt sie in der Hand.',
  materialLabel: 'Eigener kurzer Übungstext · kein Auszug aus einem literarischen Werk',
  phaseActions: ['Lies den Text und formuliere eine Deutung zu Maras Zögern.', 'Schreibe einen Absatz: Aussage → kurzer Beleg → genaue Wirkung → Rückbezug.', 'Prüfe deinen Absatz anhand der Kriterien. Überarbeite die schwächste Begründung.', 'Notiere einen Satz, der durch die Überarbeitung genauer geworden ist.'],
  questions: [{ id: 'de-analysis-paragraph', prompt: 'Wie zeigt der Text Maras Unsicherheit? Erkläre die Funktion einer Handlung oder Formulierung, statt nur den Inhalt nachzuerzählen.', solution: 'Eine mögliche Deutung steht unter „Beispiel vergleichen“. Andere textnahe Deutungen sind möglich.', explanation: 'Der Textbeleg muss deine konkrete Behauptung stützen. Ein Stilmittel zu benennen reicht ohne Erklärung seiner Funktion nicht aus.' }],
  template: 'Der Text verdeutlicht … . Dies zeigt sich an „…“ . Die Formulierung / Handlung … bewirkt …, weil … . Dadurch wird … sichtbar.',
  criteria: ['Beantwortet die Deutung die Frage nach Maras Unsicherheit?', 'Ist ein kurzer Textbeleg korrekt in den eigenen Satz eingebaut?', 'Wird erklärt, wie das konkrete Wort oder die Handlung die Deutung stützt?', 'Geht der Absatz über eine Nacherzählung hinaus?', 'Sind Verbposition, Kommas und ungenaue Wörter überprüft?'],
  sampleAnswer: 'Maras Unsicherheit wird durch das wiederholte Falten des Zettels sichtbar. Zunächst streicht sie ihn glatt, faltet ihn dann aber „kleiner als zuvor“. Die gegensätzlichen Bewegungen lassen sich als Wechsel zwischen dem Wunsch zu sprechen und dem Rückzug davor lesen. Ihre anschließende Formulierung „nur kurz“ schwächt ihr Anliegen zusätzlich ab. Dass sie den Zettel schließlich in der Hand behält, zeigt, dass sie noch keine klare Entscheidung getroffen hat.',
  resources: RESOURCES.german,
});

function ieltsSession(data, task, today) {
  const content = `${task.ieltsSkill || task.skill || ''} ${task.learningTopic || ''} ${task.title || ''}`.toLowerCase();
  const skill = /listening|hör/.test(content) ? 'listening' : /reading|lesen/.test(content) ? 'reading' : /speaking|sprech/.test(content) ? 'speaking' : 'writing';
  const days = validDate(today) && validDate(data.ielts?.examDate) ? Math.round((Date.parse(`${data.ielts.examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY) : null;
  const light = days !== null && days >= 0 && days <= 1;
  const short = Number(task.minutes) < 45 || light;
  const practice = getIELTSPractice(skill, { days, minutes: task.minutes, mistakes: data.ielts?.mistakes?.[skill] || '' });
  const base = { topic: `ielts-${skill}${skill === 'writing' ? '-task2' : ''}`, resources: RESOURCES.ielts, materialLabel: 'Vorbereitung, keine offizielle Prüfung oder automatische Bandbewertung', method: skill === 'writing' ? 'Planen → zeitgebunden schreiben → Kriterien prüfen' : skill === 'speaking' ? 'Aufnehmen → anhören → gezielt wiederholen' : 'Offizielle Aufgabe → Lösung prüfen → Fehlermuster erkennen' };
  const skills = {
    writing: { objective: short ? 'Einen IELTS-Task-2-Absatz mit klarer Position und Begründung schreiben.' : 'Eine IELTS-Task-2-Antwort schreiben und an vier Kriterien prüfen.', expectedResult: short ? 'Eine Gliederung und ein überarbeiteter Argumentationsabsatz.' : 'Ein eigener Essay mit mindestens 250 Wörtern und einer konkreten Überarbeitung.', firstStep: 'Lies die Frage und markiere beide Positionen sowie den Arbeitsauftrag.', questions: [{ id: 'ielts-writing-task2', prompt: 'Some people think students should choose subjects that lead directly to a job. Others believe students should study what interests them. Discuss both views and give your own opinion.', solution: 'Es gibt keine einzige richtige Position. Behandle beide Ansichten, beantworte die Frage vollständig und begründe deine eigene Position mit konkreten Beispielen.', explanation: 'Eigene Übungsfrage im Task-2-Stil. Sie ist keine echte IELTS-Prüfungsfrage. Für eine vollständige Simulation sind mindestens 250 Wörter und ungefähr 40 Minuten für Task 2 vorgesehen.' }], phaseActions: ['Analysiere den Arbeitsauftrag und skizziere deine Position mit zwei Begründungen.', short ? 'Schreibe einen überzeugenden Hauptabsatz. Dies ist Teilaufgabenpraxis, keine vollständige Prüfungssimulation.' : 'Schreibe mindestens 250 Wörter. Trenne Position, Argumente und Gegenargument.', 'Prüfe die vier Kriterien. Markiere eine inhaltliche Lücke und einen wiederkehrenden Sprachfehler.', 'Überarbeite eine Stelle und notiere den Fehler für die nächste Einheit.'], criteria: ['Task Response: alle Teile der Frage beantwortet; Position und Gründe entwickelt?', 'Coherence and Cohesion: klarer Absatzaufbau und sinnvolle Verknüpfungen?', 'Lexical Resource: genaue Wortwahl statt unnötig komplizierter Wörter?', 'Grammatical Range and Accuracy: abwechslungsreiche, kontrollierte Sätze; Fehler überprüft?'] },
    listening: { objective: 'Eine offizielle IELTS-Listening-Teilaufgabe bearbeiten und Fehler erklären.', expectedResult: 'Geprüfte Antworten und ein konkretes Fehlermuster, etwa Ablenkung oder Schreibweise.', firstStep: 'Öffne eine kostenlose Listening-Übung mit Audio, Transkript und Lösung beim IELTS-Anbieter.', phaseActions: ['Lies die Fragen vor dem Audio und überlege, welche Art Antwort jeweils gesucht wird.', 'Bearbeite eine passende Teilaufgabe ohne Unterbrechung. Nutze die offiziellen Audiodateien.', 'Prüfe die Lösungen. Höre Fehlerstellen erneut und nutze erst dann das Transkript.', 'Notiere einen Hörfehler mit der richtigen Formulierung; wiederhole die Stelle ohne Transkript.'], questions: [], criteria: ['Antworten vor dem Transkript geprüft?', 'Wortbegrenzung und Schreibweise kontrolliert?', 'Für jeden Fehler die entscheidende Audiostelle gefunden?'] },
    reading: { objective: 'Eine IELTS-Academic-Reading-Teilaufgabe lösen und Belegstellen finden.', expectedResult: 'Geprüfte Antworten mit Textbelegen und eine erkennbare Fehlerursache.', firstStep: 'Öffne eine offizielle Academic-Reading-Übung mit Antwortschlüssel.', phaseActions: ['Überfliege Überschriften und Arbeitsauftrag. Wähle eine Teilaufgabe für die verfügbare Zeit.', 'Bearbeite die Fragen zeitgebunden. Markiere zu jeder Antwort die konkrete Belegstelle.', 'Vergleiche mit dem Antwortschlüssel. Prüfe besonders False / Not Given und umformulierte Aussagen.', 'Formuliere eine Regel für deinen häufigsten Fehler und löse eine falsche Antwort erneut.'], questions: [], criteria: ['Jede Antwort auf eine Textstelle gestützt?', 'Keine eigene Annahme als Textinformation behandelt?', 'Wortbegrenzung und Antwortformat eingehalten?'] },
    speaking: { objective: 'Eine IELTS-Speaking-Antwort aufnehmen und gezielt verbessern.', expectedResult: 'Eine eigene Aufnahme, ein erkanntes Sprachmuster und eine verbesserte zweite Antwort.', firstStep: 'Nutze die Sprachmemo-App. Bereite eine Minute lang Stichwörter vor, keine auswendig gelernten Sätze.', questions: [{ id: 'ielts-speaking-project', prompt: 'Describe a project you enjoyed working on. Say what it was, what you did, who was involved, and why it mattered to you. Speak for up to two minutes. Then explain what you would do differently next time.', solution: 'Beantworte die Teilfragen mit tatsächlichen Erfahrungen und konkreten Einzelheiten. Es gibt keine Musterbiografie und keine automatische richtige Antwort.', explanation: 'Eigene Übung im Stil von Speaking Part 2 mit einer Folgefrage. Nutze deine echten Erfahrungen; erfinde keine Leistungen.' }], phaseActions: ['Sammle Stichwörter zu einer eigenen Erfahrung und ordne sie logisch.', 'Nimm deine Antwort auf. Sprich ohne vorgelesenen Text; beantworte anschließend die Folgefrage.', 'Höre die Aufnahme. Notiere stockende Stellen, ungenaue Wörter oder schwer verständliche Aussprache.', 'Sprich die Antwort erneut, ohne sie auswendig zu lernen. Verbessere ein konkretes Muster.'], criteria: ['Fluency and Coherence: nachvollziehbar gesprochen und Gedanken verbunden?', 'Lexical Resource: Beispiele und genaue Wörter verwendet?', 'Grammatical Range and Accuracy: Sätze bewusst variiert und häufige Fehler bemerkt?', 'Pronunciation: verständlich gesprochen; Betonung und Wortgrenzen geprüft?'] },
  };
  return { ...base, ...skills[skill], skill, ...(light ? { objective: practice.title, expectedResult: practice.expectedResult, firstStep: 'Nutze bekannte, bereits korrigierte Aufgaben. Bewahre heute Zeit für Erholung.', questions: [] } : {}), phases: practice.steps.map(step => ({ title: step.title, minutes: step.minutes, action: step.instruction })) };
}

const subjectName = value => ({ mathematics: 'Mathematik', physics: 'Physik', german: 'Deutsch', english: 'Englisch', history: 'Geschichte', politics: 'Politik / Wirtschaft', 'computer-science': 'Informatik', art: 'Kunst', religion: 'Religion', sport: 'Sport' }[value]);

function sessionContent(data, task, today) {
  const subject = data.subjects?.find(item => item.id === task.subjectId);
  const content = `${task.learningTopic || ''} ${task.title || ''} ${task.reason || ''} ${task.steps?.join(' ') || ''} ${subject?.name || ''}`.toLowerCase();
  if (task.ieltsSkill) return ieltsSession(data, task, today);
  if (task.roadmapStepId || task.eventStage || ['university', 'activity', 'review'].includes(task.category)) return {
    topic: `action:${task.roadmapStepId || task.eventId || task.category || 'personal'}`, objective: task.objective || task.title, expectedResult: task.expectedResult || (task.category === 'activity' ? 'Eine konkrete Verantwortung oder Leistung mit ehrlichem Beleg im Profil.' : 'Ein überprüfbares Ergebnis und ein klarer nächster Schritt.'), firstStep: task.steps?.[0] || 'Öffne die zugehörigen Unterlagen und lege ein konkretes Ergebnis fest.', phaseActions: task.steps?.length ? task.steps : ['Prüfe den aktuellen Stand und die verlässliche Quelle.', 'Erledige genau die beschriebene Handlung.', 'Sichere das tatsächliche Ergebnis mit Quelle oder Notiz.', 'Notiere den nächsten Schritt.'], questions: [], resources: [], method: 'Eine konkrete Handlung mit überprüfbarem Ergebnis', provisional: false,
  };
  if (/ielts/.test(content)) return ieltsSession(data, task, today);
  if (['timed', 'mistakes', 'light', 'explain', 'questions', 'interpret'].includes(task.revisionStage)) {
    const stages = {
      timed: ['Eine passende Prüfungsaufgabe unter Zeitbedingungen bearbeiten.', 'Dein eigener Lösungsversuch ohne Hilfen; die Auswertung folgt danach.'],
      mistakes: ['Zwei eigene Fehler erklären und die Aufgaben erneut lösen.', 'Zwei korrigierte Lösungswege und eine Regel je Fehler.'],
      light: ['Wichtige Inhalte ruhig abrufen und nur Unsicheres prüfen.', 'Eine kurze Liste sicherer Inhalte und höchstens zwei offene Fragen.'],
      explain: ['Ein Kursthema ohne Notizen verständlich erklären.', 'Eine eigene Erklärung mit Beispiel und einer geklärten Lücke.'],
      questions: ['Mögliche Prüfungsfragen laut und mit Begründung beantworten.', 'Eigene Antworten mit Aussage, Beleg und einem passenden Beispiel.'],
      interpret: ['Ein Ergebnis oder einen Textbeleg sachlich deuten.', 'Eine begründete Deutung mit benannter Grenze oder Unsicherheit.'],
    };
    const [objective, expectedResult] = stages[task.revisionStage];
    const exercise = getExercise(task, data);
    const recentNote = exercise.recentNotes?.[0]?.notes;
    const firstStep = task.revisionStage === 'mistakes' && recentNote ? `Beginne mit deiner eigenen Fehlernotiz: ${recentNote}` : 'Nutze eine passende Aufgabe und die besprochenen Kriterien aus deinem aktuellen Kurs.';
    const phaseActions = task.revisionStage === 'light' ? ['Rufe die wichtigsten Begriffe ohne Notizen ab.', 'Prüfe nur die unsicheren Stellen im Unterrichtsmaterial. Beginne kein neues großes Thema.', 'Beantworte höchstens zwei offene Fragen und lege die Prüfungsunterlagen bereit.', 'Beende die Einheit rechtzeitig und bewahre Zeit für Erholung.'] : [firstStep, task.revisionStage === 'mistakes' ? 'Erkläre die erste fehlerhafte Stelle. Löse die zwei Aufgaben erneut ohne die Musterlösung.' : task.steps?.[1] || 'Bearbeite die ausgewählte Aufgabe selbstständig und begründe deine Schritte.', 'Vergleiche mit der besprochenen Lösung oder bitte deine Lehrkraft um gezielte Rückmeldung.', 'Sichere eine konkrete Verbesserung und die nächste offene Frage.'];
    return { topic: task.learningTopic || `revision:${task.subjectId || 'school'}:${task.examId || task.revisionStage}`, objective, expectedResult, firstStep, method: task.revisionStage === 'timed' ? 'Zeitgebundene Prüfungspraxis' : task.revisionStage === 'mistakes' ? 'Fehleranalyse und erneuter Versuch' : 'Gezieltes Abrufen und Prüfen', phaseActions, questions: [], resources: [{ title: 'Dein Unterrichtsmaterial', hint: 'Nutze echte Aufgaben und die Kriterien deiner Lehrkraft. Ein kurzer Ausschnitt ist keine vollständige Prüfungssimulation.' }], provisional: false, ...(task.revisionStage === 'timed' ? { phases: [{ title: Number(task.minutes) >= 60 ? 'Unter Prüfungsbedingungen' : 'Zeitgebundene Teilaufgabe', minutes: Math.max(0, Math.floor(Number(task.minutes) || 0)), action: `Bearbeite eine passende Aufgabe aus deinem Kurs ohne Notizen für ${task.minutes} Minuten. Prüfe vorher, ob diese Zeit für die gesamte Aufgabe reicht; sonst wähle eine klar begrenzte Teilaufgabe. Plane die gründliche Fehlerauswertung als nächste Einheit.` }] } : {}) };
  }
  if ((!task.subjectId || task.subjectId === 'mathematics') && /math-exponential|exponential|exponentialfunktion|wachstumsfunktion/.test(content)) return mathExponential(task.minutes);
  if ((!task.subjectId || task.subjectId === 'physics') && /physics-rc|rc.?kreis|rc.?circuit|entlad|discharge/.test(content) && !/auflad|\bcharging\b|\bcharge\b/.test(content)) return physicsRC(task.minutes);
  const exercise = getExercise(task, data);
  const isGerman = task.subjectId === 'german' || (!task.subjectId && /german|deutsch|de-analysis/.test(content));
  if (isGerman && /gramma|komma|satzbau|konjunktiv/i.test(task.title || '')) return { topic: task.learningTopic || 'de-grammar', objective: 'Eine aktuelle Sprachregel anwenden und eigene Sätze überarbeiten.', expectedResult: 'Drei geprüfte eigene Sätze und eine verständlich notierte Regel.', firstStep: 'Wähle eine unsichere Regel aus deinem Unterricht oder einem korrigierten eigenen Text.', method: 'Fehleranalyse und gezielte Anwendung', phaseActions: ['Erkläre die Regel ohne Hilfe und prüfe sie dann im Unterrichtsmaterial.', 'Überarbeite drei eigene Sätze und begründe jede Änderung.', 'Vergleiche mit der besprochenen Regel oder bitte um gezielte Rückmeldung.', 'Notiere eine eigene Merkhilfe und wiederhole einen Satz ohne Hilfe.'], questions: [], resources: RESOURCES.german, provisional: true };
  if (isGerman && !exercise.words && !['timed', 'mistakes', 'light', 'explain', 'questions', 'interpret'].includes(task.revisionStage) && !/gramma|komma|zusammenfass|inhaltsangabe/i.test(task.title || '')) return germanAnalysis();
  const language = task.subjectId === 'english' || task.subjectId === 'german' || /english|englisch|german|deutsch/.test(content);
  const topic = task.learningTopic || (language ? `${isGerman ? 'de' : 'en'}-${exercise.words ? 'vocabulary' : /summary|zusammenfass|inhaltsangabe/i.test(task.title || '') ? 'summary' : /comment|argument/i.test(task.title || '') ? 'comment' : 'analysis'}` : `general:${task.subjectId || 'academic'}:${subject?.weakTopics?.[0] || 'current-topic'}`);
  const specific = Boolean(exercise.passage || exercise.words || exercise.answer);
  const title = task.objective || task.title || 'Eine konkrete Aufgabe aus dem Unterricht bearbeiten.';
  const objective = exercise.words ? `${exercise.words.length} Ausdrücke aktiv abrufen und in eigenen Sätzen verwenden.` : task.subjectId === 'english' && exercise.passage ? /summary/i.test(task.title || '') ? 'Den Übungstext knapp und neutral auf Englisch zusammenfassen.' : /comment|argument/i.test(task.title || '') ? 'Eine begründete englische Stellungnahme mit Gegenargument schreiben.' : 'Einen englischen Analyseabsatz mit Aussage, Beleg und Erklärung schreiben.' : title;
  return {
    topic, objective, expectedResult: task.expectedResult || (exercise.words ? 'Eigene Beispielsätze und eine Liste unsicherer Ausdrücke.' : exercise.passage ? 'Ein selbst geschriebener, anhand der Kriterien überarbeiteter Absatz.' : exercise.answer ? 'Ein vollständiger Rechenweg mit begründeter Korrektur.' : 'Eine selbst gelöste Unterrichtsaufgabe und ein erklärter Fehler.'),
    firstStep: exercise.words ? 'Decke die Bedeutungen ab und rufe sie ohne Hilfe ab.' : exercise.passage ? 'Lies den Text und markiere die Stelle, die deine zentrale Aussage stützt.' : 'Nimm eine passende Aufgabe aus dem aktuellen Unterricht und versuche den ersten Schritt ohne Notizen.',
    method: exercise.words ? 'Aktives Abrufen und eigene Anwendung' : exercise.passage ? 'Schreiben mit Kriterien und Überarbeitung' : task.revisionStage === 'mistakes' ? 'Fehleranalyse und erneuter Versuch' : 'Abrufen → gezielte Praxis → Selbstprüfung',
    phaseActions: [exercise.words ? 'Rufe die Bedeutungen ohne Hilfe ab.' : 'Rufe wichtige Begriffe oder Regeln ab und kläre den genauen Arbeitsauftrag.', exercise.prompt || 'Bearbeite die ausgewählte Aufgabe selbstständig.', 'Vergleiche mit der Lösung oder den Kriterien deiner Lehrkraft. Erkläre eine Abweichung.', 'Notiere eine konkrete Verbesserung und versuche die schwierige Stelle erneut.'],
    questions: exercise.answer ? [{ id: `${topic}-practice`, prompt: exercise.prompt, solution: exercise.answer, explanation: 'Vergleiche den Lösungsweg, nicht nur das Ergebnis. Prüfe Einheiten, Voraussetzungen und jeden Rechenschritt.' }] : exercise.passage ? [{ id: `${topic}-writing`, prompt: exercise.prompt, solution: 'Nutze die Kriterien und gegebenenfalls das Beispiel. Andere begründete Antworten sind möglich.', explanation: 'Dies ist eine Selbstprüfung; eine Lehrkraft kann dir gezieltes Feedback geben.' }] : [],
    passage: exercise.passage, words: exercise.words, criteria: exercise.reviewCriteria?.map(item => `${item.label}: ${item.hint}`), sampleAnswer: exercise.sampleAnswer, materialLabel: exercise.passage ? 'Eigener Übungstext · für konkrete Klausuren auch Unterrichtsmaterial verwenden' : undefined,
    resources: task.subjectId === 'mathematics' ? RESOURCES.math : task.subjectId === 'physics' ? RESOURCES.physics : isGerman ? RESOURCES.german : language ? RESOURCES.english : [{ title: 'Unterrichtsmaterial', hint: 'Wähle eine passende Aufgabe mit einer überprüfbaren Lösung oder frage deine Lehrkraft.' }],
    provisional: !specific,
  };
}

export function getGuidedSession(data = {}, task = {}, today = task.date) {
  const content = sessionContent(data, task, today);
  const subject = subjectName(task.subjectId) || data.subjects?.find(item => item.id === task.subjectId)?.name || (task.ieltsSkill || /ielts/i.test(task.title || '') ? 'IELTS Academic' : ['university', 'activity'].includes(task.category) ? 'Universität & Profil' : 'Dein nächster Schritt');
  const weights = [1, 4, 2, 1];
  const phases = content.phases || allocateLearningPhases(task.minutes, ['Abrufen & planen', 'Selbst bearbeiten', 'Prüfen & verstehen', 'Sichern & wiederholen'].map((title, index) => ({ title, weight: weights[index], action: content.phaseActions[index] || content.phaseActions.at(-1) })));
  const attempts = normalizeLearning(data.learning).attempts.filter(item => item.subjectId === (task.subjectId || '') && item.topic === content.topic && (!validDate(today) || item.date <= today));
  const recent = attempts.slice().reverse().sort((a, b) => b.date.localeCompare(a.date));
  const struggles = recent.slice(0, 5).filter(item => ['again', 'hard'].includes(item.rating));
  const differentSessions = new Set(struggles.map(item => item.taskId || item.date));
  const helpRecommendation = differentSessions.size >= 3 && recent[0]?.rating !== 'good' ? 'Dieses Thema war in mindestens drei Einheiten noch unsicher. Zeige deiner Lehrkraft genau diese Fehlerstelle und bitte um einen erklärten Lösungsweg. Eine Lerngruppe kann den erneuten Versuch begleiten.' : '';
  const reviewDate = recent[0]?.nextReviewDate || (validDate(today) ? shift(today, 1) : '');
  return { ...content, id: content.topic, subject, why: task.reason || 'Diese gezielte Einheit stärkt eine Fähigkeit, die du für deine nächsten Leistungen brauchst.', phases, reviewDate, helpRecommendation, latestAttempt: recent[0] || null };
}

export function getTaskLearningMetadata(task, data = {}, today = task.date) {
  const session = getGuidedSession(data, task, today);
  return { learningTopic: session.topic, objective: session.objective, expectedResult: session.expectedResult };
}
