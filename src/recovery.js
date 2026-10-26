/** Post-exam reflections are evidence, never invented grades or extra exams. */
const text = (value, max = 3000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = value => value !== '' && value !== null && value !== undefined && typeof value !== 'boolean' && Number.isFinite(Number(value)) ? Number(value) : null;
const points = value => { const result = number(value); return result !== null && result >= 0 && result <= 15 ? result : null; };
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const shift = (value, days) => { const result = new Date(`${value}T12:00:00Z`); result.setUTCDate(result.getUTCDate() + days); return result.toISOString().slice(0, 10); };
export const RECOVERY_MOODS = { good: 'Gut', medium: 'Mittel', poor: 'Schlecht', unsure: 'Noch unsicher' };
export const RECOVERY_CAUSES = { vocabulary: 'Wortschatz', comprehension: 'Textverständnis', analysis: 'Analyse', grammar: 'Grammatik', structure: 'Aufbau', time: 'Zeitmanagement' };

export function normalizeRecovery(value) {
  const seen = new Set();
  return { records: (Array.isArray(value?.records) ? value.records : []).slice(0, 500).flatMap(input => {
    const examId = text(input?.examId, 150);
    if (!examId || seen.has(examId)) return [];
    seen.add(examId);
    return [{ examId, mood: Object.hasOwn(RECOVERY_MOODS, input.mood) ? input.mood : '', causes: [...new Set((Array.isArray(input.causes) ? input.causes : []).filter(cause => Object.hasOwn(RECOVERY_CAUSES, cause)))], teacherFeedback: text(input.teacherFeedback), lostPoints: text(input.lostPoints, 2000), goal: text(input.goal, 500), startDate: date(input.startDate) ? input.startDate : '', reviewDate: date(input.reviewDate) ? input.reviewDate : '', gradeId: text(input.gradeId, 150), closed: input.closed === true, outcome: text(input.outcome, 2000), updatedDate: date(input.updatedDate) ? input.updatedDate : '' }];
  }) };
}
export function getExamReflection(data, examId) { return normalizeRecovery(data.recovery).records.find(record => record.examId === examId) || null; }
export function saveExamReflection(data, examId, patch, today) {
  const exam = data.exams?.find(item => item.id === examId);
  if (!exam || !date(today) || exam.date > today) throw new TypeError('Nachbesprechung ist erst am Prüfungstag möglich.');
  const old = getExamReflection(data, examId) || { examId };
  const record = normalizeRecovery({ records: [{ ...old, ...patch, examId, updatedDate: today }] }).records[0];
  return { ...data, recovery: { records: [...normalizeRecovery(data.recovery).records.filter(item => item.examId !== examId), record] } };
}
export function getPendingExamReflections(data, today) {
  if (!date(today)) return [];
  return (data.exams || []).filter(exam => exam.date < today && !getExamReflection(data, exam.id)?.mood).sort((a, b) => b.date.localeCompare(a.date));
}
export function getReturnedExamGrade(data, examId) {
  const record = getExamReflection(data, examId);
  return (data.grades || []).find(grade => grade.id === record?.gradeId || grade.id === `recovery-grade-${examId}`) || null;
}
/** A possible match needs confirmation; matching dates alone must never overwrite a grade. */
export function getPossibleExamGradeMatches(data, examId) {
  const exam = data.exams?.find(item => item.id === examId);
  if (!exam) return [];
  return (data.grades || []).filter(grade => grade.subjectId === exam.subjectId && grade.date === exam.date && ['written', 'oral', 'presentation', 'other'].includes(grade.type));
}
export function linkReturnedExamGrade(data, examId, gradeId, today) {
  const exam = data.exams?.find(item => item.id === examId), grade = data.grades?.find(item => item.id === gradeId);
  if (!exam || !grade || grade.subjectId !== exam.subjectId) throw new TypeError('Wähle eine vorhandene Note dieses Fachs.');
  return saveExamReflection(data, examId, { gradeId }, today);
}
/** Returned grade is an explicit draft until type, date, semester and weighting are supplied. */
export function buildReturnedExamGrade(data, examId, input, today) {
  const exam = data.exams?.find(item => item.id === examId);
  if (!exam || !date(today) || exam.date > today) throw new TypeError('Wähle eine bereits geschriebene Prüfung.');
  if (points(input?.points) === null) throw new TypeError('Trage das zurückgegebene Ergebnis mit 0 bis 15 Punkten ein.');
  if (!date(input.date) || input.date > today) throw new TypeError('Bestätige das tatsächliche Leistungsdatum.');
  if (!['written', 'oral', 'participation', 'presentation', 'other'].includes(input.type)) throw new TypeError('Bestätige die Leistungsart.');
  if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(input.semester)) throw new TypeError('Ordne die Leistung einem Halbjahr zu.');
  const weight = number(input.weight);
  if (weight === null || weight <= 0 || weight > 100000) throw new TypeError('Bestätige ein positives relatives Gewicht. Wenn es noch unbekannt ist, speichere vorerst nur das Feedback.');
  const existing = getReturnedExamGrade(data, examId);
  const matches = getPossibleExamGradeMatches(data, examId).filter(grade => grade.id !== existing?.id);
  if (!existing && matches.length && input.confirmNew !== true) throw new TypeError('Es gibt bereits eine mögliche Note zu dieser Prüfung. Verknüpfe sie oder bestätige ausdrücklich eine neue Leistung.');
  return { id: existing?.id || `recovery-grade-${examId}`, subjectId: exam.subjectId, points: points(input.points), type: input.type, date: input.date, semester: input.semester, weight, note: text(input.note || getExamReflection(data, examId)?.teacherFeedback) };
}

/** Explicit scenario; the written share is provided by the user, not a statutory guarantee. */
export function calculateClassroomRecovery({ writtenAverage, writtenShare, target, classroomPoints } = {}) {
  const written = points(writtenAverage), desired = points(target), share = number(writtenShare), classroom = points(classroomPoints);
  if (written === null || desired === null || share === null || share <= 0 || share >= 1) return { status: 'missing-data', requiredClassroom: null, projected: null, bestPossible: null, explanation: 'Für dieses Szenario fehlen schriftlicher Schnitt, Ziel oder der bestätigte/ausdrücklich angenommene schriftliche Anteil.' };
  const exact = (desired - written * share) / (1 - share), requiredClassroom = Math.max(0, exact), bestPossible = written * share + 15 * (1 - share);
  return { status: requiredClassroom > 15 + 1e-9 ? 'impossible' : 'achievable', requiredClassroom, minimumWholePoints: Math.ceil(requiredClassroom - 1e-9), projected: classroom === null ? null : written * share + classroom * (1 - share), bestPossible, writtenShare: share, explanation: 'Szenario aus schriftlichem Schnitt und einem zusammengefassten Mitarbeitswert. Weitere Leistungsarten und pädagogische Bewertung sind nur enthalten, wenn deine gewählten Anteile sie abbilden. Keine bestätigte Halbjahresnote.' };
}

const question = (id, prompt, solution, explanation, criteria = []) => ({ id, prompt, solution, explanation, criteria, kind: 'text' });
const unit = (id, title, objective, explanation, questions, extra = {}) => ({ id, subjectId: 'english', title, description: objective, objective, explanation, questions, materialLabel: 'Eigene Übung · keine Original-Klausur', match: new RegExp(`^${id}$`), reviewPrompt: 'Wiederhole die unsicherste Frage ohne Musterlösung und notiere genau eine Verbesserung.', ...extra });
export const RECOVERY_TUTOR_UNITS = [
  unit('recovery-english-diagnostic', 'Englisch · Fehlerursache eingrenzen', 'Textverständnis, Satzbau und Analyse getrennt prüfen.', 'Eine schlechte Selbsteinschätzung erklärt noch nicht die Ursache. Bearbeite die drei kurzen Aufgaben. Vergleiche anschließend die Lösungen und markiere die Aufgabe, bei der du Unterstützung brauchst. Das Ergebnis ist eine vorläufige Selbstdiagnose, keine Klausurnote.', [
    question('diagnose-reading', 'Read: “The school introduced tablets, but the report found no evidence that grades improved.” Does the sentence prove that tablets made grades worse? Explain in one English sentence.', 'No. It says there was no evidence of improvement, not that grades became worse.', 'Unterscheide fehlenden Nachweis von einem Nachweis des Gegenteils.', ['Keinen unbelegten Leistungsabfall behauptet?', 'No evidence of improvement korrekt erklärt?']),
    question('diagnose-grammar', 'Correct this sentence and explain the change: “Although the tablets were expensive, but the school bought them.”', 'Although the tablets were expensive, the school bought them. Alternatively: The tablets were expensive, but the school bought them.', 'Although leitet einen Nebensatz ein; but verbindet hier zwei Hauptsätze. Nutze nicht beide Verknüpfungen für denselben Gegensatz.', ['Although oder but passend verwendet?', 'Zwei vollständige Satzteile erhalten?']),
    question('diagnose-analysis', 'What does the contrast “a faster screen does not create a clearer thought” suggest? Write a claim, quote and explanation in three English sentences.', 'The writer questions the idea that faster technology automatically improves understanding. The contrast between “faster screen” and “clearer thought” separates speed from learning. It encourages readers to judge devices by their educational value.', 'Eine Analyse erklärt eine Wirkung und wiederholt nicht nur den Inhalt.', ['Aussage erkennbar?', 'Kurzer Beleg?', 'Wirkung erklärt?']),
  ]),
  unit('recovery-english-vocabulary', 'Englisch · Präzisen Wortschatz anwenden', 'Vier Wörter aus dem Kontext erklären und in einem Argument verwenden.', 'Evidence = Beleg; claim = Behauptung; inequality = Ungleichheit; opportunity = Chance. Lerne die Unterscheidung im Satz. “The text claims …” beschreibt eine Aussage; “The evidence suggests …” nennt deren Begründung und vermeidet unbelegte Sicherheit.', [
    question('vocabulary-gap', 'Fill in evidence / claim / inequality / opportunity: “The writer makes a ___ about fair access, but provides little ___. The article argues that financial ___ can limit educational ___.”', 'claim; evidence; inequality; opportunity.', 'A claim needs support. Inequality names a difference in access or resources; opportunity names a chance to act.'),
    question('vocabulary-precision', 'Replace the vague words in “The text says a good thing about people getting better stuff” with one precise sentence about equal educational opportunity.', 'One possible answer: The text argues that equal educational opportunity can improve access to qualifications.', 'Mehrere Antworten sind möglich. Prüfe, ob die Aussage ohne erfundene Textdetails präziser wird.', ['Aussage genau?', 'Passende Kollokation?', 'Keine unbelegten Details?']),
    question('vocabulary-transfer', 'Write two sentences explaining why a claim about inequality needs evidence. Use claim, evidence and opportunity.', 'A claim about inequality needs evidence to show which barriers actually exist. This helps readers judge whether people have equal opportunities.', 'Prüfe Bedeutung und grammatische Einbindung, statt nur die drei Wörter aufzulisten.'),
  ]),
  unit('recovery-english-comprehension', 'Englisch · Aussagen präzise lesen', 'Belegte Aussagen von Schlussfolgerungen unterscheiden.', 'Lies: “In a survey, 60 of 100 students said quiet rooms helped them concentrate. The study did not compare their grades. The library will test longer opening hours next month.” Eine Befragung zur Konzentration belegt keine Notenverbesserung. Eine geplante Änderung ist noch kein beobachtetes Ergebnis.', [
    question('comprehension-fact', 'What was actually measured, and how many students reported a benefit?', 'The survey measured students’ reported concentration. Sixty out of one hundred students reported a benefit.', 'Nenne die erfragte Selbstauskunft, keine erfundene Leistungsmessung.'),
    question('comprehension-inference', 'Is “quiet rooms improved examination grades” supported? Quote the limitation.', 'No. “The study did not compare their grades” means this claim was not tested.', 'Nicht belegt bedeutet weder wahr noch falsch nachgewiesen.'),
    question('comprehension-summary', 'Summarise the survey and its main limitation in two neutral English sentences.', 'Most surveyed students reported better concentration in quiet rooms. However, the study did not establish whether grades improved.', 'Im Präsens zusammenfassen, Kernaussage und Grenze unterscheiden.', ['Neutral?', 'Befund genannt?', 'Grenze erwähnt?']),
  ]),
  unit('recovery-english-grammar', 'Englisch · Satzverknüpfungen korrigieren', 'Drei typische Satzfehler erkennen und selbst verbessern.', 'Zwei Hauptsätze brauchen einen Punkt, ein Semikolon oder eine passende Konjunktion. Because und although leiten Nebensätze ein. Prüfe außerdem Kongruenz: “the writer argues”, aber “the writers argue”.', [
    question('grammar-boundary', 'Correct: “The argument is convincing, the evidence is limited.” Give two correct alternatives.', 'The argument is convincing, but the evidence is limited. / The argument is convincing; the evidence is limited.', 'Ein Komma allein verbindet im Englischen hier keine zwei Hauptsätze.'),
    question('grammar-agreement', 'Correct: “The author argue that every student need support.”', 'The author argues that every student needs support.', 'Author und every student sind jeweils Singular; im simple present bekommen die Verben hier -s.'),
    question('grammar-transfer', 'Write one sentence using although and one using because about evidence in an argument.', 'Although the claim is plausible, the writer provides little evidence. The argument is convincing because the examples support the claim.', 'Prüfe vollständigen Hauptsatz und sinnvolle logische Verbindung.', ['Hauptsatz vollständig?', 'Gegensatz/Grund passend?', 'Verbform korrekt?']),
  ]),
  unit('recovery-english-analysis', 'Englisch · Wirkung am Text erklären', 'Einen Analyseabsatz aus Aussage, Beleg und Wirkung verfassen.', 'Lies: “We celebrate every faster device, yet forget to ask whether it helps us think.” Der Gegensatz trennt technischen Fortschritt von seinem Zweck. Erkläre, wie die Wortwahl Leser zum Hinterfragen einer Annahme bewegt, statt nur “the author uses contrast” zu schreiben.', [
    question('recovery-analysis-claim', 'What assumption does the writer question? Answer in one precise English sentence.', 'The writer questions the assumption that faster technology automatically improves thinking.', 'Nenne die in Frage gestellte Verbindung; der Text lehnt Technik nicht pauschal ab.'),
    question('recovery-analysis-effect', 'Explain the effect of “celebrate” and “forget” in two sentences. Include both words as quotations.', '“Celebrate” suggests an enthusiastic, almost automatic welcome of new devices. “Forget” contrasts this excitement with neglect of their educational purpose, encouraging readers to reassess their priorities.', 'Verknüpfe konkrete Wörter mit ihrer Funktion im Argument.', ['Beide Wörter analysiert?', 'Gegensatz erklärt?', 'Wirkung passend begründet?']),
    question('recovery-analysis-paragraph', 'Write a 60–90-word analysis paragraph. Use a claim, one short quotation and an explanation of its effect.', 'The writer challenges an automatic enthusiasm for technology by contrasting excitement with neglected reflection. While “celebrate” conveys a positive, almost unquestioning response, “forget” exposes what this response leaves out. The wording suggests that speed alone is an inadequate measure of progress. It encourages readers to ask whether devices support meaningful thinking rather than assuming that every upgrade improves learning.', 'Eine mögliche Antwort. Prüfe die Verbindung von Wortwahl und Wirkung; deine Formulierung muss nicht identisch sein.', ['Klare Aussage?', 'Beleg eingebunden?', 'Wirkung erklärt?', 'Keine unbelegte Absicht behauptet?']),
  ]),
  unit('recovery-english-structure', 'Englisch · Einen Absatz logisch aufbauen', 'Eine Argumentationskette ohne Gedankensprung schreiben.', 'Ein Hauptabsatz führt von der Aussage über eine Begründung zu einem konkreten Beispiel und zurück zur Fragestellung. Jeder Satz sollte erklären, belegen oder begrenzen, was vorher behauptet wurde.', [
    question('structure-order', 'Put these notes in a logical order: A: A dictionary can clarify a word in a text. B: Devices help when they serve a specific task. C: Clear limits prevent a useful tool from becoming a distraction. D: This supports precise interpretation.', 'B → A → D → C.', 'Aussage, konkretes Beispiel, Erklärung und Einschränkung bilden eine nachvollziehbare Kette.'),
    question('structure-gap', 'Improve this argument by adding one explanatory sentence: “Phones should be allowed for dictionary work. A dictionary has many words.”', 'One possible addition: Checking alternative meanings helps students choose the interpretation that fits the context rather than translating mechanically.', 'Erkläre den Nutzen des Beispiels; “many words” begründet den Unterrichtseinsatz kaum.'),
    question('structure-transfer', 'Write a 70–100-word paragraph: Should schools reserve quiet rooms for independent study? Include a claim, an example, an explanation and a limitation.', 'Schools should reserve some quiet rooms because students need an environment suited to concentrated work. For example, a student revising a complex proof can work through each step without constant interruption. This can make independent study more manageable, although it does not automatically improve grades. Schools should therefore combine access to rooms with clear booking rules and support for effective practice.', 'Eine mögliche Position. Bewerte die logischen Verbindungen und Grenzen, nicht die Übereinstimmung deiner Meinung.', ['Aussage?', 'Konkretes Beispiel?', 'Nutzen erklärt?', 'Grenze genannt?']),
  ]),
  unit('recovery-english-time', 'Englisch · Kurze Analyse unter Zeitlimit', 'Planung, Schreiben und Kontrolle in einer kurzen Analyse verbinden.', 'Stelle für diese Übung selbst 8 Minuten ein: 1 Minute für Aussage und Beleg, 5 Minuten für einen Absatz, 2 Minuten für Kontrolle. Lies: “A louder argument is not necessarily a stronger one.” Priorisiere eine vollständige Begründung vor einer langen Einleitung.', [
    question('time-outline', 'Use one minute: note the claim, the contrast and one quotation you will analyse.', 'Claim: volume does not determine argumentative quality. Contrast: louder / stronger. Quotation: “not necessarily”.', 'Ein knapper Plan braucht einen Deutungsansatz und einen konkreten Wortbeleg.'),
    question('time-paragraph', 'Use five minutes: write a 50–80-word analysis of “A louder argument is not necessarily a stronger one.”', 'The sentence separates the force of delivery from the quality of reasoning. The contrast between “louder” and “stronger” questions the assumption that confidence proves an argument. “Not necessarily” avoids an absolute claim and leaves room for different cases. Readers are encouraged to examine evidence rather than accept the most forceful speaker.', 'Eine mögliche Deutung. Prüfe: Aussage, Beleg, Wirkung. Eine kurze vollständige Analyse ist hilfreicher als ein abgebrochener langer Absatz.', ['Vollständig innerhalb deines Zeitlimits?', 'Beleg?', 'Wirkung?', 'Differenzierung?']),
    question('time-check', 'Use two minutes: copy your weakest sentence, improve it, and write which part took too long.', 'Your answer depends on your paragraph. A useful revision replaces a vague phrase such as “has an effect” with an explanation of what readers are encouraged to reconsider.', 'Notiere die tatsächliche Schwierigkeit. Das selbst gesetzte Zeitlimit wird hier nicht automatisch als Klausurbedingung bewertet.'),
  ]),
];

const STAGES = [
  { id: 'diagnose', label: 'Fehler eingrenzen', offset: 0, minutes: 15 },
  { id: 'structure', label: 'Schwächste Fähigkeit üben', offset: 1, minutes: 20 },
  { id: 'practice', label: 'Eine kurze Aufgabe lösen', offset: 2, minutes: 20 },
  { id: 'review', label: 'Fehler korrigieren und erneut lösen', offset: 4, minutes: 15 },
  { id: 'timed', label: 'Verbesserung unter Zeitlimit prüfen', offset: 6, minutes: 20 },
];
export function getRecoveryPlan(data, examId, today) {
  const exam = data.exams?.find(item => item.id === examId), reflection = getExamReflection(data, examId);
  if (!exam || !reflection?.startDate || !date(today) || exam.date > today) return [];
  const cause = reflection.causes[0], specific = cause ? `recovery-english-${cause}` : 'recovery-english-diagnostic';
  return STAGES.map(stage => {
    const id = `recovery-${examId}-${stage.id}`, linked = (data.tasks || []).filter(task => task.revisionPlanId === id);
    const complete = linked.some(task => task.completed);
    return { ...stage, id, examId, subjectId: exam.subjectId, date: shift(reflection.startDate, stage.offset), completed: complete, provisional: !reflection.teacherFeedback.trim(), learningTopic: exam.subjectId === 'english' ? stage.id === 'diagnose' ? 'recovery-english-diagnostic' : stage.id === 'timed' ? 'recovery-english-time' : specific : '', title: `${data.subjects?.find(subject => subject.id === exam.subjectId)?.name || exam.title}: ${stage.label}`, reason: reflection.teacherFeedback ? 'Dein gespeichertes Prüfungsfeedback gezielt nacharbeiten.' : 'Vorläufige Diagnose: Die Ursache wird erst durch deine Antworten und das Prüfungsfeedback geklärt.', steps: [reflection.goal || 'Eine konkrete Fehlerart verstehen und beim nächsten Versuch vermeiden.', ...(reflection.teacherFeedback ? [reflection.teacherFeedback] : [])] };
  });
}
/** Return only the next due unit. The existing shared allocator owns the real time budget. */
export function getRecoveryCandidates(data, today) {
  return normalizeRecovery(data.recovery).records.flatMap(reflection => {
    if (reflection.closed || !reflection.startDate) return [];
    const plan = getRecoveryPlan(data, reflection.examId, today), next = plan.find(stage => !stage.completed);
    if (!next || next.date > today) return [];
    const exam = data.exams?.find(item => item.id === reflection.examId);
    const isPoor = reflection.mood === 'poor' || (getReturnedExamGrade(data, reflection.examId)?.points ?? 15) < 5;
    const score = isPoor ? 84 : 56;
    return [{ key: next.id, title: next.title, category: exam?.subjectId === 'english' || exam?.subjectId === 'german' ? 'language' : 'academics', minutes: next.minutes, score, priority: isPoor ? 'high' : 'medium', reason: next.reason, subjectId: next.subjectId, examId: next.examId, goalId: 'grades', revisionPlanId: next.id, revisionStage: `recovery-${next.id.split('-').at(-1)}`, learningTopic: next.learningTopic, objective: next.steps[0], expectedResult: 'Eine Antwort verbessern und die verbleibende Schwierigkeit festhalten.', steps: next.steps, resource: '' }];
  });
}
