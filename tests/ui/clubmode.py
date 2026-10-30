"""Browser checks for the club registration mode switch (auto / view only / open now) on the test-data preview.

    python3 tools/build.py && python3 tools/preview/build_preview.py /tmp/pv/index.html
    (cd /tmp/pv && python3 -m http.server 8790 &) ; python3 tests/ui/clubmode.py http://127.0.0.1:8790/ /tmp/pv/shots
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


async def as_role(pg, role, phase="p1", hash="clubs", reset=False):
    await pg.goto(BASE + "#home")
    await pg.evaluate("""([r,p,reset])=>{localStorage.setItem('tpe-preview-role',r);localStorage.setItem('tpe-preview-phase',p);if(reset)localStorage.removeItem('tpe-preview-db-v6');localStorage.setItem('tpe-beta-ok','1')}""", [role, phase, reset])
    await pg.goto("about:blank")
    await pg.goto(BASE + "#" + hash)
    await pg.wait_for_timeout(900)


async def banner(pg):
    return (await pg.locator("#crOut .crbanner").first.inner_text()).strip()


async def set_mode(pg, label):
    await pg.click("#crOut [data-crmode] >> text=" + label)
    await pg.wait_for_timeout(600)


async def pressed(pg):
    return await pg.evaluate("""()=>[...document.querySelectorAll('#crOut [data-crmode]')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.crmode).join(',')""")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1280, "height": 900})
        errs, dialogs = [], []
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: (dialogs.append(d.message), asyncio.ensure_future(d.accept())))
        await pg.route("**/fonts.googleapis.com/**", lambda r: r.abort())

        # 1. owner sees the switch, default is "by the times"
        await as_role(pg, "admin", "p1", reset=True)
        n = await pg.locator("#crOut [data-crmode]").count()
        check("M1 owner sees 3 mode buttons", n == 3, n)
        check("M1 default mode is auto", await pressed(pg) == "auto", await pressed(pg))
        bn = await banner(pg)
        check("M1 auto + open time: registration open", "Бүртгэл нээлттэй" in bn, bn)
        await pg.locator("#crOut .box").filter(has_text="Бүртгэлийн горим").first.screenshot(path=SHOT + "mode-auto.png")

        # 2. view only
        await set_mode(pg, "Зөвхөн харах")
        check("M2 confirm explains view mode", any("Зөвхөн харах горим" in m for m in dialogs), dialogs[-1:] if dialogs else "")
        check("M2 view pressed", await pressed(pg) == "view", await pressed(pg))
        bn = await banner(pg)
        check("M2 banner says look-only", "Дугуйлантай танилцах үе" in bn, bn)
        await pg.locator("#crOut .box").filter(has_text="Бүртгэлийн горим").first.screenshot(path=SHOT + "mode-view-admin.png")

        await as_role(pg, "student", "p1")
        bn = await banner(pg)
        check("M3 student sees look-only banner", "Дугуйлантай танилцах үе" in bn, bn)
        en = await pg.locator("#crOut button:has-text('Суудал авах'):not([disabled]), #crOut button:has-text('Хүлээлгэнд орох'):not([disabled])").count()
        check("M3 no seat button is active", en == 0, en)
        dis = await pg.locator("#crOut button[disabled]:has-text('Сонголт түр хаалттай')").count()
        check("M3 buttons say paused", dis >= 8, dis)
        check("M3 student has no mode switch", await pg.locator("[data-crmode]").count() == 0)
        await pg.screenshot(path=SHOT + "mode-view-student.png")
        # a page still open from before the switch: the server (here the preview's copy of the rules) refuses the pick
        st = await pg.evaluate("()=>{var s=__tpeStore()['site/clubreg'];s.mode='auto';return 1}")
        await pg.evaluate("()=>__tpeNotify()"); await pg.wait_for_timeout(500)
        en = await pg.locator("#crOut button:has-text('Суудал авах'):not([disabled])").count()
        check("M3b stale page still shows a seat button", en > 0, en)
        await pg.evaluate("()=>{__tpeStore()['site/clubreg'].mode='view'}")  # switched on the server, page not told yet
        await pg.locator("#crOut button:has-text('Суудал авах'):not([disabled])").last.click()
        await pg.wait_for_timeout(900)
        t = await pg.locator("#crOut").inner_text()
        check("M3b stale page: pick refused with a clear message", "Одоогоор сонгох боломжгүй" in t, t[:300])
        n_fnb = await pg.evaluate("()=>__tpeStore()['offers/fn-b'].n")
        check("M3b no seat counted", n_fnb == 0, n_fnb)
        await pg.evaluate("()=>__tpeNotify()"); await pg.wait_for_timeout(400)
        await pg.goto(BASE + "#myclubs"); await pg.wait_for_timeout(600)
        t = await pg.locator("#myClubsOut").inner_text()
        check("M3 my clubs says paused", "түр хаалттай" in t, t[:200])

        # 3. open now, even though the times have passed
        await as_role(pg, "admin", "closed")
        await set_mode(pg, "Одоо идэвхтэй")
        check("M4 live pressed", await pressed(pg) == "live", await pressed(pg))
        check("M4 confirm says what students get", any("Одоо идэвхтэй горим" in m and "Нээлттэй" in m for m in dialogs), dialogs[-1:])
        await as_role(pg, "student", "closed")
        bn = await banner(pg)
        check("M4 times passed + live: open, 2 clubs", "2 дахь дугуйлан" in bn and "багш зарлана" in bn, bn)
        await pg.screenshot(path=SHOT + "mode-live-student.png")
        await pg.locator("#crOut .crrow", has_text="Б ээлж").filter(has=pg.locator("button:has-text('Суудал авах')")).last.locator("button:has-text('Суудал авах')").click()
        await pg.wait_for_timeout(900)
        t = await pg.locator("#crOut").inner_text()
        check("M4 student takes a seat in live mode", "✓ Суудал авлаа" in t, t[:300])

        # 4. open now before the opening time: the 1-club rule still holds until p1
        await as_role(pg, "student", "before")
        bn = await banner(pg)
        check("M5 live before p1: step 1 (1 club)", "1-р алхам" in bn and "багш зарлана" in bn, bn)
        dis = await pg.locator("#crOut button[disabled]:has-text('2 дахь дугуйлангаа нэмнэ')").count()
        check("M5 second club waits for p1", dis >= 1, dis)

        # 5. back to auto: times passed -> closed again
        await as_role(pg, "admin", "closed")
        await set_mode(pg, "Цагаар")
        check("M6 auto confirm shows the times", any("Цагаар горим" in m and "Хаагдсан" in m for m in dialogs), dialogs[-1:])
        await as_role(pg, "student", "closed")
        bn = await banner(pg)
        check("M6 auto + closed: closed", "хаагдсан" in bn, bn)
        en = await pg.locator("#crOut button:has-text('Суудал авах'):not([disabled])").count()
        check("M6 closed: no seat button", en == 0, en)

        # 6. teachers do not get the switch
        await as_role(pg, "teacher", "p1")
        check("M7 teacher has no mode switch", await pg.locator("[data-crmode]").count() == 0)

        # 7. phone width: the switch fits
        await pg.set_viewport_size({"width": 390, "height": 844})
        await as_role(pg, "admin", "p1")
        w = await pg.evaluate("document.documentElement.scrollWidth")
        check("M8 no sideways scroll at 390px", w <= 390, w)
        await pg.locator("#crOut .box").filter(has_text="Бүртгэлийн горим").first.screenshot(path=SHOT + "mode-phone.png")

        check("M9 no page errors", not errs, errs[:3])
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)


asyncio.run(main())
