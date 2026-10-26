"""Consumer-flow regression for the academic coach upgrade.

Run against a production preview:
    python3 tests/coach_upgrade_browser.py --url http://127.0.0.1:4176

All dates, grades, scores and achievements entered below are isolated test
scenarios. They are never written to the application defaults or a real account.
Chromium mobile emulation complements, but cannot replace, real iPhone Safari QA.
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

KEY = 'northstar.coach.v2'
TODAY = '2026-10-19'
NOW = datetime(2026, 10, 19, 7, 0, tzinfo=timezone.utc)
RESULTS = Path(__file__).resolve().parents[1] / 'test-results' / 'coach-upgrade'


def state(page):
    return page.evaluate('key => JSON.parse(localStorage.getItem(key))', KEY)


def wait_state(page, expression):
    page.wait_for_function(f'key => {{ const data = JSON.parse(localStorage.getItem(key)); return data && ({expression}); }}', arg=KEY)


def today_tasks(page):
    return [task for task in state(page)['tasks'] if task['date'] == TODAY and not task.get('skipped')]


def primary_nav(page):
    return page.locator('.bottom-nav') if page.locator('.bottom-nav').is_visible() else page.locator('.desktop-sidebar')


PROFILE_SECTIONS = {'Überblick':'Goals','Fächer':'Subjects','Erfahrungen':'Activities','Hochschulen':'Universities','IELTS & SAT':'IELTS','Zeitplan':'Timetable','Einstellungen':'Settings'}

def select_profile_section(page, label):
    selector = page.get_by_label('Profilbereich', exact=True)
    if selector.count():
        selector.select_option(PROFILE_SECTIONS[label])
    else:
        page.get_by_role('tab', name=label, exact=True).click()

def navigate(page, label):
    primary = {'Lernplan':'Lernen','Fortschritt':'Lernen','Profil':'Zukunft'}.get(label,label)
    primary_nav(page).get_by_role('button', name=primary, exact=True).click()
    if label == 'Lernplan':
        open_plan_view(page, 'Woche')
    elif label == 'Fortschritt':
        expand(page.locator('.learning-more'), 'Rückblick & Organisation')
        page.get_by_role('button', name='Wochenrückblick', exact=True).click()
    elif label == 'Profil':
        page.locator('.hub-list').get_by_role('button', name=re.compile('Mein Profil')).click()

def open_plan_view(page, label):
    if label == 'Studienweg':
        primary_nav(page).get_by_role('button', name='Zukunft', exact=True).click()
        page.locator('.hub-list').get_by_role('button', name=re.compile('Bewerbungsweg')).click()
        expand(page.locator('.future-hub'), 'Allgemeine Planung für USA & Deutschland')
        return
    primary_nav(page).get_by_role('button', name='Lernen', exact=True).click()
    patterns={'Woche':'^Wochenplan$','Stundenplan':'Stundenplan','Prüfungen':'Prüfungen','Termine':'Termine','Lernzeiten':'Lernzeit'}
    button=page.locator('.learning-menu').get_by_role('button', name=re.compile(patterns[label]))
    if not button.is_visible():
        page.locator('.learning-more').evaluate("el=>el.open=true")
    button.click()


def close_dialog(page):
    page.get_by_role('dialog').get_by_role('button', name='Dialog schließen', exact=True).click()


def expand(container, label):
    summary = container.locator('summary').filter(has_text=re.compile('^' + re.escape(label)))
    assert summary.count() == 1, f'Expected one disclosure: {label}'
    if summary.locator('xpath=..').get_attribute('open') is None:
        summary.click()



def open_task(page, title):
    button = page.get_by_role('button', name=f'Lernaufgabe öffnen: {title}', exact=True)
    if not button.is_visible():
        expand(page.locator('.full-day'), 'Tagesplan & Verlauf')
    button.click()

def no_overflow(page):
    widths = page.evaluate('''() => ({viewport:document.documentElement.clientWidth,
      document:document.documentElement.scrollWidth,body:document.body.scrollWidth})''')
    assert widths['document'] <= widths['viewport'] + 1, widths
    assert widths['body'] <= widths['viewport'] + 1, widths
    if page.get_by_role('dialog').count():
        dialog = page.get_by_role('dialog').evaluate('el => ({width:el.clientWidth,scroll:el.scrollWidth})')
        assert dialog['scroll'] <= dialog['width'] + 1, dialog


class Suite:
    def __init__(self, browser, url):
        self.browser = browser
        self.url = url.rstrip('/') + '/'
        self.contexts = []
        self.errors = []
        self.console_errors = []
        self.personal = None
        self.with_grades = None
        self.with_ielts = None
        self.latest = None

    def page(self, seed=None, raw=None, width=390, dark=False):
        context = self.browser.new_context(viewport={'width': width, 'height': 844},
            is_mobile=True, has_touch=True, timezone_id='Europe/Berlin', locale='de-DE',
            color_scheme='dark' if dark else 'light', accept_downloads=True)
        self.contexts.append(context)
        if seed is not None or raw is not None:
            content = raw if raw is not None else json.dumps(seed)
            context.add_init_script(f'if (!localStorage.getItem({json.dumps(KEY)})) localStorage.setItem({json.dumps(KEY)}, {json.dumps(content)});')
        page = context.new_page()
        self.latest = page
        page.set_default_timeout(8000)
        page.on('pageerror', lambda error: self.errors.append(str(error)))
        page.on('console', lambda message: self.console_errors.append(message.text) if message.type == 'error' else None)
        page.clock.install(time=NOW)
        page.goto(self.url, wait_until='networkidle')
        return page

    def personal_page(self, **kwargs):
        assert self.personal, 'Onboarding must succeed before dependent scenarios.'
        return self.page(seed=copy.deepcopy(self.personal), **kwargs)

    def shot(self, page, name):
        page.screenshot(path=str(RESULTS / f'{name}.png'), full_page=True, animations='disabled')

    def first_launch_onboarding(self):
        page = self.page()
        dialog = page.get_by_role('dialog', name='Dein persönlicher Lernplan')
        expect(dialog).to_be_visible()
        fresh = state(page)
        assert fresh['grades'] == [] and fresh['exams'] == []
        assert fresh['ielts']['examDate'] == '' and fresh['ielts']['scores'] == []
        assert all(subject['written'] is None and subject['oral'] is None for subject in fresh['subjects'])
        assert all(not activity.get('achievements') and not activity.get('impact') for activity in fresh['activities'])
        dialog.get_by_label('Dein Name (optional)', exact=True).fill('Eric')
        dialog.get_by_label('Aktuelle Schulphase', exact=True).select_option('Q1')
        dialog.get_by_label('Voraussichtliches Abiturjahr', exact=True).fill('2028')
        dialog.get_by_role('button', name='Weiter', exact=True).click()
        dialog.get_by_label('Zielschnitt in Kurspunkten (optional)', exact=True).fill('10')
        for name, written, oral in [('Mathematik', '6', '11'), ('Englisch', '', '7')]:
            dialog.get_by_label(f'{name}: Schriftlich (Punkte)', exact=True).fill(written)
            dialog.get_by_label(f'{name}: Mündlich (Punkte)', exact=True).fill(oral)
        dialog.get_by_label('Mathematik: schwierige Themen', exact=True).fill('Exponentialfunktionen')
        dialog.get_by_label('Deutsch: schwierige Themen', exact=True).fill('Literarische Analyse')
        dialog.get_by_role('button', name='Weiter', exact=True).click()
        dialog.get_by_label('Montag: verfügbare Lernminuten', exact=True).fill('120')
        dialog.get_by_label('Montag: Lernbeginn', exact=True).fill('16:00')
        dialog.get_by_label('Montag: Lernende', exact=True).fill('21:00')
        dialog.get_by_role('button', name='Weiter', exact=True).click()
        expect(dialog.get_by_text('Dein Lernplan wird an deine Ziele und verfügbare Zeit angepasst.', exact=True)).to_be_visible()
        dialog.get_by_role('button', name='Meinen Plan erstellen', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        wait_state(page, 'data.onboardingCompleted === true && data.profile.name === "Eric"')
        self.personal = state(page)
        assert str(self.personal['profile']['graduationYear']) == '2028'
        assert len(today_tasks(page)) in range(1, 6)
        assert sum(task['minutes'] for task in today_tasks(page)) <= 120
        expect(page.get_by_role('region', name='Dein wichtigster nächster Schritt')).to_be_visible()
        assert page.locator('[data-testid="daily-tasks"] .coach-task-open').count() <= 3
        expect(page.locator('.next-action .action-start')).to_be_visible()
        assert len(page.locator('.bottom-nav button').all()) == 3
        no_overflow(page)
        self.shot(page, '01-today')

    def fresh_skip_keeps_unknowns(self):
        page = self.page()
        page.get_by_role('button', name='Später einrichten', exact=True).click()
        wait_state(page, 'data.onboardingCompleted === true')
        assert all(subject['written'] is None and subject['oral'] is None for subject in state(page)['subjects'])
        navigate(page, 'Fortschritt')
        expect(page.locator('.academic-grades')).to_contain_text('Noch keine Ergebnisse')
        assert not state(page)['ielts']['examDate']
        no_overflow(page)

    def simple_grade_entry_forecast(self):
        page = self.personal_page()
        navigate(page, 'Fortschritt')
        page.get_by_role('button', name='Mathematik: Noten und Ziel berechnen', exact=True).click()
        for points, kind, date in [('6', 'written', '2026-10-18'), ('12', 'oral', TODAY)]:
            expand(page.get_by_role('dialog'), 'Noten und Verlauf')
            page.get_by_role('dialog').get_by_role('button', name='Note', exact=True).click()
            dialog = page.get_by_role('dialog', name='Note eintragen')
            dialog.get_by_label('Punkte (0–15)', exact=True).fill(points)
            dialog.get_by_label('Leistungsart', exact=True).select_option(kind)
            dialog.get_by_label('Datum', exact=True).fill(date)
            dialog.get_by_label('Halbjahr', exact=True).select_option('Q1')
            dialog.get_by_role('button', name='Note speichern', exact=True).click()
        detail = page.get_by_role('dialog', name='Mathematik', exact=True)
        expect(detail.locator('.academic-subject-score')).to_contain_text('9')
        expand(detail, 'Zielnote berechnen')
        detail.get_by_label('Offene Leistungen', exact=True).select_option('1')
        expect(detail.locator('.forecast-result')).to_contain_text('mindestens 12 Punkte')
        detail.get_by_role('button', name='Noten und Ziele für Mathematik einstellen', exact=True).click()
        page.get_by_label('Mein Fachziel · Punkte', exact=True).fill('15')
        page.get_by_role('button', name='Einstellungen speichern', exact=True).click()
        detail = page.get_by_role('dialog', name='Mathematik', exact=True)
        expect(detail.locator('.forecast-result')).to_contain_text('Mehr als 15 sind nicht möglich')
        expect(detail.locator('.forecast-result')).to_contain_text('SO NICHT ERREICHBAR')
        assert len(state(page)['grades']) == 2
        self.with_grades = state(page)
        self.shot(page, '02-grades-forecast')
        no_overflow(page)

    def weighted_grade_settings_and_missing_weights(self):
        assert self.with_grades
        page = self.page(seed=self.with_grades)
        navigate(page, 'Fortschritt')
        page.get_by_role('button', name='Mathematik: Noten und Ziel berechnen', exact=True).click()
        page.get_by_role('button', name='Noten und Ziele für Mathematik einstellen', exact=True).click()
        page.get_by_label('Berechnung', exact=True).select_option('weighted')
        page.get_by_label('Mein Fachziel · Punkte', exact=True).fill('10')
        page.get_by_role('button', name='Einstellungen speichern', exact=True).click()
        expect(page.get_by_role('dialog')).to_contain_text('Gewicht')
        for points, date, weight in [('6', '2026-10-18', '2'), ('12', TODAY, '1')]:
            expand(page.get_by_role('dialog'), 'Noten und Verlauf')
            page.get_by_role('button', name=f'Note {points} vom {date} bearbeiten', exact=True).click()
            page.get_by_label('Gewicht dieser Leistung', exact=True).fill(weight)
            page.get_by_role('button', name='Note speichern', exact=True).click()
        dialog = page.get_by_role('dialog')
        expect(dialog.locator('.academic-subject-score')).to_contain_text('8')
        expand(dialog, 'Zielnote berechnen')
        dialog.get_by_label('Offene Leistungen', exact=True).select_option('1')
        expect(dialog.locator('.forecast-result')).to_contain_text('fehlt')
        dialog.get_by_label('Gewicht der nächsten Leistung', exact=True).fill('2')
        expect(dialog.locator('.forecast-result')).to_contain_text('mindestens 13 Punkte')
        close_dialog(page)
        page.reload(wait_until='networkidle')
        assert next(subject for subject in state(page)['subjects'] if subject['id'] == 'mathematics')['grading']['mode'] == 'weighted'
        assert sorted(grade['weight'] for grade in state(page)['grades']) == [1, 2]

    def semester_assignment_and_edit_delete(self):
        assert self.with_grades
        page = self.page(seed=self.with_grades)
        navigate(page, 'Fortschritt')
        page.get_by_role('button', name='Mathematik: Noten und Ziel berechnen', exact=True).click()
        expand(page.get_by_role('dialog'), 'Noten und Verlauf')
        page.get_by_role('button', name=f'Note 12 vom {TODAY} bearbeiten', exact=True).click()
        page.get_by_label('Halbjahr', exact=True).select_option('Q2')
        page.get_by_role('button', name='Note speichern', exact=True).click()
        expand(page.get_by_role('dialog'), 'Noten und Verlauf')
        page.get_by_label('Halbjahr anzeigen', exact=True).select_option('Q1')
        expect(page.get_by_role('dialog').locator('.academic-subject-score')).to_contain_text('6')
        page.get_by_label('Halbjahr anzeigen', exact=True).select_option('Q2')
        expect(page.get_by_role('dialog').locator('.academic-subject-score')).to_contain_text('12')
        page.get_by_role('button', name=f'Note 12 vom {TODAY} löschen', exact=True).click()
        page.get_by_role('dialog').get_by_role('button', name='Löschen', exact=True).click()
        wait_state(page, 'data.grades.length === 1')
        assert state(page)['grades'][0]['points'] == 6

    def exam_creates_preparation_and_priority(self):
        page = self.personal_page()
        navigate(page, 'Lernplan')
        open_plan_view(page, 'Prüfungen')
        page.get_by_role('button', name='Prüfung hinzufügen', exact=True).click()
        dialog = page.get_by_role('dialog')
        expect(dialog.get_by_label('Prüfungsdatum', exact=True)).to_have_value('')
        dialog.get_by_label('Fach', exact=True).select_option('mathematics')
        dialog.get_by_label('Prüfungstitel', exact=True).fill('Mathematik LK · Testfall')
        dialog.get_by_label('Prüfungsdatum', exact=True).fill('2026-10-26')
        dialog.get_by_label('Uhrzeit · optional', exact=True).fill('09:00')
        dialog.get_by_label('Prüfungsthemen', exact=True).fill('Exponentialfunktionen\nWachstumsmodelle')
        dialog.get_by_label('Bedeutung', exact=True).select_option('high')
        dialog.get_by_role('button', name='Lernplan erstellen', exact=True).click()
        exam = state(page)['exams'][0]
        assert exam['date'] == '2026-10-26' and len(exam['topics']) == 2
        expand(page.locator('.exam-card'), 'Vorbereitungsplan')
        assert page.locator('.revision-stage').count() >= 3
        navigate(page, 'Heute')
        tasks = today_tasks(page)
        assert any(task.get('examId') == exam['id'] for task in tasks)
        assert tasks[0].get('subjectId') == 'mathematics'
        expect(page.locator('.next-deadline')).to_contain_text('Mathematik')
        expect(page.locator('.next-deadline')).to_contain_text('26. Okt.')
        no_overflow(page)

    def timetable_blocks_lessons_and_detects_conflicts(self):
        page = self.personal_page()
        navigate(page, 'Lernplan')
        open_plan_view(page, 'Stundenplan')
        page.get_by_role('button', name='Erste Stunde hinzufügen', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Fach', exact=True).select_option('mathematics')
        dialog.get_by_label('Wochentag', exact=True).select_option('1')
        dialog.get_by_label('Beginn', exact=True).fill('16:00')
        dialog.get_by_label('Ende', exact=True).fill('17:00')
        dialog.get_by_label('Raum · optional', exact=True).fill('A12')
        dialog.get_by_role('button', name='Stunde speichern', exact=True).click()
        assert state(page)['schedule']['lessons'][0]['room'] == 'A12'
        page.get_by_role('button', name='Stunde', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Wochentag', exact=True).select_option('1')
        dialog.get_by_label('Beginn', exact=True).fill('16:30')
        dialog.get_by_label('Ende', exact=True).fill('17:30')
        dialog.get_by_role('button', name='Stunde speichern', exact=True).click()
        expect(dialog.get_by_role('alert').first).to_contain_text(re.compile('überschneidet|Überschneidung'))
        assert len(state(page)['schedule']['lessons']) == 1
        close_dialog(page)
        navigate(page, 'Heute')
        for task in today_tasks(page):
            for session in task.get('sessions', []):
                assert session['end'] <= '16:00' or session['start'] >= '17:00', session

    def alternating_timetable(self):
        page = self.personal_page()
        navigate(page, 'Lernplan')
        open_plan_view(page, 'Stundenplan')
        page.get_by_role('button', name='Erste Stunde hinzufügen', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Wochentag', exact=True).select_option('1')
        dialog.get_by_label('Beginn', exact=True).fill('16:00')
        dialog.get_by_label('Ende', exact=True).fill('17:00')
        dialog.get_by_label('Wiederholung', exact=True).select_option('A')
        dialog.get_by_role('button', name='Stunde speichern', exact=True).click()
        expect(page.get_by_text('A/B-Woche noch offen', exact=True)).to_be_visible()
        page.get_by_label('Ein Datum in einer bekannten A-Woche', exact=True).fill(TODAY)
        page.get_by_role('button', name='Wochenrhythmus speichern', exact=True).click()
        wait_state(page, f'data.schedule.cycleAnchor === "{TODAY}"')
        expect(page.get_by_text('A-Woche', exact=True).first).to_be_visible()
        page.get_by_role('group', name='Stundenplan-Ansicht').get_by_role('button', name='Woche', exact=True).click()
        assert page.locator('.timetable-week .lesson-row').count() == 1
        page.get_by_role('button', name='Nächste Woche', exact=True).click()
        assert page.locator('.timetable-week .lesson-row').count() == 0

    def ielts_setup_results_and_skill_priorities(self):
        page = self.personal_page()
        navigate(page, 'Profil')
        select_profile_section(page, 'IELTS & SAT')
        page.get_by_role('button', name='Ziel festlegen', exact=True).click()
        dialog = page.get_by_role('dialog')
        expect(dialog.get_by_label('Prüfungsdatum (optional)', exact=True)).to_have_value('')
        dialog.get_by_label('Prüfungsdatum (optional)', exact=True).fill('2026-11-30')
        dialog.get_by_label('Ziel · Overall Band', exact=True).fill('7')
        dialog.get_by_label('Writing · Ziel', exact=True).fill('7')
        dialog.get_by_label('IELTS-Zeit pro Woche · Minuten', exact=True).fill('120')
        dialog.get_by_role('button', name='Ziel speichern', exact=True).click()
        page.get_by_role('button', name='Ergebnis erfassen', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Ergebnisart', exact=True).select_option('mock')
        for skill, score in [('Listening', '7'), ('Reading', '7'), ('Writing', '5'), ('Speaking', '7')]:
            dialog.get_by_label(f'{skill} · Band', exact=True).fill(score)
        expect(dialog).to_contain_text('Overall aus vier Bereichen: 6.5')
        dialog.get_by_role('button', name='Ergebnis speichern', exact=True).click()
        wait_state(page, 'data.ielts.scores.length === 1')
        assert state(page)['ielts']['scores'][0]['source'] == 'mock'
        expect(page.locator('.ielts-coach')).to_contain_text('In 42 Tagen')
        expect(page.locator('.ielts-next')).to_contain_text('Writing hat aktuell den größten bekannten Abstand')
        assert '%' not in page.locator('.ielts-coach').inner_text(), 'Readiness must not be a fabricated percentage.'
        self.with_ielts = state(page)
        self.shot(page, '03-ielts')
        navigate(page, 'Heute')
        assert any(task.get('ieltsSkill') == 'writing' for task in today_tasks(page)), today_tasks(page)
        assert sum(bool(task.get('ieltsSkill')) for task in today_tasks(page)) <= 1
        assert state(page)['ielts']['scores'][0]['skills']['writing'] == 5
        no_overflow(page)

    def ielts_mistake_edit_and_result_delete(self):
        assert self.with_ielts
        page = self.page(seed=self.with_ielts)
        navigate(page, 'Profil')
        select_profile_section(page, 'IELTS & SAT')
        writing = page.locator('details.ielts-skill').filter(has=page.locator('summary').filter(has_text='Writing'))
        writing.locator('summary').click()
        writing.get_by_role('button', name='Fehlernotiz hinzufügen', exact=True).click()
        page.get_by_label('Was passiert wiederholt?', exact=True).fill('Testnotiz: zweiten Fragenteil vollständig beantworten.')
        page.get_by_role('button', name='Notiz speichern', exact=True).click()
        wait_state(page, 'data.ielts.mistakes.writing.includes("Testnotiz")')
        expand(page.locator('.ielts-history'), 'Ergebnisse')
        page.get_by_role('button', name=f'IELTS-Ergebnis vom {TODAY} bearbeiten', exact=True).click()
        page.get_by_label('Ergebnisart', exact=True).select_option('self')
        page.get_by_role('button', name='Ergebnis speichern', exact=True).click()
        expect(page.locator('.ielts-coach')).to_contain_text('Noch keine vollständige Probeprüfung')
        page.get_by_role('button', name=f'IELTS-Ergebnis vom {TODAY} löschen', exact=True).click()
        page.get_by_role('dialog').get_by_role('button', name='Löschen', exact=True).click()
        wait_state(page, 'data.ielts.scores.length === 0')
        assert 'Testnotiz' in state(page)['ielts']['mistakes']['writing']

    def application_profile_evidence(self):
        page = self.personal_page()
        navigate(page, 'Profil')
        select_profile_section(page, 'Erfahrungen')
        page.get_by_role('button', name='Hinzufügen', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Name der Erfahrung', exact=True).fill('Codingprojekt · QA-Test')
        dialog.get_by_label('Was ich mache', exact=True).fill('Isolierter Testeintrag: einen eigenen Lernplaner entwickeln.')
        dialog.get_by_label('Meine Verantwortung', exact=True).fill('Entwurf, Implementierung und Tests.')
        dialog.get_by_label('Projekt- oder GitHub-Link (optional)', exact=True).fill('https://github.com/96gb7p6wfp-a11y/chat')
        dialog.get_by_label('Stand deiner Angaben', exact=True).select_option('verified')
        dialog.get_by_role('button', name='Erfahrung speichern', exact=True).click()
        expect(dialog.get_by_role('alert')).to_contain_text('Nachweis')
        dialog.get_by_role('button', name='Nachweis hinzufügen', exact=True).click()
        dialog.get_by_label('Bezeichnung 1', exact=True).fill('Testbeleg')
        dialog.get_by_label('Notiz zum Nachweis 1', exact=True).fill('QA-Beleg ohne behauptetes reales Ergebnis.')
        dialog.get_by_role('button', name='Erfahrung speichern', exact=True).click()
        wait_state(page, 'data.activities.some(activity => activity.name === "Codingprojekt · QA-Test")')
        record = next(item for item in state(page)['activities'] if item['name'] == 'Codingprojekt · QA-Test')
        assert record['evidenceStatus'] == 'verified' and len(record['evidence']) == 1
        assert record['hoursPerWeek'] is None and record['startDate'] == ''
        expect(page.get_by_text('Codingprojekt · QA-Test', exact=True)).to_be_visible()
        assert not re.search(r'\d+\s*%.*(?:Zulassung|admission)', page.locator('body').inner_text(), re.I)

    def guided_learning_reflection_and_completion(self):
        page = self.personal_page()
        academic = next(task for task in today_tasks(page) if task.get('subjectId') and not task.get('roadmapStepId'))
        open_task(page, academic['title'])
        expect(page.get_by_role('region', name='Interaktive Lerneinheit')).to_be_visible()
        if page.get_by_label('Lernthema wählen', exact=True).is_visible():
            selector = page.get_by_label('Lernthema wählen', exact=True)
            selector.select_option(selector.locator('option:not([value=""])').first.get_attribute('value'))
        page.get_by_role('button', name='Lernen starten', exact=True).click()
        if page.get_by_role('button', name='Zu den Aufgaben', exact=True).count():
            page.get_by_role('button', name='Zu den Aufgaben', exact=True).click()
        for index in range(12):
            page.get_by_label('Deine Antwort', exact=True).fill(f'Testantwort {index}: eigener Versuch mit nachvollziehbarer Begründung.')
            page.get_by_role('button', name='Antwort prüfen', exact=True).click()
            expect(page.locator('.tutor-model-answer')).not_to_have_text('')
            page.get_by_role('button', name='Mit Mühe' if index == 0 else 'Selbstständig', exact=True).click()
            if page.get_by_role('button', name='Zur Wiederholung', exact=True).count():
                page.get_by_role('button', name='Zur Wiederholung', exact=True).click()
                break
            page.get_by_role('button', name='Nächste Aufgabe', exact=True).click()
        if page.get_by_label('Dein zweiter Versuch · 1', exact=True).count():
            page.get_by_label('Dein zweiter Versuch · 1', exact=True).fill('Zweiter eigener Versuch mit geprüftem Rechenweg und korrigierter Begründung.')
        page.get_by_label('Dein wichtigster Fehler', exact=True).fill('Testfehler: die Begründung und den Lösungsweg genauer prüfen.')
        page.get_by_role('button', name='Einheit beenden', exact=True).click()
        wait_state(page, 'data.learning.attempts.length === 1')
        attempt = state(page)['learning']['attempts'][0]
        assert attempt['nextReviewDate'] > TODAY and 'Testfehler' in attempt['mistake']
        assert state(page)['grades'] == [] and state(page)['ielts']['scores'] == []
        wait_state(page, f'data.tasks.some(task => task.id === {json.dumps(academic["id"])} && task.completed)')
        navigate(page, 'Fortschritt')
        expect(page.locator('body')).to_contain_text('1 /')
        no_overflow(page)

    def task_skip_preserves_draft_and_rebalances(self):
        page = self.personal_page()
        task = next(task for task in today_tasks(page) if task.get('subjectId') and not task.get('roadmapStepId'))
        open_task(page, task["title"])
        expand(page.get_by_role('dialog'), 'Notizen & Entwürfe')
        page.get_by_label('Deine gespeicherten Notizen', exact=True).fill('Dieser Entwurf darf beim Neuplanen nicht verschwinden.')
        expand(page.get_by_role('dialog'), 'Aufgabe anpassen')
        page.get_by_role('button', name='Heute auslassen', exact=True).click()
        wait_state(page, f'data.tasks.some(task => task.id === {json.dumps(task["id"])} && task.skipped)')
        retained = next(item for item in state(page)['tasks'] if item['id'] == task['id'])
        assert 'Entwurf' in retained['notes']
        assert len(today_tasks(page)) <= 5
        assert sum(item['minutes'] for item in today_tasks(page)) <= 120
        expand(page.locator('.full-day'), 'Tagesplan & Verlauf')
        expect(page.locator('summary').filter(has_text='Für später gespeichert')).to_be_visible()

    def focus_start_pause_resume_saves_actual_time(self):
        page = self.personal_page()
        task = today_tasks(page)[0]
        open_task(page, task["title"])
        expand(page.get_by_role('dialog'), 'Fokustimer')
        page.get_by_role('button', name='Fokus starten', exact=True).click()
        expect(page.get_by_role('dialog', name='Fokuszeit')).to_be_visible()
        page.clock.fast_forward(35000)
        page.get_by_role('dialog').get_by_role('button', name='Pausieren', exact=True).click()
        paused = state(page)['study']['active']
        assert paused['runningSince'] is None
        page.clock.fast_forward(20000)
        page.get_by_role('dialog').get_by_role('button', name='Fortsetzen', exact=True).click()
        page.clock.fast_forward(25000)
        page.get_by_role('dialog').get_by_role('button', name='Beenden & speichern', exact=True).click()
        wait_state(page, 'data.study.sessions.length === 1 && data.study.active === null')
        session = state(page)['study']['sessions'][0]
        assert 60 <= session['seconds'] <= 62, session
        assert not next(item for item in state(page)['tasks'] if item['id'] == task['id'])['completed']
        page.get_by_role('dialog').get_by_role('button', name='Aufgabe abschließen', exact=True).click()
        wait_state(page, f'data.tasks.some(task => task.id === {json.dumps(task["id"])} && task.completed)')

    def task_move_edit_replace(self):
        page = self.personal_page()
        task = today_tasks(page)[0]
        open_task(page, task["title"])
        expand(page.get_by_role('dialog'), 'Aufgabe anpassen')
        page.get_by_role('button', name='Verschieben', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Neuer Tag', exact=True).fill('2026-10-20')
        dialog.get_by_role('button', name='Verschieben', exact=True).click()
        wait_state(page, f'data.tasks.some(task => task.id === {json.dumps(task["id"])} && task.date === "2026-10-20")')
        assert len(today_tasks(page)) <= 5
        chosen = today_tasks(page)[0]
        open_task(page, chosen["title"])
        expand(page.get_by_role('dialog'), 'Aufgabe anpassen')
        page.get_by_role('button', name='Bearbeiten', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Aufgabe', exact=True).fill('Gezielt überarbeitete Testaufgabe')
        dialog.get_by_label('Dauer (Minuten)', exact=True).fill('15')
        dialog.get_by_role('button', name='Änderungen speichern', exact=True).click()
        wait_state(page, f'data.tasks.some(task => task.id === {json.dumps(chosen["id"])} && task.title === "Gezielt überarbeitete Testaufgabe")')
        generated = next(item for item in today_tasks(page) if item['origin'] == 'generated' and item['id'] != chosen['id'])
        open_task(page, generated["title"])
        expand(page.get_by_role('dialog'), 'Aufgabe anpassen')
        page.get_by_role('button', name='Andere Aufgabe wählen', exact=True).click()
        wait_state(page, f'data.tasks.some(task => task.id === {json.dumps(generated["id"])} && task.skipped)')
        assert len(today_tasks(page)) <= 5

    def backup_roundtrip_and_bad_file_safety(self):
        seed = self.with_ielts or self.personal
        page = self.page(seed=seed)
        navigate(page, 'Profil')
        select_profile_section(page, 'Einstellungen')
        with page.expect_download() as download:
            page.get_by_role('button', name='Backup exportieren', exact=True).click()
        file = RESULTS / 'personal-test-backup.json'
        download.value.save_as(file)
        backup = json.loads(file.read_text())
        assert backup['profile']['name'] == 'Eric'
        if self.with_ielts:
            assert backup['ielts']['scores'][0]['skills']['writing'] == 5
        before = state(page)
        page.locator('input[type=file]').set_input_files({'name': 'broken.json', 'mimeType': 'application/json', 'buffer': b'{broken'})
        expect(page.get_by_role('dialog')).to_have_count(0)
        assert state(page) == before
        page.locator('input[type=file]').set_input_files(file)
        dialog = page.get_by_role('dialog')
        expect(dialog).to_be_visible()
        dialog.get_by_role('button', name='Wiederherstellen', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        assert state(page)['profile'] == backup['profile']
        if self.with_ielts:
            assert state(page)['ielts'] == backup['ielts']

    def corrupt_saved_data_recovery(self):
        page = self.page(raw='{not valid JSON')
        expect(page.get_by_role('alert')).to_be_visible()
        assert page.evaluate('() => Object.values(localStorage).some(value => value === "{not valid JSON")')
        assert len(page.locator('.bottom-nav button').all()) == 3
        no_overflow(page)

    def empty_states_have_a_next_action(self):
        seed = copy.deepcopy(self.personal)
        seed['activities'] = []
        seed['universities'] = []
        seed['exams'] = []
        seed['tasks'] = []
        seed['schedule']['timeOverrides'] = [{'date': TODAY, 'minutes': 0}]
        page = self.page(seed=seed)
        expect(page.get_by_role('heading', name='Heute bleibt frei.', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Lernzeit anpassen', exact=True)).to_be_visible()
        navigate(page, 'Lernplan')
        open_plan_view(page, 'Prüfungen')
        expect(page.get_by_role('heading', name='Noch keine Prüfungen', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Prüfung hinzufügen', exact=True)).to_be_visible()
        navigate(page, 'Profil')
        select_profile_section(page, 'Erfahrungen')
        expect(page.get_by_role('button', name='Erfahrung hinzufügen', exact=True)).to_be_visible()
        select_profile_section(page, 'Hochschulen')
        expect(page.get_by_role('button', name='Hochschule speichern', exact=True)).to_be_visible()
        no_overflow(page)

    def keyboard_height_modal_stays_usable(self):
        page = self.personal_page()
        navigate(page, 'Profil')
        select_profile_section(page, 'IELTS & SAT')
        page.get_by_role('button', name='Ergebnis erfassen', exact=True).click()
        page.set_viewport_size({'width': 390, 'height': 390})
        notes = page.get_by_label('Notiz (optional)', exact=True)
        notes.fill('Längere Testnotiz bei geöffneter Bildschirmtastatur.')
        notes.focus()
        box = notes.bounding_box()
        assert box and box['y'] >= 0 and box['y'] < 390, box
        page.get_by_label('Writing · Band', exact=True).fill('6')
        page.get_by_role('button', name='Ergebnis speichern', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        assert state(page)['ielts']['scores'][0]['skills']['writing'] == 6
        no_overflow(page)

    def weekly_review_changes_next_week(self):
        page = self.personal_page()
        navigate(page, 'Fortschritt')
        page.get_by_role('button', name='Woche reflektieren', exact=True).click()
        page.get_by_label('Was hat funktioniert? Was möchtest du ändern?', exact=True).fill('Testreflexion: nächste Woche Deutsch früher beginnen.')
        page.get_by_label('Schwerpunkt für die nächste Woche', exact=True).select_option('german')
        page.get_by_label('Lernumfang nächste Woche', exact=True).select_option('lighter')
        page.get_by_role('button', name='Speichern und nächste Woche anpassen', exact=True).click()
        wait_state(page, 'data.weeklyReviews.length === 1')
        review = state(page)['weeklyReviews'][0]
        assert review['focusSubjectId'] == 'german' and review['effort'] == 'lighter'
        expect(page.locator('.weekly-review-card')).to_contain_text('Testreflexion')
        assert page.locator('.next-week-priorities li').count() > 0

    def iphone_sizes_dark_and_large_text(self):
        for width in [320, 390, 430]:
            page = self.personal_page(width=width, dark=width == 430)
            for label in ['Heute', 'Lernplan', 'Fortschritt', 'Profil']:
                navigate(page, label)
                no_overflow(page)
            navigate(page, 'Profil')
            for label in ['Überblick', 'Fächer', 'Erfahrungen', 'Hochschulen', 'IELTS & SAT', 'Zeitplan', 'Einstellungen']:
                select_profile_section(page, label)
                no_overflow(page)
            page.add_style_tag(content=':root { font-size: 200% !important; }')
            for label in ['Heute', 'Lernplan', 'Fortschritt', 'Profil']:
                navigate(page, label)
                no_overflow(page)
            self.shot(page, f'04-iphone-{width}-large-text')
            if width == 430:
                assert page.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()') not in ['#f8f9fb', '#fff', '#ffffff']

    def pwa_offline_reopens_saved_plan(self):
        page = self.personal_page()
        page.evaluate('navigator.serviceWorker.ready')
        page.reload(wait_until='networkidle')
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        page.context.set_offline(True)
        page.reload(wait_until='domcontentloaded')
        expect(page.get_by_role('region', name='Dein wichtigster nächster Schritt')).to_be_visible()
        assert state(page)['profile']['name'] == 'Eric'
        navigate(page, 'Fortschritt')
        expect(page.get_by_role('heading', name='Meine Noten', exact=True)).to_be_visible()
        page.context.set_offline(False)

    def no_console_errors(self):
        assert not self.errors, self.errors
        assert not self.console_errors, self.console_errors

    def university_pathways_keep_independent_progress(self):
        page = self.personal_page()
        navigate(page, 'Lernplan')
        open_plan_view(page, 'Studienweg')
        usa_button = page.get_by_role('button', name='USA', exact=True)
        usa_button.click()
        expect(page.locator('.roadmap-phase').first).to_be_visible()
        first_check = page.locator('.roadmap-item button.task-check').first
        first_check.click()
        wait_state(page, 'data.roadmapCompleted.length === 1')
        usa_id = state(page)['roadmapCompleted'][0]
        assert usa_id.startswith('USA-')
        page.get_by_role('button', name='Deutschland', exact=True).click()
        expect(page.locator('.roadmap-phase').first).to_be_visible()
        page.locator('.roadmap-item button.task-check').first.click()
        wait_state(page, 'data.roadmapCompleted.length === 2')
        assert any(key.startswith('Germany-') for key in state(page)['roadmapCompleted'])
        assert usa_id in state(page)['roadmapCompleted']
        page.reload(wait_until='networkidle')
        assert len(state(page)['roadmapCompleted']) == 2
        navigate(page, 'Heute')
        linked = next(task for task in today_tasks(page) if task.get('roadmapItemId'))
        open_task(page, linked['title'])
        expand(page.get_by_role('dialog'), 'Aufgabe & Planung')
        page.get_by_role('button', name='Zum Studienweg', exact=True).click()
        expect(page.locator(f'[data-milestone-id="{linked["roadmapItemId"]}"]')).to_be_attached()
        assert len(state(page)['roadmapCompleted']) == 2
        no_overflow(page)

    def missed_work_preserves_history_and_replans(self):
        page = self.personal_page()
        original = today_tasks(page)
        task = original[0]
        open_task(page, task['title'])
        dialog = page.get_by_role('dialog')
        expand(dialog, 'Notizen & Entwürfe')
        dialog.get_by_label('Deine gespeicherten Notizen', exact=True).fill('Testentwurf: diesen Lösungsweg morgen weiter prüfen.')
        close_dialog(page)
        wait_state(page, 'data.tasks.some(task => task.notes.includes("Testentwurf"))')
        page.clock.set_system_time(datetime(2026, 10, 20, 7, 0, tzinfo=timezone.utc))
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        wait_state(page, 'data.tasks.some(task => task.date === "2026-10-20")')
        current = state(page)
        old = [item for item in current['tasks'] if item['date'] == TODAY]
        assert {item['id'] for item in old} == {item['id'] for item in original}
        assert next(item for item in old if item['id'] == task['id'])['notes'].startswith('Testentwurf')
        active = [item for item in current['tasks'] if item['date'] == '2026-10-20' and not item.get('skipped')]
        assert 0 < len(active) <= 5
        allowance = next(day['minutes'] for day in current['schedule']['weekly'] if day['day'] == 2)
        assert sum(item['minutes'] for item in active) <= allowance
        assert len({item['id'] for item in current['tasks']}) == len(current['tasks'])
        assert not any(item['completed'] for item in active)
        no_overflow(page)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:4176')
    parser.add_argument('--case', help='Run one named case; onboarding always runs for its real UI baseline.')
    arguments = parser.parse_args()
    RESULTS.mkdir(parents=True, exist_ok=True)
    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        suite = Suite(browser, arguments.url)
        cases = ['first_launch_onboarding', 'fresh_skip_keeps_unknowns', 'simple_grade_entry_forecast',
            'weighted_grade_settings_and_missing_weights', 'semester_assignment_and_edit_delete',
            'exam_creates_preparation_and_priority', 'timetable_blocks_lessons_and_detects_conflicts', 'alternating_timetable',
            'ielts_setup_results_and_skill_priorities', 'ielts_mistake_edit_and_result_delete', 'application_profile_evidence',
            'guided_learning_reflection_and_completion', 'task_skip_preserves_draft_and_rebalances', 'focus_start_pause_resume_saves_actual_time', 'task_move_edit_replace',
            'backup_roundtrip_and_bad_file_safety', 'corrupt_saved_data_recovery', 'empty_states_have_a_next_action',
            'keyboard_height_modal_stays_usable', 'weekly_review_changes_next_week', 'iphone_sizes_dark_and_large_text',
            'university_pathways_keep_independent_progress', 'missed_work_preserves_history_and_replans',
            'pwa_offline_reopens_saved_plan', 'no_console_errors']
        if arguments.case and arguments.case not in cases:
            parser.error(f'Unknown case: {arguments.case}')
        # Cases depending on earlier result fixtures keep those prerequisites under --case.
        selected = {arguments.case, 'first_launch_onboarding'} if arguments.case else set(cases)
        if arguments.case in ['weighted_grade_settings_and_missing_weights', 'semester_assignment_and_edit_delete']:
            selected.add('simple_grade_entry_forecast')
        if arguments.case == 'ielts_mistake_edit_and_result_delete':
            selected.add('ielts_setup_results_and_skill_priorities')
        for name in cases:
            if name not in selected:
                continue
            started = time.monotonic()
            try:
                getattr(suite, name)()
                results.append({'name': name, 'passed': True, 'seconds': round(time.monotonic() - started, 2)})
                print(f'PASS {name}', flush=True)
            except Exception as error:
                results.append({'name': name, 'passed': False, 'seconds': round(time.monotonic() - started, 2), 'error': str(error)})
                print(f'FAIL {name}: {error}', flush=True)
                traceback.print_exc()
                if suite.latest:
                    try:
                        suite.shot(suite.latest, f'FAIL-{name}')
                        (RESULTS / f'FAIL-{name}.txt').write_text(suite.latest.locator('body').inner_text())
                    except Exception:
                        pass
            finally:
                for context in suite.contexts:
                    context.close()
                suite.contexts = []
        browser.close()
    (RESULTS / 'results.json').write_text(json.dumps(results, indent=2, ensure_ascii=False))
    passed = sum(result['passed'] for result in results)
    print(f'{passed}/{len(results)} browser cases passed', flush=True)
    raise SystemExit(0 if passed == len(results) else 1)


if __name__ == '__main__':
    main()
