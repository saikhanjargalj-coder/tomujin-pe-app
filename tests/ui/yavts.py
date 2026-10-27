"""Browser checks for the term progress grade (Явц) on the test-data preview (never the real site):
the owner copies grades from the (made-up) working sheet, teachers see every class by ID and class,
a student sees only their own grade and only after the owner opens the class, teacher notes never reach students.

    python3 tools/build.py && python3 tools/preview/build_preview.py /tmp/pv/index.html
    (cd /tmp/pv && python3 -m http.server 8791 &) ; python3 tests/ui/yavts.py http://127.0.0.1:8791/ /tmp/pv/shots
"""
import asyncio, sys, os
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8791/"
SHOT = (sys.argv[2] if len(sys.argv) > 2 else "/tmp/pv/shots").rstrip("/") + "/"
os.makedirs(SHOT, exist_ok=True)
results = []


def check(name, cond, info=""):
    results.append((bool(cond), name, info))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  -> " + str(info)[:400]))


async def as_role(pg, role, hash="home", reset=False):
    await pg.goto(BASE + "#home")
    await pg.evaluate("""([r,reset])=>{localStorage.setItem('tpe-preview-role',r);localStorage.setItem('tpe-preview-phase','p1');if(reset)localStorage.removeItem('tpe-preview-db-v6');localStorage.setItem('tpe-beta-ok','1')}""", [role, reset])
    await pg.goto("about:blank")
    await pg.goto(BASE + "#" + hash)
    await pg.wait_for_timeout(1300)


async def text(pg, sel):
    return await pg.evaluate("(s)=>{const e=document.querySelector(s);return e?e.innerText:''}", sel)


async def sheet_text(pg):
    return await pg.evaluate("()=>document.getElementById('sheet').hidden?'':document.getElementById('panel').innerText")


async def no_hscroll(pg):
    return await pg.evaluate("()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1")


async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={"width": 1280, "height": 900})
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))

        # ---------- student before anything is copied ----------
        await as_role(pg, "student", "tests", reset=True)
        t = await text(pg, "#testsOut")
        check("student: no grade card before the owner copies grades", "Миний улирлын дүн" not in t, t[:200])

        # ---------- owner copies from the sheet ----------
        await as_role(pg, "admin", "tests")
        t = await text(pg, "#testsOut")
        check("owner: term grade tab is first and says nothing is copied yet", "Улирлын дүн (Явц)" in t and "Sheet-ээс шинэчлэх" in t and "хараахан ороогүй" in t, t[:300])
        await pg.click("#testsOut button:has-text('Sheet-ээс шинэчлэх')")
        await pg.wait_for_timeout(2500)
        t = await text(pg, "#testsOut")
        st = await pg.evaluate("()=>{const s=__tpeStore();const g=Object.keys(s).filter(k=>/^grades\\//.test(k));const n=Object.keys(s).filter(k=>/^gradesStaff\\//.test(k));return {g:g.length,n:n.length,pub:g.filter(k=>s[k].pub).length,noteInGrade:g.some(k=>'note' in s[k]),ex:s[g[0]]}}")
        check("owner: grades copied for every made-up student", st["g"] >= 80 and "сурагчийн дүн шинэчлэгдлээ" in t, [st["g"], t[:300]])
        check("owner: copied grades start closed to students", st["pub"] == 0, st["pub"])
        check("teacher notes stored apart, never inside the grade", st["n"] > 0 and not st["noteInGrade"], st)
        check("grade keeps ID, class, levels, points, weights", all(k in st["ex"] for k in ["sid", "cls", "grade", "lv", "pts", "w", "yavts", "email", "c"]), st["ex"])
        cards = await pg.evaluate("()=>[...document.querySelectorAll('#testsOut .clsgrid .clscard b')].map(b=>b.textContent)")
        check("owner: one card per class, grade order", cards[:2] == ["6A", "7A"] and "12C" in cards and "11B" in cards, cards)
        await pg.screenshot(path=SHOT + "yavts-owner.png", full_page=True)

        # open 11B, look at a row, then open the class to students
        await pg.click("#testsOut .clscard:has(b:text-is('11B'))"); await pg.wait_for_timeout(300)
        rows = await pg.evaluate("()=>[...document.querySelectorAll('#testsOut table.yvtbl tbody tr')].map(r=>[...r.cells].map(c=>c.innerText))")
        check("class table: ID, name, attendance, 4 levels, grade", len(rows) == 8 and rows[0][0].startswith("3") and "%" in rows[0][2] and rows[0][7].isdigit(), rows[:2])
        await pg.click("#testsOut table.yvtbl tbody tr:first-child button.exlink"); await pg.wait_for_timeout(300)
        t = await sheet_text(pg)
        check("detail: five parts with points and the teacher note box", all(x in t for x in ["Ирц", "Идэвх, оролцоо", "Бэлэн байдал", "Мэдлэг", "Хэрэглээ, дадал", "/ 35 оноо", "Багшийн тэмдэглэл"]), t[:500])
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)

        # search by ID across classes
        sid = rows[3][0]
        await pg.fill("#testsOut .yvq", sid); await pg.wait_for_timeout(200)
        found = await pg.evaluate("()=>[...document.querySelectorAll('#testsOut .yvfound tbody tr')].map(r=>r.cells[0].innerText+'|'+r.cells[2].innerText)")
        check("search by ID finds the student with their class", found == [sid + "|11B"], found)
        await pg.fill("#testsOut .yvq", "")

        await pg.click("#testsOut button:has-text('Сурагчдад нээх')"); await pg.wait_for_timeout(800)
        pub = await pg.evaluate("()=>{const s=__tpeStore();return Object.keys(s).filter(k=>/^grades\\//.test(k)&&s[k].pub).map(k=>s[k].cls)}")
        check("owner: opening 11B opens exactly that class", len(pub) == 8 and set(pub) == {"11B"}, pub)

        # re-copy keeps the class open and says new grades are visible at once
        await pg.click("#testsOut button:has-text('Sheet-ээс шинэчлэх')"); await pg.wait_for_timeout(2500)
        t = await text(pg, "#testsOut")
        pub2 = await pg.evaluate("()=>{const s=__tpeStore();return Object.keys(s).filter(k=>/^grades\\//.test(k)&&s[k].pub).length}")
        check("re-copy keeps opened classes open and warns", pub2 == 8 and "11B" in t and "шууд харагдана" in t, [pub2, t[:300]])

        # dashboard box and student record
        await pg.goto(BASE + "#coach"); await pg.wait_for_timeout(1500)
        t = await text(pg, "#coachOut")
        check("dashboard: term grade box with every class", "Явцын дүн" in t and "11B" in t and "12C" in t and "Нээлттэй" in t, t[:400])
        await pg.screenshot(path=SHOT + "yavts-coach.png", full_page=True)
        await pg.click("#coachOut tr.cxrow:has-text('Бат Тэмүүлэн') button:has-text('Нээх')"); await pg.wait_for_timeout(400)
        t = await sheet_text(pg)
        check("dashboard: a registered student's record shows their term grade", "Явцын дүн" in t and "Хэрэглээ, дадал" in t and "ID 31" in t, t[:600])
        await pg.keyboard.press("Escape")

        # ---------- teacher (read only) ----------
        await as_role(pg, "teacher", "tests")
        t = await text(pg, "#testsOut")
        check("teacher: sees grades but cannot copy or open classes", "11B" in t and "Sheet-ээс шинэчлэх" not in t and "Сурагчдад нээх" not in t, t[:300])
        ok = await pg.evaluate("()=>__tpeStore()&&TPE.db.batch([{op:'merge',path:'grades/t1_31101',data:{pub:true}}]).then(()=>'saved',()=>'denied')")
        check("teacher: writing a grade is refused", ok == "denied", ok)

        # ---------- student ----------
        await as_role(pg, "student", "tests")
        t = await text(pg, "#testsOut")
        check("student: own card after the class was opened", "Миний улирлын дүн" in t and "Хэрэглээ, дадал" in t and "/ 100" in t, t[:400])
        check("student: no other student, no teacher note, no class table", "Ирцийн бүртгэл" not in t and "Багшийн тэмдэглэл" not in t and "Хичээлээс гадуур" not in t and "Техникээ" not in t and not await pg.evaluate("()=>!!document.querySelector('#testsOut table.yvtbl')"), t[:600])
        mine = await pg.evaluate("()=>document.querySelectorAll('#testsOut .yvcard').length")
        check("student: exactly one grade card (their own)", mine == 1, mine)
        await pg.screenshot(path=SHOT + "yavts-student.png", full_page=True)
        ok = await pg.evaluate("()=>TPE.db.batch([{op:'merge',path:'grades/t1_31101',data:{yavts:100}}]).then(()=>'saved',()=>'denied')")
        check("student: changing a grade is refused", ok == "denied", ok)
        await pg.set_viewport_size({"width": 390, "height": 844}); await pg.wait_for_timeout(300)
        check("student card fits a phone (no sideways scroll)", await no_hscroll(pg))
        await pg.screenshot(path=SHOT + "yavts-student-phone.png", full_page=True)

        # owner closes the class again: the student's card disappears
        await pg.set_viewport_size({"width": 1280, "height": 900})
        await as_role(pg, "admin", "tests")
        await pg.click("#testsOut .clscard:has(b:text-is('11B'))"); await pg.wait_for_timeout(300)
        await pg.click("#testsOut button:has-text('Хаах')"); await pg.wait_for_timeout(800)
        await as_role(pg, "student", "tests")
        t = await text(pg, "#testsOut")
        check("student: card gone once the owner closes the class", "Миний улирлын дүн" not in t, t[:200])

        check("no page errors", not errors, errors)
        await br.close()
    bad = [r for r in results if not r[0]]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)

asyncio.run(main())
