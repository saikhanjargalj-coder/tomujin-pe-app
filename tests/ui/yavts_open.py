"""Browser checks that every part of a student's term grade (Явц) opens, on the test-data preview (never the real site):
the five part cards, the total, the two tags, the attendance days, the class list behind each part,
teacher-only notes on the grade, the way back, and that students still see only their own plain card.

    python3 tools/build.py && python3 tools/preview/build_preview.py /tmp/pv/index.html
    (cd /tmp/pv && python3 -m http.server 8791 &) ; python3 tests/ui/yavts_open.py http://127.0.0.1:8791/ /tmp/pv/shots
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


async def panel(pg):
    return await pg.evaluate("()=>document.getElementById('sheet').hidden?'':document.getElementById('panel').innerText")


async def title(pg):
    return await pg.evaluate("()=>{const t=document.getElementById('sheetTitle');return t?t.innerText:''}")


async def poke(pg):
    """change one grade in the (made-up) database so every open view gets a live update"""
    await pg.evaluate("()=>{const s=__tpeStore();const k=Object.keys(s).filter(k=>/^grades\\//.test(k))[0];return TPE.db.batch([{op:'merge',path:k,data:{at:Date.now()}}])}")


async def open_11b(pg, row=1):
    await pg.click("#testsOut .clscard:has(b:text-is('11B'))"); await pg.wait_for_timeout(300)
    await pg.click(f"#testsOut .clsgrid ~ .box table.yvtbl tbody tr:nth-child({row}) button.exlink"); await pg.wait_for_timeout(300)


async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={"width": 1280, "height": 900})
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))

        # ---------- owner: copy grades, open a student ----------
        await as_role(pg, "admin", "tests", reset=True)
        await pg.click("#testsOut button:has-text('Sheet-ээс шинэчлэх')"); await pg.wait_for_timeout(2500)
        await open_11b(pg)
        name = await title(pg)
        n = await pg.evaluate("()=>({parts:document.querySelectorAll('#panel button.yvpart.yvbtn').length,big:!!document.querySelector('#panel button.yvbig'),tags:document.querySelectorAll('#panel .chips button.tag').length,mail:!!document.querySelector('#panel a[href^=\"mailto:\"]')})")
        check("detail: all five part cards, the total and both tags are buttons", n["parts"] == 5 and n["big"] and n["tags"] == 2, n)
        check("detail: the student's email is a link", n["mail"], n)
        await pg.screenshot(path=SHOT + "open-detail.png")

        # a level part
        await pg.click("#panel button.yvpart[data-part='a']"); await pg.wait_for_timeout(300)
        t = await panel(pg)
        rows = await pg.evaluate("()=>document.querySelectorAll('#panel table.yvmates tbody tr').length")
        me = await pg.evaluate("()=>document.querySelectorAll('#panel table.yvmates tbody tr.me').length")
        check("Идэвх opens: scale 1–5, the whole class, this student marked", await title(pg) == "Идэвх, оролцоо" and "1–5 түвшин" in t and rows == 8 and me == 1, [await title(pg), rows, me, t[:300]])
        check("part view: way back to the student and the owner's fix box", ("‹ " + name) in t and "Засах" in t and "Sheet-ээс шинэчлэх" in t, t[:400])
        lv = await pg.evaluate("()=>[...document.querySelectorAll('#panel .yvlv')].map(b=>[+b.dataset.lv,+b.querySelector('small.num').textContent])")
        check("scale shows five levels with counts adding up to the class", len(lv) == 5 and sum(c for _, c in lv) == 8, lv)
        await pg.screenshot(path=SHOT + "open-part.png")
        pick = [l for l, c in lv if c > 0][0]
        await pg.click(f"#panel .yvlv[data-lv='{pick}']"); await pg.wait_for_timeout(250)
        got = await pg.evaluate("()=>[...document.querySelectorAll('#panel table.yvmates tbody tr')].map(r=>r.cells[1].innerText)")
        cnt = dict(lv)[pick]
        check("tapping a level shows only the students at that level", len(got) == cnt and all(g.startswith(str(pick) + "/") for g in got), [pick, got])
        await pg.click(f"#panel .yvlv[data-lv='{pick}']"); await pg.wait_for_timeout(250)
        check("tapping it again shows the whole class", await pg.evaluate("()=>document.querySelectorAll('#panel table.yvmates tbody tr').length") == 8)

        # switch part with the chips, then step into a classmate
        await pg.click("#panel .chips[role=group] button:has-text('Хэрэглээ, дадал')"); await pg.wait_for_timeout(250)
        check("chips switch to another part", await title(pg) == "Хэрэглээ, дадал")
        other = await pg.evaluate("()=>{const r=[...document.querySelectorAll('#panel table.yvmates tbody tr')].filter(r=>!r.classList.contains('me'))[0];return r?r.cells[0].innerText:''}")
        await pg.click(f"#panel table.yvmates tbody tr:not(.me) button.exlink >> nth=0"); await pg.wait_for_timeout(250)
        t = await panel(pg)
        check("a classmate's name opens the same part for them", await title(pg) == "Хэрэглээ, дадал" and other in t and ("‹ " + other) in t, [other, t[:200]])
        await pg.click("#panel .yvback button"); await pg.wait_for_timeout(250)
        check("back goes to that student's grade", await title(pg) == other and await pg.evaluate("()=>document.querySelectorAll('#panel button.yvpart.yvbtn').length") == 5, await title(pg))

        # the total
        await pg.click("#panel button.yvbig"); await pg.wait_for_timeout(250)
        tot = await pg.evaluate("()=>({rows:document.querySelectorAll('#panel table.yvtot tbody tr').length,sum:document.querySelector('#panel table.yvtot tfoot td.yvy').innerText,big:document.querySelector('#panel .yvbig b').innerText})")
        check("ЯВЦ opens how the points add up (5 rows, total matches)", tot["rows"] == 5 and abs(float(tot["sum"]) - float(tot["big"])) <= 1, tot)
        await pg.click("#panel table.yvtot tbody tr:nth-child(4)"); await pg.wait_for_timeout(250)
        check("a row of the total opens that part", await title(pg) == "Мэдлэг", await title(pg))

        # attendance: counts and every lesson from the school sheet
        await pg.click("#panel .chips[role=group] button:has-text('Ирц')"); await pg.wait_for_timeout(1500)
        t = await panel(pg)
        days = await pg.evaluate("()=>document.querySelectorAll('#panel .yvday').length")
        check("Ирц opens: the five codes and each lesson from the sheet", await title(pg) == "Ирц" and "И Ирсэн" in t and "Т Тасалсан" in t and "Хичээл бүрээр" in t and days > 3, [days, t[:400]])
        check("attendance %: the formula is shown when it matches the numbers", "(И + Х) ÷ (И + Х + Т)" in t, t[:500])
        await pg.screenshot(path=SHOT + "open-att.png")
        d = await pg.evaluate("()=>document.querySelector('#panel .yvday').dataset.date")
        await pg.click("#panel .yvday >> nth=0"); await pg.wait_for_timeout(1200)
        st = await pg.evaluate("()=>({sheet:document.getElementById('sheet').hidden,patt:!document.getElementById('v-patt').hidden,date:(document.getElementById('pa-date')||{}).value,title:(document.getElementById('pa-title')||{}).innerText})")
        check("a lesson day opens that day's class attendance", st["sheet"] and st["patt"] and st["date"] == d and st["title"] and st["title"].startswith("11B"), [d, st])

        # ---------- the tags ----------
        await as_role(pg, "admin", "tests")
        await open_11b(pg)
        await pg.click("#panel .chips button.tag >> nth=0"); await pg.wait_for_timeout(250)
        t = await panel(pg)
        check("'Зөвхөн багшид' explains and offers to open the class", "11B ангид нээх" in t and "ангийн жагсаалт" in t, t[:400])
        await pg.click("#panel button:has-text('11B ангид нээх')"); await pg.wait_for_timeout(900)
        pub = await pg.evaluate("()=>{const s=__tpeStore();return Object.keys(s).filter(k=>/^grades\\//.test(k)&&s[k].pub).map(k=>s[k].cls)}")
        t = await panel(pg)
        check("opening from the panel opens exactly that class, panel stays and updates", len(pub) == 8 and set(pub) == {"11B"} and "Сурагчид харж байна" in t, [pub, t[:300]])
        await pg.click("#panel button:has-text('11B ангид хаах')"); await pg.wait_for_timeout(900)
        await pg.click("#panel .chips button.tag >> nth=1"); await pg.wait_for_timeout(250)
        t = await panel(pg)
        check("the account tag explains sign-up", ("бүртгэлтэй" in t) or ("бүртгүүлээгүй" in t), t[:400])
        await pg.click("#panel button:has-text('ангийн жагсаалт')") if await pg.query_selector("#panel button:has-text('ангийн жагсаалт')") else None
        await pg.click("#panel .chips button.tag >> nth=0"); await pg.wait_for_timeout(250)
        await pg.click("#panel button:has-text('ангийн жагсаалт')"); await pg.wait_for_timeout(500)
        check("'ангийн жагсаалт' closes the panel on the class list", await pg.evaluate("()=>document.getElementById('sheet').hidden&&document.querySelector('#testsOut .clscard[aria-pressed=true] b').textContent==='11B'"))

        # ---------- teacher-only notes on the grade ----------
        await open_11b(pg)
        sid = await pg.evaluate("()=>document.querySelector('#panel .yvtop p').innerText.match(/ID (\\d+)/)[1]")
        await pg.fill("#cx-newnote", "Хэрэглээний дасгалаа гэртээ хийж эхэлсэн.")
        await pg.click("#panel button:has-text('Тэмдэглэл нэмэх')"); await pg.wait_for_timeout(700)
        nt = await pg.evaluate("(sid)=>{const s=__tpeStore();return Object.keys(s).filter(k=>/^tnotes\\//.test(k)).map(k=>s[k]).filter(n=>n.text.indexOf('гэртээ')>=0).map(n=>n.uid)}", sid)
        t = await panel(pg)
        check("owner writes a note on the grade (kept on the student's ID if no account)", len(nt) == 1 and (nt[0] == "sid:" + sid or not nt[0].startswith("sid:")) and "гэртээ" in t, [nt, sid])
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
        badge = await pg.evaluate("(sid)=>[...document.querySelectorAll('#testsOut .clsgrid ~ .box table.yvtbl tbody tr')].filter(r=>r.cells[0].innerText===sid).map(r=>r.innerText.indexOf('💬')>=0)[0]", sid)
        check("the class table shows 💬 for that student", badge, badge)

        # live update keeps the panel where it was (part view) and keeps a note being typed
        await open_11b(pg, 2)
        await pg.click("#panel button.yvpart[data-part='k']"); await pg.wait_for_timeout(250)
        await pg.click("#panel .yvfix button:has-text('Sheet-ээс шинэчлэх')"); await pg.wait_for_timeout(2600)
        t = await panel(pg)
        check("re-copying from the sheet redraws the same part view", await title(pg) == "Мэдлэг" and "шинэчлэгдлээ" in t, [await title(pg), t[:300]])
        await pg.click("#panel .yvback button"); await pg.wait_for_timeout(250)
        await pg.fill("#cx-newnote", "бичиж байгаа тэмдэглэл")
        await poke(pg); await pg.wait_for_timeout(300)
        check("a redraw keeps a note being typed", await pg.evaluate("()=>document.getElementById('cx-newnote').value") == "бичиж байгаа тэмдэглэл")

        # another panel is never replaced by a grade redraw
        await pg.keyboard.press("Escape")
        await pg.goto(BASE + "#library"); await pg.wait_for_timeout(800)
        await pg.click("#v-library button.ex >> nth=0"); await pg.wait_for_timeout(300)
        before = await title(pg)
        await poke(pg); await pg.wait_for_timeout(300)
        check("an exercise panel is not replaced when grades update", await title(pg) == before and await pg.evaluate("()=>!document.querySelector('#panel .yvparts')"), [before, await title(pg)])
        await pg.keyboard.press("Escape")

        # ---------- teacher dashboard student record ----------
        await pg.goto(BASE + "#coach"); await pg.wait_for_timeout(1500)
        await pg.click("#coachOut tr.cxrow:has-text('Бат Тэмүүлэн') button:has-text('Нээх')"); await pg.wait_for_timeout(400)
        n = await pg.evaluate("()=>document.querySelectorAll('#panel button.yvpart.yvbtn').length")
        check("dashboard: the student record's grade parts open too", n == 5, n)
        await pg.click("#panel button:has-text('Явцын дэлгэрэнгүй')"); await pg.wait_for_timeout(300)
        t = await panel(pg)
        check("dashboard: full grade opens with a way back to the record", "Бат Тэмүүлэн" in t.split("\n")[1] or "‹ Бат Тэмүүлэн" in t, t[:200])
        await pg.click("#panel .yvback button"); await pg.wait_for_timeout(300)
        check("back returns to the student record", "Бэлтгэлийн тэмдэглэл" in await panel(pg))
        await pg.keyboard.press("Escape")

        # ---------- phone ----------
        await pg.set_viewport_size({"width": 390, "height": 844})
        await pg.goto(BASE + "#tests"); await pg.wait_for_timeout(1000)
        await open_11b(pg)
        await pg.click("#panel button.yvpart[data-part='u']"); await pg.wait_for_timeout(300)
        fits = await pg.evaluate("()=>{const p=document.getElementById('panel');return p.scrollWidth<=p.clientWidth+1}")
        check("part view fits a phone (no sideways scroll)", fits)
        await pg.screenshot(path=SHOT + "open-part-phone.png")
        await pg.click("#panel .chips[role=group] button:has-text('Ирц')"); await pg.wait_for_timeout(600)
        check("attendance view fits a phone", await pg.evaluate("()=>{const p=document.getElementById('panel');return p.scrollWidth<=p.clientWidth+1}"))
        await pg.screenshot(path=SHOT + "open-att-phone.png")
        await pg.set_viewport_size({"width": 1280, "height": 900})

        # ---------- teacher (not the owner) ----------
        await as_role(pg, "teacher", "tests")
        await open_11b(pg)
        await pg.click("#panel button.yvpart[data-part='r']"); await pg.wait_for_timeout(300)
        t = await panel(pg)
        check("teacher: parts open, no fix box", await title(pg) == "Бэлэн байдал" and "Sheet-ээс шинэчлэх" not in t, t[:300])
        await pg.click("#panel .chips[role=group] button:has-text('Ирц')"); await pg.wait_for_timeout(300)
        t = await panel(pg)
        check("teacher: attendance shows counts, not the owner's sheet", "И Ирсэн" in t and "«Хичээлийн ирц»" in t and not await pg.evaluate("()=>document.querySelector('#panel .yvday')"), t[:300])
        await pg.click("#panel .yvback button"); await pg.wait_for_timeout(250)
        check("teacher: reads notes but cannot write them", "Сайт дээрх тэмдэглэл" in await panel(pg) and not await pg.evaluate("()=>document.getElementById('cx-newnote')"))
        await pg.click("#panel .chips button.tag >> nth=0"); await pg.wait_for_timeout(250)
        check("teacher: no open/close buttons", "ангид нээх" not in await panel(pg))

        # ---------- student: own plain card, nothing else opens ----------
        await as_role(pg, "admin", "tests")
        await pg.click("#testsOut .clscard:has(b:text-is('11B'))"); await pg.wait_for_timeout(300)
        await pg.click("#testsOut button:has-text('Сурагчдад нээх')"); await pg.wait_for_timeout(800)
        await as_role(pg, "student", "tests")
        n = await pg.evaluate("()=>({card:document.querySelectorAll('#testsOut .yvcard').length,btn:document.querySelectorAll('#testsOut button.yvpart, #testsOut button.yvbig').length,txt:document.getElementById('testsOut').innerText})")
        check("student: own card stays plain (no class lists, no notes)", n["card"] == 1 and n["btn"] == 0 and "гэртээ" not in n["txt"] and "Сайт дээрх тэмдэглэл" not in n["txt"], n)

        check("no page errors", not errors, errors)
        await br.close()
    bad = [r for r in results if not r[0]]
    print(f"\n{len(results) - len(bad)}/{len(results)} passed")
    sys.exit(1 if bad else 0)

asyncio.run(main())
