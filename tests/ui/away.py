"""Browser checks for "tell in advance" (a student marks a coming PE lesson sick/excused) on the test-data preview.
Never the real site or the real sheet.

    python3 tools/build.py && python3 tools/preview/build_preview.py /tmp/pv/index.html
    (cd /tmp/pv && python3 -m http.server 8791 &) ; python3 tests/ui/away.py http://127.0.0.1:8791/ /tmp/pv/shots
"""
import asyncio, sys, os
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8791/"
SHOT = (sys.argv[2] if len(sys.argv) > 2 else "/tmp/pv/shots").rstrip("/") + "/"
os.makedirs(SHOT, exist_ok=True)
results = []
ME = "()=>__tpeStore()['mocksheet/PE 11'].students.filter(x=>x.email==='bat.temuulen@tomujin.edu.mn')[0]"


def check(name, cond, info=""):
    results.append((bool(cond), name, info))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  -> " + str(info)[:300]))


async def as_role(pg, role, hash="home", reset=False):
    await pg.goto(BASE + "#home")
    await pg.evaluate("""([r,reset])=>{localStorage.setItem('tpe-preview-role',r);localStorage.setItem('tpe-preview-phase','p1');if(reset)localStorage.removeItem('tpe-preview-db-v5');localStorage.setItem('tpe-beta-ok','1')}""", [role, reset])
    await pg.goto("about:blank")
    await pg.goto(BASE + "#" + hash)
    await pg.wait_for_timeout(900)


async def menu_has_away(pg):
    return await pg.evaluate("()=>{var a=document.querySelector('nav [data-go=away]');return !!a&&!a.hidden}")


async def writes(pg):
    return await pg.evaluate("()=>window.__tpeSheetWrites||0")


async def cell(pg, d):
    return await pg.evaluate("(d)=>{var x=(" + ME + ")();return [x.m[d]||'',!!(x.req&&x.req[d])]}", d)


async def student(pg):
    # Wednesday 28 Oct 2026, 08:00 in Ulaanbaatar: 11B has PE on Wednesdays (made-up sheet)
    await pg.clock.set_fixed_time("2026-10-28T08:00:00+08:00")
    await as_role(pg, "student", reset=True)
    check("menu: students see 'Ирэхгүй гэж мэдэгдэх'", await menu_has_away(pg))
    card = pg.locator("#homeAway .acard")
    check("home: a card for students", await card.count() == 1 and "ирж чадахгүй" in (await card.text_content()), await card.count())
    await card.locator("button").click(); await pg.wait_for_timeout(700)
    check("home card opens the page", await pg.is_visible("#v-away") and pg.url.endswith("#away"), pg.url)
    days = await pg.eval_on_selector_all("#awayOut .aw-day h3", "e=>e.map(x=>x.textContent)")
    check("own PE days only: Wednesdays from today, up to 21 days", days == ["Өнөөдөр, Лхагва, 10/28", "Лхагва, 11/4", "Лхагва, 11/11", "Лхагва, 11/18"], days)
    head = await pg.text_content("#awayOut > p")
    check("shows own name and class only", "Тэмүүлэн" in head and "11B" in head, head)
    await pg.screenshot(path=SHOT + "aw_student.png", full_page=True)

    w0 = await writes(pg)
    today = pg.locator(".aw-day[data-date='2026-10-28']")
    await today.locator("button[data-act=sick]").click(); await pg.wait_for_timeout(150)
    t = await today.text_content()
    check("first tap only asks (nothing sent yet)", "мэдэгдэх үү" in t and await writes(pg) == w0, t)
    await today.locator("button[data-act=no]").click(); await pg.wait_for_timeout(150)
    check("'Болих' backs out without sending", await writes(pg) == w0 and await today.locator("button[data-act=sick]").count() == 1)
    await today.locator("button[data-act=sick]").click(); await pg.wait_for_timeout(100)
    await pg.screenshot(path=SHOT + "aw_confirm.png")
    await today.locator("button[data-act=yes]").click(); await pg.wait_for_timeout(900)
    check("sent: the sheet cell is Ө in the student's own row", await cell(pg, "2026-10-28") == ["Ө", True] and await writes(pg) == w0 + 1, await cell(pg, "2026-10-28"))
    t = await today.text_content()
    msg = await pg.text_content("#aw-msg")
    check("the student sees it went through", "Өвчтэй" in t and "мэдэгдсэн" in t and "Илгээгдлээ" in msg, [t, msg])
    await pg.screenshot(path=SHOT + "aw_sent.png", full_page=True)
    await today.locator("button[data-act=swap]").click(); await pg.wait_for_timeout(900)
    check("reason can be changed to Чөлөөтэй (Ч)", await cell(pg, "2026-10-28") == ["Ч", True])
    await today.locator("button[data-act=undo]").click(); await pg.wait_for_timeout(900)
    check("'Болиулах' clears the cell again", await cell(pg, "2026-10-28") == ["", False])

    # a lesson the teacher already marked cannot be changed by the student
    await pg.evaluate("()=>{var x=(" + ME + ")();x.m['2026-11-04']='Ч';delete (x.req||{})['2026-11-04'];__tpeNotify()}")
    await pg.click("#awayOut button:has-text('Шинэчлэх')"); await pg.wait_for_timeout(700)
    other = pg.locator(".aw-day[data-date='2026-11-04']")
    check("a teacher's mark shows, with no buttons", "Багш тэмдэглэсэн: Чөлөөтэй" in await other.text_content() and await other.locator("button").count() == 0, await other.text_content())

    # connection trouble: clear message, nothing written
    w0 = await writes(pg)
    later = pg.locator(".aw-day[data-date='2026-11-18']")
    await later.locator("button[data-act=leave]").click(); await pg.wait_for_timeout(100)
    await pg.evaluate("()=>{window.__tpeSheetFail=true}")
    await later.locator("button[data-act=yes]").click(); await pg.wait_for_timeout(900)
    check("send failure: says so, nothing written, can try again", "Холбогдож чадсангүй" in await pg.text_content("#aw-msg") and await writes(pg) == w0 and await cell(pg, "2026-11-18") == ["", False] and await later.locator("button[data-act=leave]").count() == 1)

    # after the cut-off time today's lesson is closed
    await pg.clock.set_fixed_time("2026-10-28T08:45:00+08:00")
    await pg.click("#awayOut button:has-text('Шинэчлэх')"); await pg.wait_for_timeout(700)
    t = await today.text_content()
    check("after 08:30: today's lesson closed, tells to talk to the teacher", "08:30" in t and "өнгөрсөн" in t and await today.locator("button").count() == 0, t)
    check("later lessons stay open after 08:30", await later.locator("button[data-act=sick]").count() == 1)

    # phone width
    await pg.set_viewport_size({"width": 390, "height": 844}); await pg.wait_for_timeout(200)
    sw = await pg.evaluate("()=>document.documentElement.scrollWidth<=innerWidth+1")
    hgt = await pg.evaluate("()=>Math.min(...[...document.querySelectorAll('#awayOut .aw-day button')].map(b=>b.getBoundingClientRect().height))")
    check("phone: no sideways scroll, buttons at least 44px", sw and hgt >= 44, [sw, hgt])
    await pg.screenshot(path=SHOT + "aw_phone.png", full_page=True)
    await pg.set_viewport_size({"width": 1280, "height": 900})


async def others(pg):
    for role in ["teacher", "admin", "guest"]:
        await as_role(pg, role)
        check("menu: no 'Ирэхгүй гэж мэдэгдэх' for " + role, not await menu_has_away(pg) and await pg.locator("#homeAway .acard").count() == 0)
    await as_role(pg, "teacher", hash="away")
    check("staff opening the page get an explanation, no buttons", "сурагчид ашиглана" in await pg.text_content("#awayOut") and await pg.locator("#awayOut button").count() == 0)


async def teacher(pg):
    await pg.clock.set_fixed_time("2026-10-28T08:00:00+08:00")
    await as_role(pg, "student", hash="away", reset=True)
    await pg.locator(".aw-day[data-date='2026-11-04'] button[data-act=sick]").click(); await pg.wait_for_timeout(100)
    await pg.locator(".aw-day[data-date='2026-11-04'] button[data-act=yes]").click(); await pg.wait_for_timeout(900)
    await as_role(pg, "admin", hash="coach")
    await pg.wait_for_timeout(600)
    box = pg.locator("#awayBox")
    t = await box.text_content() if await box.count() else ""
    check("teacher home: 'Урьдчилан мэдэгдсэн' lists coming lessons with class, day, reason", "Урьдчилан мэдэгдсэн (2)" in t and "Б. Тэмүүлэн · 11B" in t and "11/4" in t and "Өвчтэй" in t and "12C" in t, t)
    await pg.screenshot(path=SHOT + "aw_teacher_home.png", full_page=True)
    await box.locator("button", has_text="Тэмүүлэн").click(); await pg.wait_for_timeout(900)
    title = await pg.text_content("#pa-title")
    date = await pg.input_value("#pa-date")
    check("a click opens that class on that day", await pg.is_visible("#v-patt") and "11B" in title and date == "2026-11-04", [title, date])
    sid = await pg.evaluate("()=>(" + ME + ")().id")
    row = pg.locator(f".pa-row[data-id='{sid}']")
    check("the row shows the student told in advance", "Сурагч өөрөө урьдчилан мэдэгдсэн" in await row.text_content() and await row.locator("button[aria-pressed=true]", has_text="Өвчтэй").count() == 1)
    check("the day line counts it", "Сурагч өөрөө мэдэгдсэн 1" in await pg.text_content("#pattOut"))
    await pg.screenshot(path=SHOT + "aw_teacher_class.png", full_page=True)
    await row.locator("button", has_text="Чөлөөтэй").click(); await pg.wait_for_timeout(700)
    check("teacher's change wins: mark Ч, the student's note is gone", await cell(pg, "2026-11-04") == ["Ч", False] and "урьдчилан мэдэгдсэн" not in await row.text_content(), await cell(pg, "2026-11-04"))
    await as_role(pg, "student", hash="away")
    d = pg.locator(".aw-day[data-date='2026-11-04']")
    check("…and the student now sees the teacher's mark, no undo", "Багш тэмдэглэсэн: Чөлөөтэй" in await d.text_content() and await d.locator("button").count() == 0)

    # settings: cut-off time and how far ahead; switching off closes it for students
    await as_role(pg, "admin", hash="patt")
    await pg.wait_for_timeout(600)
    await pg.locator("#abs-set summary").click()
    await pg.fill("#abs-cut", "09:00"); await pg.select_option("#abs-ahead", "14")
    await pg.click("#abs-save"); await pg.wait_for_timeout(700)
    conf = await pg.evaluate("()=>__tpeStore()['config/absence']")
    check("owner saves 09:00 / 14 days: site setting and script setting", conf.get("cutoff") == "09:00" and conf.get("ahead") == 14 and conf.get("on") is True and await pg.evaluate("()=>__tpeStore().mockabs.cutoff") == "09:00", conf)
    await pg.screenshot(path=SHOT + "aw_settings.png", full_page=True)
    await as_role(pg, "student", hash="away")
    days = await pg.eval_on_selector_all("#awayOut .aw-day", "e=>e.map(x=>x.dataset.date)")
    check("students follow the new settings (14 days)", days == ["2026-10-28", "2026-11-04", "2026-11-11"], days)
    await as_role(pg, "admin", hash="patt"); await pg.wait_for_timeout(600)
    await pg.locator("#abs-set summary").click()
    await pg.uncheck("#abs-on"); await pg.click("#abs-save"); await pg.wait_for_timeout(700)
    await as_role(pg, "student", hash="away")
    check("switched off: page says closed, menu and home card gone", "хаалттай" in await pg.text_content("#awayOut") and not await menu_has_away(pg) and await pg.locator("#awayOut .aw-day").count() == 0)
    await as_role(pg, "student", hash="home")
    check("switched off: no home card", await pg.locator("#homeAway .acard").count() == 0)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1280, "height": 900})
        errs = []
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.route("**/fonts.googleapis.com/**", lambda r: r.abort())
        for part in [student, others, teacher]:
            try:
                await part(pg)
            except Exception as e:
                check(part.__name__ + " ran to the end", False, repr(e))
        check("no script errors", not errs, errs[:5])
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    asyncio.run(main())
