"""Browser checks for what a student reads with their term grade (Явц): the teacher's comment, the baseline tests,
one strength and one area to work on. On the test-data preview only (never the real site).

    python3 tools/build.py && python3 tools/preview/build_preview.py /tmp/pv/index.html
    (cd /tmp/pv && python3 -m http.server 8791 &) ; python3 tests/ui/yavts_comment.py http://127.0.0.1:8791/ /tmp/pv/shots
"""
import asyncio, sys, os
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8791/"
SHOT = (sys.argv[2] if len(sys.argv) > 2 else "/tmp/pv/shots").rstrip("/") + "/"
os.makedirs(SHOT, exist_ok=True)
results = []
STUDENT = "bat.temuulen@tomujin.edu.mn"


def check(name, cond, info=""):
    results.append((bool(cond), name, info))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  -> " + str(info)[:400]))


async def as_role(pg, role, hash="home", reset=False):
    await pg.goto(BASE + "#home")
    await pg.evaluate("""([r,reset])=>{localStorage.setItem('tpe-preview-role',r);localStorage.setItem('tpe-preview-phase','p1');if(reset)localStorage.removeItem('tpe-preview-db-v6');localStorage.setItem('tpe-beta-ok','1')}""", [role, reset])
    await pg.goto("about:blank")
    await pg.goto(BASE + "#" + hash)
    await pg.wait_for_timeout(1300)


async def panel(pg):
    return await pg.evaluate("()=>document.getElementById('sheet').hidden?'':document.getElementById('panel').innerText")


async def grade_of(pg, email):
    return await pg.evaluate("(em)=>{const s=__tpeStore();const k=Object.keys(s).filter(k=>/^grades\\//.test(k)&&s[k].email===em)[0];return k?Object.assign({id:k.slice(7)},s[k]):null}", email)


async def sync(pg):
    await pg.click("#testsOut button:has-text('Sheet-ээс шинэчлэх')"); await pg.wait_for_timeout(2500)
    return await pg.evaluate("()=>{const e=document.querySelector('#testsOut .status');return e?e.innerText:''}")


async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={"width": 1280, "height": 900})
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))

        # ---------- owner: an Apps Script not updated yet says so, nothing breaks ----------
        await as_role(pg, "admin", "tests", reset=True)
        await pg.evaluate("()=>{window.__tpeOldScript=true}")
        msg = await sync(pg)
        g = await grade_of(pg, STUDENT)
        check("old script: grades still copied, the owner is told to update the script", g and g.get("yavts") is not None and "скрипт хуучин" in msg and not g.get("comment"), [msg, g and g.get("comment")])

        # ---------- owner: updated script brings the comment and the baseline ----------
        await pg.evaluate("()=>{window.__tpeOldScript=false}")
        msg = await sync(pg)
        g = await grade_of(pg, STUDENT)
        check("new script: comment, baseline, strength and area saved with the grade", g and g.get("comment") and "Сунах" in (g.get("base") or "") and "скрипт хуучин" not in msg, [msg, g])
        staff = await pg.evaluate("()=>{const s=__tpeStore();return Object.keys(s).filter(k=>/^gradesStaff\\//.test(k)).map(k=>Object.keys(s[k]).join(','))}")
        check("the teacher-only note stays apart (gradesStaff holds only note, at)", staff and all(x in ("note,at", "at,note") for x in staff), staff)
        check("sync message counts students without a comment", "сэтгэгдэл хоосон" in msg, msg)

        # teacher view of that student: the same boxes the student will see, plus the teacher-only note
        await pg.click("#testsOut .clscard:has(b:text-is('11B'))"); await pg.wait_for_timeout(300)
        await pg.fill("#testsOut input.yvq", g["sid"]); await pg.wait_for_timeout(200)
        await pg.click("#testsOut .yvfound button.exlink"); await pg.wait_for_timeout(400)
        t = await panel(pg)
        tiles = await pg.evaluate("()=>document.querySelectorAll('#panel .yvb').length")
        check("teacher sees 'Сурагчид харагдах хэсэг' with the comment", "Сурагчид харагдах хэсэг" in t and g["comment"][:40] in t and "Багшийн сэтгэгдэл" in t, t[:600])
        check("baseline shows as tiles with what each test measures", tiles == 4 and "Уян хатан чанар" in t and "1 миль гүйлт" in t, [tiles, t[:600]])
        check("strength and area to work on shown", (not g.get("str") or "Давуу тал" in t) and (not g.get("weak") or "Цаашид анхаарах" in t), [g.get("str"), g.get("weak")])
        check("closed class: the panel says when the student will see it", "Анги нээгдсэний дараа" in t, t[:400])
        check("teacher-only note box still there", "Багшийн тэмдэглэл (ажлын хүснэгтээс)" in t)
        await pg.screenshot(path=SHOT + "comment_teacher.png")
        await pg.click("#sheet .x, #sheet button[aria-label='Хаах']") if await pg.query_selector("#sheet .x, #sheet button[aria-label='Хаах']") else None

        # a student without baseline: plain line, no tiles
        nob = await pg.evaluate("()=>{const s=__tpeStore();const k=Object.keys(s).filter(k=>/^grades\\//.test(k)&&s[k].base==='Гарааны дүн бүртгэгдээгүй')[0];return k?s[k].sid:null}")
        if nob:
            await pg.goto(BASE + "#tests"); await pg.wait_for_timeout(900)
            await pg.fill("#testsOut input.yvq", nob); await pg.wait_for_timeout(200)
            await pg.click("#testsOut .yvfound button.exlink"); await pg.wait_for_timeout(400)
            t2 = await panel(pg)
            check("no baseline yet: says so plainly, no empty tiles", "Гарааны дүн бүртгэгдээгүй" in t2 and await pg.evaluate("()=>document.querySelectorAll('#panel .yvb').length") == 0, t2[:400])

        # ---------- student: nothing before the class is opened ----------
        await as_role(pg, "student", "tests")
        txt = await pg.evaluate("()=>document.getElementById('testsOut').innerText")
        check("student: class not opened, no comment visible", g["comment"][:30] not in txt and "Багшийн сэтгэгдэл" not in txt, txt[:300])

        # ---------- owner opens 11B, student reads own comment ----------
        await as_role(pg, "admin", "tests")
        await pg.click("#testsOut .clscard:has(b:text-is('11B'))"); await pg.wait_for_timeout(300)
        await pg.click("#testsOut button:has-text('Сурагчдад нээх')"); await pg.wait_for_timeout(800)
        await as_role(pg, "student", "tests")
        n = await pg.evaluate("()=>({txt:document.getElementById('testsOut').innerText,tiles:document.querySelectorAll('#testsOut .yvb').length,btn:document.querySelectorAll('#testsOut .yvown button, #testsOut .yvcomment button').length})")
        check("student: own comment under the grade", "Багшийн сэтгэгдэл" in n["txt"] and g["comment"][:40] in n["txt"], n["txt"][:500])
        check("student: own baseline as 'Миний гарааны үнэлгээ'", "Миний гарааны үнэлгээ" in n["txt"] and n["tiles"] == 4, [n["tiles"], n["txt"][:500]])
        check("student: no teacher-only note, no 'Сурагчид харагдах хэсэг', no sheet hint", "Багшийн тэмдэглэл" not in n["txt"] and "Сурагчид харагдах" not in n["txt"] and "Сэтгэгдэл (автомат)" not in n["txt"], n["txt"][:500])
        check("student: says the baseline is a starting point, no ranking", "эхлэлийн цэг" in n["txt"] and "дундаж" not in n["txt"], n["txt"][:500])
        check("student: nothing to click in the comment boxes", n["btn"] == 0, n["btn"])
        await pg.screenshot(path=SHOT + "comment_student.png", full_page=True)

        await pg.set_viewport_size({"width": 390, "height": 844}); await pg.wait_for_timeout(300)
        wide = await pg.evaluate("()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1")
        check("student view fits a phone (no sideways scroll)", not wide)
        await pg.screenshot(path=SHOT + "comment_student_phone.png", full_page=True)
        await pg.set_viewport_size({"width": 1280, "height": 900})

        # ---------- dark theme stays readable ----------
        await pg.emulate_media(color_scheme="dark"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=SHOT + "comment_student_dark.png", full_page=True)
        await pg.emulate_media(color_scheme="light")

        # ---------- closing the class hides the comment again ----------
        await as_role(pg, "admin", "tests")
        await pg.click("#testsOut .clscard:has(b:text-is('11B'))"); await pg.wait_for_timeout(300)
        await pg.click("#testsOut .box button:text-is('Хаах')"); await pg.wait_for_timeout(800)
        await as_role(pg, "student", "tests")
        txt = await pg.evaluate("()=>document.getElementById('testsOut').innerText")
        check("student: comment gone once the class is closed", g["comment"][:30] not in txt and "Багшийн сэтгэгдэл" not in txt, txt[:300])

        check("no page errors", not errors, errors)
        await br.close()
    bad = [r for r in results if not r[0]]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)

asyncio.run(main())
