"""Browser checks for students' PE lesson requests on the test-data preview (never the real site or sheet):
a student sends a request with a reason; only the teacher's approval writes Ө/Ч; not approved and absent → Т.

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
    await pg.evaluate("""([r,reset])=>{localStorage.setItem('tpe-preview-role',r);localStorage.setItem('tpe-preview-phase','p1');if(reset)localStorage.removeItem('tpe-preview-db-v6');localStorage.setItem('tpe-beta-ok','1')}""", [role, reset])
    await pg.goto("about:blank")
    await pg.goto(BASE + "#" + hash)
    await pg.wait_for_timeout(900)


async def menu_has_away(pg):
    return await pg.evaluate("()=>{var a=document.querySelector('nav [data-go=away]');return !!a&&!a.hidden}")


async def writes(pg):
    return await pg.evaluate("()=>window.__tpeSheetWrites||0")


async def mark(pg, d):
    return await pg.evaluate("(d)=>(" + ME + ")().m[d]||''", d)


async def req(pg, d, uid="s1"):
    return await pg.evaluate("(k)=>__tpeStore()['absreq/'+k]||null", uid + "_" + d)


async def send(pg, d, kind, why):
    card = pg.locator(f".aw-day[data-date='{d}']")
    await card.locator(f"button[data-act={kind}]").click(); await pg.wait_for_timeout(150)
    await pg.fill("#aw-why", why)
    await card.locator("button[data-act=yes]").click(); await pg.wait_for_timeout(700)


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

    w0 = await writes(pg)
    today = pg.locator(".aw-day[data-date='2026-10-28']")
    await today.locator("button[data-act=sick]").click(); await pg.wait_for_timeout(150)
    check("choosing a reason opens a comment box (nothing sent yet)", await pg.locator("#aw-why").count() == 1 and await req(pg, "2026-10-28") is None)
    await today.locator("button[data-act=yes]").click(); await pg.wait_for_timeout(200)
    check("the comment is required", await pg.get_attribute("#aw-why", "aria-invalid") == "true" and "Шалтгаанаа бичнэ үү" in await today.text_content() and await req(pg, "2026-10-28") is None)
    await pg.fill("#aw-why", "Халуураад гэртээ байна")
    await pg.evaluate("()=>__tpeNotify()"); await pg.wait_for_timeout(100)
    check("typed comment stays after a live redraw", await pg.input_value("#aw-why") == "Халуураад гэртээ байна")
    await pg.screenshot(path=SHOT + "aw_form.png", full_page=True)
    await today.locator("button[data-act=yes]").click(); await pg.wait_for_timeout(700)
    r = await req(pg, "2026-10-28")
    check("sent as a request: sick, with the comment, waiting", r and r["status"] == "pending" and r["kind"] == "sick" and r["reason"] == "Халуураад гэртээ байна" and r["tab"] == "PE 11" and r["cls"] == "11B", r)
    check("the sheet is NOT written by the student", await writes(pg) == w0 and await mark(pg, "2026-10-28") == "")
    t = await today.text_content()
    check("the student sees it waits for the teacher, with their comment", "Багш шалгаж байна" in t and "Халуураад гэртээ байна" in t and "Хүсэлт илгээгдлээ" in await pg.text_content("#aw-msg"), t)
    await pg.screenshot(path=SHOT + "aw_sent.png", full_page=True)
    await today.locator("button[data-act=undo]").click(); await pg.wait_for_timeout(600)
    check("a waiting request can be withdrawn", await req(pg, "2026-10-28") is None and await today.locator("button[data-act=sick]").count() == 1)

    await send(pg, "2026-11-04", "leave", "Гэр бүлээрээ хөдөө явна")
    r = await req(pg, "2026-11-04")
    check("excused request saved with its comment", r and r["kind"] == "leave" and r["status"] == "pending")
    # a send that fails says so and saves nothing
    later = pg.locator(".aw-day[data-date='2026-11-11']")
    await later.locator("button[data-act=sick]").click(); await pg.wait_for_timeout(100)
    await pg.fill("#aw-why", "Эмчид үзүүлнэ")
    await pg.evaluate("()=>{window.__tpeFailSet=true}")
    await later.locator("button[data-act=yes]").click(); await pg.wait_for_timeout(600)
    check("send failure: says so, nothing saved, comment kept to try again", "Илгээх боломжгүй" in await pg.text_content("#aw-msg") and await req(pg, "2026-11-11") is None and await pg.input_value("#aw-why") == "Эмчид үзүүлнэ")
    await later.locator("button[data-act=no]").click(); await pg.wait_for_timeout(100)

    # a lesson the teacher already marked
    await pg.evaluate("()=>{var x=(" + ME + ")();x.m['2026-11-18']='Ч';__tpeNotify()}")
    await pg.click("#awayOut button:has-text('Шинэчлэх')"); await pg.wait_for_timeout(700)
    other = pg.locator(".aw-day[data-date='2026-11-18']")
    check("a teacher's mark shows, with no buttons", "Багш тэмдэглэсэн: Чөлөөтэй" in await other.text_content() and await other.locator("button").count() == 0, await other.text_content())

    await pg.clock.set_fixed_time("2026-10-28T08:45:00+08:00")
    await pg.click("#awayOut button:has-text('Шинэчлэх')"); await pg.wait_for_timeout(700)
    t = await today.text_content()
    check("after 08:30: today's lesson closed, tells to talk to the teacher", "08:30" in t and "өнгөрсөн" in t and await today.locator("button").count() == 0, t)
    check("later lessons stay open after 08:30", await later.locator("button[data-act=sick]").count() == 1)

    await pg.set_viewport_size({"width": 390, "height": 844}); await pg.wait_for_timeout(200)
    await later.locator("button[data-act=sick]").click(); await pg.wait_for_timeout(150)
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
    await as_role(pg, "teacher", hash="coach")
    check("read-only teachers do not see students' requests or comments", await pg.locator("#awayBox").count() == 0 and "Шүд өвдөөд" not in await pg.text_content("main"))


async def teacher(pg):
    await pg.clock.set_fixed_time("2026-10-28T08:00:00+08:00")
    await as_role(pg, "student", hash="away", reset=True)
    await send(pg, "2026-11-04", "sick", "Халуурч байна")
    await send(pg, "2026-11-11", "leave", "Гэр бүлээрээ хөдөө явна")
    await as_role(pg, "admin", hash="coach"); await pg.wait_for_timeout(600)
    box = pg.locator("#awayBox")
    t = await box.text_content() if await box.count() else ""
    check("teacher home: requests waiting, with class, day, reason and the student's comment", "Сурагчдын хүсэлт (3 шинэ)" in t and "Бат Тэмүүлэн · 11B" in t and "11/4" in t and "Халуурч байна" in t and "12C" in t and "Шүд өвдөөд" in t, t)
    await pg.screenshot(path=SHOT + "aw_teacher_home.png", full_page=True)

    line = box.locator(".aw-req", has_text="Халуурч байна")
    await pg.evaluate("()=>{window.__tpeSheetFail=true}")
    await line.locator("button[data-act=approve]").click(); await pg.wait_for_timeout(900)
    check("approval that cannot reach the sheet: request stays waiting, nothing written", (await req(pg, "2026-11-04"))["status"] == "pending" and await mark(pg, "2026-11-04") == "")
    a0 = await pg.evaluate("()=>window.__tpeApproved||0")
    await box.locator(".aw-req", has_text="Халуурч байна").locator("button[data-act=approve]").click(); await pg.wait_for_timeout(1200)
    check("'Батлах' writes Ө into the student's row (as an approved request) and marks it approved", await mark(pg, "2026-11-04") == "Ө" and (await req(pg, "2026-11-04"))["status"] == "ok" and await pg.evaluate("()=>window.__tpeApproved||0") == a0 + 1)
    seeded = await pg.evaluate("()=>Object.keys(__tpeStore()).filter(k=>k.indexOf('absreq/u31218_')===0)[0]")
    before12 = await pg.evaluate("()=>JSON.stringify(__tpeStore()['mocksheet/PE 12'].students.filter(x=>x.id==='31218')[0].m)")
    await box.locator(".aw-req", has_text="Шүд өвдөөд").locator("button[data-act=reject]").click(); await pg.wait_for_timeout(700)
    check("'Татгалзах' only marks the request, the sheet is untouched", (await pg.evaluate("(k)=>__tpeStore()[k].status", seeded)) == "no" and await pg.evaluate("()=>JSON.stringify(__tpeStore()['mocksheet/PE 12'].students.filter(x=>x.id==='31218')[0].m)") == before12)
    check("the box now shows only the one still waiting", "Сурагчдын хүсэлт (1 шинэ)" in await box.text_content())

    await as_role(pg, "student", hash="away")
    d = pg.locator(".aw-day[data-date='2026-11-04']")
    check("the student sees it was approved", "Багш баталсан" in await d.text_content() and await d.locator("button").count() == 0, await d.text_content())

    # lesson day 11 Nov: the excused request was never approved and the student did not come → Т
    await pg.clock.set_fixed_time("2026-11-11T10:00:00+08:00")
    await as_role(pg, "admin", hash="patt"); await pg.wait_for_timeout(600)
    await pg.locator("#pa-classes button.chip", has_text="11B").click(); await pg.wait_for_timeout(700)
    sid = await pg.evaluate("()=>(" + ME + ")().id")
    row = pg.locator(f".pa-row[data-id='{sid}']")
    rt = await row.text_content()
    check("class page: the row shows the waiting request with the comment and approve/reject", await pg.input_value("#pa-date") == "2026-11-11" and "Гэр бүлээрээ хөдөө явна" in rt and await row.locator("button[data-act=approve]").count() == 1, rt)
    check("the day line counts requests", "Хүсэлт 1" in await pg.text_content("#pattOut"))
    await pg.click("#pa-bulk"); await pg.wait_for_timeout(300)
    pv = await pg.text_content("#pa-preview")
    check("'Бүгд ирсэн болгох' preview: 7 present, the not-approved one absent (Т)", "\"Ирсэн\" (И) болно: 7" in pv and "Тасалсан\" (Т): 1" in pv and "Тэмүүлэн" in await pg.text_content("#pa-bulk-absent"), pv)
    await pg.screenshot(path=SHOT + "aw_bulk.png", full_page=True)
    await pg.click("#pa-bulk-ok"); await pg.wait_for_timeout(800)
    marks = await pg.evaluate("()=>__tpeStore()['mocksheet/PE 11'].students.filter(x=>x.cls==='11B').map(x=>x.m['2026-11-11']||'')")
    check("after confirming: 7 × И, the not-approved request × Т", marks.count("И") == 7 and await mark(pg, "2026-11-11") == "Т", marks)
    # the teacher can still accept the reason later: approve writes Ч over the Т
    await row.locator("button[data-act=approve]").click(); await pg.wait_for_timeout(1000)
    check("approving later replaces Т with Ч", await mark(pg, "2026-11-11") == "Ч" and (await req(pg, "2026-11-11"))["status"] == "ok")
    await pg.screenshot(path=SHOT + "aw_teacher_class.png", full_page=True)

    # settings
    await pg.clock.set_fixed_time("2026-10-28T08:00:00+08:00")
    await as_role(pg, "admin", hash="patt"); await pg.wait_for_timeout(600)
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
    check("switched off: page says closed, menu gone", "хаалттай" in await pg.text_content("#awayOut") and not await menu_has_away(pg) and await pg.locator("#awayOut .aw-day").count() == 0)
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
