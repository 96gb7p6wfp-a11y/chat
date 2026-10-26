/** Small, authored practice units. Matching a topic never invents a syllabus. */
import { getCurrentLearningTopics } from './curriculum.js';
import { RECOVERY_TUTOR_UNITS } from './recovery.js';
const clean = (value, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const answerText = (value, max = 5000) => typeof value === 'string' ? value.slice(0, max) : '';
const stamp = value => typeof value === 'string' && value.includes('T') && Number.isFinite(Date.parse(value)) ? value : null;
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const SUBJECTS = { mathematics: 'Mathematik', physics: 'Physik', german: 'Deutsch', english: 'Englisch', ielts: 'IELTS Academic', sat: 'SAT' };
export const TUTOR_STAGES = ['intro', 'learn', 'practice', 'check', 'review', 'done'];
const mapText = (value, max = 5000) => Object.fromEntries(Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {}).slice(0, 100).filter(([key, text]) => key && key.length <= 200 && typeof text === 'string').map(([key, text]) => [key, answerText(text, max)]));
export function normalizeTutorSessions(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).slice(0, 1000).flatMap(input => {
    if (!input || typeof input !== 'object') return [];
    const taskId = clean(input.taskId, 200), id = clean(input.id, 200) || taskId;
    if (!id || !taskId || seen.has(taskId)) return [];
    seen.add(taskId);
    return [{ id, taskId, unitId: clean(input.unitId, 200), stage: TUTOR_STAGES.includes(input.stage) ? input.stage : 'intro', questionIndex: Number.isInteger(input.questionIndex) ? Math.max(0, Math.min(99, input.questionIndex)) : 0,
      answers: mapText(input.answers), reviewAnswers: mapText(input.reviewAnswers), revealed: [...new Set((Array.isArray(input.revealed) ? input.revealed : []).filter(item => typeof item === 'string' && item.length > 0 && item.length <= 200))].slice(0, 100),
      checks: Object.fromEntries(Object.entries(input.checks && typeof input.checks === 'object' && !Array.isArray(input.checks) ? input.checks : {}).slice(0, 100).filter(([key, rating]) => key && key.length <= 200 && ['again', 'hard', 'good'].includes(rating))), mistakes: mapText(input.mistakes, 2000),
      startedAt: stamp(input.startedAt), completedAt: stamp(input.completedAt), updatedAt: stamp(input.updatedAt),
    }];
  });
}

const resources = {
  mathematics: [{ title: 'Serlo · Mathematik', url: 'https://de.serlo.org/mathe', hint: 'Zusätzliche Aufgaben zum gewählten Thema suchen.' }],
  physics: [{ title: 'LEIFIphysik', url: 'https://www.leifiphysik.de/', hint: 'Zusätzliche Erklärungen zum gewählten physikalischen Modell.' }],
  english: [{ title: 'Cambridge English · Lernmaterial', url: 'https://www.cambridgeenglish.org/learning-english/', hint: 'Zusätzliche Sprachübungen; die Texte und Fragen in der App sind selbst verfasst.' }],
  german: [],
  ielts: [{ title: 'IELTS · offizielle Vorbereitung', url: 'https://ielts.org/take-a-test/preparation-resources', hint: 'Originalmaterial und aktuelle Bewertungskriterien. Die App-Übungen sind selbst verfasst.' }],
  sat: [{ title: 'College Board · Student Question Bank', url: 'https://satsuite.collegeboard.org/practice/student-question-bank', hint: 'Offizielle zusätzliche Aufgaben mit Erklärungen.' }],
};
const q = (id, prompt, solution, explanation, extra = {}) => ({ id, prompt, solution, explanation, kind: 'text', ...extra });
const UNITS = [
  ...RECOVERY_TUTOR_UNITS,
  {
    id: 'english-civil-rights-brown', subjectId: 'english', title: 'Civil Rights · Brown v. Board of Education', description: 'Entscheidung, Verfassungsgrund und historische Wirkung erklären.', match: /civil.?rights|bürgerrecht|brown\s*(v\.?|versus)?\s*board|segregation|desegregation/,
    objective: 'Die Entscheidung von 1954 in drei klaren englischen Antworten erklären.',
    explanation: 'Brown v. Board of Education was a unanimous U.S. Supreme Court decision in 1954. The Court held that racial segregation in public schools violated the Equal Protection Clause of the Fourteenth Amendment. It rejected the claim that separate public schools could provide equal educational opportunities. The ruling challenged legally enforced school segregation, but it did not make every school integrated immediately. Resistance, further court decisions and organised activism continued. The case became an important legal milestone in the Civil Rights Movement.\n\nVocabulary: ruling = Gerichtsentscheidung; equal protection = gleicher Schutz durch das Gesetz; desegregation = Aufhebung der Rassentrennung.',
    materialLabel: 'Eigener englischer Lerntext · historische Sachübung',
    resources: [{ title: 'National Archives · Brown v. Board of Education', url: 'https://www.archives.gov/milestone-documents/brown-v-board-of-education', hint: 'Entscheidung und historischer Kontext.' }],
    questions: [
      q('brown-decision', 'What did the Supreme Court decide in Brown v. Board of Education in 1954? Answer in one or two sentences.', 'The Court decided that racial segregation in public schools was unconstitutional. Separate public schools were inherently unequal.', 'Nenne öffentliche Schulen und staatlich durchgesetzte Rassentrennung. Die Entscheidung bezog sich nicht auf ein sofortiges Ende jeder Form von Diskriminierung.', { criteria: ['Öffentliche Schulen genannt?', 'Rassentrennung als verfassungswidrig erklärt?'], hint: 'Begin with: “The Court ruled that …”', followUp: 'Erkläre die Entscheidung erneut in einem einzigen Satz ohne Text.' }),
      q('brown-constitution', 'Which constitutional principle did the segregated schools violate, and why was “separate” not considered equal?', 'They violated the Equal Protection Clause of the Fourteenth Amendment. Separating children in public schools on the basis of race denied equal educational protection; separation itself could not be treated as an equal educational arrangement.', 'Der Verfassungsgrund ist Equal Protection, nicht Meinungsfreiheit oder Wahlrecht. Der Kern der Entscheidung war nicht nur ein Vergleich von Gebäuden oder Schulbudgets.', { criteria: ['Fourteenth Amendment / Equal Protection genannt?', 'Erklärt, weshalb Trennung selbst das Gleichheitsprinzip verletzt?'], hint: 'Connect the legal principle with the effect of separating pupils.' }),
      q('brown-impact', 'Why was Brown important for the Civil Rights Movement, even though schools did not all integrate immediately?', 'It undermined the legal justification for segregated public education and gave civil-rights campaigners a major legal precedent. Implementation still faced resistance and required further legal action and activism.', 'Unterscheide rechtliche Bedeutung von tatsächlicher Umsetzung. Eine starke Antwort benennt sowohl den Fortschritt als auch eine Grenze.', { criteria: ['Rechtlichen Fortschritt benannt?', 'Widerstand / weitere Umsetzung erklärt?'], followUp: 'Formuliere den Unterschied zwischen einer Rechtsentscheidung und ihrer Umsetzung.' }),
    ], reviewPrompt: 'Schließe den Lerntext. Erkläre Entscheidung, Verfassungsgrund und eine Grenze der Umsetzung jeweils in einem Satz.',
  },
  {
    id: 'english-american-dream', subjectId: 'english', title: 'American Dream · Chancen und Grenzen', description: 'Einen kurzen Text zusammenfassen und einen Gegensatz erklären.', match: /american.?dream|social.?mobility|chancengleichheit/,
    objective: 'Die Spannung zwischen persönlichem Einsatz und ungleichen Startbedingungen erklären.',
    explanation: 'The American Dream is often associated with the belief that people can improve their lives through effort and opportunity. An analysis should distinguish this ideal from a claim that everyone actually starts with the same resources. Support your interpretation with the text; do not assume that a writer rejects effort simply because they describe structural barriers.\n\nVocabulary: upward mobility = sozialer Aufstieg; opportunity = Chance; barrier = Hindernis.',
    passage: 'When Elena opened the acceptance letter, her father called it proof that hard work always pays off. Elena smiled, remembering the evening shifts she had worked after school. Yet she also remembered the teacher who had found a fee waiver and the neighbour who had lent her a laptop. The letter was hers, but the path to it had never been hers alone.',
    materialLabel: 'Eigener Übungstext · keine Darstellung deiner Biografie',
    questions: [
      q('dream-summary', 'Summarise Elena’s situation in two neutral English sentences. Do not add your opinion.', 'Elena receives an acceptance letter after combining school with paid work. She recognises that her effort mattered, but support from other people also helped her reach this point.', 'Eine Zusammenfassung bleibt im Präsens, nennt die Kernaussage und verzichtet auf Bewertung oder erfundene Details.', { criteria: ['Neutral und im Präsens?', 'Eigenleistung und Unterstützung beide erfasst?'] }),
      q('dream-contrast', 'Explain the effect of the contrast between “hers” and “never been hers alone”. Use one quotation.', 'The contrast recognises Elena’s personal achievement while questioning the idea that success depends only on individual effort. The phrase “never been hers alone” makes the support behind the achievement visible.', 'Erkläre den Gegensatz und seine Funktion. “The writer uses contrast” allein reicht nicht.', { hint: 'Claim → quotation → what this changes about the reader’s view.', followUp: 'Schreibe einen zusätzlichen Satz: Welche vereinfachte Vorstellung von Erfolg wird eingeschränkt?' }),
    ], reviewPrompt: 'Erkläre ohne Vorlage: Welche Rolle spielen Eigenleistung und Unterstützung im Text?',
  },
  {
    id: 'english-analysis-paragraph', subjectId: 'english', title: 'English · Einen Analyseabsatz schreiben', description: 'Aussage, Textbeleg und Wirkung an einem kurzen Originaltext üben.', match: /^(?:en-analysis|english-analysis|analyse|analysis|rhetorical analysis|text analysis|textanalyse|analyseabsatz|rhetorik|textbelege?)$/,
    objective: 'Eine sprachliche Entscheidung mit einem Textbeleg und ihrer Wirkung erklären.',
    explanation: 'A useful analysis paragraph links three things: a claim about the writer’s intention, a short quotation and an explanation of how that wording shapes the reader’s response. Naming a technique is only the beginning. Ask what changes if the writer uses a neutral alternative. Use cautious language when the text supports several interpretations: “suggests” or “emphasises” is often more precise than “proves”.',
    passage: 'Our school celebrates every new device as a leap into the future. But a faster screen does not automatically create a clearer thought. If we want technology to improve learning, we must ask what students can do with it—not simply how quickly they can open it.',
    materialLabel: 'Eigener englischer Übungstext',
    questions: [
      q('analysis-claim', 'What attitude towards technology does the writer express? Support your answer with one short quotation.', 'The writer supports a thoughtful use of technology rather than assuming that new devices automatically improve learning. The contrast between a “faster screen” and a “clearer thought” questions the connection between speed and understanding.', 'Eine differenzierte Antwort erkennt die Bedingung: Der Text lehnt Technik nicht pauschal ab.', { criteria: ['Haltung differenziert benannt?', 'Passenden kurzen Beleg verwendet?'] }),
      q('analysis-paragraph', 'Write a 70–100-word analysis paragraph explaining the contrast between “a faster screen” and “a clearer thought”.', 'The writer contrasts technological speed with the quality of thinking to challenge an automatic belief in progress. While a “faster screen” suggests efficiency, a “clearer thought” refers to understanding, which a device cannot guarantee. The parallel phrasing makes the difference easy to recognise. It encourages readers to judge technology by its educational purpose rather than its novelty. This prepares the final demand to ask what students can actually do with their devices.', 'Dies ist eine mögliche Antwort, keine einzig richtige Deutung. Prüfe besonders die Verbindung zwischen konkretem Wortlaut, Wirkung und Gesamtargument.', { criteria: ['Klare Aussage am Anfang?', 'Kurzen Beleg grammatisch eingebaut?', 'Wirkung erklärt, statt nur Inhalt wiederholt?', 'Rückbezug zur Haltung des Textes?'], hint: 'The writer contrasts … with … . This suggests … because … .', followUp: 'Ersetze den ungenauesten Satz durch eine Erklärung mit “because”.' }),
    ], reviewPrompt: 'Decke die Musterantwort ab. Schreibe deinen schwächsten Erklärungssatz erneut und verbinde Beleg und Wirkung.',
  },
  {
    id: 'english-comment-argument', subjectId: 'english', title: 'English · Ein begründetes Argument', description: 'Position, Beispiel und Gegenargument für einen Comment entwickeln.', match: /^(?:en-comment|comment|comment writing|argumentation|argument|stellungnahme|opinion|opinion writing)$/,
    objective: 'Ein englisches Argument mit konkretem Beispiel und begrenztem Gegenargument schreiben.',
    explanation: 'An effective comment states a position and explains why it is reasonable. A paragraph should include a reason, a concrete example and a sentence connecting the example to the claim. Address a strong counterargument fairly; then explain which condition or trade-off supports your view. Avoid unsupported words such as “everyone” and “always”.',
    questions: [
      q('comment-plan', 'Should students be allowed to use smartphones during lessons? Write your position, one reason, one concrete example and one counterargument as four short notes.', 'One possible plan: allow phones for teacher-directed tasks; useful tools can support learning; a class uses a dictionary to compare precise meanings; unrestricted access can distract students. The condition is that the teacher defines a task and an end point.', 'Es gibt keine vorgeschriebene Meinung. Entscheidend sind ein passendes Beispiel und eine ernsthafte Gegenposition.', { criteria: ['Position klar?', 'Beispiel erklärt den Grund?', 'Gegenargument fair wiedergegeben?'] }),
      q('comment-paragraph', 'Write a 90–120-word paragraph defending your position. Include one sentence that responds to the counterargument.', 'Phones should be allowed when the teacher assigns a clear task. A dictionary or a quick source check can help students solve a specific problem instead of waiting for missing information. For example, comparing two meanings of a word can make an interpretation more accurate. Critics are right that unrestricted access encourages distraction. However, this supports clear limits rather than a ban on every educational use. Students should know when to open a device, what result to produce and when to put it away.', 'Die Beispielantwort ist eine mögliche Position. Vergleiche Struktur und Begründung, nicht deine Meinung mit einer vermeintlich richtigen Meinung.', { criteria: ['Position und Grund verbunden?', 'Konkretes Beispiel genutzt?', 'Gegenargument beantwortet?', 'Pauschale Aussagen vermieden?'], followUp: 'Streiche einen allgemeinen Satz und ersetze ihn durch ein konkretes Beispiel.' }),
    ], reviewPrompt: 'Formuliere dein Argument mündlich in vier Sätzen: Position, Grund, Beispiel, Einschränkung.',
  },
  {
    id: 'mathematics-exponential', subjectId: 'mathematics', title: 'Mathematik · Exponentialfunktionen', description: 'Funktionswerte, Kettenregel und logarithmisches Lösen.', match: /math-exponential|exponential|wachstum|logarithm|e-funktion/,
    objective: 'Exponentialaufgaben mit nachvollziehbarem Rechenweg lösen.',
    explanation: 'Bei f(x) = a · e^(kx) ist a der Wert bei x = 0. Die Ableitung lautet f′(x) = a · k · e^(kx), weil die innere Ableitung k durch die Kettenregel hinzukommt. Um a · e^(kx) = b zu lösen, teile zuerst durch a und logarithmiere dann: kx = ln(b/a). Prüfe vor dem Logarithmieren, ob b/a positiv ist.',
    questions: [
      q('exp-values', 'Für f(x) = 3 · 2^x: Berechne f(0) und f(3). Erkläre die Bedeutung der 3.', 'f(0) = 3; f(3) = 24. Die 3 ist der Anfangswert f(0).', '2^0 = 1, nicht 0. Schreibe die eingesetzten Werte vor der Ausrechnung auf.', { hint: 'Setze die beiden x-Werte getrennt ein.', followUp: 'Berechne f(−1) und prüfe, ob dein Ergebnis zum Wachstum passt.' }),
      q('exp-derivative', 'Leite f(x) = 5e^(0,4x) ab. Begründe jeden Faktor.', 'f′(x) = 2e^(0,4x).', 'Die Kettenregel ergibt 5 · 0,4 · e^(0,4x). Der Exponent bleibt gleich; sein innerer Faktor wird zusätzlich multipliziert.', { hint: 'Äußere Ableitung × innere Ableitung.', followUp: 'Leite g(x) = 3e^(−2x) ab. Kontrolle: g′(x) = −6e^(−2x).' }),
      q('exp-equation', 'Löse 2e^(0,5x) = 10 exakt und auf zwei Nachkommastellen.', 'x = 2 ln(5) ≈ 3,22.', 'Durch 2 teilen: e^(0,5x) = 5. Dann 0,5x = ln(5). Zuletzt durch 0,5 teilen. Probe: 2e^(ln 5) = 10.', { hint: 'Den Faktor vor e zuerst entfernen.', followUp: 'Löse 3e^(2x) = 12. Kontrolle: x = ln(4)/2 ≈ 0,69.' }),
      q('exp-growth', 'N(t) = 200e^(0,15t), t in Tagen. Berechne N(4) und die Verdopplungszeit.', 'N(4) ≈ 364,42. Verdopplungszeit: t = ln(2)/0,15 ≈ 4,62 Tage.', 'Verdopplung bedeutet N(t) = 400, nicht t = 2. Teile die Gleichung durch 200 und logarithmiere. Runde erst am Ende.', { followUp: 'Was ändert sich an der Verdopplungszeit, wenn der Anfangswert 500 statt 200 beträgt? Kontrolle: nichts.' }),
    ], reviewPrompt: 'Löse die Gleichung, bei der dein erster Fehler entstand, ohne Musterlösung erneut. Notiere die korrigierte Regel.',
  },
  {
    id: 'mathematics-integration', subjectId: 'mathematics', title: 'Mathematik · Integrale sicher berechnen', description: 'Stammfunktion, bestimmtes Integral und Flächeninhalt unterscheiden.', match: /integrat|integral|stammfunktion|flächeninhalt|flaecheninhalt/,
    objective: 'Drei Integralaufgaben mit Stammfunktion und korrekter Interpretation lösen.',
    explanation: 'Eine Stammfunktion F erfüllt F′ = f. Für Potenzen gilt ∫x^n dx = x^(n+1)/(n+1) + C, wenn n ≠ −1. Ein bestimmtes Integral berechnest du mit F(b) − F(a). Es misst eine vorzeichenbehaftete Bilanz. Für einen geometrischen Flächeninhalt musst du an Nullstellen aufteilen und die Beträge der Teilintegrale addieren.',
    questions: [
      q('integral-primitive', 'Bestimme alle Stammfunktionen von f(x) = 3x² − 4x + 2. Prüfe durch Ableiten.', 'F(x) = x³ − 2x² + 2x + C.', 'Erhöhe bei jeder Potenz den Exponenten um 1 und teile durch den neuen Exponenten. Die Konstante C beschreibt alle Stammfunktionen.', { hint: 'Integriere die drei Summanden getrennt.', followUp: 'Bestimme eine Stammfunktion zu 4x³ − 6x. Kontrolle: x⁴ − 3x² + C.' }),
      q('integral-bounds', 'Berechne ∫ von 0 bis 2 x² dx exakt. Schreibe die Auswertung der Grenzen auf.', 'F(x) = x³/3; F(2) − F(0) = 8/3.', 'Die Grenzen werden in die Stammfunktion eingesetzt, nicht in x². F(b) − F(a) erhält die Reihenfolge oben minus unten.', { kind: 'number', acceptedAnswers: ['8/3', '2,6667', '2.6667'], hint: 'Nutze F(x) = x³/3.', followUp: 'Berechne ∫ von 1 bis 3 2x dx. Kontrolle: 8.' }),
      q('integral-area', 'Für f(x) = x − 1 auf [0; 2]: Berechne das bestimmte Integral und den geometrischen Flächeninhalt. Warum unterscheiden sie sich?', 'Das Integral ist 0. Der Flächeninhalt ist 1: links und rechts der Nullstelle x = 1 liegen zwei Dreiecke mit Fläche jeweils 1/2.', 'Negative und positive Beiträge heben sich im Integral auf. Der Flächeninhalt zählt beide Teilflächen positiv. Teile an x = 1 auf.', { criteria: ['Nullstelle x = 1 bestimmt?', 'Integral 0 und Fläche 1 unterschieden?', 'Vorzeichen erklärt?'], followUp: 'Skizziere die Gerade und schraffiere die beiden Dreiecke mit verschiedenen Vorzeichen.' }),
    ], reviewPrompt: 'Erkläre ohne Formelblatt den Unterschied zwischen bestimmtem Integral und geometrischem Flächeninhalt.',
  },
  {
    id: 'mathematics-derivatives', subjectId: 'mathematics', title: 'Mathematik · Ableitungen und Extremstellen', description: 'Potenzregel, Kettenregel und notwendige Bedingung anwenden.', match: /differential|ableit|derivat|extrem|kurvendiskussion/,
    objective: 'Eine Ableitung berechnen und eine Extremstelle begründet prüfen.',
    explanation: 'Die Ableitung beschreibt die lokale Änderungsrate einer Funktion. Die Potenzregel lautet (x^n)′ = n · x^(n−1). Bei einer Verkettung wird zusätzlich mit der inneren Ableitung multipliziert. Eine Nullstelle von f′ ist ein Kandidat für eine Extremstelle; prüfe anschließend zum Beispiel den Vorzeichenwechsel von f′ oder eine von null verschiedene zweite Ableitung.',
    questions: [
      q('derivative-polynomial', 'Leite f(x) = 2x³ − 5x² + 4 ab.', 'f′(x) = 6x² − 10x.', 'Eine Konstante hat die Ableitung 0. Der Exponent wird zuerst als Faktor verwendet und dann um 1 vermindert.', { followUp: 'Leite g(x) = x⁴ + 3x ab. Kontrolle: g′(x) = 4x³ + 3.' }),
      q('derivative-chain', 'Leite h(x) = (3x − 1)² ab und erkläre die Kettenregel.', 'h′(x) = 2(3x − 1) · 3 = 6(3x − 1).', 'Die äußere Ableitung liefert 2(3x − 1); die innere Ableitung von 3x − 1 ist 3.', { hint: 'Du kannst zur Kontrolle zuerst ausmultiplizieren.' }),
      q('derivative-extreme', 'Bestimme die Extremstelle von f(x) = x² − 4x + 1 und begründe ihre Art.', 'f′(x) = 2x − 4 = 0 ⇒ x = 2. f″(x) = 2 > 0, also liegt ein Tiefpunkt bei (2; −3).', 'f′ = 0 allein unterscheidet Hoch- und Tiefpunkt nicht. Die zweite Ableitung ist hier positiv; der Funktionswert ergibt sich durch Einsetzen in f.', { followUp: 'Begründe denselben Tiefpunkt anhand des Vorzeichenwechsels von f′.' }),
    ], reviewPrompt: 'Löse die Aufgabe mit deinem ersten Fehler erneut. Erkläre dabei jeden Faktor und jede Prüfung laut.',
  },
  {
    id: 'german-literary-analysis', subjectId: 'german', title: 'Deutsch · Literarische Analyse', description: 'An einem kurzen Text Deutung, Beleg und Wirkung verbinden.', match: /^(?:de-analysis|german-analysis|literarische analyse|literarische textanalyse|literary analysis|deutung|textanalyse|analyse|analyseabsatz|kurzprosa|erzähltechnik|erzaehltechnik)$/,
    objective: 'Maras Zögern mit einem genauen Textbeleg deuten.',
    explanation: 'Ein Analyseabsatz beginnt mit einer Deutung, die die Aufgabe beantwortet. Ein kurzer Textbeleg stützt diese Aussage. Danach erklärst du, wie genau die Formulierung oder Handlung zu deiner Deutung passt. Formuliere vorsichtig, wenn mehrere Lesarten möglich sind: „legt nahe“ ist genauer als eine unbegründete Behauptung über sichere Gefühle oder Absichten.',
    passage: 'Vor der Tür blieb Mara stehen. Drinnen klirrten Tassen, und ihr Name fiel, als gehöre er jemand anderem. Sie strich den Zettel in ihrer Tasche glatt. Dann faltete sie ihn wieder, kleiner als zuvor. Als die Tür aufging, sagte sie: „Ich wollte nur kurz etwas abgeben.“ Den Zettel behielt sie in der Hand.',
    materialLabel: 'Eigener kurzer Übungstext · kein literarischer Werkauszug',
    questions: [
      q('german-evidence', 'Formuliere eine Deutung zu Maras Unsicherheit und stütze sie mit einem kurzen, wörtlichen Beleg.', 'Maras widersprüchliche Bewegungen legen Unsicherheit nahe: Sie streicht den Zettel zunächst glatt und faltet ihn dann „kleiner als zuvor“. Das kann als Wechsel zwischen dem Wunsch zu sprechen und dem Rückzug davor gelesen werden.', 'Nenne nicht bloß ein Gefühl. Verbinde eine konkrete Handlung mit einer nachvollziehbaren Deutung. Der Text beweist keine bestimmte Vorgeschichte.', { criteria: ['Aufgabenbezug erkennbar?', 'Beleg wörtlich korrekt?', 'Deutung aus der Handlung hergeleitet?'], hint: 'Die Handlung … legt … nahe, weil … .' }),
      q('german-paragraph', 'Schreibe einen Analyseabsatz von etwa 80–120 Wörtern: Wie zeigt der Text Maras Zögern? Erkläre die Wirkung mindestens eines Belegs.', 'Maras Zögern wird durch gegensätzliche Bewegungen sichtbar. Sie streicht den Zettel zunächst glatt, faltet ihn anschließend aber „kleiner als zuvor“. Dieser Wechsel lässt sich als Spannung zwischen dem Wunsch, ihr Anliegen vorzubringen, und dem Rückzug davor lesen. Die Formulierung „nur kurz“ schwächt die Bedeutung ihres Besuchs zusätzlich ab. Mara spielt ihr Anliegen dadurch sprachlich herunter. Dass sie den Zettel am Ende in der Hand behält, lässt die Entscheidung offen. Die Szene zeigt damit Unsicherheit, ohne die Gründe dafür ausdrücklich zu erklären.', 'Dies ist eine mögliche textnahe Deutung. Stilmittel müssen mit ihrer konkreten Funktion erklärt werden. Prüfe außerdem Verbposition, Kommas und ungenaue Wörter.', { criteria: ['Deutung statt Nacherzählung?', 'Kurzer Beleg in den eigenen Satz eingebaut?', 'Wirkung mit „weil“ oder vergleichbarer Begründung erklärt?', 'Keine unbelegte Vorgeschichte erfunden?', 'Satzbau und Kommas kontrolliert?'], followUp: 'Überarbeite deinen allgemeinsten Satz so, dass er sich auf ein bestimmtes Wort oder eine Handlung bezieht.' }),
    ], reviewPrompt: 'Schreibe deinen schwächsten Erklärungssatz ohne Musterlösung erneut. Markiere darin Beleg und Deutung.',
  },
  {
    id: 'german-classicism-humanity', subjectId: 'german', title: 'Weimarer Klassik · Humanität im Analyseabsatz', description: 'An einer selbst verfassten Szene eine moralische Entscheidung deuten.', match: /weimarer klassik|humanitätsideal|humanitaetsideal|^klassik$/,
    objective: 'Eine Deutung zu Humanität mit einem Textbeleg und einer Erklärung absichern.',
    explanation: 'Die Weimarer Klassik verbindet die Frage nach menschlicher Würde mit der bewussten Gestaltung von Gefühl und Vernunft. Das ist ein historischer Deutungsrahmen, kein Beweis, dass jeder klassische Text dieselbe Botschaft hat. Prüfe deine Deutung am Wortlaut. Ein Analyseabsatz enthält eine Aussage, einen kurzen Beleg und eine Erklärung seiner Wirkung.',
    passage: 'Eigene Übungsszene, kein historischer Originaltext: Die Richterin hielt das Urteil bereits in der Hand. Vor ihr stand ein Bote, der das Gesetz gebrochen hatte, um ein verletztes Kind zu retten. Sie legte das Blatt auf den Tisch. „Ich werde die Tat prüfen“, sagte sie, „und den Menschen dabei nicht übersehen.“',
    materialLabel: 'Selbst verfasste Lernszene · kein vorgeschriebener Abiturtext',
    questions: [
      q('classic-conflict', 'Welcher Konflikt zwischen zwei Handlungsmaßstäben entsteht in der Szene? Nenne beide und belege einen am Text.', 'Die Richterin muss die Durchsetzung des Gesetzes gegen die Berücksichtigung des menschlichen Notfalls abwägen. Der Bote hat „das Gesetz gebrochen“, wollte aber „ein verletztes Kind […] retten“.', 'Die Antwort benennt Gesetzestreue und menschliche Fürsorge. Eine bloße Inhaltsangabe würde die konkurrierenden Maßstäbe noch nicht herausarbeiten.', { criteria: ['Zwei unterschiedliche Maßstäbe benennen.', 'Mindestens einen kurzen, genauen Textbeleg verwenden.'] }),
      q('classic-analysis', 'Schreibe 70–100 Wörter: Deute das Ablegen des Urteils und die direkte Rede. Verbinde Aussage, Beleg und Erklärung; unterscheide Deutung und sichere Textinformation.', 'Das Ablegen des Urteils kann als Unterbrechung eines vorschnellen, rein formalen Entscheids gelesen werden. Die Richterin will „die Tat prüfen“ und zugleich „den Menschen […] nicht übersehen“. Die Gegenüberstellung verbindet rechtliche Verantwortung mit einer humanen Betrachtung des Einzelfalls. Ihre direkte Rede macht diese bewusste Selbstverpflichtung hörbar. Die Szene lässt sich daher mit einem Humanitätsideal verbinden; dass das spätere Urteil gerecht sein wird, ist damit noch nicht bewiesen.', 'Das Modell zeigt einen möglichen Aufbau. Andere textnahe Deutungen sind möglich. Die historische Zuordnung bleibt ein Vergleichsrahmen und darf nicht als bewiesene Entstehungsepoche der erfundenen Szene ausgegeben werden.', { criteria: ['Eine deutliche Deutung formulieren.', 'Handlung und direkte Rede untersuchen.', 'Wirkung der Textgestaltung erklären.', 'Keine unbelegte Behauptung über das spätere Urteil.'], followUp: 'Ersetze eine allgemeine Wertung wie „gut“ durch eine genaue Erklärung der Textgestaltung.' }),
      q('classic-limit', 'Warum wäre „Die Szene ist ein Werk von Goethe“ eine unzulässige Schlussfolgerung?', 'Die Szene wurde für diese Übung verfasst. Ein ähnliches Motiv oder ein historischer Deutungsrahmen belegt weder Autor noch Epoche.', 'Motivvergleich und Quellenbestimmung sind verschiedene Aufgaben. Behaupte Autor und Entstehungszeit nur bei einer zuverlässigen Quellenangabe.'),
    ], reviewPrompt: 'Formuliere deine Deutung noch einmal in einem Satz und ergänze genau einen Beleg mit Wirkungserklärung.',
  },
  {
    id: 'german-argumentation', subjectId: 'german', title: 'Deutsch · Präzise argumentieren', description: 'Behauptung, Begründung und Beispiel verständlich verbinden.', match: /^(?:de-comment|argumentation|argument|erörterung|eroerterung|stellungnahme|satzbau|grammatik|komma|kommasetzung)$/,
    objective: 'Ein tragfähiges Argument schreiben und eine ungenaue Aussage verbessern.',
    explanation: 'Ein Argument verbindet eine überprüfbare Behauptung mit einer Begründung und einem passenden Beispiel. Vermeide unhaltbare Verallgemeinerungen wie „alle“ oder „immer“. Nebensätze mit „weil“, „obwohl“ oder „dass“ werden durch Kommas abgetrennt; im Nebensatz steht das finite Verb in der Regel am Ende. Der Text soll präzise sein, nicht unnötig kompliziert.',
    questions: [
      q('german-argument', 'Sollte es in der Schule feste handyfreie Lernphasen geben? Schreibe 70–100 Wörter mit Behauptung, Begründung, Beispiel und einer Einschränkung.', 'Feste handyfreie Lernphasen können konzentriertes Arbeiten erleichtern, weil Benachrichtigungen die Aufmerksamkeit unterbrechen. Wer einen schwierigen Text analysiert, muss Gedanken über mehrere Sätze hinweg verbinden. Ein Blick auf eine neue Nachricht kann diesen Zusammenhang unterbrechen. Deshalb ist es sinnvoll, das Handy während solcher Aufgaben außer Reichweite zu legen. Das bedeutet jedoch nicht, digitale Hilfsmittel grundsätzlich auszuschließen. Für eine klar begrenzte Recherche kann die Lehrkraft Geräte gezielt zulassen.', 'Andere Positionen sind möglich. Prüfe, ob dein Beispiel den Grund tatsächlich veranschaulicht und ob deine Einschränkung zu deiner Position passt.', { criteria: ['Behauptung erkennbar?', 'Grund erklärt statt nur behauptet?', 'Passendes konkretes Beispiel?', 'Sinnvolle Einschränkung?'] }),
      q('german-revise', 'Überarbeite diesen Satz sprachlich und inhaltlich: „Handys sind immer schlecht weil alle Schüler lernen nichts wenn sie benutzen es.“', 'Handys können das Lernen erschweren, weil Benachrichtigungen die Aufmerksamkeit unterbrechen, wenn Schülerinnen und Schüler eine konzentrierte Aufgabe bearbeiten.', '„Immer“ und „alle“ waren unbegründete Verallgemeinerungen. Vor „weil“ und „wenn“ stehen Kommas; „unterbrechen“ und „bearbeiten“ stehen am Ende ihrer Nebensätze.', { criteria: ['Unbelegte Verallgemeinerung eingeschränkt?', 'Kommas vor den Nebensätzen?', 'Verbposition in den Nebensätzen richtig?'], followUp: 'Schreibe einen eigenen „obwohl“-Satz mit korrektem Komma und Verb am Ende des Nebensatzes.' }),
    ], reviewPrompt: 'Schreibe die verbesserte Satzstruktur erneut und benenne eine konkrete Änderung an deinem ersten Argument.',
  },
  {
    id: 'physics-rc-discharge', subjectId: 'physics', title: 'Physik · RC-Entladung', description: 'Zeitkonstante, Spannung und Entladungszeit berechnen.', match: /physics-rc|rc.?kreis|rc.?circuit|entlad|discharge|kondensator/,
    objective: 'Ein ideales Entladungsmodell mit korrekten Einheiten anwenden.',
    explanation: 'Ein geladener Kondensator gibt beim Entladen Energie über einen Widerstand ab. Im idealen RC-Modell gilt U(t) = U₀ · e^(−t/τ) mit τ = R · C. Nach einer Zeitkonstante bleibt etwa 36,8 % der Anfangsspannung übrig. Die Spannung fällt exponentiell, weil die Stromstärke mit der verbleibenden Spannung abnimmt. Schreibe Widerstand in Ω, Kapazität in F und Zeit in s, bevor du einsetzt.',
    questions: [
      q('rc-time-constant', 'R = 100 kΩ, C = 100 µF und U₀ = 12 V. Berechne τ und U(10 s).', 'τ = 100 000 Ω · 0,0001 F = 10 s. U(10 s) = 12e^(−1) V ≈ 4,41 V.', 'k bedeutet 10³, µ bedeutet 10⁻⁶. Eine Zeitkonstante ist nicht der Zeitpunkt vollständiger Entladung.', { hint: 'Rechne die Vorsätze zuerst in SI-Einheiten um.', followUp: 'Berechne U(20 s). Kontrolle: etwa 1,62 V.' }),
      q('rc-threshold', 'Nach welcher Zeit ist die Spannung desselben Kondensators auf 3 V gefallen?', '3/12 = e^(−t/10); t = −10 ln(1/4) s = 10 ln(4) s ≈ 13,86 s.', 'Teile zuerst durch U₀ und logarithmiere. Der Logarithmus von 1/4 ist negativ; das Minuszeichen führt zu einer positiven Zeit.', { hint: 'Löse 0,25 = e^(−t/10).', followUp: 'Warum muss das Ergebnis größer als 10 s sein? Nutze U(10 s) ≈ 4,41 V.' }),
      q('rc-energy', 'Berechne die anfängliche Energie E₀ und den Betrag des Anfangsstroms |I₀|.', 'E₀ = ½CU₀² = 0,0072 J = 7,2 mJ. |I₀| = U₀/R = 0,00012 A = 0,12 mA.', 'Die Energie enthält das Quadrat der Spannung. Der Betrag des Stroms ist gefragt; das Vorzeichen hängt von der gewählten Stromrichtung ab.', { criteria: ['Spannung quadriert?', 'Kapazität in F eingesetzt?', 'J und A / mA korrekt angegeben?'], followUp: 'Wie verändert sich E₀ bei doppelter Anfangsspannung? Kontrolle: Sie vervierfacht sich.' }),
    ], reviewPrompt: 'Löse eine Rechnung erneut und erkläre, an welcher Stelle eine falsche Einheit oder ein Vorzeichen das Ergebnis verändern würde.',
  },
  {
    id: 'physics-forces', subjectId: 'physics', title: 'Physik · Kräfte und Beschleunigung', description: 'Resultierende Kraft, Reibung und Einheiten prüfen.', match: /\b(?:kraft|kräfte|kraefte|newton|newtons|beschleunigung|mechanik|dynamik)\b/,
    objective: 'Aus den wirkenden Kräften eine Beschleunigung bestimmen.',
    explanation: 'Newtons zweites Gesetz verknüpft die resultierende Kraft mit der Beschleunigung: ΣF = m · a. Entscheidend ist die Summe der Kräfte mit Vorzeichen. Ein Körper kann sich auch dann bewegen, wenn die resultierende Kraft null ist; seine Geschwindigkeit bleibt dann konstant. In einer horizontalen Modellaufgabe werden Gewichtskraft und Normalkraft nur dann als ausgeglichen behandelt, wenn keine vertikale Beschleunigung vorliegt.',
    questions: [
      q('forces-resultant', 'Ein Wagen mit m = 2 kg wird horizontal mit 10 N gezogen. Eine Reibungskraft von 2 N wirkt entgegen. Berechne die horizontale Beschleunigung.', 'ΣF = 10 N − 2 N = 8 N; a = 8 N / 2 kg = 4 m/s².', 'Die Reibungskraft wird abgezogen. F = ma verwendet die resultierende Kraft, nicht jede Kraft einzeln als gleichzeitige Gesamtwirkung.', { hint: 'Lege zuerst die positive Richtung fest.', followUp: 'Welche Beschleunigung entsteht bei 4 N Zugkraft und 2 N Reibung? Kontrolle: 1 m/s².' }),
      q('forces-velocity', 'Der Wagen startet aus der Ruhe. Welche Geschwindigkeit erreicht er nach 3 s, wenn die Beschleunigung konstant 4 m/s² beträgt?', 'v = v₀ + at = 0 + 4 · 3 = 12 m/s.', 'Die Beschleunigung gibt die Geschwindigkeitsänderung pro Sekunde an. Die Annahme konstanter Kräfte und konstanter Masse muss für dieses Modell gelten.'),
      q('forces-zero', 'Ein Körper bewegt sich geradeaus mit konstanter Geschwindigkeit. Was folgt für die resultierende Kraft? Begründe.', 'Die resultierende Kraft ist null, weil die Beschleunigung null ist. Das bedeutet nicht, dass keine einzelnen Kräfte wirken; sie können sich ausgleichen.', 'Bewegung benötigt nach dem idealisierten Newton-Modell keine von null verschiedene resultierende Kraft. Eine solche Kraft ändert die Geschwindigkeit.', { followUp: 'Nenne ein Beispiel für zwei Kräfte, die sich bei gleichförmiger Bewegung ausgleichen.' }),
    ], reviewPrompt: 'Zeichne zu Aufgabe 1 ein Kräftebild und erkläre, warum du die beiden horizontalen Kräfte subtrahierst.',
  },
  {
    id: 'ielts-reading-evidence', subjectId: 'ielts', skill: 'reading', title: 'IELTS Reading · True, False, Not Given', description: 'Aussagen am Text prüfen und eigene Annahmen vermeiden.', match: /ielts-reading|academic.?reading|reading/,
    objective: 'Drei Aussagen mit Textbelegen als True, False oder Not Given einordnen.',
    explanation: 'True bedeutet, dass der Text die Aussage bestätigt. False bedeutet, dass der Text ihr widerspricht. Not Given bedeutet, dass die entscheidende Information fehlt. Plausibilität oder eigenes Wissen ersetzen keinen Textbeleg. Unterstreiche zuerst die entscheidende Formulierung und vergleiche besonders Mengenwörter und Zeitangaben.',
    passage: 'A university library introduced quiet study rooms in 2022. Students book the rooms online for a maximum of two hours per session. In a survey conducted one year later, most respondents said the rooms helped them concentrate. The report did not compare examination results before and after the rooms opened. The library plans to review booking limits next year, but no change has yet been approved.',
    materialLabel: 'Eigener kurzer Übungstext · kein Original-IELTS-Test',
    questions: [
      q('ielts-reading-true', 'Students can reserve a quiet room for no more than two hours in one session. True, False or Not Given? Give the phrase that supports your answer.', 'True. The text says “a maximum of two hours per session”.', '„No more than“ und „a maximum of“ drücken dieselbe Obergrenze aus.'),
      q('ielts-reading-ng', 'Students obtained better examination results after the study rooms opened. True, False or Not Given?', 'Not Given. The report did not compare examination results; it only reports opinions about concentration.', 'Bessere Konzentration in einer Befragung belegt keine besseren Klausurergebnisse. Das Fehlen eines Vergleichs ist auch kein Beweis für schlechtere Ergebnisse.', { hint: 'Welche Art Ergebnis wurde tatsächlich erhoben?' }),
      q('ielts-reading-false', 'The library has already approved longer booking sessions. True, False or Not Given?', 'False. The text explicitly says that “no change has yet been approved”.', 'Die mögliche künftige Überprüfung ist kein schon genehmigter Beschluss.', { followUp: 'Erkläre den Unterschied zwischen einer geplanten Prüfung einer Regel und einer bereits beschlossenen Änderung.' }),
    ], reviewPrompt: 'Erkläre ohne Text den Unterschied zwischen False und Not Given. Wiederhole deine unsicherste Aussage mit Beleg.',
  },
  {
    id: 'ielts-writing-argument', subjectId: 'ielts', skill: 'writing', title: 'IELTS Writing · Task-2-Argument entwickeln', description: 'Eine Frage analysieren, Position planen und einen Absatz schreiben.', match: /ielts-writing|task.?2|academic.?writing|writing/,
    objective: 'Eine klar begründete Position zu einer Task-2-Frage entwickeln.',
    explanation: 'Task-2-Antworten müssen alle Teile der Frage behandeln und eine nachvollziehbare Position entwickeln. Ein Hauptabsatz braucht einen Grund und eine Erklärung mit konkretem Beispiel. Die vier offiziellen Bewertungsbereiche sind Task Response, Coherence and Cohesion, Lexical Resource sowie Grammatical Range and Accuracy. Diese kurze Übung liefert Selbstprüfung, keine automatische Bandbewertung.\n\nUseful language: “One reason is that …”, “For example …”, “This does not mean that …”, “Nevertheless …”.',
    passage: 'Some people think students should choose subjects that lead directly to a job. Others believe students should study what interests them. Discuss both views and give your own opinion.',
    materialLabel: 'Eigene Task-2-Übungsfrage · keine Original-Prüfungsfrage',
    questions: [
      q('ielts-writing-outline', 'Write a four-part outline: the practical-career view, the personal-interest view, your position, and one concrete example.', 'Career view: qualifications can improve access to specific jobs. Interest view: motivation can support deeper learning. Position: consider both interest and credible opportunities. Example: a student interested in mathematics investigates courses combining quantitative work with practical applications.', 'Die Frage verlangt beide Sichtweisen und eine eigene Position. Der Beispielplan ist eine mögliche Antwort, keine Hochschul- oder Karriereempfehlung.'),
      q('ielts-writing-paragraph', 'Write one developed paragraph of 90–120 words. State a reason, explain it and give a concrete example.', 'Personal interest matters because it can sustain the effort needed to understand a difficult subject. A student who enjoys mathematics may be more willing to work through unfamiliar problems and seek feedback after mistakes. For example, they might investigate how statistics is used in transport or public health, which connects curiosity with practical work. However, interest alone does not guarantee employment. Students should also examine the skills a course teaches and the opportunities it can realistically open. This combination offers a stronger basis for a decision than choosing a course only for its title.', 'Die Modellantwort entwickelt einen Grund und begrenzt ihn. Vergleiche deine Begründung und Struktur; ein Bandwert lässt sich daraus nicht zuverlässig automatisch ableiten.', { criteria: ['Task Response: Grund zur gestellten Frage entwickelt?', 'Coherence: Sätze logisch verbunden?', 'Lexical Resource: präzise und passende Wörter?', 'Grammar: Satzbau und wiederkehrende Fehler geprüft?'], followUp: 'Überarbeite einen Satz, der nur eine Behauptung ohne Erklärung enthält.' }),
    ], reviewPrompt: 'Notiere eine inhaltliche Lücke und einen wiederkehrenden Sprachfehler. Schreibe die betreffende Stelle verbessert neu.',
  },
  {
    id: 'ielts-speaking-experience', subjectId: 'ielts', skill: 'speaking', title: 'IELTS Speaking · Eine Erfahrung erklären', description: 'Eine strukturierte Antwort sprechen und gezielt verbessern.', match: /ielts-speaking|speaking|sprech/,
    objective: 'Eine echte Erfahrung mit konkreten Einzelheiten mündlich erklären.',
    explanation: 'Sammle eine Minute lang Stichwörter und sprich anschließend bis zu zwei Minuten, ohne einen fertigen Text vorzulesen. Nutze die Sprachmemo-App für die Selbstprüfung. Achte auf nachvollziehbare Gedanken, konkrete Beispiele, kontrollierte Grammatik und verständliche Aussprache. Stichwörter im Antwortfeld ersetzen keine gesprochene Antwort und sind kein Nachweis eines Bandwerts.',
    passage: 'Describe a project or activity you enjoyed. Say what it was, what you did, who was involved, and why it mattered to you.',
    materialLabel: 'Eigene Speaking-Übung · nutze deine tatsächlichen Erfahrungen',
    questions: [
      q('ielts-speaking-notes', 'Write four short notes, one for each part of the prompt. Then record your spoken answer for up to two minutes.', 'Eine mögliche Struktur ist: Kontext → eigene Aufgabe → konkretes Beispiel → persönliche Bedeutung. Verwende tatsächliche Erfahrungen; es gibt keine vorgeschriebene Biografie.', 'Bewerte anschließend die Aufnahme, nicht nur die Notizen. Erfinde keine Verantwortung oder Ergebnisse, um die Antwort beeindruckender klingen zu lassen.', { criteria: ['Alle Teile behandelt?', 'Konkretes Beispiel statt allgemeiner Behauptung?', 'Eigene Rolle klar beschrieben?', 'Aufnahme angehört und eine unklare Stelle gefunden?'] }),
      q('ielts-speaking-followup', 'Speak for 30–60 seconds: What would you do differently if you repeated the activity? Afterwards, write one sentence you want to improve.', 'A possible sentence pattern is: “If I did it again, I would … because … . For example, … .” The actual content depends on your experience.', 'Formuliere eine konkrete Veränderung und begründe sie. Beim zweiten Versuch verbessern sich vor allem Klarheit und Genauigkeit; das ist keine offizielle IELTS-Bewertung.', { followUp: 'Sprich deine Antwort erneut und verbessere genau den notierten Satz.' }),
    ], reviewPrompt: 'Höre eine unsichere Stelle erneut und sprich sie klarer. Notiere ein Sprachmuster, das du morgen wiederholen möchtest.',
  },
  {
    id: 'ielts-listening-message', subjectId: 'ielts', skill: 'listening', title: 'IELTS Listening · Eine Nachricht verstehen', description: 'Uhrzeit, Treffpunkt und eine Korrektur in einer Hörnachricht erkennen.', match: /ielts-listening|listening|hörversteh|hoerversteh/,
    objective: 'Drei konkrete Angaben aus einer englischen Hörnachricht entnehmen.',
    explanation: 'Lies zuerst die drei Fragen. Höre dann die eigene Übungsnachricht und notiere nur die gesuchten Angaben. Achte auf Korrekturen wie “not …” und “actually …”. Die Stimme wird von deinem Gerät erzeugt; dies ist kein Original-IELTS-Audio und keine Bandmessung. Den Text kannst du erst bei der Lösungskontrolle mitlesen.',
    audioText: 'Hello, this is a reminder about our science museum visit on Saturday. We originally planned to meet at ten, but the guide has changed the starting time. Please be at the north entrance at ten fifteen, not ten o’clock. You do not need to bring a printed ticket because I have the group booking. Please bring a notebook for the workshop. Lunch is available in the café, although you are welcome to bring your own food. If you are delayed, call the museum reception rather than the guide.',
    requiresAudio: true, materialLabel: 'Eigene Hörübung · synthetische Stimme · kein Originaltest',
    questions: [
      q('ielts-listening-time', 'At what time should participants meet?', '10:15 / ten fifteen.', 'Die zuerst genannte Uhrzeit 10:00 wird ausdrücklich korrigiert. Entscheidend ist die aktuelle Treffzeit.'),
      q('ielts-listening-place', 'Where should participants meet? Write no more than two words.', 'North entrance.', '„Science museum“ bezeichnet das Ziel, aber die Frage fragt nach dem genauen Treffpunkt. „North entrance“ besteht aus zwei Wörtern.'),
      q('ielts-listening-item', 'What should participants bring for the workshop? Write one word.', 'Notebook.', 'Ein gedrucktes Ticket ist ausdrücklich nicht nötig. Das gesuchte Objekt für den Workshop ist das Notizbuch.', { followUp: 'Höre die Nachricht erneut und markiere gedanklich die beiden ausdrücklich korrigierten oder ausgeschlossenen Angaben.' }),
    ], reviewPrompt: 'Höre die falsche Stelle noch einmal ohne Transkript. Erkläre, welche Ablenkung oder Korrektur du zuerst überhört hast.',
  },
  {
    id: 'sat-math-foundations', subjectId: 'sat', skill: 'math', title: 'SAT Math · Gleichungen und Prozentrechnung', description: 'Vier konkrete Grundlagenaufgaben mit Lösungen.', match: /sat-math|sat.*math|gleichung|percent/,
    objective: 'Rechenwege auf Gleichungen, Funktionen und Prozentangaben anwenden.',
    explanation: 'Schreibe bei einer Gleichung die gleiche Operation auf beiden Seiten auf. Bei Prozentangaben ist der Bezugswert entscheidend: Ein Anstieg und ein Rückgang um denselben Prozentsatz beziehen sich auf unterschiedliche Ausgangswerte. Die folgenden Fragen sind eigene Übungen; für adaptive vollständige Probetests bleibt Bluebook die passende Umgebung.',
    questions: [
      q('sat-equation', 'Solve 3(2x − 1) = 21. Show your first step and check the result.', 'x = 4.', 'Divide by 3: 2x − 1 = 7. Add 1: 2x = 8. Divide by 2. Check: 3(8 − 1) = 21.', { kind: 'number', acceptedAnswers: ['4', 'x=4'] }),
      q('sat-percent', 'A price rises from €80 to €100, then falls by 20%. What is the final price, and what was the original percentage increase?', 'Final price: €80. Original increase: 25%.', '0.8 · 100 = 80. The original increase is (100 − 80)/80 = 0.25. The two changes use different reference values.'),
      q('sat-function', 'For f(x) = 2x² − 3, find f(−2).', '5.', 'Square first: (−2)² = 4, then 2 · 4 − 3 = 5.', { kind: 'number', acceptedAnswers: ['5'] }),
      q('sat-system', 'If x + y = 10 and 2x − y = 5, find x and y.', 'x = 5 and y = 5.', 'Add the equations: 3x = 15. Then y = 10 − 5. Check both original equations.'),
    ], reviewPrompt: 'Löse die Aufgabe mit deinem ersten Fehler erneut und schreibe die fehlerhafte Regel richtig auf.',
  },
  {
    id: 'sat-reading-evidence', subjectId: 'sat', skill: 'readingWriting', title: 'SAT Reading and Writing · Belege und Satzgrenzen', description: 'Eine Schlussfolgerung prüfen und einen Satz korrigieren.', match: /sat-reading|sat-rw|readingwriting|reading and writing|sat.*reading|satzgrenz/,
    objective: 'Eine belegbare Schlussfolgerung und eine korrekte Satzverbindung auswählen.',
    explanation: 'Wähle beim Lesen die Aussage, die der Text tatsächlich trägt. Starke Wörter wie “every”, “always” oder “only” brauchen entsprechend starke Belege. Zwei selbstständige englische Hauptsätze dürfen nicht allein durch ein Komma verbunden werden. Ein Semikolon kann zwei inhaltlich verbundene Hauptsätze trennen.',
    passage: 'A school replaced several paved areas with trees. During the first summer, temperatures were lower near the planted areas than near the remaining pavement. The researchers caution that the study covered only one school.',
    materialLabel: 'Eigene Übungsfragen · keine Original-SAT-Aufgaben',
    questions: [
      q('sat-evidence', 'Which conclusion is best supported? A: Trees always reduce temperatures in every city. B: The planted areas at this school were cooler during the observed summer. C: Pavement is the only cause of urban heat. D: Every school should use the same planting plan.', 'B.', 'B bleibt innerhalb der beobachteten Schule, Flächen und Zeit. A und C verallgemeinern unbelegt; D ist eine Empfehlung, die aus dieser Untersuchung nicht folgt.'),
      q('sat-boundaries', 'Choose the correct version. A: The data were incomplete, the team repeated the experiment. B: The data were incomplete; the team repeated the experiment. C: The data were incomplete the team repeated the experiment. D: The data were incomplete; because the team repeated the experiment.', 'B.', 'A ist ein comma splice. C fehlt eine Satzgrenze. Nach dem Semikolon in D steht wegen “because” kein selbstständiger Hauptsatz.', { followUp: 'Schreibe eine korrekte Alternative mit einem Punkt oder mit “so”.' }),
    ], reviewPrompt: 'Begründe für eine falsche Option genau, welche Textinformation oder Grammatikregel ihr widerspricht.',
  },
];

export function getTutorChoices(subject) {
  return UNITS.filter(unit => unit.subjectId === subject).map(unit => ({ id: unit.id, label: unit.title, title: unit.title, description: unit.description }));
}
export function resolveTutorTopic(subject, text) {
  const input = clean(text, 2000).toLowerCase();
  if (!input) return null;
  const available = UNITS.filter(unit => unit.subjectId === subject);
  if (subject === 'physics' && /auflad|charg(?:e|ing)/i.test(input) && !/entlad|discharg/i.test(input)) return null;
  if (subject === 'physics' && /reihen|parallel|dielektr|dielectr/i.test(input)) return null;
  if (subject === 'physics' && /lorentz|magnet|coulomb|elektrisch.*kraft|electric.*force|gravit|auftrieb|federkraft|spring force/i.test(input)) return null;
  if (subject === 'mathematics' && /substitution|partiell|partial integration|integration by parts|trigonom|rotations|uneigentlich|improper|logistisch|logistic/i.test(input)) return null;
  // A saved exact unit ID is stronger evidence than overlapping vocabulary.
  return available.find(unit => unit.id === input) || available.find(unit => unit.match.test(input)) || null;
}
function tutorSubject(data, task) {
  if (task.ieltsSkill || /\bielts\b/i.test(task.title || '')) return 'ielts';
  if (task.satSkill || /\bsat\b/i.test(task.title || '')) return 'sat';
  if (SUBJECTS[task.subjectId]) return task.subjectId;
  const name = data.subjects?.find(subject => subject.id === task.subjectId)?.name || '';
  return /mathemat|maths/i.test(name) ? 'mathematics' : /physik|physics/i.test(name) ? 'physics' : /englisch|english/i.test(name) ? 'english' : /deutsch|german/i.test(name) ? 'german' : task.subjectId || '';
}
function phasesFor(minutes) {
  const duration = Number.isFinite(Number(minutes)) ? Math.max(0, Math.min(720, Math.floor(Number(minutes)))) : 15;
  const phases = [{ key: 'learn', title: 'Lernen', weight: 3 }, { key: 'practice', title: 'Üben', weight: 7 }, { key: 'check', title: 'Prüfen', weight: 3 }, { key: 'review', title: 'Wiederholen', weight: 2 }].map((phase, index) => {
    const exact = duration * phase.weight / 15;
    return { ...phase, index, minutes: Math.floor(exact), remainder: exact % 1 };
  });
  const order = [...phases].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let remaining = duration - phases.reduce((sum, phase) => sum + phase.minutes, 0), index = 0; index < remaining; index++) order[index % order.length].minutes++;
  return phases.filter(phase => phase.minutes > 0).map(({ weight, index, remainder, ...phase }) => phase);
}
function recentEvidence(data, task, unit, today) {
  const attempts = (Array.isArray(data.learning?.attempts) ? data.learning.attempts : []).filter(item => item.topic === unit.id && (!validDate(today) || (validDate(item.date) && item.date <= today))).sort((a, b) => b.date.localeCompare(a.date));
  const latest = attempts[0] || null;
  const struggles = attempts.slice(0, 5).filter(item => ['again', 'hard'].includes(item.rating));
  const count = new Set(struggles.map(item => item.taskId || item.date)).size;
  return { latestAttempt: latest, previousMistake: latest?.mistake || '', helpRecommendation: count >= 3 && latest?.rating !== 'good' ? 'Dieses Thema war in mindestens drei Einheiten unsicher. Zeige deiner Lehrkraft eine konkrete Antwort und bitte um einen erklärten Lösungsweg. Eine Lerngruppe kann den nächsten Versuch begleiten.' : '' };
}
function materialize(unit, data, task, today, topicSource, exam) {
  const duration = Number.isFinite(Number(task.minutes)) ? Number(task.minutes) : 15;
  const maxQuestions = duration < 10 ? 1 : duration < 15 ? 2 : duration < 20 && unit.questions.length > 3 ? 2 : unit.questions.length;
  const evidence = recentEvidence(data, task, unit, today);
  let questions = unit.questions.map(question => ({ ...question }));
  // Revisit an actually recorded mistake first, without inventing a diagnosis.
  const previousIds = ['again', 'hard'].includes(evidence.latestAttempt?.rating) ? (evidence.latestAttempt?.questionId || '').split(',').map(id => id.trim()) : [];
  questions.sort((a, b) => Number(previousIds.includes(b.id)) - Number(previousIds.includes(a.id)));
  questions = questions.slice(0, maxQuestions);
  return { ...unit, ...evidence, status: 'ready', unitId: unit.id, topicId: unit.id, topic: unit.id, subject: SUBJECTS[unit.subjectId], questions,
    firstExercise: questions[0].prompt, firstQuestion: questions[0], expectedResult: unit.objective, why: task.reason || 'Übe eine klar abgegrenzte Fähigkeit und prüfe dein eigenes Ergebnis.',
    phases: phasesFor(task.minutes), resources: unit.resources || resources[unit.subjectId] || [], choices: getTutorChoices(unit.subjectId), topicSource, topicSelectionRequired: false,
    topicNotice: topicSource === 'selection' ? (exam?.topics?.length ? 'Von dir gewähltes Übungsmodul. Gleiche es mit deinen Klausurthemen ab.' : exam ? 'Übungsmodul gewählt · Klausurthemen noch nicht bestätigt.' : 'Von dir gewähltes Übungsmodul.') : topicSource === 'exam' ? 'Passend zu deinen gespeicherten Prüfungsthemen.' : 'Passend zu deinem gespeicherten Lernthema.',
    assessmentNote: unit.subjectId === 'ielts' || unit.subjectId === 'sat' ? 'Eigene Übung · keine offizielle Prüfung und keine automatische Scorebewertung.' : 'Selbstprüfung anhand von Lösungen und Kriterien · keine automatische Schulnote.',
  };
}
/** A known exam topic takes precedence over generic generated task wording. */
export function getTutorSession(data = {}, task = {}, today = task.date, selectedTopicId = '') {
  const subjectId = tutorSubject(data, task), subject = SUBJECTS[subjectId] || data.subjects?.find(item => item.id === task.subjectId)?.name || 'Lerneinheit';
  const choices = getTutorChoices(subjectId), exam = data.exams?.find(item => item.id === task.examId);
  const saved = (Array.isArray(data.learning?.sessions) ? data.learning.sessions : []).find(session => session?.taskId === task.id);
  const selected = clean(selectedTopicId || saved?.unitId, 200);
  const unavailable = (status, reason, topic = '') => ({ status, subjectId, subject, title: status === 'choose-topic' ? 'Was steht in deiner Klausur an?' : 'Für dieses Thema fehlt noch eine konkrete Übung', topicId: topic, unitId: '', topic, questions: [], choices, explanation: '', firstExercise: '', phases: [], resources: resources[subjectId] || [], topicSource: 'unknown', topicSelectionRequired: true, unavailableReason: reason });
  if (task.satSkill === 'full') return { ...unavailable('external', 'Ein vollständiger adaptiver SAT-Probetest läuft in Bluebook. Die App kann seine Module und Bewertung nicht nachbilden.'), title: 'Vollständiger Bluebook-Probetest', topicSelectionRequired: false, resources: [{ title: 'College Board · Bluebook-Probetests', url: 'https://satsuite.collegeboard.org/practice/practice-tests/bluebook' }] };
  if (task.roadmapStepId || task.roadmapAction || (!task.ieltsSkill && !task.satSkill && (task.eventStage || ['university', 'activity', 'review'].includes(task.category)))) return { ...unavailable('action', ''), title: task.objective || task.title, explanation: task.steps?.[0] || task.reason || '', firstExercise: task.steps?.[0] || task.title, topicSelectionRequired: false };
  if (selected) {
    const unit = resolveTutorTopic(subjectId, selected);
    return unit ? materialize(unit, data, task, today, 'selection', exam) : unavailable('unsupported', `Für „${selected}“ gibt es noch kein geprüftes Übungsmodul. Wähle ein verfügbares Thema oder nutze dein Unterrichtsmaterial.`, selected);
  }
  if (/^recovery-/.test(task.revisionStage || '') && subjectId !== 'english') return unavailable(choices.length ? 'choose-topic' : 'unsupported', 'Für dieses Fach ist die Diagnose aus dem Klausurfeedback noch nicht als eigene Übung umgesetzt. Wähle ein konkretes Fehlerthema; die App erfindet keine Ursache.');
  // New persisted unit IDs represent a concrete earlier choice, including a
  // scheduled review. Legacy generic labels such as en-analysis do not.
  const exact = UNITS.find(unit => unit.subjectId === subjectId && unit.id === task.learningTopic);
  if (exact) return materialize(exact, data, task, today, 'task', exam);
  if (subjectId === 'ielts' && task.ieltsSkill) { const unit = UNITS.find(unit => unit.subjectId === 'ielts' && unit.skill === task.ieltsSkill); return unit ? materialize(unit, data, task, today, 'task', exam) : unavailable('unsupported', 'Für diesen IELTS-Bereich ist keine konkrete Übung verfügbar.'); }
  if (subjectId === 'sat' && task.satSkill) { const unit = UNITS.find(unit => unit.subjectId === 'sat' && unit.skill === task.satSkill); return unit ? materialize(unit, data, task, today, 'task', exam) : unavailable('unsupported', 'Für diesen SAT-Bereich ist keine konkrete Übung verfügbar.'); }
  const examTopics = Array.isArray(exam?.topics) ? exam.topics.filter(item => typeof item === 'string' && item.trim()) : [];
  if (exam) {
    if (!examTopics.length) return unavailable('choose-topic', 'Wähle das tatsächliche Prüfungsthema oder ein ausdrücklich gewähltes Übungsmodul. Die App ergänzt keine unbekannten Klausurthemen.');
    const mapped = examTopics.map(topic => resolveTutorTopic(subjectId, topic));
    const known = [...new Map(mapped.filter(Boolean).map(unit => [unit.id, unit])).values()];
    if (examTopics.length > 1 && (known.length > 1 || mapped.some(unit => !unit))) return { ...unavailable('choose-topic', 'Wähle einen deiner Prüfungsbereiche für diese Einheit. Die übrigen Themen bleiben im Vorbereitungsplan.'), choices: [...known.map(unit => ({ id: unit.id, label: unit.title, title: unit.title, description: unit.description })), ...choices.filter(choice => !known.some(unit => unit.id === choice.id))] };
    return known[0] ? materialize(known[0], data, task, today, 'exam', exam) : unavailable('unsupported', `Für deine gespeicherten Themen „${examTopics.join(', ')}“ ist noch kein passendes Übungsmodul vorhanden.`, examTopics.join(', '));
  }
  const subjectRecord = data.subjects?.find(item => item.id === task.subjectId);
  // A deliberate topic session is more specific than the subject's other
  // current topics. Never swap the requested exercise for a different lesson.
  if (task.origin === 'custom' && task.id?.startsWith('topic-') && task.learningTopic) {
    const requested = resolveTutorTopic(subjectId, task.learningTopic);
    return requested ? materialize(requested, data, task, today, 'selection', exam) : unavailable('unsupported', `Für dein ausdrücklich gewähltes Thema „${task.learningTopic}“ fehlt noch eine konkrete interaktive Übung.`, task.learningTopic);
  }
  const currentTopics = getCurrentLearningTopics(data, task.subjectId);
  if (currentTopics.length) {
    const matchingTask = currentTopics.find(topic => topic.learningTopic === task.learningTopic);
    const active = matchingTask ? [matchingTask] : currentTopics;
    const mapped = active.map(topic => resolveTutorTopic(subjectId, topic.learningTopic));
    const known = [...new Map(mapped.filter(Boolean).map(unit => [unit.id, unit])).values()];
    if (active.length > 1 && (known.length !== 1 || mapped.some(unit => !unit))) return { ...unavailable('choose-topic', 'Wähle einen deiner aktuellen Unterrichtsbereiche. Nicht abgedeckte Themen bleiben als offen gekennzeichnet.'), choices: [...known.map(unit => ({ id: unit.id, label: unit.title, title: unit.title, description: unit.description })), ...choices.filter(choice => !known.some(unit => unit.id === choice.id))] };
    return known[0] ? materialize(known[0], data, task, today, 'curriculum', exam) : unavailable('unsupported', `Für dein gewähltes Thema „${active.map(topic => topic.title).join(', ')}“ fehlt noch eine konkrete interaktive Übung.`, active[0].learningTopic);
  }
  const topics = Array.isArray(subjectRecord?.weakTopics) ? subjectRecord.weakTopics.filter(item => typeof item === 'string') : [];
  const concreteTaskTopic = /math-exponential|physics-rc/i.test(task.learningTopic || '') ? task.learningTopic : '';
  const explicitTask = task.origin === 'custom' ? `${task.title || ''} ${task.learningTopic || ''}` : '';
  const unit = resolveTutorTopic(subjectId, concreteTaskTopic) || topics.map(topic => resolveTutorTopic(subjectId, topic)).find(Boolean) || resolveTutorTopic(subjectId, explicitTask);
  if (unit) return materialize(unit, data, task, today, 'task', exam);
  return unavailable(choices.length ? 'choose-topic' : 'unsupported', choices.length ? 'Wähle ein Thema. Danach beginnt die Einheit direkt mit konkretem Material und Aufgaben.' : 'Für dieses Fach sind noch keine konkreten interaktiven Übungen hinterlegt. Diese Lernfunktion ist hier noch unvollständig.');
}
