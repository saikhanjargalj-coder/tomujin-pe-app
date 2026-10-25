"""Browser checks for phase B on the test-data preview (never the real site).

    python3 tools/build.py && python3 tools/preview/build_preview.py /tmp/pv/index.html
    (cd /tmp/pv && python3 -m http.server 8790 &) ; python3 tests/ui/phase_b.py http://127.0.0.1:8790/ /tmp/pv/shots
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
    await pg.evaluate("""([r,p,reset])=>{localStorage.setItem('tpe-preview-role',r);localStorage.setItem('tpe-preview-phase',p);if(reset)localStorage.removeItem('tpe-preview-db-v3');localStorage.setItem('tpe-beta-ok','1')}""", [role, phase, reset])
    await pg.goto("about:blank")
    await pg.goto(BASE + "#" + hash)
    await pg.wait_for_timeout(800)


async def my_logs(pg):
    return await pg.evaluate("()=>Object.keys(__tpeStore()).filter(k=>k.indexOf('users/s1/loading/')===0).length")


async def newest_log(pg):
    return await pg.evaluate("()=>{var s=__tpeStore();return Object.keys(s).filter(k=>k.indexOf('users/s1/loading/')===0).map(k=>s[k]).sort((a,b)=>b.at-a.at)[0]}")


async def log_form(pg):
    """5.3 training log: nothing pre-filled, required answers checked, one save per form."""
    await as_role(pg, "student", hash="log", reset=True)
    vals = await pg.evaluate("()=>['lf-rpe','lf-min','lf-feel','lf-sore','lf-sleep','lf-note'].map(id=>document.getElementById(id).value)")
    check("5.3 log form starts empty (no ready-made answers)", vals == [""] * 6, vals)
    before = await my_logs(pg)
    await pg.click("#lf-send"); await pg.wait_for_timeout(300)
    st = await pg.text_content("#logOut .status")
    check("5.3 empty send names the missing answers", "Бөглөөгүй" in st and "хэр хүнд" in st and "хугацаа" in st, st)
    bad = await pg.evaluate("()=>[...document.querySelectorAll('#logOut [aria-invalid=true]')].map(e=>e.id)")
    check("5.3 missing answers are marked for screen readers", set(bad) == {"lf-rpe", "lf-min", "lf-feel", "lf-sore"}, bad)
    check("5.3 focus goes to the first missing answer", await pg.evaluate("()=>document.activeElement.id") == "lf-rpe")
    check("5.3 nothing saved when answers are missing", await my_logs(pg) == before)
    await pg.screenshot(path=SHOT + "b1_log_missing.png")

    # typed answers survive a live redraw (another device or the teacher changes data)
    await pg.select_option("#lf-rpe", "6")
    await pg.fill("#lf-min", "35")
    await pg.fill("#lf-note", "Тэнцвэр сайжирлаа")
    await pg.evaluate("()=>__tpeNotify()"); await pg.wait_for_timeout(100)
    kept = await pg.evaluate("()=>['lf-rpe','lf-min','lf-note'].map(id=>document.getElementById(id).value)")
    check("5.3 typed answers stay after a live redraw", kept == ["6", "35", "Тэнцвэр сайжирлаа"], kept)
    await pg.fill("#lf-min", "999")
    await pg.select_option("#lf-feel", "4"); await pg.select_option("#lf-sore", "2")
    await pg.click("#lf-send"); await pg.wait_for_timeout(300)
    st = await pg.text_content("#logOut .status")
    check("5.3 minutes outside 1–300 are refused with a reason", "1–300" in st and await my_logs(pg) == before, st)
    await pg.fill("#lf-min", "35")

    # slow network: a double click and a redraw while saving still make one entry
    await pg.evaluate("()=>{window.__tpeHold=true}")
    await pg.click("#lf-send")
    await pg.click("#lf-send", force=True)
    await pg.evaluate("()=>__tpeNotify()"); await pg.wait_for_timeout(100)
    check("5.3 send button stays locked while saving, also after a redraw", await pg.is_disabled("#lf-send"))
    await pg.click("#lf-send", force=True)
    await pg.evaluate("()=>window.__tpeRelease&&window.__tpeRelease()"); await pg.wait_for_timeout(500)
    check("5.3 a double click during a slow save makes one entry", await my_logs(pg) == before + 1, (before, await my_logs(pg)))
    st = await pg.text_content("#logOut .status")
    check("5.3 success message shows the load", "Хадгалагдлаа" in st and "6 × 35 = 210" in st, st)
    vals = await pg.evaluate("()=>['lf-rpe','lf-min','lf-feel','lf-sore','lf-note'].map(id=>document.getElementById(id).value)")
    check("5.3 form is empty again after saving", vals == [""] * 5, vals)
    check("5.3 sleep left empty is not stored", "sleep" not in await newest_log(pg))

    # a refused save keeps what was typed
    await pg.select_option("#lf-rpe", "3"); await pg.fill("#lf-min", "20")
    await pg.select_option("#lf-feel", "3"); await pg.select_option("#lf-sore", "1")
    await pg.fill("#lf-note", "Алхсан")
    await pg.evaluate("()=>{window.__tpeFailSet=true}")
    await pg.click("#lf-send"); await pg.wait_for_timeout(500)
    st = await pg.text_content("#logOut .status")
    kept = await pg.evaluate("()=>['lf-rpe','lf-min','lf-note'].map(id=>document.getElementById(id).value)")
    check("5.3 failed save says so and keeps the answers", "Хадгалж чадсангүй" in st and kept == ["3", "20", "Алхсан"], (st, kept))
    await pg.click("#lf-send"); await pg.wait_for_timeout(500)
    check("5.3 retry after a failure saves once", await my_logs(pg) == before + 2)

    # from an assignment: planned minutes are shown, not written in for the student
    await pg.goto(BASE + "#today"); await pg.wait_for_timeout(500)
    await pg.locator("#todayOut .acard", has_text="Хүчний 4 хэв").first.locator("button", has_text="Хийж дууслаа").click()
    await pg.wait_for_timeout(400)
    await pg.locator("#todayOut button", has_text="Бэлтгэлийн тэмдэглэл бөглөх").first.click()
    await pg.wait_for_timeout(400)
    fr = await pg.text_content("#lf-from")
    check("5.3 assignment shows planned time separately", "Төлөвлөсөн хугацаа: 20 мин" in fr, fr)
    check("5.3 planned minutes are not put into the answer", await pg.input_value("#lf-min") == "")
    await pg.screenshot(path=SHOT + "b2_log_from_assignment.png")
    await pg.select_option("#lf-rpe", "5"); await pg.fill("#lf-min", "25")
    await pg.select_option("#lf-feel", "4"); await pg.select_option("#lf-sore", "1"); await pg.select_option("#lf-sleep", "8")
    await pg.click("#lf-send"); await pg.wait_for_timeout(500)
    x = await newest_log(pg); last = [x.get("min"), x.get("planMin"), x.get("aid"), x.get("sleep")]
    check("5.3 entry keeps actual and planned minutes apart", last == [25, 20, "a1", 8], last)
    check("5.3 assignment banner is gone after saving", await pg.locator("#lf-from").count() == 0)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1280, "height": 900})
        errs = []
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.route("**/fonts.googleapis.com/**", lambda r: r.abort())
        for part in [log_form] + EXTRA:
            try:
                await part(pg)
            except Exception as e:
                check(part.__name__ + " ran to the end", False, repr(e))
        check("no script errors", not errs, errs[:5])
        await b.close()
    bad = [r for r in results if not r[0]]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)


EXTRA = []

if __name__ == "__main__":
    asyncio.run(main())
