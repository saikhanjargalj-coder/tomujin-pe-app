"""Browser checks for "Миний Strava" on the test-data preview (never the real site, never real Strava):
a student connects, sees only their own made-up activities, puts one into the training log with one tap;
the teacher sees only the log entry; the owner sets the club and coach boxes; pasted codes are checked.

    python3 tools/build.py && python3 tools/preview/build_preview.py /tmp/pv/index.html
    (cd /tmp/pv && python3 -m http.server 8791 &) ; python3 tests/ui/strava.py http://127.0.0.1:8791/ /tmp/pv/shots
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


async def as_role(pg, role, hash="home", reset=False, query=""):
    await pg.goto(BASE + "#home")
    await pg.evaluate("""([r,reset])=>{localStorage.setItem('tpe-preview-role',r);localStorage.setItem('tpe-preview-phase','p1');if(reset)localStorage.removeItem('tpe-preview-db-v6');localStorage.setItem('tpe-beta-ok','1')}""", [role, reset])
    await pg.goto("about:blank")
    await pg.goto(BASE + query + "#" + hash)
    await pg.wait_for_timeout(900)


async def text(pg, sel):
    return await pg.evaluate("(s)=>{var e=document.querySelector(s);return e?e.innerText:''}", sel)


async def no_hscroll(pg):
    return await pg.evaluate("()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1")


async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctx = await br.new_context(viewport={"width": 1280, "height": 900})
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))

        # guest: members only
        await as_role(pg, "guest", "strava", reset=True)
        check("guest: Strava page is members-only", await pg.evaluate("()=>document.getElementById('v-strava').hidden") and await pg.evaluate("()=>!document.getElementById('sheet').hidden"))

        # student, not connected
        await as_role(pg, "student", "strava", reset=True)
        out = await text(pg, "#stravaOut")
        check("student: menu has Миний Strava", await pg.evaluate("()=>{var a=document.querySelector('nav [data-go=strava]');return !!a&&!a.hidden}"))
        check("student: connect button and privacy notes", "Strava-аар холбох" in out and "Зөвхөн чи өөрөө харна" in out and "13-аас дээш" in out, out[:400])
        check("student: club box from settings", "Клубт нэгдэх" in out)
        check("no coach box until the owner sets one", "Жак багшийн бэлтгэл" not in out)
        await pg.screenshot(path=SHOT + "strava-connect-desktop.png", full_page=False)

        # connect
        await pg.click("text=Strava-аар холбох")
        await pg.wait_for_timeout(1300)
        out = await text(pg, "#stravaOut")
        check("connected: success message and list", "Strava холбогдлоо" in out and "Өглөөний гүйлт" in out and await pg.evaluate("()=>document.querySelectorAll('#stravaOut .stvact').length") == 10, out[:500])
        check("connected: Mongolian sport names, minutes, pace", "ГҮЙЛТ" in out.upper() and "31 мин" in out and "/км" in out, out[:600])
        check("connected: View on Strava links point to strava.com", await pg.evaluate("()=>[...document.querySelectorAll('#stravaOut a.stvlink')].every(a=>/^https:\\/\\/www\\.strava\\.com\\/activities\\/\\d+$/.test(a.href)&&a.target==='_blank')"))
        check("connected: no map or location shown", await pg.evaluate("()=>!document.querySelector('#stravaOut img,#stravaOut canvas,#stravaOut svg path')"))
        await pg.screenshot(path=SHOT + "strava-list-desktop.png", full_page=True)

        # one tap into the training log
        await pg.click("#stravaOut .stvact >> nth=0 >> text=Тэмдэглэлд оруулах")
        await pg.wait_for_timeout(500)
        check("log opens with the Strava banner", not await pg.evaluate("()=>document.getElementById('v-log').hidden") and "Strava: Өглөөний гүйлт" in await text(pg, "#lf-stvfrom"))
        check("minutes filled from Strava, the rest left to the student", await pg.input_value("#lf-min") == "31" and await pg.input_value("#lf-rpe") == "" and await pg.input_value("#lf-feel") == "")
        check("no separate link field while an activity is picked", await pg.evaluate("()=>!document.getElementById('lf-stv')"))
        await pg.select_option("#lf-rpe", "6"); await pg.select_option("#lf-feel", "4"); await pg.select_option("#lf-sore", "2")
        await pg.click("#lf-send"); await pg.wait_for_timeout(700)
        last = await pg.evaluate("()=>{var s=__tpeStore();return Object.keys(s).filter(k=>k.indexOf('users/s1/loading/')===0).map(k=>s[k]).sort((a,b)=>b.at-a.at)[0]}")
        check("saved with the activity link and student's own answers", last.get("strava") == "https://www.strava.com/activities/17000000000" and last["min"] == 31 and last["rpe"] == 6 and last["load"] == 186, last)
        check("banner cleared after saving", await pg.evaluate("()=>!document.getElementById('lf-stvfrom')") and "Хадгалагдлаа" in await text(pg, "#lf-st"))
        check("own log table has a Strava link", await pg.evaluate("()=>[...document.querySelectorAll('#logOut table a.stvlink')].some(a=>a.href==='https://www.strava.com/activities/17000000000')"))
        lb = await text(pg, "#logOut .stvbox")
        check("log picker: logged activity gone, others listed", "Өглөөний гүйлт" not in lb and "Заалны хүч" in lb, lb[:300])
        await pg.screenshot(path=SHOT + "log-with-strava-desktop.png", full_page=True)

        # pasted link: wrong one refused, right one stored in one fixed form
        await pg.fill("#lf-stv", "https://evil.example/activities/5")
        await pg.select_option("#lf-rpe", "5"); await pg.fill("#lf-min", "40"); await pg.select_option("#lf-feel", "3"); await pg.select_option("#lf-sore", "1")
        await pg.click("#lf-send"); await pg.wait_for_timeout(300)
        check("bad Strava link refused", "Strava холбоос буруу" in await text(pg, "#lf-st") and await pg.get_attribute("#lf-stv", "aria-invalid") == "true")
        await pg.fill("#lf-stv", "https://www.strava.com/activities/12345678901?share_sig=abc&utm_medium=social")
        await pg.click("#lf-send"); await pg.wait_for_timeout(700)
        last = await pg.evaluate("()=>{var s=__tpeStore();return Object.keys(s).filter(k=>k.indexOf('users/s1/loading/')===0).map(k=>s[k]).sort((a,b)=>b.at-a.at)[0]}")
        check("pasted link cleaned to the plain activity address", last.get("strava") == "https://www.strava.com/activities/12345678901", last)

        # Strava page shows the tick now
        await pg.evaluate("()=>document.querySelector('nav [data-go=strava]').click()"); await pg.wait_for_timeout(300)
        check("Strava page: logged activity ticked", "✓ Тэмдэглэлд орсон" in await text(pg, "#stravaOut .stvact"))

        # Strava busy
        await pg.evaluate("()=>{window.__tpeStravaFail='busy'}")
        await pg.click("text=↻ Шинэчлэх"); await pg.wait_for_timeout(400)
        check("busy error shown", "завгүй" in await text(pg, "#stravaOut"))

        # phone width
        await pg.set_viewport_size({"width": 390, "height": 844})
        await pg.click("text=↻ Шинэчлэх"); await pg.wait_for_timeout(700)
        check("phone: no sideways scrolling on Strava page", await no_hscroll(pg))
        await pg.screenshot(path=SHOT + "strava-list-phone.png", full_page=True)
        await pg.evaluate("()=>document.querySelector('nav [data-go=log]').click()"); await pg.wait_for_timeout(500)
        check("phone: no sideways scrolling on log page", await no_hscroll(pg))
        await pg.screenshot(path=SHOT + "log-phone.png", full_page=True)
        await pg.set_viewport_size({"width": 1280, "height": 900})

        # teacher sees only the log entry, never the student's Strava list
        await as_role(pg, "teacher", "coach")
        coach = await pg.evaluate("()=>document.getElementById('coachOut').innerHTML")
        check("teacher: log entry has the student's Strava link", "https://www.strava.com/activities/17000000000" in coach)
        await pg.evaluate("()=>document.querySelector('nav [data-go=strava]').click()"); await pg.wait_for_timeout(500)
        out = await text(pg, "#stravaOut")
        check("teacher: Strava page shows their own connect button, not the student's activities", "Strava-аар холбох" in out and "Заалны хүч" not in out, out[:300])

        # student disconnects
        await as_role(pg, "student", "strava")
        await pg.wait_for_timeout(700)
        await pg.click("#stravaOut button:has-text('Салгах')")
        await pg.click("text=Тийм, салгах"); await pg.wait_for_timeout(700)
        out = await text(pg, "#stravaOut")
        check("disconnected: back to connect, message says nothing kept", "Strava-аар холбох" in out and "үлдээгүй" in out, out[:300])
        check("disconnected: link flag removed", await pg.evaluate("()=>!__tpeStore()['users/s1/strava/link']"))
        await pg.evaluate("()=>document.querySelector('nav [data-go=log]').click()"); await pg.wait_for_timeout(300)
        check("disconnected: log page has no Strava picker", not await pg.evaluate("()=>!!document.querySelector('#logOut .stvbox')"))

        # coming back from Strava's page
        await as_role(pg, "student", "strava", query="?strava=scope")
        out = await text(pg, "#stravaOut")
        check("return message shown and address cleaned", "зөвшөөрлийг чагталгүй" in out and await pg.evaluate("()=>location.search===''&&location.hash==='#strava'"), out[:300])

        # owner: club and coach settings, only Strava codes accepted
        await as_role(pg, "admin", "strava")
        await pg.evaluate("()=>{[...document.querySelectorAll('#editBar button')].find(b=>/Засах горим/.test(b.textContent)).click()}"); await pg.wait_for_timeout(300)
        await pg.click("text=✎ Клуб ба багшийн Strava-г засах"); await pg.wait_for_timeout(300)
        await pg.fill("#sv-curl", "https://evil.example/clubs/1")
        await pg.fill("#sv-kprof", "<iframe src='https://evil.example/x'></iframe>")
        await pg.click("#sheet button:has-text('Хадгалах')"); await pg.wait_for_timeout(300)
        st = await text(pg, "#sheet .status")
        check("owner: non-Strava addresses refused", "клубын холбоос" in st and "профайлын embed" in st, st)
        await pg.fill("#sv-curl", "https://www.strava.com/clubs/1234567")
        await pg.fill("#sv-kprof", "<iframe height='454' width='300' frameborder='0' allowtransparency='true' scrolling='no' src='https://www.strava.com/athletes/987654/latest-rides/abcdef0123'></iframe>")
        await pg.fill("#sv-kacts", "https://www.strava.com/activities/11122233344\n<div class=\"strava-embed-placeholder\" data-embed-type=\"activity\" data-embed-id=\"55566677788\" data-style=\"standard\" data-from-embed=\"false\"></div><script src=\"https://strava-embeds.com/embed.js\"></script>")
        await pg.click("#sheet button:has-text('Хадгалах')"); await pg.wait_for_timeout(500)
        await pg.evaluate("()=>{var b=document.querySelector('#sheet .sheetx,#sheet [aria-label=Хаах]');if(b)b.click();else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))}"); await pg.wait_for_timeout(300)
        out = await text(pg, "#stravaOut")
        check("owner: club join link saved", await pg.evaluate("()=>[...document.querySelectorAll('#stravaOut a.stvbtn')].some(a=>a.href==='https://www.strava.com/clubs/1234567')"))
        check("owner: coach box with profile card and 2 activity players", "Жак багшийн бэлтгэл" in out
              and await pg.evaluate("()=>{var f=document.querySelector('#stravaOut iframe.stvframe');return !!f&&f.src==='https://www.strava.com/athletes/987654/latest-rides/abcdef0123'&&f.getAttribute('sandbox').indexOf('allow-top-navigation')<0}")
              and await pg.evaluate("()=>[...document.querySelectorAll('#stravaOut .strava-embed-placeholder')].map(e=>e.dataset.embedId).join()") == "11122233344,55566677788")
        check("owner: Strava's own embed script requested once", await pg.evaluate("()=>document.querySelectorAll('script#stvjs').length===1&&document.getElementById('stvjs').src==='https://strava-embeds.com/embed.js'"))
        check("owner: pasted <script> never put into the page", await pg.evaluate("()=>document.querySelectorAll('script[src*=\"strava-embeds\"]').length===1"))
        await pg.screenshot(path=SHOT + "strava-admin-desktop.png", full_page=True)

        # switch off: page says "coming soon"
        await pg.evaluate("()=>{TPE.strava=null;TPE_CONFIG.STRAVA_ON=false;document.querySelector('nav [data-go=log]').click();document.querySelector('nav [data-go=strava]').click()}")
        check("switched off: coming-soon note", "удахгүй нээгдэнэ" in await text(pg, "#stravaOut"))

        check("no page errors", not errors, errors[:3])
        await br.close()
    bad = [r for r in results if not r[0]]
    print("\n%d/%d passed" % (len(results) - len(bad), len(results)))
    sys.exit(1 if bad else 0)

asyncio.run(main())
