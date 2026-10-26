"""Populated mobile form regression. Chromium emulation, not real Safari certification.

python3 tests/responsive_browser.py --url http://127.0.0.1:4181
Checks 320/360/375/390/430/768/1280px, light/dark and 100%/200% text.
All entered values are isolated QA fixtures, never application defaults.
"""
import argparse
import json
from pathlib import Path
import re
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect
from coach_upgrade_browser import navigate, open_plan_view, select_profile_section, PROFILE_SECTIONS, expand

KEY = 'northstar.coach.v2'
RESULTS = Path(__file__).resolve().parents[1] / 'test-results' / 'responsive'
NOW = datetime(2026, 10, 19, 7, tzinfo=timezone.utc)


def inspect_layout(page, context):
    result = page.evaluate('''() => {
      const root = document.documentElement, dialog = document.querySelector('[role="dialog"]');
      const area = dialog || document;
      const visible = el => !!el.getClientRects().length && !el.closest('details:not([open])') && getComputedStyle(el).visibility !== 'hidden';
      const controls = [...area.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]),select,textarea')].filter(visible);
      const out = {width: root.clientWidth, document: root.scrollWidth, body: document.body.scrollWidth,
        dialog: dialog ? {width:dialog.clientWidth, scroll:dialog.scrollWidth} : null,
        outside: [], collisions: [], labels: []};
      controls.forEach((el,i) => {
        const a = el.getBoundingClientRect();
        if (a.x < -1 || a.right > root.clientWidth + 1) out.outside.push({tag:el.type || el.tagName, x:a.x, right:a.right});
        controls.slice(i+1).forEach(other => {
          const b = other.getBoundingClientRect();
          if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1)
            out.collisions.push([el.id,other.id]);
        });
      });
      [...area.querySelectorAll('.field')].filter(visible).forEach(field=>{
        const label=field.querySelector('.field-label'), control=field.querySelector('input:not([type=checkbox]),select,textarea');
        if (label && control && visible(label) && visible(control) && label.getBoundingClientRect().bottom > control.getBoundingClientRect().top+1)
          out.labels.push(label.textContent);
      });
      return out;
    }''')
    assert result['document'] <= result['width'] + 1, (context, result)
    assert result['body'] <= result['width'] + 1, (context, result)
    assert not result['outside'] and not result['collisions'] and not result['labels'], (context, result)
    assert not result['dialog'] or result['dialog']['scroll'] <= result['dialog']['width'] + 1, (context,result)


def populate_dialog(page):
    # Populate via normal bubbling input/change events in one browser round-trip.
    # Main interaction suites separately exercise typing, validation and persistence.
    page.get_by_role('dialog').evaluate("""dialog => {
      dialog.querySelectorAll('details').forEach(el=>{el.open=true});
      const setter = (el,value) => {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
      };
      [...dialog.querySelectorAll('input:not([type="checkbox"]):not([type="hidden"]):not([type="file"]),textarea')].forEach(el=>{
        if (el.disabled || el.value || !el.getClientRects().length) return;
        const min=Number(el.min||0), number=min>=400?'1400':min>=200?'650':'7';
        const value = {date:'2026-10-19',time:'17:30',number,url:'https://example.org/isolierter-test'}[el.type]
          || 'Ausführlicher Testeintrag mit längeren deutschen Wörtern';
        setter(el,value);
      });
    }""")


def close(page):
    page.get_by_role('dialog').get_by_role('button', name='Dialog schließen', exact=True).click()


def route(page, name):
    navigate(page, {'today':'Heute','plan':'Lernplan','progress':'Fortschritt','profile':'Profil'}.get(name,name))


def click(page, name, role='button'):
    if role == 'tab':
        select_profile_section(page, name)
        return
    if not page.get_by_role('dialog').count() and name in ['Woche','Stundenplan','Prüfungen','Termine','Studienweg','Lernzeiten']:
        open_plan_view(page, name)
        return
    scope = page.get_by_role('dialog') if role == 'button' and page.get_by_role('dialog').count() else page
    scope.get_by_role(role, name=name, exact=True).click()


def audit(page, name, screenshot=False):
    inspect_layout(page, name)
    if screenshot:
        # The dialog scrolls internally; capture its initial viewport, not the background page.
        if page.get_by_role('dialog').count():
            page.get_by_role('dialog').evaluate('(el) => {el.scrollTop=0}')
        page.screenshot(path=str(RESULTS / f'{name}.png'), full_page=not page.get_by_role('dialog').count(), animations='disabled')


def modal(page, trigger, name, screenshot=False):
    trigger()
    expect(page.get_by_role('dialog')).to_be_visible()
    populate_dialog(page)
    audit(page, name, screenshot)
    if name.endswith('-ielts-goal') and page.viewport_size['width']<=430:
        date=page.get_by_role('dialog').get_by_label('Prüfungsdatum (optional)',exact=True).bounding_box()
        band=page.get_by_role('dialog').get_by_label('Ziel · Overall Band',exact=True).bounding_box()
        assert date and band and abs(date['x']-band['x'])<1 and band['y']>=date['y']+date['height'], (name,date,band)
    close(page)


def suite(browser, url, seed, width, dark, scale):
    context = browser.new_context(viewport={'width':width,'height':844},is_mobile=width<760,has_touch=width<760,
        timezone_id='Europe/Berlin',locale='de-DE',color_scheme='dark' if dark else 'light',service_workers='block')
    fixture=json.loads(json.dumps(seed))
    fixture['profile']['theme']='dark' if dark else 'light'
    context.add_init_script(f'localStorage.setItem({json.dumps(KEY)}, {json.dumps(json.dumps(fixture))})')
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_default_timeout(8000)
    page.clock.install(time=NOW)
    page.goto(url,wait_until='networkidle')
    if scale==200:
        page.add_style_tag(content=':root {font-size:200% !important;}')
    prefix=f'{width}-{"dark" if dark else "light"}-{scale}'
    capture=width in [320,390,768,1280] and (scale==100 or width==320)
    audit(page,prefix+'-today',capture)
    expand(page.locator('.full-day'), 'Tagesplan & Verlauf')
    modal(page,lambda:click(page,'Lernzeit ändern'),prefix+'-today-time')
    modal(page,lambda:click(page,'Eigene Aufgabe'),prefix+'-custom-task')
    page.locator('.coach-task-open').first.click()
    populate_dialog(page)
    audit(page,prefix+'-guided-learning',capture)
    if page.get_by_label('Lernthema wählen',exact=True).count():
        selector=page.get_by_label('Lernthema wählen',exact=True)
        if not selector.input_value():
            selector.select_option(selector.locator('option:not([value=""])').first.get_attribute('value'))
    if page.get_by_role('button',name='Lernen starten',exact=True).count():
        click(page,'Lernen starten')
        audit(page,prefix+'-tutor-explanation',capture)
        if page.get_by_role('button',name='Zu den Aufgaben',exact=True).count():
            click(page,'Zu den Aufgaben')
        page.get_by_label('Deine Antwort',exact=True).fill('Eine ausführliche eigene Antwort mit Belegen, Erklärung und sorgfältiger Überprüfung.')
        audit(page,prefix+'-tutor-practice',capture)
        click(page,'Antwort prüfen')
        audit(page,prefix+'-tutor-solution',capture)
    page.get_by_role('dialog').locator('details').evaluate_all('(els)=>els.forEach(el=>{el.open=true})')
    click(page,'Bearbeiten')
    populate_dialog(page)
    audit(page,prefix+'-edit-task')
    close(page)
    page.locator('.coach-task-open').first.click()
    page.get_by_role('dialog').locator('details').evaluate_all('(els)=>els.forEach(el=>{el.open=true})')
    click(page,'Verschieben')
    populate_dialog(page)
    audit(page,prefix+'-move-task')
    close(page)
    page.locator('.coach-task-open').first.click()
    page.get_by_role('dialog').locator('details').evaluate_all('(els)=>els.forEach(el=>{el.open=true})')
    click(page,'Fokus starten')
    audit(page,prefix+'-focus-timer',capture)
    clock=page.locator('.focus-clock')
    assert clock.evaluate('(el)=>getComputedStyle(el).whiteSpace')=='nowrap',prefix
    assert clock.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1'),prefix
    close(page)
    # Each top-level page and every existing secondary page has an independent overflow check.
    route(page,'plan')
    for name in ['Woche','Stundenplan','Prüfungen','Termine','Studienweg','Lernzeiten']:
        click(page,name)
        audit(page,prefix+'-plan-'+name)
    click(page,'Prüfungen')
    modal(page,lambda:click(page,'Prüfung hinzufügen'),prefix+'-exam-form',capture)
    click(page,'Termine')
    modal(page,lambda:click(page,'Termin hinzufügen'),prefix+'-deadline-form')
    click(page,'Lernzeiten')
    modal(page,lambda:click(page,'Termin hinzufügen'),prefix+'-commitment-form')
    click(page,'Stundenplan')
    modal(page,lambda:click(page,'Stunde'),prefix+'-lesson-form',capture)
    route(page,'progress')
    audit(page,prefix+'-progress',capture)
    modal(page,lambda:click(page,'Woche reflektieren'),prefix+'-review-form')
    click(page,'Mathematik: Noten und Ziel berechnen')
    page.get_by_role('dialog').locator('details').evaluate_all('(els)=>els.forEach(el=>{el.open=true})')
    audit(page,prefix+'-grade-analysis',capture)
    click(page,'Note')
    populate_dialog(page)
    audit(page,prefix+'-grade-form',capture)
    close(page)
    # Closing grade entry returns to the subject analysis.
    click(page,'Noten und Ziele für Mathematik einstellen')
    populate_dialog(page)
    audit(page,prefix+'-grade-settings')
    close(page)
    close(page)
    route(page,'profile')
    tabs=list(PROFILE_SECTIONS)
    for name in tabs:
        click(page,name,role='tab')
        audit(page,prefix+'-profile-'+name)
    click(page,'Überblick',role='tab')
    modal(page,lambda:click(page,'Ziele bearbeiten'),prefix+'-goals-form')
    if page.get_by_role('button',name=re.compile('^Deine Q1-Unterlagen')).count():
        page.get_by_role('button',name=re.compile('^Deine Q1-Unterlagen')).click()
        audit(page,prefix+'-school-import')
        page.get_by_role('button',name=re.compile('^Deinen Stundenplan prüfen')).click()
        page.locator('.school-import-correction').first.evaluate('(el)=>{el.open=true}')
        audit(page,prefix+'-timetable-review',capture)
        click(page,'Zurück')
        page.get_by_role('button',name=re.compile('^9 bestätigte Klausuren')).click()
        audit(page,prefix+'-exam-import')
        click(page,'Zurück')
        page.get_by_role('button',name=re.compile('^Deutsch · 4 von 15 Punkten')).click()
        populate_dialog(page)
        audit(page,prefix+'-german-draft')
        close(page)
    modal(page,lambda:click(page,'Weiteren Test planen'),prefix+'-test-form')
    click(page,'Fächer',role='tab')
    modal(page,lambda:click(page,'Mathematik bearbeiten'),prefix+'-subject-form')
    click(page,'Erfahrungen',role='tab')
    modal(page,lambda:click(page,'Hinzufügen'),prefix+'-activity-form',capture)
    click(page,'Hochschulen',role='tab')
    modal(page,lambda:click(page,'Hinzufügen' if page.get_by_role('button',name='Hinzufügen',exact=True).count() else 'Hochschule speichern'),prefix+'-university-form')
    click(page,'IELTS & SAT',role='tab')
    modal(page,lambda:click(page,'Ziel bearbeiten'),prefix+'-ielts-goal',capture)
    modal(page,lambda:click(page,'Ergebnis erfassen'),prefix+'-ielts-result')
    # A reduced visible viewport represents the keyboard opening. Focus and save controls
    # must stay scroll-reachable without clipping or horizontal movement.
    click(page,'Ziel bearbeiten')
    populate_dialog(page)
    page.set_viewport_size({'width':width,'height':360})
    field=page.get_by_label('IELTS-Zeit pro Woche · Minuten',exact=True)
    field.focus()
    field.scroll_into_view_if_needed()
    audit(page,prefix+'-keyboard')
    button=page.get_by_role('dialog').get_by_role('button',name='Ziel speichern',exact=True)
    button.scroll_into_view_if_needed()
    box=button.bounding_box()
    assert box and box['y']>=0 and box['y']+box['height']<=361, (prefix,box)
    close(page)
    if page.get_by_role('group',name='Testvorbereitung wählen').count():
        page.get_by_role('group',name='Testvorbereitung wählen').get_by_role('button',name='SAT',exact=True).click()
        audit(page,prefix+'-sat',capture)
        modal(page,lambda:click(page,'SAT-Ziel bearbeiten' if page.get_by_role('button',name='SAT-Ziel bearbeiten',exact=True).count() else 'SAT-Ziel festlegen'),prefix+'-sat-goal',capture)
        modal(page,lambda:click(page,'SAT-Ergebnis erfassen'),prefix+'-sat-result')
    assert not errors,(prefix,errors)
    context.close()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:4181')
    parser.add_argument('--widths',default='320,360,375,390,430,768,1280')
    args=parser.parse_args()
    RESULTS.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
        page=context.new_page()
        page.clock.install(time=NOW)
        page.goto(args.url,wait_until='networkidle')
        click(page,'Später einrichten')
        page.wait_for_function('key=>JSON.parse(localStorage.getItem(key))?.onboardingCompleted',arg=KEY)
        seed=page.evaluate('key=>JSON.parse(localStorage.getItem(key))',KEY)
        seed['profile']['name']='Eric · isolierter UI-Test'
        # Explicit QA evidence enables the actual next-exam calculation and its
        # populated scenario controls; this never changes application defaults.
        math=next(subject for subject in seed['subjects'] if subject['id']=='mathematics')
        math['target']=13
        math['grading']['mode']='weighted'
        math['forecast']={'semester':'Q1','mode':'next','future':[{'id':'qa-next','type':'written','weight':5,'points':None}],'comparisonScore':12}
        seed['grades']=[{'id':'qa-written','subjectId':'mathematics','points':8,'type':'written','date':'2026-10-17','semester':'Q1','weight':1,'note':''},{'id':'qa-oral','subjectId':'mathematics','points':9,'type':'oral','date':'2026-10-18','semester':'Q1','weight':1,'note':''}]
        seed['exams']=[{'id':'qa-english','subjectId':'english','title':'Englisch · Civil Rights','date':'2026-10-26','topics':['Civil Rights','Brown v. Board of Education'],'format':'written','importance':'high'},{'id':'qa-math','subjectId':'mathematics','title':'Mathematik LK','date':'2026-12-17','topics':['Exponentialfunktionen'],'format':'written','importance':'normal'}]
        seed['tasks']=[{'id':'qa-tutor','date':'2026-10-19','title':'Civil Rights konkret üben','category':'language','subjectId':'english','examId':'qa-english','minutes':15,'priority':'high','origin':'custom','completed':False,'completedAt':None,'notes':'','selfReview':[]}]

        seed['ielts'].update({'examDate':'2026-12-05','targetOverall':7.5,'targets':dict.fromkeys(['listening','reading','writing','speaking'],7)})
        context.close()
        count=0
        for width in map(int,args.widths.split(',')):
            for dark in [False,True]:
                for scale in [100,200]:
                    suite(browser,args.url,seed,width,dark,scale)
                    count+=1
                    print(f'PASS {width}px {"dark" if dark else "light"} {scale}% text',flush=True)
        browser.close()
        print(f'{count} responsive configurations passed. Screenshots: {RESULTS}',flush=True)

if __name__=='__main__':
    main()
