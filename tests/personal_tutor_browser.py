"""Release journeys for explicit grade scenarios and interactive authored tutoring.

Run against a production build: python3 tests/personal_tutor_browser.py --url URL
All records below are isolated QA scenarios, never user defaults. Chromium mobile
emulation does not certify real Safari keyboard or native date input behaviour.
"""
import argparse
import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import time
import traceback
from playwright.sync_api import sync_playwright, expect
from coach_upgrade_browser import open_plan_view, select_profile_section, KEY, close_dialog, expand, navigate, no_overflow, state, wait_state

TODAY = '2026-10-25'
NOW = datetime(2026, 10, 25, 8, 0, tzinfo=timezone.utc)
RESULTS = Path(__file__).resolve().parents[1] / 'test-results' / 'personal-tutor'


class TutorSuite:
    def __init__(self, browser, url):
        self.browser, self.url = browser, url.rstrip('/') + '/'
        self.contexts, self.errors, self.console_errors = [], [], []
        self.base = None
        self.latest = None

    def page(self, seed=None, width=390, dark=False):
        context = self.browser.new_context(viewport={'width': width, 'height': 844},
            is_mobile=width < 760, has_touch=width < 760, timezone_id='Europe/Berlin',
            locale='de-DE', color_scheme='dark' if dark else 'light', accept_downloads=True)
        self.contexts.append(context)
        if seed is not None:
            context.add_init_script(f'if (!localStorage.getItem({json.dumps(KEY)})) localStorage.setItem({json.dumps(KEY)}, {json.dumps(json.dumps(seed))});')
        page = context.new_page()
        self.latest = page
        page.set_default_timeout(10000)
        page.clock.install(time=NOW)
        page.on('pageerror', lambda error: self.errors.append(str(error)))
        page.on('console', lambda message: self.console_errors.append(message.text) if message.type == 'error' else None)
        page.goto(self.url, wait_until='networkidle')
        return page

    def shot(self, page, name):
        page.screenshot(path=str(RESULTS / f'{name}.png'),
            full_page=not page.get_by_role('dialog').count(), animations='disabled')

    def first_launch_preserves_unknowns(self):
        page = self.page()
        expect(page.get_by_role('dialog', name='Dein persönlicher Lernplan')).to_be_visible()
        page.get_by_role('button', name='Später einrichten', exact=True).click()
        wait_state(page, 'data.onboardingCompleted')
        self.base = state(page)
        assert self.base['grades'] == []
        assert self.base['ielts']['scores'] == []
        no_overflow(page)

    def fixture(self, known_english=True):
        assert self.base
        data = copy.deepcopy(self.base)
        data['profile'].update({'name': 'Eric · isolierter Produkttest', 'schoolYear': 'Q1', 'graduationYear': '2028', 'theme': 'dark'})
        math = next(subject for subject in data['subjects'] if subject['id'] == 'mathematics')
        math.update({'written': 8.5, 'oral': None, 'baselineWritten': 8.5, 'baselineOral': None, 'target': 13, 'weakTopics': []})
        data['exams'] = [
            {'id': 'qa-math', 'subjectId': 'mathematics', 'title': 'Mathematik LK · Testfall', 'date': '2026-12-17', 'topics': [], 'format': 'written', 'target': 13, 'importance': 'normal'},
            {'id': 'qa-english', 'subjectId': 'english', 'title': 'Englisch GK · Testfall', 'date': '2026-10-26', 'topics': ['Civil Rights', 'Brown v. Board of Education'] if known_english else [], 'format': 'written', 'importance': 'high'},
        ]
        data['tasks'] = [{
            'id': 'qa-english-tutor', 'date': TODAY, 'title': 'Englisch · konkrete Klausurvorbereitung',
            'category': 'language', 'subjectId': 'english', 'examId': 'qa-english', 'minutes': 15,
            'priority': 'high', 'reason': 'Explizites QA-Szenario: Klausur am nächsten Tag.', 'origin': 'custom',
            'completed': False, 'completedAt': None, 'notes': 'Mein bisheriger Entwurf bleibt erhalten.', 'selfReview': [],
        }]
        return data

    def open_english(self, page):
        navigate(page, 'Heute')
        button = page.get_by_role('button', name='Lernaufgabe öffnen: Englisch · konkrete Klausurvorbereitung', exact=True)
        if not button.is_visible():
            expand(page.locator('.full-day'), 'Tagesplan & Verlauf')
        button.click()
        expect(page.get_by_role('region', name='Interaktive Lerneinheit')).to_be_visible()
        return page.get_by_role('dialog')

    def open_math(self, page):
        navigate(page, 'Fortschritt')
        page.get_by_role('button', name='Mathematik: Noten und Ziel berechnen', exact=True).click()
        return page.get_by_role('dialog', name='Mathematik', exact=True)

    def home_improvement_opens_the_relevant_subject(self):
        page = self.page(seed=self.fixture(), dark=True)
        expand(page.locator('.full-day'), 'Tagesplan & Verlauf')
        page.get_by_role('button', name='Fortschritt ansehen', exact=True).click()
        page.get_by_role('button', name='Mathematik: Noten und Ziel berechnen', exact=True).click()
        expect(page.get_by_role('dialog', name='Mathematik', exact=True)).to_be_visible()
        expect(page.get_by_role('dialog').locator('.forecast-result')).to_be_visible()
        no_overflow(page)

    def grade_baseline_is_not_a_confirmed_forecast(self):
        page = self.page(seed=self.fixture(), dark=True)
        dialog = self.open_math(page)
        expect(dialog.locator('.academic-subject-score')).to_contain_text('8,5')
        expect(dialog).to_contain_text('Ausgangswert · unbestätigt')
        expect(dialog.locator('.forecast-required')).to_contain_text('Offen')
        expect(dialog).to_contain_text('Datierte Noten mit Leistungsart')
        expect(dialog.locator('.grade-next-date')).to_contain_text('17.')
        assert state(page)['grades'] == []
        self.shot(page, '01-unconfirmed-grade-setup')
        no_overflow(page)

    def actual_weighted_next_score_and_remaining_scenarios(self):
        page = self.page(seed=self.fixture(), dark=True)
        dialog = self.open_math(page)
        dialog.get_by_role('button', name='Noten und Ziele für Mathematik einstellen', exact=True).click()
        page.get_by_label('Mein Fachziel · Punkte', exact=True).fill('13')
        page.get_by_label('Berechnung', exact=True).select_option('weighted')
        page.get_by_role('button', name='Einstellungen speichern', exact=True).click()
        for value, kind, date in [('8', 'written', '2026-10-20'), ('9', 'oral', '2026-10-22')]:
            dialog = page.get_by_role('dialog', name='Mathematik', exact=True)
            expand(dialog, 'Noten und Verlauf')
            dialog.get_by_role('button', name='Note', exact=True).click()
            entry = page.get_by_role('dialog', name='Note eintragen', exact=True)
            entry.get_by_label('Punkte (0–15)', exact=True).fill(value)
            entry.get_by_label('Leistungsart', exact=True).select_option(kind)
            entry.get_by_label('Datum', exact=True).fill(date)
            entry.get_by_label('Gewicht dieser Leistung', exact=True).fill('1')
            entry.get_by_role('button', name='Note speichern', exact=True).click()
        dialog = page.get_by_role('dialog', name='Mathematik', exact=True)
        expect(dialog.locator('.academic-subject-score')).to_contain_text('8,5')
        expect(dialog).to_contain_text('2 datierte Leistungen')
        expect(dialog.locator('.forecast-required')).to_contain_text('Offen')
        expand(dialog, 'Zielnote berechnen')
        dialog.get_by_label('Offene Leistungen', exact=True).select_option('1')
        dialog.get_by_label('Gewicht der nächsten Leistung', exact=True).fill('5')
        expect(dialog.locator('.forecast-required')).to_contain_text('15')
        expect(dialog.locator('.forecast-result')).to_contain_text('14,8')
        expect(dialog.locator('.forecast-status')).to_contain_text('Erreichbar')
        expand(dialog, 'Detaillierte Rechnung ansehen')
        expect(dialog.locator('.forecast-calculation')).to_contain_text('Gesamtgewicht')
        dialog.evaluate('(element) => {element.scrollTop=0}')
        self.shot(page, '02-achievable-next-exam-score')
        dialog.get_by_label('Gewicht der nächsten Leistung', exact=True).fill('1')
        expect(dialog.locator('.forecast-status')).to_contain_text('SO NICHT ERREICHBAR')
        expect(dialog.locator('.forecast-required')).to_contain_text('>15')
        expect(dialog.locator('.forecast-result')).to_contain_text('22')
        dialog.evaluate('(element) => {element.scrollTop=0}')
        self.shot(page, '02b-impossible-next-exam-score')
        dialog.get_by_label('Offene Leistungen', exact=True).select_option('2')
        dialog.get_by_label('Gewicht der nächsten Leistung', exact=True).fill('3')
        dialog.get_by_label('Leistungsart 2', exact=True).select_option('oral')
        dialog.get_by_label('Gewicht der Leistung 2', exact=True).fill('2')
        expect(dialog.locator('.forecast-required')).to_contain_text('Offen')
        expect(dialog.locator('.forecast-result')).to_contain_text('angenommenen Punkte')
        dialog.get_by_label('Angenommene Punkte der Leistung 2', exact=True).fill('15')
        expect(dialog.locator('.forecast-required')).to_contain_text('15')
        expect(dialog.locator('.forecast-result')).to_contain_text('14,7')
        dialog.get_by_role('group', name='Zielrechnung wählen').get_by_role('button', name='Alle offenen', exact=True).click()
        dialog.get_by_label('Angenommene Punkte der Leistung 2', exact=True).fill('')
        expect(dialog.locator('.forecast-result')).to_contain_text('14,8')
        expand(dialog, 'Detaillierte Rechnung ansehen')
        dialog.get_by_label('Vergleich: angenommene Punkte', exact=True).fill('12')
        expect(dialog.locator('.grade-outcome-row').filter(has_text='Schnitt in deinem Vergleichsszenario')).to_contain_text('11')
        expand(dialog, 'Was kann ich gezielt verbessern?')
        expect(dialog.locator('.grade-evidence')).to_contain_text('Aus einer Punktzahl lässt sich keine konkrete Schwäche ableiten')
        current = state(page)
        assert len(current['grades']) == 2
        saved = next(subject for subject in current['subjects'] if subject['id'] == 'mathematics')['forecast']
        assert saved['mode'] == 'remaining' and len(saved['future']) == 2
        assert saved['future'][1]['type'] == 'oral' and saved['future'][1]['points'] is None
        close_dialog(page)
        page.reload(wait_until='networkidle')
        dialog = self.open_math(page)
        expect(dialog.locator('.forecast-required')).to_contain_text('15')
        assert next(subject for subject in state(page)['subjects'] if subject['id'] == 'mathematics')['target'] == 13
        no_overflow(page)

    def guided_english_material_answers_and_mistakes(self):
        page = self.page(seed=self.fixture(), dark=True)
        dialog = self.open_english(page)
        expect(dialog).to_contain_text('Brown')
        expect(dialog.get_by_role('button', name='Lernen starten', exact=True)).to_be_visible()
        assert not dialog.get_by_label('Deine Antwort', exact=True).count(), 'The initial view must be concise.'
        self.shot(page, '03-english-start')
        dialog.get_by_role('button', name='Lernen starten', exact=True).click()
        expect(dialog).to_contain_text('1954')
        if dialog.get_by_role('button', name='Zu den Aufgaben', exact=True).count():
            dialog.get_by_role('button', name='Zu den Aufgaben', exact=True).click()
        answer = dialog.get_by_label('Deine Antwort', exact=True)
        answer.fill('QA-Entwurf: The Supreme Court ruled against segregated public schools.')
        wait_state(page, 'data.learning.sessions.some(item => item.taskId === "qa-english-tutor" && Object.values(item.answers).some(answer => answer.includes("QA-Entwurf")))')
        page.reload(wait_until='networkidle')
        dialog = self.open_english(page)
        expect(dialog.get_by_label('Deine Antwort', exact=True)).to_have_value(re.compile('QA-Entwurf'))
        assert not dialog.locator('.tutor-model-answer').count(), 'Solutions stay hidden until checking.'
        question_count = 0
        while question_count < 12:
            answer = dialog.get_by_label('Deine Antwort', exact=True)
            if not answer.input_value():
                answer.fill(f'QA-Antwort {question_count}: eine begründete eigene Antwort.')
            dialog.get_by_role('button', name='Antwort prüfen', exact=True).click()
            expect(dialog).to_contain_text(re.compile('Musterlösung', re.I))
            if question_count == 0:
                self.shot(page, '04-english-solution')
            dialog.get_by_role('button', name='Mit Mühe' if question_count == 0 else 'Selbstständig', exact=True).click()
            question_count += 1
            if dialog.get_by_role('button', name='Zur Wiederholung', exact=True).count():
                dialog.get_by_role('button', name='Zur Wiederholung', exact=True).click()
                break
            dialog.get_by_role('button', name='Nächste Aufgabe', exact=True).click()
        assert question_count >= 3, 'The authored history unit must contain real questions.'
        if dialog.get_by_label('Dein zweiter Versuch · 1', exact=True).count():
            dialog.get_by_label('Dein zweiter Versuch · 1', exact=True).fill('QA-Wiederholung: getrennte Schulen verletzten den gleichen Schutz nach dem 14. Zusatzartikel.')
        dialog.get_by_label('Dein wichtigster Fehler', exact=True).fill('QA-Fehler: Entscheidung, Verfassungsgrundlage und spätere Wirkung unterscheiden.')
        self.shot(page, '05-english-review')
        dialog.get_by_role('button', name='Einheit beenden', exact=True).click()
        wait_state(page, 'data.learning.sessions.some(item => item.taskId === "qa-english-tutor" && item.stage === "done" && item.completedAt)')
        current = state(page)
        session = next(item for item in current['learning']['sessions'] if item['taskId'] == 'qa-english-tutor')
        assert len(session['answers']) >= 3 and len(session['revealed']) >= 3
        attempt = next(item for item in current['learning']['attempts'] if item['taskId'] == 'qa-english-tutor')
        assert 'QA-Fehler' in attempt['mistake'] and attempt['nextReviewDate'] > TODAY
        assert next(item for item in current['tasks'] if item['id'] == 'qa-english-tutor')['notes'] == 'Mein bisheriger Entwurf bleibt erhalten.'
        assert current['grades'] == [] and current['ielts']['scores'] == [], 'Practice cannot manufacture proficiency evidence.'
        page.reload(wait_until='networkidle')
        assert next(item for item in state(page)['learning']['sessions'] if item['taskId'] == 'qa-english-tutor')['completedAt']
        no_overflow(page)

    def unknown_topic_requires_one_explicit_choice(self):
        page = self.page(seed=self.fixture(known_english=False), width=320, dark=True)
        dialog = self.open_english(page)
        selector = dialog.get_by_label('Lernthema wählen', exact=True)
        expect(selector).to_be_visible()
        assert not dialog.get_by_label('Deine Antwort', exact=True).count()
        option = selector.locator('option').filter(has_text=re.compile('Brown|Civil Rights')).first
        assert option.count(), 'An available authored unit must be an explicit choice.'
        selector.select_option(option.get_attribute('value'))
        dialog.get_by_role('button', name='Lernen starten', exact=True).click()
        expect(dialog).to_contain_text('1954')
        # Choosing a practice unit must not silently claim it is a confirmed exam topic.
        assert next(exam for exam in state(page)['exams'] if exam['id'] == 'qa-english')['topics'] == []
        self.shot(page, '06-topic-choice-320')
        no_overflow(page)

    def unsupported_topics_are_explicitly_unfinished(self):
        seed = self.fixture()
        next(exam for exam in seed['exams'] if exam['id'] == 'qa-english')['topics'] = ['QA: unconfigured specialist topic']
        page = self.page(seed=seed, width=320)
        dialog = self.open_english(page)
        expect(dialog.locator('.tutor-unavailable')).to_contain_text('Für dieses Thema noch keine interaktive Übung')
        assert not dialog.get_by_role('button', name='Lernen starten', exact=True).count()
        assert not dialog.get_by_label('Deine Antwort', exact=True).count()
        expect(dialog.get_by_label('Lernthema wählen', exact=True)).to_be_visible()
        assert next(exam for exam in state(page)['exams'] if exam['id'] == 'qa-english')['topics'] == ['QA: unconfigured specialist topic']
        self.shot(page, '07-unsupported-topic')
        no_overflow(page)

    def no_console_errors(self):
        assert not self.errors, self.errors
        assert not self.console_errors, self.console_errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--case')
    args = parser.parse_args()
    RESULTS.mkdir(parents=True, exist_ok=True)
    cases = ['first_launch_preserves_unknowns', 'home_improvement_opens_the_relevant_subject', 'grade_baseline_is_not_a_confirmed_forecast',
        'actual_weighted_next_score_and_remaining_scenarios', 'guided_english_material_answers_and_mistakes',
        'unknown_topic_requires_one_explicit_choice', 'unsupported_topics_are_explicitly_unfinished', 'no_console_errors']
    if args.case and args.case not in cases:
        parser.error('Unknown case')
    selected = cases if not args.case else ['first_launch_preserves_unknowns', args.case]
    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        suite = TutorSuite(browser, args.url)
        for name in selected:
            started = time.monotonic()
            try:
                getattr(suite, name)()
                results.append({'name': name, 'passed': True, 'seconds': round(time.monotonic()-started, 2)})
                print('PASS', name, flush=True)
            except Exception as error:
                results.append({'name': name, 'passed': False, 'error': str(error)})
                print('FAIL', name, error, flush=True)
                traceback.print_exc()
                if suite.latest:
                    suite.shot(suite.latest, 'FAIL-'+name)
                    (RESULTS / ('FAIL-'+name+'.txt')).write_text(suite.latest.locator('body').inner_text())
            finally:
                for context in suite.contexts:
                    context.close()
                suite.contexts = []
        browser.close()
    (RESULTS/'results.json').write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f'{sum(result["passed"] for result in results)}/{len(results)} browser cases passed', flush=True)
    raise SystemExit(0 if all(result['passed'] for result in results) else 1)

if __name__ == '__main__':
    main()
