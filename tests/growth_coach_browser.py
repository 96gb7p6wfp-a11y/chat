"""Real user journeys for the three-area academic and university growth coach.

Only isolated QA records are used. Source verification remains distinguishable
from a manual user assertion. Chromium phone emulation is not physical Safari.
Run after a production build: python3 tests/growth_coach_browser.py --url URL
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
from coach_upgrade_browser import KEY, close_dialog, expand, navigate, no_overflow, open_plan_view, primary_nav, select_profile_section, state, wait_state
from responsive_browser import inspect_layout

TODAY = '2026-10-28'
NOW = datetime(2026, 10, 28, 8, 0, tzinfo=timezone.utc)
RESULTS = Path(__file__).resolve().parents[1] / 'test-results' / 'growth-coach'


class GrowthSuite:
    def __init__(self, browser, url):
        self.browser, self.url = browser, url.rstrip('/') + '/'
        self.contexts, self.errors, self.console_errors = [], [], []
        self.base = None
        self.latest = None

    def page(self, seed=None, width=390, dark=False, large=False):
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
        if large:
            page.add_style_tag(content='html {font-size:200%!important}')
        return page

    def shot(self, page, name):
        page.screenshot(path=str(RESULTS/f'{name}.png'), full_page=not page.get_by_role('dialog').count(), animations='disabled')

    def fixture(self):
        assert self.base
        data=copy.deepcopy(self.base)
        data['profile'].update({'name':'Isolierter Growth-Test','schoolYear':'Q1','graduationYear':'2028'})
        data['exams']=[
            {'id':'growth-english','subjectId':'english','title':'Englisch Q1 · isolierter Test','date':'2026-10-26','semester':'Q1','topics':[],'format':'written'},
            {'id':'growth-cs','subjectId':'computer-science','title':'Informatik Q1 · isolierter Test','date':'2026-11-12','semester':'Q1','topics':[],'format':'written'},
        ]
        data['schedule']['weekly']=[dict(day,minutes=90) for day in data['schedule']['weekly']]
        data['tasks']=[]
        return data

    def first_launch_and_three_primary_areas(self):
        page=self.page()
        page.get_by_role('button',name='Später einrichten',exact=True).click()
        wait_state(page,'data.onboardingCompleted')
        self.base=state(page)
        assert self.base['grades']==[]
        assert [label.strip() for label in page.locator('.bottom-nav button').all_text_contents()]==['Heute','Lernen','Zukunft']
        expect(page.get_by_role('region',name='Dein wichtigster nächster Schritt')).to_be_visible()
        assert page.locator('[data-testid=daily-tasks] .coach-task').count()<=2
        expect(page.locator('.next-action .action-start')).to_be_visible()
        no_overflow(page)
        self.shot(page,'01-home')

    def open_goals(self,page):
        navigate(page,'Zukunft')
        page.get_by_role('button',name=re.compile('Studienziel wählen|Anforderungen & nächster Schritt')).click()

    def add_goal(self,page,institution='ucl',priority='high'):
        button=page.get_by_role('button',name=re.compile('^(Studienziel wählen|Ziel ergänzen)$'))
        button.click()
        dialog=page.get_by_role('dialog',name='Studienziel',exact=True)
        dialog.get_by_label('Hochschule',exact=True).select_option(institution)
        dialog.get_by_label('Studienbeginn',exact=True).fill('2028')
        dialog.get_by_label('Priorität',exact=True).select_option(priority)
        dialog.get_by_role('button',name='Studienziel speichern',exact=True).click()
        wait_state(page,f'data.universityGoals.goals.some(goal=>goal.institutionId==="{institution}")')

    def university_goal_source_gap_and_next_action(self):
        page=self.page(self.fixture(),dark=True)
        before=copy.deepcopy(state(page))
        self.open_goals(page)
        self.add_goal(page,'ucl')
        goal=next(goal for goal in state(page)['universityGoals']['goals'] if goal['institutionId']=='ucl')
        assert goal['country']=='UK' and goal['entryYear']==2028
        assert all(requirement['status']=='provisional' and not requirement['verifiedAt'] for requirement in goal['requirements'])
        page.get_by_role('button',name=f'UCL · {goal["programme"]} öffnen',exact=True).click()
        dialog=page.get_by_role('dialog',name='Studienziel im Blick',exact=True)
        expect(dialog).to_contain_text('2028')
        expect(dialog.locator('.university-next-action h4')).not_to_have_text('')
        expect(dialog.locator('.university-requirement-row').first).to_contain_text('Vorläufig')
        reference=dialog.locator('.official-reference')
        expand(reference,'Offizielle Referenz · Eintritt 2027')
        expect(reference).to_contain_text('1,4 insgesamt')
        expect(reference).to_contain_text('TARA')
        expect(reference).to_contain_text('keine bestätigte 2028-Vorgabe')
        assert all(requirement['status']!='confirmed' for requirement in state(page)['universityGoals']['goals'][0]['requirements'])
        dialog.get_by_role('button',name='Fachvoraussetzung prüfen',exact=True).click()
        verify=page.get_by_role('dialog',name='Anforderung prüfen',exact=True)
        href=verify.get_by_role('link',name='Offizielle Quelle öffnen').get_attribute('href')
        assert href.startswith('https://www.ucl.ac.uk/'),href
        verify.get_by_label('Betroffenes Fach',exact=True).select_option('mathematics')
        verify.get_by_label('Anforderung / genauer Wortlaut',exact=True).fill('Isolierter QA-Vermerk: Die konkrete Mathematikvoraussetzung muss für 2028 noch geprüft werden.')
        verify.get_by_role('button',name='Anforderung speichern',exact=True).click()
        close_dialog(page)
        self.add_goal(page,'ucla','normal')
        goals=state(page)['universityGoals']['goals']
        assert {(goal['institutionId'],goal['country']) for goal in goals}=={('ucl','UK'),('ucla','USA')}
        page.get_by_role('button',name='Studienziele vergleichen',exact=True).click()
        expect(page.locator('.university-comparison')).to_contain_text('UCL')
        expect(page.locator('.university-comparison')).to_contain_text('UCLA')
        assert state(page)['grades']==before['grades']
        self.shot(page,'02-university-comparison')
        navigate(page,'Heute')
        expect(page.locator('.destination-link')).to_contain_text('UCL')
        assert not re.search(r'\d+\s*%.*(?:Zulassung|admission)',page.locator('body').inner_text(),re.I)
        page.reload(wait_until='networkidle')
        assert len(state(page)['universityGoals']['goals'])==2
        self.open_goals(page)
        page.get_by_role('button',name=f'UCL · {goal["programme"]} öffnen',exact=True).click()
        dialog=page.get_by_role('dialog',name='Studienziel im Blick',exact=True)
        expand(dialog.locator('.official-reference'),'Offizielle Referenz · Eintritt 2027')
        dialog.get_by_role('button',name='Als persönliches Abiturziel · 1,4',exact=True).click()
        expect(page.get_by_role('region',name='Abitur rückwärts planen')).to_be_visible()
        expect(page.get_by_label('Abiturnote als Ziel',exact=True)).to_have_value('custom')
        expect(page.get_by_label('Eigene Abitur-Zielnote',exact=True)).to_have_value('1.4')
        assert state(page)['abiturTarget']['targetGrade']==1.4
        expect(page.locator('.abitur-target-headline')).to_contain_text('751')
        assert state(page)['grades']==before['grades']
        assert not any(requirement['status']=='confirmed' for saved in state(page)['universityGoals']['goals'] for requirement in saved['requirements'])

    def sat_decision_diagnostic_bluebook_and_preparation(self):
        page=self.page(self.fixture())
        self.open_goals(page)
        self.add_goal(page,'ucla')
        navigate(page,'Zukunft')
        page.get_by_role('button',name=re.compile('IELTS & SAT')).click()
        page.get_by_role('group',name='Test wählen').get_by_role('button',name='SAT',exact=True).click()
        expect(page.locator('.journey-step-content')).to_contain_text('kein Schwerpunkt')
        assert not any(task.get('satSkill') for task in state(page)['tasks'] if task['date']==TODAY and not task.get('skipped'))
        expand(page.locator('details').filter(has_text='Eigene Entscheidung'),'Eigene Entscheidung')
        page.get_by_label('SAT trotzdem vorbereiten',exact=True).check()
        page.get_by_role('group',name='Vorbereitungsschritt').get_by_role('button',name=re.compile('Meinen Stand prüfen')).click()
        page.get_by_role('button',name='Kurzdiagnose starten',exact=True).click()
        for index,answer in enumerate(['6','5','25','10','B','B','A']):
            page.get_by_label('Deine Diagnose-Antwort',exact=True).fill(answer)
            page.get_by_role('button',name='Lösung prüfen',exact=True).click()
            expect(page.locator('.journey-diagnostic-solution')).to_contain_text('Richtig beantwortet')
            page.get_by_role('button',name='Diagnose abschließen' if index==6 else 'Nächste Diagnosefrage',exact=True).click()
        wait_state(page,'data.testJourney.sat.diagnostics.some(item=>item.completed)')
        expect(page.locator('.journey-step-content')).to_contain_text('7 / 7 Fragen geprüft')
        expect(page.locator('.journey-step-content')).to_contain_text('Kein SAT-Score')
        assert state(page)['sat']['scores']==[]
        assert page.get_by_role('link',name='Vollständigen Bluebook-Test öffnen').get_attribute('href')=='https://bluebook.collegeboard.org/students/practice'
        page.get_by_role('button',name='Zu Ziel und Ergebnis',exact=True).click()
        expand(page.locator('.journey-existing'),'Ziel, Prüfungstermin & echte Ergebnisse')
        page.get_by_role('button',name='SAT-Ziel festlegen',exact=True).click()
        dialog=page.get_by_role('dialog',name='Dein SAT-Ziel',exact=True)
        dialog.get_by_label('Ziel · Gesamtwert',exact=True).fill('1400')
        dialog.get_by_label('Prüfungsdatum (optional)',exact=True).fill('2027-03-13')
        dialog.get_by_label('SAT-Zeit pro Woche · Minuten',exact=True).fill('90')
        dialog.get_by_role('button',name='SAT-Ziel speichern',exact=True).click()
        page.get_by_role('button',name='SAT-Ergebnis erfassen',exact=True).click()
        dialog=page.get_by_role('dialog',name='SAT-Ergebnis erfassen',exact=True)
        dialog.get_by_label('Ergebnisart',exact=True).select_option('mock')
        dialog.get_by_label('Datum',exact=True).fill(TODAY)
        dialog.get_by_label('Reading and Writing · Score',exact=True).fill('600')
        dialog.get_by_label('Mathematics · Score',exact=True).fill('650')
        dialog.get_by_label('Notiz (optional)',exact=True).fill('Isolierter QA-Test: Beispiel einer manuell übertragenen ausgewerteten Bluebook-Probeprüfung.')
        dialog.get_by_role('button',name='SAT-Ergebnis speichern',exact=True).click()
        wait_state(page,'data.sat.scores.length===1')
        expect(page.locator('.journey-scoreline')).to_contain_text(re.compile(r'1[.,]?250'))
        expect(page.locator('.journey-scoreline')).to_contain_text(re.compile(r'1[.,]?400'))
        expect(page.locator('.journey-scoreline')).to_contain_text('150 Abstand')
        expand(page.locator('details').filter(has_text='Lernzyklus und Aufwand'),'Lernzyklus und Aufwand')
        page.get_by_label('Aufwandsszenario · mindestens Stunden',exact=True).fill('12')
        page.get_by_label('Aufwandsszenario · höchstens Stunden',exact=True).fill('24')
        expect(page.locator('.journey-hours')).to_contain_text('12–24 Stunden')
        expect(page.locator('.journey-hours')).to_contain_text('Dein Aufwandsszenario')
        page.get_by_role('group',name='Vorbereitungsschritt').get_by_role('button',name=re.compile('Termin & Anmeldung')).click()
        links=page.locator('.journey-resource-list a').evaluate_all('(els)=>els.map(el=>el.href)')
        assert 'https://satsuite.collegeboard.org/sat/registration' in links
        assert 'https://satsuite.collegeboard.org/sat/test-center-search' in links
        expect(page.locator('.journey-registration')).to_contain_text('Freie Plätze sind hier nicht bestätigt')
        provider=page.locator('.journey-registration .official-reference')
        expand(provider,'Geprüfte Anbieterinformationen & veröffentlichte Termine')
        assert provider.locator('.reference-provider-date').filter(has=page.locator('strong',has_text='7. November 2026')).count()==0,'Expired registration must not be suggested on 28 October.'
        # A separate date scenario exercises the still-open late-registration
        # window without misrepresenting it as open on the main 28 October fixture.
        page.clock.set_fixed_time(datetime(2026,10,26,8,0,tzinfo=timezone.utc))
        page.reload(wait_until='networkidle')
        navigate(page,'Zukunft')
        page.get_by_role('button',name=re.compile('IELTS & SAT')).click()
        page.get_by_role('group',name='Test wählen').get_by_role('button',name='SAT',exact=True).click()
        page.get_by_role('group',name='Vorbereitungsschritt').get_by_role('button',name=re.compile('Termin & Anmeldung')).click()
        provider=page.locator('.journey-registration .official-reference')
        expand(provider,'Geprüfte Anbieterinformationen & veröffentlichte Termine')
        november=provider.locator('.reference-provider-date').filter(has=page.locator('strong',has_text='7. November 2026'))
        expect(november).to_contain_text('Nur verspätete Anmeldung, mit Aufpreis')
        assert state(page)['sat']['examDate']=='2027-03-13','Opening suggested dates must not change a personal exam date.'
        march=provider.locator('.reference-provider-date').filter(has=page.locator('strong',has_text='6. März 2027'))
        march.get_by_role('button',name='Als Plantermin wählen',exact=True).click()
        wait_state(page,'data.sat.examDate==="2027-03-06" && data.sat.dateStatus==="planned"')
        no_overflow(page)
        self.shot(page,'03-sat-registration')

    def abitur_backward_target_and_what_if(self):
        seed=self.fixture()
        semesters=[]
        for subject in ['mathematics','physics','german','english','history','politics','computer-science','art']:
            for term in ['Q1','Q2','Q3','Q4']:
                semesters.append({'id':f'qa-{subject}-{term}','subjectId':subject,'semester':term,'points':8 if subject=='mathematics' and term=='Q1' else None,'status':'confirmed' if subject=='mathematics' and term=='Q1' else 'scenario','inclusion':'optional','included':True})
        seed['hessen']['semesterResults']=semesters
        seed['hessen']['examinationSubjects']=[{'slot':index+1,'subjectId':subject,'points':None,'status':'scenario','mode':'written' if index<3 else 'oral'} for index,subject in enumerate(['mathematics','physics','german','english','history'])]
        page=self.page(seed,dark=True)
        original=copy.deepcopy(state(page)['hessen'])
        navigate(page,'Lernen')
        page.get_by_role('button',name='Abiturziel',exact=True).click()
        region=page.get_by_role('region',name='Abitur rückwärts planen')
        region.get_by_label('Abiturnote als Ziel',exact=True).select_option('1.5')
        if region.get_by_text('Vorläufige Notenumrechnung',exact=True).count():
            expand(region.locator('details').filter(has_text='Vorläufige Notenumrechnung'),'Vorläufige Notenumrechnung')
            region.get_by_label('Mit vorläufiger 900-Punkte-Tabelle rechnen',exact=True).check()
        expect(region.locator('.abitur-target-headline')).to_contain_text('733')
        region.get_by_label('Annahme: offene Halbjahre',exact=True).fill('12')
        region.get_by_label('Annahme: offene Abiturprüfungen',exact=True).fill('12')
        expect(region.locator('.abitur-target-headline')).to_contain_text('712')
        region.get_by_label('Annahme: offene Abiturprüfungen',exact=True).fill('13')
        expect(region.locator('.abitur-target-headline')).to_contain_text('732')
        expand(region.locator('details').filter(has_text='Was wäre, wenn …?'),'Was wäre, wenn …?')
        region.get_by_label('Vergleich: Prüfungsfach 1',exact=True).fill('15')
        expect(region.locator('.abitur-target-headline')).to_contain_text('740')
        region.get_by_label('Halbjahr im Vergleich',exact=True).select_option('qa-mathematics-Q1')
        region.get_by_label('Angenommene Halbjahrespunkte',exact=True).fill('12')
        expect(region.locator('.abitur-target-headline')).to_contain_text('748')
        assert state(page)['hessen']==original,'What-if changes must not overwrite actual semester results.'
        region.get_by_role('button',name='Vergleich zurücksetzen',exact=True).click()
        region.get_by_label('Annahme: offene Abiturprüfungen',exact=True).fill('0')
        expect(region.locator('.abitur-target-results')).to_contain_text('So nicht erreichbar')
        no_overflow(page)
        self.shot(page,'04-abitur-backward')

    def grade_setback_creates_specific_recovery(self):
        page=self.page(self.fixture())
        open_plan_view(page,'Prüfungen')
        page.locator('.exam-card').filter(has_text='Englisch Q1 · isolierter Test').get_by_role('button',name='Wie lief deine Klausur?',exact=True).click()
        dialog=page.get_by_role('dialog',name='Deine Klausur',exact=True)
        dialog.get_by_role('button',name='Schlecht',exact=True).click()
        dialog.get_by_role('button',name='Verbesserungsplan starten',exact=True).click()
        assert state(page)['grades']==[]
        assert len(state(page)['exams'])==2
        close_dialog(page)
        navigate(page,'Heute')
        wait_state(page,'data.tasks.some(task=>task.date==="2026-10-28"&&task.learningTopic==="recovery-english-diagnostic")')
        task=next(task for task in state(page)['tasks'] if task['date']==TODAY and task['learningTopic']=='recovery-english-diagnostic' and not task.get('skipped'))
        button=page.get_by_role('button',name=f'Lernaufgabe öffnen: {task["title"]}',exact=True)
        if not button.is_visible():expand(page.locator('.full-day'),'Tagesplan & Verlauf')
        button.click()
        dialog=page.get_by_role('dialog',name='Lerneinheit',exact=True)
        dialog.get_by_role('button',name='Lernen starten',exact=True).click()
        if dialog.get_by_role('button',name='Zu den Aufgaben',exact=True).count():dialog.get_by_role('button',name='Zu den Aufgaben',exact=True).click()
        expect(dialog.get_by_label('Deine Antwort',exact=True)).to_be_visible()
        expect(dialog).to_contain_text('tablets')
        dialog.get_by_label('Deine Antwort',exact=True).fill('No. The sentence reports no evidence of improvement, not proof of worse results.')
        dialog.get_by_role('button',name='Antwort prüfen',exact=True).click()
        expect(dialog.locator('.tutor-model-answer')).to_contain_text('no evidence')
        assert sum(task['minutes'] for task in state(page)['tasks'] if task['date']==TODAY and not task.get('skipped'))<=90
        self.shot(page,'05-recovery-exercise')

    def three_area_mobile_layout(self):
        for width,dark,large in [(320,False,True),(320,True,True),(360,False,False),(375,True,False),(390,False,False),(430,True,False),(768,False,True),(1280,True,False)]:
            page=self.page(self.fixture(),width=width,dark=dark,large=large)
            for label in ['Heute','Lernen','Zukunft']:
                primary_nav(page).get_by_role('button',name=label,exact=True).click()
                inspect_layout(page,f'growth-{width}-{dark}-{large}-{label}')
                scrolling=page.evaluate("""() => [...document.querySelectorAll('main *')].filter(el => el.getClientRects().length && !el.closest('details:not([open])') && ['auto','scroll'].includes(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1).map(el=>({class:el.className,width:el.clientWidth,scroll:el.scrollWidth}))""")
                assert not scrolling,(width,label,scrolling)
            self.shot(page,f'08-hubs-{width}-{dark}-{large}')

    def no_console_errors(self):
        assert not self.errors,self.errors
        assert not self.console_errors,self.console_errors


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',required=True)
    parser.add_argument('--case')
    args=parser.parse_args()
    RESULTS.mkdir(parents=True,exist_ok=True)
    cases=['first_launch_and_three_primary_areas','university_goal_source_gap_and_next_action','sat_decision_diagnostic_bluebook_and_preparation','abitur_backward_target_and_what_if','grade_setback_creates_specific_recovery','three_area_mobile_layout','no_console_errors']
    if args.case and args.case not in cases: parser.error('Unknown case')
    selected=cases if not args.case else ['first_launch_and_three_primary_areas',args.case]
    results=[]
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        suite=GrowthSuite(browser,args.url)
        for name in selected:
            started=time.monotonic()
            try:
                getattr(suite,name)()
                results.append({'name':name,'passed':True,'seconds':round(time.monotonic()-started,2)})
                print('PASS',name,flush=True)
            except Exception as error:
                results.append({'name':name,'passed':False,'error':str(error)})
                print('FAIL',name,error,flush=True)
                traceback.print_exc()
                if suite.latest and not suite.latest.is_closed():
                    suite.shot(suite.latest,'FAIL-'+name)
                    (RESULTS/('FAIL-'+name+'.txt')).write_text(suite.latest.locator('body').inner_text())
            finally:
                for context in suite.contexts: context.close()
                suite.contexts=[]
        browser.close()
    (RESULTS/'results.json').write_text(json.dumps(results,indent=2,ensure_ascii=False))
    print(f'{sum(result["passed"] for result in results)}/{len(results)} browser cases passed',flush=True)
    raise SystemExit(0 if all(result['passed'] for result in results) else 1)

if __name__=='__main__': main()
