"""Browser checks for phase A on the test-data preview (never the real site).

    python3 tools/build.py && python3 tools/preview/build_preview.py /tmp/pv/index.html
    (cd /tmp/pv && python3 -m http.server 8790 &) ; python3 tests/ui/phase_a.py http://127.0.0.1:8790/ /tmp/pv/shots
"""
import asyncio, sys, os
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8790/"
SHOT = (sys.argv[2] if len(sys.argv) > 2 else "/tmp/pv/shots").rstrip("/") + "/"
os.makedirs(SHOT, exist_ok=True)
results = []


def check(name, cond, info=""):
    results.append((bool(cond), name, info))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  -> " + str(info)[:300]))


async def as_role(pg, role, phase="p1", hash="home", reset=False):
    await pg.goto(BASE + "#home")
    await pg.evaluate("""([r,p,reset])=>{localStorage.setItem('tpe-preview-role',r);localStorage.setItem('tpe-preview-phase',p);if(reset)localStorage.removeItem('tpe-preview-db-v4');localStorage.setItem('tpe-beta-ok','1')}""", [role, phase, reset])
    await pg.goto("about:blank")
    await pg.goto(BASE + "#" + hash)
    await pg.wait_for_timeout(800)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1280, "height": 900})
        errs = []
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.route("**/fonts.googleapis.com/**", lambda r: r.abort())

        # 3.1 one access rule
        await as_role(pg, "guest", reset=True)
        await pg.click("#acctBar >> text=Нэвтрэх")
        note = await pg.text_content("#panel p.muted")
        check("3.1 login note lists open sections", "Тоглолтууд" in note and "Podcast" in note and "Нүүр хуудас" in note, note)
        check("3.1 login note lists members-only sections", "Дасгалын сан" in note.split("нээгдэнэ:")[-1] and "Хоол тооцоолуур" in note.split("нээгдэнэ:")[-1], note)
        check("3.1 no 'use without login' promise for library", "нэвтрэлгүйгээр ашиглана" not in note, note)
        await pg.screenshot(path=SHOT + "a1_login_note.png")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
        check("Escape closes the dialog", not await pg.is_visible("#sheet"))
        await pg.goto(BASE + "#library"); await pg.wait_for_timeout(300)
        check("3.1 guest opening library is sent to home (members only)", not await pg.is_visible("#v-library"))

        # deep link to a members page while signed out: login opens and the page is kept
        await as_role(pg, "guest", hash="plan")
        check("signed-out deep link asks to sign in", await pg.is_visible("#sheet") and "Нэвтрэх" in (await pg.text_content("#sheetTitle") or ""))
        await pg.keyboard.press("Escape")

        # 3.2 grades
        await pg.goto(BASE + "#home"); await pg.wait_for_timeout(300)
        cj = await pg.text_content("#coachIntro")
        check("3.2 coach intro says grades 1 and 6–12", "1 болон 6–12" in cj and "1–12" not in cj, cj[:200])
        await pg.goto(BASE + "#how"); await pg.wait_for_timeout(300)
        hw = await pg.text_content("#howSteps")
        check("3.2 how-it-works says grades 1 and 6–12", "1 болон 6–12" in hw and "1–12" not in hw, hw[:200])

        # 3.4 plan saved to the account, survives reload
        await as_role(pg, "student", hash="plan")
        btn = pg.locator("#planOut button", has_text="Акаунтдаа хадгалах")
        check("3.4 save button names the account (not this device)", await btn.count() == 1 and await pg.locator("text=Хадгалах (энэ төхөөрөмж дээр)").count() == 0)
        await pg.fill("#pName", "Миний хүчний бэлтгэл")
        await btn.click(); await pg.wait_for_timeout(600)
        st = await pg.text_content("#planOut")
        check("3.4 rename then save in one click: saved state shown with time", "Акаунтад хадгалагдсан" in st, st[-300:])
        await pg.reload(); await pg.wait_for_timeout(900)
        mine = await pg.text_content("#myPlans")
        check("3.4 saved plan is there after reload", "Миний хүчний бэлтгэл" in mine, mine[:200])
        tb = await pg.text_content("#planOut .timebox")
        check("3.5 time split into work, rest, transitions", "Ажил" in tb and "Амралт" in tb and "Шилжилт" in tb, tb[:200])
        await pg.screenshot(path=SHOT + "a2_plan_saved.png", full_page=False)

        # 4 club registration, 1st choice only before 11:00
        await as_role(pg, "student", phase="p1", hash="clubs", reset=True)
        row = pg.locator("#crOut .crrow", has_text="Да, Лх").filter(has=pg.locator("button", has_text="Суудал авах")).first
        await pg.locator("#crOut .club", has_text="Сагсан бөмбөг").locator("button", has_text="Суудал авах").click()
        await pg.wait_for_timeout(600)
        bb = await pg.locator("#crOut .club", has_text="Сагсан бөмбөг").text_content()
        check("4 seat taken, message says it is not final yet", "Таны суудал" in bb and "эцсийн баталгаажуулалт биш" in bb, bb[:300])
        fn = pg.locator("#crOut .club", has_text="Functional strength").locator("button").filter(has_text="2 дахь дугуйлангаа нэмнэ")
        check("4 before 11:00 a second club is blocked with the time", await fn.count() >= 1)
        await pg.screenshot(path=SHOT + "a3_seat_taken.png")

        # last seat taken by someone else between screen and click
        await as_role(pg, "student", phase="p2", hash="clubs", reset=True)
        await pg.evaluate("window.__tpeRace='tn-a'")
        await pg.locator("#crOut .club", has_text="Пиклбол").locator(".crrow", has_text="А ээлж").locator("button", has_text="Суудал авах").click()
        await pg.wait_for_timeout(600)
        tn = await pg.locator("#crOut .club", has_text="Пиклбол").text_content()
        check("4 race: clear 'just taken' message with waitlist button", "дөнгөж өөр хүүхдэд оногдлоо" in tn, tn[:300])
        await pg.screenshot(path=SHOT + "a4_race_message.png")
        await pg.locator("#crOut .club", has_text="Пиклбол").locator("button", has_text="Хүлээлгэнд орох").first.click()
        await pg.wait_for_timeout(600)
        tn = await pg.locator("#crOut .club", has_text="Пиклбол").text_content()
        check("4 race: joining the waitlist works", "Хүлээлгийн" in tn, tn[:300])

        # network: answer lost after the server saved -> verify says seat exists
        await pg.evaluate("window.__tpeLost=true")
        await pg.locator("#crOut .club", has_text="Гар бөмбөг").locator("button", has_text="Суудал авах").click()
        await pg.wait_for_timeout(1200)
        hb = await pg.locator("#crOut .club", has_text="Гар бөмбөг").text_content()
        check("4 lost answer: checks the server and confirms the seat", "серверт бүртгэгдсэн" in hb or "Таны суудал" in hb, hb[:300])
        # offline -> clear 'unknown, check after reconnect' state, no fake seat
        await as_role(pg, "student", phase="p2", hash="clubs", reset=True)
        await pg.evaluate("window.__tpeOffline=true")
        await pg.locator("#crOut .club", has_text="Functional strength").locator(".crrow", has_text="Б ээлж").locator("button", has_text="Суудал авах").click()
        await pg.wait_for_timeout(1200)
        fnb = await pg.locator("#crOut .club", has_text="Functional strength").text_content()
        oktags = await pg.locator("#crOut .club", has_text="Functional strength").locator(".tag.ok").count()
        check("4 offline: no seat shown, clear next step", oktags == 0 and ("тодорхойгүй" in fnb or "аваагүй" in fnb), fnb[:300])
        await pg.screenshot(path=SHOT + "a5_offline.png")
        await pg.evaluate("window.__tpeOffline=false")

        # closed: nothing to pick
        await as_role(pg, "student", phase="closed", hash="clubs", reset=True)
        cl = await pg.text_content("#crOut")
        check("4 closed: no seat buttons", await pg.locator("#crOut button", has_text="Суудал авах").count() == 0 and "хаагдсан" in cl.lower(), cl[:200])
        await as_role(pg, "student", phase="before", hash="clubs", reset=True)
        bf = await pg.text_content("#crOut")
        check("4 before opening: shows opening time", "нээгдэнэ" in bf and await pg.locator("#crOut button", has_text="Суудал авах").count() == 0, bf[:200])

        # owner: free seats while children wait
        await as_role(pg, "admin", phase="p2", hash="clubs", reset=True)
        await pg.evaluate("TPE.db.batch([{op:'merge',path:'offers/jj-a',data:{n:15}}])")
        await pg.wait_for_timeout(400)
        ad = await pg.text_content("#crOut")
        check("4 owner warned: free seat while children wait", "суудал чөлөөтэй, хүлээлгэд 3" in ad, ad[-400:])
        await pg.screenshot(path=SHOT + "a6_owner_warning.png", full_page=True)

        # 3.3 lesson circuit vs block time, teacher-only
        await as_role(pg, "admin", hash="lessons")
        ls = await pg.text_content("#lessonList")
        check("3.3 owner sees circuit check (12 min vs 40 min block)", "12 мин" in ls and "40 мин" in ls, ls[:300])
        await as_role(pg, "student", hash="lessons")
        ls2 = await pg.text_content("#lessonList")
        check("3.3 students do not see the teacher check", "Тойргийн тооцоо" not in ls2)
        await as_role(pg, "teacher", hash="lessons")
        check("3.3 read-only teacher: no edit button", await pg.locator("#lessonList button", has_text="Тохируулах").count() == 0)
        await as_role(pg, "admin", hash="lessons")
        await pg.screenshot(path=SHOT + "a7_lesson_check.png")

        # widths
        for w in (360, 390, 768):
            m = await b.new_context(viewport={"width": w, "height": 820}, is_mobile=w < 700, has_touch=w < 700)
            mp = await m.new_page(); mp.on("pageerror", lambda e: errs.append(str(e)))
            await mp.route("**/fonts.googleapis.com/**", lambda r: r.abort())
            await mp.goto(BASE + "#clubs")
            await mp.evaluate("localStorage.setItem('tpe-preview-role','student');localStorage.setItem('tpe-preview-phase','p1');localStorage.setItem('tpe-beta-ok','1')")
            await mp.reload(); await mp.wait_for_timeout(700)
            sw = await mp.evaluate("document.documentElement.scrollWidth")
            check(f"no sideways scroll at {w}px", sw <= w, sw)
            await mp.screenshot(path=SHOT + f"a8_clubs_{w}.png")
            await m.close()

        check("no page errors", not errs, errs[:3])
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)


asyncio.run(main())
