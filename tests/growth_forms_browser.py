"""Populated new university/test forms on phone, tablet and desktop viewports.

Complements responsive_browser.py, which audits all retained legacy forms. Uses
isolated records and Chromium emulation; physical iOS keyboard testing remains.
"""
import argparse
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from growth_coach_browser import GrowthSuite, RESULTS as GROWTH_RESULTS
from coach_upgrade_browser import navigate, close_dialog, expand, state
from responsive_browser import inspect_layout, populate_dialog

RESULTS=Path(__file__).resolve().parents[1]/'test-results'/'growth-forms'


def run(browser,url):
    suite=GrowthSuite(browser,url)
    suite.first_launch_and_three_primary_areas()
    count=0
    for width in [320,360,375,390,430,768,1280]:
        for dark in [False,True]:
            for large in ([False,True] if width==320 else [False]):
                page=suite.page(suite.fixture(),width=width,dark=dark,large=large)
                prefix=f'{width}-{"dark" if dark else "light"}-{"200" if large else "100"}'
                suite.open_goals(page)
                page.get_by_role('button',name='Studienziel wählen',exact=True).click()
                dialog=page.get_by_role('dialog',name='Studienziel',exact=True)
                dialog.get_by_label('Hochschule',exact=True).select_option('ucl')
                dialog.get_by_label('Studiengang',exact=True).fill('Computer Science · ausführlicher isolierter Testeintrag')
                dialog.get_by_label('Studienbeginn',exact=True).fill('2028')
                populate_dialog(page)
                inspect_layout(page,prefix+'-goal')
                if width in [320,390]:page.screenshot(path=str(RESULTS/(prefix+'-goal.png')),animations='disabled')
                dialog.get_by_role('button',name='Studienziel speichern',exact=True).click()
                goal=state(page)['universityGoals']['goals'][0]
                page.get_by_role('button',name=f'UCL · {goal["programme"]} öffnen',exact=True).click()
                inspect_layout(page,prefix+'-goal-detail')
                expand(page.get_by_role('dialog').locator('.official-reference'),'Offizielle Referenz · Eintritt 2027')
                inspect_layout(page,prefix+'-official-university-reference')
                page.get_by_role('button',name='Fachvoraussetzung prüfen',exact=True).click()
                dialog=page.get_by_role('dialog',name='Anforderung prüfen',exact=True)
                dialog.get_by_label('Betroffenes Fach',exact=True).select_option('mathematics')
                dialog.get_by_label('Verlangte Punkte · optional',exact=True).fill('13')
                dialog.get_by_label('Verlangter Nachweis',exact=True).select_option('semester')
                dialog.get_by_label('Verlangtes Halbjahr',exact=True).select_option('Q4')
                populate_dialog(page)
                inspect_layout(page,prefix+'-source-form')
                if width in [320,390]:page.screenshot(path=str(RESULTS/(prefix+'-source.png')),animations='disabled')
                close_dialog(page)
                close_dialog(page)
                navigate(page,'Zukunft')
                page.get_by_role('button',name=re.compile('IELTS & SAT')).click()
                for test,label in [('sat','SAT'),('ielts','IELTS Academic')]:
                    page.get_by_role('group',name='Test wählen').get_by_role('button',name=label,exact=True).click()
                    inspect_layout(page,prefix+'-'+test+'-decision')
                    page.get_by_role('group',name='Vorbereitungsschritt').get_by_role('button',name=re.compile('Meinen Stand prüfen')).click()
                    page.get_by_role('button',name='Kurzdiagnose starten',exact=True).click()
                    page.get_by_label('Deine Diagnose-Antwort',exact=True).fill('Dies ist eine ausführliche isolierte Antwort zur Layoutprüfung.')
                    inspect_layout(page,prefix+'-'+test+'-diagnostic')
                    page.get_by_role('button',name='Zur Übersicht',exact=True).click()
                    page.get_by_role('group',name='Vorbereitungsschritt').get_by_role('button',name=re.compile('Mein Lernplan')).click()
                    expand(page.locator('.journey-existing'),'Ziel, Prüfungstermin & echte Ergebnisse')
                    title='SAT-Ziel festlegen' if test=='sat' else 'Ziel festlegen'
                    page.get_by_role('button',name=title,exact=True).click()
                    populate_dialog(page)
                    inspect_layout(page,prefix+'-'+test+'-goal')
                    if width in [320,390]:page.screenshot(path=str(RESULTS/(prefix+'-'+test+'-goal.png')),animations='disabled')
                    close_dialog(page)
                    page.get_by_role('group',name='Vorbereitungsschritt').get_by_role('button',name=re.compile('Termin & Anmeldung')).click()
                    provider=page.locator('.journey-registration .official-reference')
                    expand(provider,'Geprüfte Anbieterinformationen')
                    inspect_layout(page,prefix+'-'+test+'-official-provider-reference')
                    expand(page.locator('details').filter(has_text='Anbietertermine vergleichen'),'Anbietertermine vergleichen')
                    page.get_by_role('button',name='Anbietertermin ergänzen',exact=True).click()
                    page.get_by_label('Anbietertermin',exact=True).fill('2027-03-13')
                    page.get_by_label('Anmeldefrist · optional',exact=True).fill('2027-02-20')
                    page.get_by_label('Offizielle Terminquelle',exact=True).fill('https://satsuite.collegeboard.org/sat/dates-deadlines' if test=='sat' else 'https://www.britishcouncil.de/en/exam/ielts/dates-fees-locations')
                    inspect_layout(page,prefix+'-'+test+'-registration')
                navigate(page,'Lernen')
                page.get_by_role('button',name='Abiturziel',exact=True).click()
                region=page.get_by_role('region',name='Abitur rückwärts planen')
                region.get_by_label('Abiturnote als Ziel',exact=True).select_option('1.5')
                region.get_by_label('Annahme: offene Halbjahre',exact=True).fill('12')
                region.get_by_label('Annahme: offene Abiturprüfungen',exact=True).fill('13')
                inspect_layout(page,prefix+'-abitur-target')
                assert not suite.errors and not suite.console_errors,(suite.errors,suite.console_errors)
                count+=1
                print('PASS',prefix,flush=True)
                for context in suite.contexts:context.close()
                suite.contexts=[]
    print(f'{count} new-form viewport/theme/text configurations passed',flush=True)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--url',required=True);args=parser.parse_args()
    RESULTS.mkdir(parents=True,exist_ok=True);GROWTH_RESULTS.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        run(browser,args.url)
        browser.close()

if __name__=='__main__':main()
