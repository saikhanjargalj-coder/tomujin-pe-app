"""Browser checks for the teacher dashboard on the test-data preview (never the real site):
every card, student row and log row opens; only the owner edits and writes notes; notes stay with teachers.

    python3 tools/build.py && python3 tools/preview/build_preview.py /tmp/pv/index.html
    (cd /tmp/pv && python3 -m http.server 8791 &) ; python3 tests/ui/coach.py http://127.0.0.1:8791/ /tmp/pv/shots
"""
import asyncio, sys, os
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8791/"
SHOT = (sys.argv[2] if len(sys.argv) > 2 else "/tmp/pv/shots").rstrip("/") + "/"
os.makedirs(SHOT, exist_ok=True)
results = []


def check(name, cond, info=""):
    results.append((bool(cond), name, info))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else "  -> " + str(info)[:300]))


async def as_role(pg, role, hash="home", reset=False):
    await pg.goto(BASE + "#home")
    await pg.evaluate("""([r,reset])=>{localStorage.setItem('tpe-preview-role',r);localStorage.setItem('tpe-preview-phase','p1');if(reset)localStorage.removeItem('tpe-preview-db-v6');localStorage.setItem('tpe-beta-ok','1')}""", [role, reset])
    await pg.goto("about:blank")
    await pg.goto(BASE + "#" + hash)
    await pg.wait_for_timeout(1200)


async def sheet_text(pg):
    return await pg.evaluate("()=>document.getElementById('sheet').hidden?'':document.getElementById('panel').innerText")


async def close(pg):
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)


async def no_hscroll(pg):
    return await pg.evaluate("()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1")


STORE = "()=>__tpeStore()"


async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        pg = await (await br.new_context(viewport={"width": 1280, "height": 900})).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))

        # ---------- owner ----------
        await as_role(pg, "admin", "coach", reset=True)
        await pg.wait_for_timeout(1500)   # attendance summary from the made-up sheet
        cards = await pg.evaluate("()=>[...document.querySelectorAll('#teachHome .tcards > *')].map(e=>e.tagName+':'+e.querySelector('.tc-h span').textContent)")
        check("owner: all 4 cards are buttons", all(c.startswith("BUTTON:") for c in cards) and len(cards) == 4, cards)
        await pg.screenshot(path=SHOT + "coach-owner-desktop.png")

        await pg.click("#teachHome button.tcard:has-text('Ирцийн хувь')"); await pg.wait_for_timeout(300)
        t = await sheet_text(pg)
        check("card: attendance % by class", "Ирцийн хувь ангиар" in t and await pg.evaluate("()=>document.querySelectorAll('#panel tr.cxrow').length") > 0, t[:300])
        await pg.click("#panel tr.cxrow >> nth=0 >> td >> nth=1"); await pg.wait_for_timeout(600)
        check("class row opens that class's attendance", not await pg.evaluate("()=>document.getElementById('v-patt').hidden") and await pg.evaluate("()=>document.getElementById('sheet').hidden"))
        await pg.evaluate("()=>document.querySelector('nav [data-go=coach]').click()"); await pg.wait_for_timeout(500)

        await pg.click("#teachHome button.tcard:has-text('Анхаарах сурагч')"); await pg.wait_for_timeout(300)
        t = await sheet_text(pg)
        check("card: watch list opens", "Анхаарах сурагч (" in t, t[:200]); await close(pg)

        await pg.click("#teachHome button.tcard:has-text('Өнөөдрийн ирц')"); await pg.wait_for_timeout(400)
        check("card: today's attendance opens the attendance page", not await pg.evaluate("()=>document.getElementById('v-patt').hidden"))
        await pg.evaluate("()=>document.querySelector('nav [data-go=coach]').click()"); await pg.wait_for_timeout(500)

        await pg.click("#teachHome button.tcard:has-text('Бэлтгэлийн тэмдэглэл')"); await pg.wait_for_timeout(300)
        t = await sheet_text(pg)
        check("card: this week's log entries, KPIs and who has not written", "Энэ долоо хоногийн тэмдэглэл" in t and "Бичсэн сурагч" in t and "Энэ долоо хоногт бичээгүй" in t, t[:400])
        await pg.screenshot(path=SHOT + "coach-week-sheet.png")
        await close(pg)

        # student row (click on a plain cell, not the name) opens the record
        await pg.click("#coachOut tr.cxrow:has-text('Бат Тэмүүлэн') >> td >> nth=2"); await pg.wait_for_timeout(300)
        t = await sheet_text(pg)
        U = t.upper()
        check("student row opens the full record", "Бат Тэмүүлэн" in t and "БЭЛТГЭЛИЙН ТЭМДЭГЛЭЛ (" in U and "ҮНЭЛГЭЭ (ФИТНЕС ТЕСТ)" in U and "САЙН САЙХАН БАЙДАЛ" in U, t[:600])
        check("existing teacher note shown, with the teachers-only line", "Гүйлтэнд ахиц сайн" in t and "Сурагч харахгүй" in t)
        await pg.screenshot(path=SHOT + "coach-student-sheet.png", full_page=False)

        # owner adds a note
        await pg.fill("#cx-newnote", "Дараагийн хичээлд сунгалтыг шалгах.")
        await pg.click("#panel button:has-text('Тэмдэглэл нэмэх')"); await pg.wait_for_timeout(500)
        notes = await pg.evaluate(STORE + "")
        n_new = [k for k, v in notes.items() if k.startswith("tnotes/") and v.get("text") == "Дараагийн хичээлд сунгалтыг шалгах."]
        check("owner: note saved for this student", len(n_new) == 1 and notes[n_new[0]]["uid"] == "s1" and notes[n_new[0]]["lid"] == "", n_new)
        check("new note appears in the panel", "Дараагийн хичээлд сунгалтыг шалгах." in await sheet_text(pg))

        # edit the note
        await pg.click("#cxNotes .cxn:has-text('Дараагийн хичээлд') button:has-text('Засах')")
        await pg.fill("#cxNotes .cxn textarea", "Дараагийн хичээлд сунгалт, тэнцвэрийг шалгах.")
        await pg.click("#cxNotes .cxn button:has-text('Хадгалах')"); await pg.wait_for_timeout(500)
        v = await pg.evaluate("(k)=>__tpeStore()[k]", n_new[0])
        check("owner: note edited", v["text"] == "Дараагийн хичээлд сунгалт, тэнцвэрийг шалгах." and v.get("edited"), v)

        # edit name and class
        await pg.click("#panel summary:has-text('Нэр, анги засах')")
        await pg.fill("#cx-name", "Бат-Эрдэнэ Тэмүүлэн"); await pg.click("#panel .cxedit button:has-text('Хадгалах')"); await pg.wait_for_timeout(500)
        check("owner: student name changed", (await pg.evaluate("()=>__tpeStore()['users/s1'].name")) == "Бат-Эрдэнэ Тэмүүлэн")

        # open a log entry from the student's table and correct it
        await pg.click("#panel tr.cxrow >> nth=0 >> td >> nth=2"); await pg.wait_for_timeout(300)
        t = await sheet_text(pg)
        check("entry shows the current name", "Бат-Эрдэнэ Тэмүүлэн" in t)
        check("log row opens the entry with every answer", "ХЭР ХҮНД БАЙСАН" in t.upper() and "БИЕИЙН МЭДРЭМЖ" in t.upper() and "Сурагчийн бодол" in t, t[:300])
        path = await pg.evaluate("()=>{var s=__tpeStore();return Object.keys(s).filter(k=>k.indexOf('users/s1/loading/')===0).sort((a,b)=>s[b].at-s[a].at)[0]}")
        await pg.click("#panel summary:has-text('Хариултыг засах')")
        await pg.fill("#cx-min", "35"); await pg.select_option("#cx-rpe", "7")
        await pg.click("#panel .cxedit button:has-text('Хадгалах')"); await pg.wait_for_timeout(600)
        e = await pg.evaluate("(k)=>__tpeStore()[k]", path)
        check("owner: entry corrected, load recalculated, marked edited", e["min"] == 35 and e["rpe"] == 7 and e["load"] == 245 and e.get("editedAt"), e)
        check("entry panel shows it was corrected", "зассан" in await sheet_text(pg))
        # note on this entry
        await pg.fill("#cx-newnote", "Өвдөгний талаар асуух.")
        await pg.click("#panel button:has-text('Тэмдэглэл нэмэх')"); await pg.wait_for_timeout(500)
        lid = path.split("/")[-1]
        check("owner: note attached to this entry", await pg.evaluate("(l)=>Object.values(__tpeStore()).some(v=>v&&v.lid===l&&v.text==='Өвдөгний талаар асуух.')", lid))
        await pg.click("#panel .cxh"); await pg.wait_for_timeout(300)
        t = await sheet_text(pg)
        check("student record lists the entry note with a link to the entry", "Өвдөгний талаар асуух." in t and "-ний бэлтгэл дээр" in t, t[-500:])

        # delete a note (inline confirm, no browser dialog)
        await pg.click("#cxNotes .cxn:has-text('Өвдөгний талаар') button[aria-label='Тэмдэглэл устгах']")
        await pg.click("#cxNotes .cxn:has-text('Өвдөгний талаар') button:has-text('Тийм')"); await pg.wait_for_timeout(500)
        check("owner: note deleted", not await pg.evaluate("(l)=>Object.values(__tpeStore()).some(v=>v&&v.lid===l)", lid))

        # results button goes to the assessment page for this class
        await pg.click("#panel button:has-text('Үнэлгээ оруулах')"); await pg.wait_for_timeout(500)
        check("results: opens assessment page", not await pg.evaluate("()=>document.getElementById('v-tests').hidden"))

        # recent table row opens the entry
        await pg.evaluate("()=>document.querySelector('nav [data-go=coach]').click()"); await pg.wait_for_timeout(500)
        await pg.click("#coachOut .box:has-text('Сүүлийн бэлтгэлийн тэмдэглэлүүд') tr.cxrow >> nth=0 >> td >> nth=3"); await pg.wait_for_timeout(300)
        check("recent log row opens the entry", "ХЭР ХҮНД БАЙСАН" in (await sheet_text(pg)).upper())
        await close(pg)
        # keyboard: Enter on a focused row
        await pg.focus("#coachOut tr.cxrow >> nth=0"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(300)
        check("keyboard: Enter on a row opens it", await pg.evaluate("()=>!document.getElementById('sheet').hidden"))
        await close(pg)

        # phone
        await pg.set_viewport_size({"width": 390, "height": 844}); await pg.wait_for_timeout(300)
        check("phone: dashboard has no sideways scroll", await no_hscroll(pg))
        await pg.screenshot(path=SHOT + "coach-owner-phone.png", full_page=False)
        await pg.click("#coachOut tr.cxrow:has-text('Бат-Эрдэнэ') >> td >> nth=0"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=SHOT + "coach-student-phone.png", full_page=False)
        await close(pg)
        await pg.set_viewport_size({"width": 1280, "height": 900})

        # ---------- another teacher: sees, cannot change ----------
        await as_role(pg, "teacher", "coach")
        kinds = await pg.evaluate("()=>[...document.querySelectorAll('#teachHome .tcards > *')].map(e=>e.tagName)")
        check("teacher: attendance cards not clickable (owner only), log card is", kinds == ["DIV", "DIV", "DIV", "BUTTON"], kinds)
        await pg.click("#coachOut tr.cxrow:has-text('Бат-Эрдэнэ') >> td >> nth=2"); await pg.wait_for_timeout(300)
        t = await sheet_text(pg)
        check("teacher: reads notes", "Гүйлтэнд ахиц сайн" in t)
        check("teacher: no edit, delete or note form", await pg.evaluate("()=>!document.querySelector('#panel .cxedit,#cx-newnote,#panel button[aria-label=\"Тэмдэглэл устгах\"]')"))
        await close(pg)

        # ---------- student: never sees notes; sees the correction mark ----------
        await as_role(pg, "student", "log")
        body = await pg.evaluate("()=>document.body.innerText")
        check("student: no teacher notes anywhere", "Гүйлтэнд ахиц сайн" not in body and "сунгалт, тэнцвэр" not in body)
        check("student: corrected entry marked ✎ in own table", await pg.evaluate("()=>[...document.querySelectorAll('#logOut table td')].some(td=>td.title==='Багш зассан'&&/✎/.test(td.textContent))"))

        check("no page errors", not errors, errors[:3])
        await br.close()
    bad = [r for r in results if not r[0]]
    print("\n%d/%d passed" % (len(results) - len(bad), len(results)))
    sys.exit(1 if bad else 0)

asyncio.run(main())
