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
    await pg.evaluate("""([r,p,reset])=>{localStorage.setItem('tpe-preview-role',r);localStorage.setItem('tpe-preview-phase',p);if(reset)localStorage.removeItem('tpe-preview-db-v4');localStorage.setItem('tpe-beta-ok','1')}""", [role, phase, reset])
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


async def store_get(pg, path):
    return await pg.evaluate("(p)=>__tpeStore()[p]||null", path)


async def open_fb(pg):
    await pg.click("#fbFab"); await pg.wait_for_timeout(250)


async def feedback(pg):
    """5.2 feedback: draft kept, honest reply wording, sender's own list, owner's private notes, skip with a reason."""
    await as_role(pg, "guest", hash="home", reset=True)
    await pg.evaluate("()=>localStorage.removeItem('tpe-fb-draft')")
    await open_fb(pg)
    help_ = await pg.text_content("#sheet")
    check("5.2 guest is told the site sends no email or SMS", "хариу имэйл, мессеж илгээдэггүй" in help_ and "зөвхөн Жак багш харна" in help_, help_[:400])
    await pg.locator("#sheet .fbtype", has_text="Санаа").click()
    await pg.fill("#fb-text", "Хуваарийг нүүрэнд гаргаарай")
    await pg.select_option("#fb-who", "parent")
    await pg.fill("#fb-contact", "9911 2233")
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
    draft = await pg.evaluate("()=>localStorage.getItem('tpe-fb-draft')")
    check("5.2 draft kept on this device without the phone number", draft and "Хуваарийг" in draft and "9911" not in draft, draft)
    await pg.reload(); await pg.wait_for_timeout(800)
    await open_fb(pg)
    check("5.2 reopened form has the text, type and who back", await pg.input_value("#fb-text") == "Хуваарийг нүүрэнд гаргаарай"
          and await pg.get_attribute("#sheet .fbtype:has-text('Санаа')", "aria-pressed") == "true" and await pg.input_value("#fb-who") == "parent")
    await pg.screenshot(path=SHOT + "b3_feedback_draft.png")
    n0 = await pg.evaluate("()=>Object.keys(__tpeStore()).filter(k=>k.indexOf('feedback/')===0).length")
    await pg.fill("#fb-contact", "9911 2233")
    await pg.click("#sheet button:has-text('Илгээх')"); await pg.wait_for_timeout(500)
    th = await pg.text_content("#sheet")
    check("5.2 guest thanks: honest about replies, mentions the phone left", "автоматаар илгээдэггүй" in th and "өөрөө холбогдоно" in th, th[:400])
    check("5.2 one feedback saved", await pg.evaluate("()=>Object.keys(__tpeStore()).filter(k=>k.indexOf('feedback/')===0).length") == n0 + 1)
    check("5.2 draft cleared after sending", await pg.evaluate("()=>localStorage.getItem('tpe-fb-draft')") is None)

    # the sender sees status and reply of their own feedback
    await as_role(pg, "student", hash="home", reset=True)
    ban = await pg.text_content("#fbDone")
    check("5.2 student sees a notice for a reply to a skipped idea", await pg.is_visible("#fbDone") and "хариу бичлээ" in ban and "нойр, ачааллын" in ban, ban)
    await pg.screenshot(path=SHOT + "b4_feedback_notice.png")
    await pg.click("#fbDone button:has-text('Миний саналууд')"); await pg.wait_for_timeout(300)
    mine = await pg.text_content("#sheet")
    check("5.2 'Миний саналууд' lists own feedback with status", "Хийхгүй" in mine and "Хийж байна" in mine and "ажиллаж байна" in mine, mine[:500])
    check("5.2 own list shows the teacher's reason", "нойр, ачааллын бүртгэлийг" in mine)
    check("5.2 own list never shows the owner's private notes", "Нүүрний шинэчлэлд" not in mine and "Дотоод" not in mine)
    check("5.2 only own feedback is listed", "Нүүр хуудсанд дугуйлангийн" not in mine and "тэмдэглэлийн товч хэт жижиг" not in mine)
    await pg.screenshot(path=SHOT + "b5_my_feedback.png")
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
    check("5.2 reading the reply clears the notice", not await pg.is_visible("#fbDone") and (await store_get(pg, "feedback/f4"))["seen"] is True)

    # owner: manage chip name, skip needs a reason, private note, delete removes the note too
    await as_role(pg, "admin", hash="feedback", reset=True)
    chip = await pg.locator("text=Санал удирдах").count()
    check("5.2 owner's chip reads 'Санал удирдах' (FAB stays 'Санал өгөх')", chip >= 1 and "Санал өгөх" in (await pg.text_content("#fbFab")))
    card = pg.locator("#fbOut article", has_text="тэмдэглэлийн товч хэт жижиг")
    await card.locator("button:has-text('Хийхгүй')").click(); await pg.wait_for_timeout(250)
    await pg.click("#sheet button:has-text('Хадгалах')"); await pg.wait_for_timeout(200)
    check("5.2 'Хийхгүй' asks for a short reason", "Шалтгаанаа" in await pg.text_content("#sheet .status") and (await store_get(pg, "feedback/f1"))["status"] == "new")
    await pg.fill("#fs-why", "Товчийг томруулсан хувилбар 11-р сард гарна.")
    await pg.click("#sheet button:has-text('Хадгалах')"); await pg.wait_for_timeout(400)
    f1 = await store_get(pg, "feedback/f1")
    check("5.2 skip saved with the reason as the sender's reply", f1["status"] == "skip" and "11-р сард" in f1["reply"] and f1["seen"] is False, f1)
    await pg.locator("text=Бүгд (").first.click(); await pg.wait_for_timeout(200)
    c2 = pg.locator("#fbOut article", has_text="Нүүр хуудсанд дугуйлангийн")
    summ = await c2.locator("details.fbnote summary").text_content()
    check("5.2 private note shown to the owner", "Нүүрний шинэчлэлд" in summ, summ)
    await c2.locator("details.fbnote summary").click()
    await c2.locator("textarea").fill("Ээж нь 11/3-нд утсаар ярьсан.")
    await c2.locator("details.fbnote button:has-text('Хадгалах')").click(); await pg.wait_for_timeout(400)
    check("5.2 private note saved apart from the feedback", (await store_get(pg, "fbnotes/f2"))["text"].startswith("Ээж нь") and "note" not in (await store_get(pg, "feedback/f2")))
    await pg.screenshot(path=SHOT + "b6_feedback_owner.png")
    await c2.locator("button[aria-label='Устгах']").click(); await pg.wait_for_timeout(400)
    check("5.2 deleting feedback deletes its private note", await store_get(pg, "feedback/f2") is None and await store_get(pg, "fbnotes/f2") is None)


async def attendance(pg):
    """6 attendance: correction history, bulk 'present' with a preview, cancelled sessions not counted."""
    await pg.clock.set_fixed_time("2026-11-19T10:00:00+08:00")
    await as_role(pg, "admin", hash="clubs", reset=True)
    await pg.click("button:has-text('Ирц бүртгэх')"); await pg.wait_for_timeout(300)
    await pg.locator("#sheet button", has_text="Пиклбол · Б ээлж").click(); await pg.wait_for_timeout(300)
    check("6 sheet opens on the latest past session", await pg.input_value("#att-day") == "2026-11-19")
    rows = await pg.locator("#sheet .crrow").count()
    check("6 four children listed for tennis B", rows == 4, rows)
    await pg.click("#att-bulk"); await pg.wait_for_timeout(300)
    pv = await pg.text_content("#att-preview")
    check("6 bulk 'present' shows who changes before saving", '"Ирсэн" болно: 3' in pv and '"Шалтгаантай" болно (урьдчилан мэдэгдсэн): 1' in pv and "Номин Бат" in pv, pv)
    check("6 nothing saved before confirming", "att" not in (await store_get(pg, "offers/tn-b/seats/s2")))
    await pg.screenshot(path=SHOT + "b7_att_preview.png")
    await pg.click("#att-bulk-ok"); await pg.wait_for_timeout(400)
    s2 = await store_get(pg, "offers/tn-b/seats/s2"); s4 = await store_get(pg, "offers/tn-b/seats/s4")
    check("6 confirm marks present, and excused for the child who told ahead", s2["att"]["2026-11-19"] == "p" and s4["att"]["2026-11-19"] == "e", (s2, s4))
    # correct one mark: history is kept and shown
    row = pg.locator("#sheet .crrow", has_text="Ану Болд")
    await row.locator("button:has-text('Тасалсан')").click(); await pg.wait_for_timeout(400)
    s2 = await store_get(pg, "offers/tn-b/seats/s2")
    h = s2.get("atth", {}).get("2026-11-19", [])
    check("6 a corrected mark keeps its history", len(h) == 2 and h[-1]["was"] == "p" and h[-1]["v"] == "a", h)
    txt = await pg.locator("#sheet .crrow", has_text="Ану Болд").text_content()
    check("6 history is visible next to the name", "Засвар: ✓ Ирсэн → ✗ Тасалсан" in txt, txt)
    # future session: no present/absent marks
    await pg.select_option("#att-day", "2026-11-24"); await pg.wait_for_timeout(300)
    dis = await pg.locator("#sheet .crrow").first.locator("button:has-text('Ирсэн')").is_disabled()
    check("6 future session cannot be marked present", dis and await pg.locator("#att-bulk").count() == 0)
    # cancel a past session: it stops counting
    await pg.select_option("#att-day", "2026-11-12"); await pg.wait_for_timeout(300)
    await pg.locator("#sheet summary", has_text="цуцлах").click()
    await pg.click("#sheet button:has-text('Цуцлах')"); await pg.wait_for_timeout(200)
    check("6 cancelling asks for a reason", "шалтгаанаа" in (await pg.text_content("#sheet .status")).lower())
    await pg.fill("#att-why", "Заал засвартай")
    await pg.click("#sheet button:has-text('Цуцлах')"); await pg.wait_for_timeout(400)
    off = (await store_get(pg, "offers/tn-b")).get("off", {})
    check("6 cancelled session saved with its reason", off.get("2026-11-12") == "Заал засвартай", off)
    check("6 cancelled session shows a notice, no marking buttons", "цуцлагдсан" in (await pg.text_content("#sheet")) and await pg.locator("#sheet .crrow").count() == 0)
    await pg.screenshot(path=SHOT + "b8_att_cancelled.png")
    # after a reload the cancellation is still there and can be undone
    await pg.keyboard.press("Escape")
    await pg.clock.set_fixed_time("2026-11-19T10:00:00+08:00")
    await as_role(pg, "admin", hash="clubs")
    await pg.click("button:has-text('Ирц бүртгэх')"); await pg.wait_for_timeout(300)
    await pg.locator("#sheet button", has_text="Пиклбол · Б ээлж").click(); await pg.wait_for_timeout(300)
    await pg.select_option("#att-day", "2026-11-12"); await pg.wait_for_timeout(300)
    await pg.click("#sheet button:has-text('Цуцлалтыг буцаах')"); await pg.wait_for_timeout(400)
    off = (await store_get(pg, "offers/tn-b")).get("off", {})
    check("6 a cancellation can be undone", not off.get("2026-11-12"), off)


async def home_header(pg):
    """5.1 home order and a header that fits a phone."""
    await as_role(pg, "guest", hash="home", reset=True)
    order = await pg.evaluate("""()=>['homeReg','homeHow','topSec','coachIntro','gate','parentFaq'].map(id=>{var e=document.getElementById(id);return e&&e.offsetParent?Math.round(e.getBoundingClientRect().top+scrollY):null})""")
    shown = [y for y in order if y is not None]
    check("5.1 home: registration, summary, (athletes), coach, login, FAQ in this order", order[0] is not None and order[1] is not None and shown == sorted(shown), order)
    reg = await pg.text_content("#homeReg")
    check("5.1 home registration box shows the window and links to clubs", "Бүртгэл" in reg and "Дугуйлан, суудал харах" in reg, reg)
    how = await pg.locator("#homeHowList li").count()
    check("5.1 PE summary comes from the same 6 steps as the 'how' page", how == 6, how)
    cap = await pg.text_content("#pbCap")
    check("5.4 Podcast & Broadcast has a Mongolian caption, name unchanged", "Подкаст ба шууд дамжуулалт" in cap and await pg.locator("nav.tabs .mt", has_text="Podcast & Broadcast").count() == 1)
    content = await pg.evaluate("()=>getComputedStyle(document.querySelector('.gsteps li'),'::before').content")
    check("5.4 guide step numbers are not read twice", '/ ""' in content or content.endswith('""') or content == 'counter(g) / ""', content)
    await pg.set_viewport_size({"width": 390, "height": 860})
    for role, limit in [("guest", 140), ("student", 190), ("admin", 230)]:
        await as_role(pg, role, hash="home")
        hh = await pg.evaluate("()=>document.querySelector('header.bar').getBoundingClientRect().height")
        pos = await pg.evaluate("()=>getComputedStyle(document.querySelector('header.bar')).position")
        wide = await pg.evaluate("()=>document.documentElement.scrollWidth")
        check(f"5.4 phone header for {role}: {round(hh)}px, scrolls away, no sideways scroll", hh <= limit and pos != "sticky" and wide <= 390, (hh, pos, wide))
    await pg.screenshot(path=SHOT + "b9_phone_admin_header.png")
    await pg.set_viewport_size({"width": 1280, "height": 900})
    await as_role(pg, "admin", hash="home")
    check("5.4 desktop header stays fixed at the top", await pg.evaluate("()=>getComputedStyle(document.querySelector('header.bar')).position") == "sticky")


async def pickleball(pg):
    """Pickleball replaces mini tennis: same seats, new name and picture; drills in the library."""
    await as_role(pg, "guest", hash="clubs", reset=True)
    cr = await pg.text_content("#crOut")
    check("PB clubs page shows Пиклбол, no mini tennis", "Пиклбол" in cr and "теннис" not in cr.lower(), cr[:200])
    card = pg.locator("#crOut .club", has_text="Пиклбол")
    t = await card.text_content()
    check("PB keeps the tennis time, place and two shifts", "07:00–08:20" in t and "А ээлж" in t and "Б ээлж" in t, t[:300])
    check("PB card has a paddle picture", await card.locator(".pic svg").count() == 1)
    await card.screenshot(path=SHOT + "pb_club_card.png")
    await as_role(pg, "student", hash="library")
    await pg.locator("#fCat button", has_text="Пиклбол").click(); await pg.wait_for_timeout(300)
    n = await pg.locator("#exList .ex").count()
    check("PB 5 pickleball drills in the exercise library", n == 5, n)
    await pg.screenshot(path=SHOT + "pb_library.png")


async def pe_attendance(pg):
    """Class attendance written to the school's Sheet (preview: made-up students)."""
    await pg.clock.set_fixed_time("2026-10-21T10:00:00+08:00")
    await as_role(pg, "student", hash="patt", reset=True)
    check("PA students cannot open class attendance", not await pg.is_visible("#v-patt") and await pg.locator("nav [data-go=patt]").is_hidden() and await pg.locator("#pattChip").count() == 0)
    await as_role(pg, "admin", hash="home")
    await pg.set_viewport_size({"width": 1280, "height": 545})
    await pg.locator("nav .mt", has_text="Миний хэсэг").click(); await pg.wait_for_timeout(200)
    dd = pg.locator("nav .mg.open .dd")
    last = dd.locator("a[data-go=patt]")
    await last.scroll_into_view_if_needed()
    box = await last.bounding_box()
    check("PA long 'Миний хэсэг' menu scrolls, last link reachable on a short screen", box is not None and box["y"] + box["height"] <= 545 and await dd.evaluate("e=>getComputedStyle(e).overflowY") == "auto", box)
    await pg.keyboard.press("Escape")
    await pg.set_viewport_size({"width": 1280, "height": 900})
    check("PA owner strip has a 'Хичээлийн ирц' shortcut", await pg.locator("#editBar #pattChip").count() == 1)
    await pg.click("#pattChip"); await pg.wait_for_timeout(500)
    check("PA shortcut opens the page", await pg.is_visible("#v-patt"))
    check("PA owner sees the menu link", await pg.locator("nav [data-go=patt]").count() == 1 and not await pg.locator("nav [data-go=patt]").get_attribute("hidden"))
    tabs = await pg.locator("#pattOut > .chips").first.locator("button.chip").all_text_contents()
    check("PA tabs PE 6 ... PE 12 from the Sheet", tabs == ["PE 6", "PE 7", "PE 8", "PE 9", "PE 10", "PE 11", "PE 12"], tabs)
    await pg.locator("#pattOut button.chip", has_text="PE 12").click(); await pg.wait_for_timeout(400)
    cls = await pg.locator("#pattOut .chips").nth(1).locator("button").all_text_contents()
    check("PA class filter 12A / 12B / 12C", cls == ["Бүгд", "12A", "12B", "12C"], cls)
    check("PA date starts on today", await pg.input_value("#pa-date") == "2026-10-21")
    note = await pg.text_content("#pattOut .crstep")
    check("PA wrong header dates are named with the real days", "11/10" in note and "1/19" in note and "2025" in note, note)
    await pg.locator("#pattOut .chips button", has_text="12B").click(); await pg.wait_for_timeout(200)
    rows = pg.locator("#pattOut .pa-row")
    check("PA class filter shows only 12B", await rows.count() == 8)
    first = rows.first; sid = await first.get_attribute("data-id")
    async def mark_of(i, d="2026-10-21"):
        return await pg.evaluate("([id,d])=>{var s=__tpeStore()['mocksheet/PE 12'].students.filter(x=>x.id===id)[0];return s.m[d]||''}", [i, d])
    await first.locator("button", has_text="Ирсэн").click(); await pg.wait_for_timeout(400)
    check("PA one tap writes И to the Sheet", await mark_of(sid) == "И" and "Sheet-д хадгалагдлаа" in await pg.text_content("#pa-msg"))
    await pg.locator(f".pa-row[data-id='{sid}'] button", has_text="Ирсэн").click(); await pg.wait_for_timeout(400)
    check("PA tapping again clears the cell", await mark_of(sid) == "")
    await pg.evaluate("()=>{window.__tpeSheetFail=true}")
    await pg.locator(f".pa-row[data-id='{sid}'] button", has_text="Тасалсан").click(); await pg.wait_for_timeout(400)
    msg = await pg.text_content("#pa-msg")
    check("PA failed write says so and the screen goes back", "ороогүй" in msg and await mark_of(sid) == "" and await pg.locator(f".pa-row[data-id='{sid}'] button[aria-pressed=true]").count() == 0, msg)
    await pg.evaluate("()=>{window.__tpeSheetHold=true}")
    await pg.locator(f".pa-row[data-id='{sid}'] button", has_text="Хоцорсон").click(); await pg.wait_for_timeout(150)
    check("PA buttons wait while the Sheet is saving", await pg.locator(f".pa-row[data-id='{sid}'] button").first.is_disabled())
    await pg.evaluate("()=>window.__tpeSheetRelease()"); await pg.wait_for_timeout(300)
    check("PA late (Х) saved", await mark_of(sid) == "Х")
    check("PA five codes including Ө Өвчтэй", await pg.locator(f".pa-row[data-id='{sid}'] button").count() == 5 and await pg.locator(f".pa-row[data-id='{sid}'] button", has_text="Өвчтэй").count() == 1)
    n0 = await pg.evaluate("()=>window.__tpeSheetWrites||0")
    await pg.click("#pa-bulk"); await pg.wait_for_timeout(200)
    pv = await pg.text_content("#pa-preview")
    check("PA bulk shows who changes, before writing", "7 сурагч (12B)" in pv and await pg.evaluate("()=>window.__tpeSheetWrites||0") == n0, pv)
    await pg.screenshot(path=SHOT + "pa_bulk_preview.png")
    await pg.click("#pa-bulk-ok"); await pg.wait_for_timeout(400)
    marks = await pg.evaluate("()=>__tpeStore()['mocksheet/PE 12'].students.filter(x=>x.cls==='12B').map(x=>x.m['2026-10-21']||'')")
    check("PA bulk writes in one request; the late mark stays", marks.count("И") == 7 and marks.count("Х") == 1 and await pg.evaluate("()=>window.__tpeSheetWrites") == n0 + 1, marks)
    other = await pg.evaluate("()=>__tpeStore()['mocksheet/PE 12'].students.filter(x=>x.cls==='12A').map(x=>x.m['2026-10-21']||'').join('')")
    check("PA bulk does not touch other classes", other == "", other)
    row = await pg.locator(f".pa-row[data-id='{sid}'] small").text_content()
    st = await pg.evaluate("(id)=>{var s=__tpeStore()['mocksheet/PE 12'].students.filter(x=>x.id===id)[0];return Object.values(s.m).filter(v=>v==='И'||v==='Х').length*2}", sid)
    check("PA hours = (И + Х) × 2, like the Sheet", f"{st} цаг" in row, (row, st))
    await pg.screenshot(path=SHOT + "pa_marked.png")
    await pg.select_option("#pa-date", "2026-10-26"); await pg.wait_for_timeout(200)
    r0 = pg.locator("#pattOut .pa-row").first
    check("PA future day: only 'Чөлөөтэй' / 'Өвчтэй' can be set, no bulk", await r0.locator("button", has_text="Ирсэн").is_disabled() and not await r0.locator("button", has_text="Чөлөөтэй").is_disabled() and not await r0.locator("button", has_text="Өвчтэй").is_disabled() and await pg.locator("#pa-bulk").count() == 0)
    await r0.locator("button", has_text="Өвчтэй").click(); await pg.wait_for_timeout(400)
    rid = await r0.get_attribute("data-id")
    check("PA sick (Ө) written to the Sheet", await mark_of(rid, "2026-10-26") == "Ө")
    await pg.locator("#pattOut summary", has_text="Тохиргоо").click()
    await pg.fill("#pa-url", "https://evil.example.com/x")
    await pg.locator("#pattOut button", has_text="Хадгалах").click(); await pg.wait_for_timeout(200)
    check("PA settings refuse a non-Apps-Script address", "script.google.com" in await pg.locator("#pattOut details .status").last.text_content() and await store_get(pg, "private/peatt") is None)
    await pg.fill("#pa-url", "https://script.google.com/macros/s/AKfyc-test_123/exec")
    await pg.locator("#pattOut button", has_text="Хадгалах").click(); await pg.wait_for_timeout(300)
    check("PA script address saved owner-only (private/peatt)", (await store_get(pg, "private/peatt") or {}).get("url", "").endswith("/exec"))
    check("PA copy-code button for installing the script", await pg.locator("#pattOut button", has_text="Кодыг хуулах").count() == 1)


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


EXTRA = [feedback, attendance, home_header, pickleball, pe_attendance]

if __name__ == "__main__":
    asyncio.run(main())
