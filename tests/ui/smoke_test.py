"""Browser smoke test for every screen, with Supabase replaced by an in-memory mock.

Run:  python3 tests/ui/smoke_test.py      (needs: pip install playwright && playwright install chromium)
"""
import http.server, threading, functools, re, sys, pathlib
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[2]
MOCK = (ROOT / "tests/ui/mock-supabase.js").read_text()
CONFIG = 'window.TOMUJIN_CONFIG={SUPABASE_URL:"https://example.supabase.co",SUPABASE_KEY:"test",ACADEMIC_YEAR:"2026-27",SCHOOL_DOMAIN:"tomujin.edu.mn",GOOGLE_LOGIN:true};'

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_address[1]}"
failures, passed = [], []

def check(name, fn):
    try:
        fn(); passed.append(name); print("ok -", name)
    except Exception as e:  # noqa
        failures.append((name, e)); print("FAIL -", name, "\n   ", str(e).splitlines()[0][:300])

def new_page(browser, role):
    ctx = browser.new_context(accept_downloads=True, viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "fonts" not in m.text and "ERR_FAILED" not in m.text else None)
    page.add_init_script(f"window.__MOCK_ROLE={role!r};")
    page.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    page.route("**/fonts.gstatic.com/**", lambda r: r.abort())
    page.route("**/cdn.jsdelivr.net/**", lambda r: r.fulfill(body=MOCK, content_type="application/javascript"))
    page.route("**/assets/config.js", lambda r: r.fulfill(body=CONFIG, content_type="application/javascript"))
    return page, errors

def toast(page, text):
    expect(page.locator("#toast")).to_contain_text(text, timeout=4000)

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------------- signed out
    page, errs = new_page(browser, "none")
    page.goto(BASE + "/")
    check("login screen renders", lambda: expect(page.locator("h1").nth(1)).to_have_text("Нэвтрэх"))
    def outside_email():
        page.fill("input[name=email]", "someone@gmail.com"); page.click("#magic button")
        expect(page.locator("#authmsg")).to_contain_text("Зөвхөн @tomujin.edu.mn")
    check("non-school email rejected in UI", outside_email)
    def unknown_email():
        page.fill("input[name=email]", "unknown@tomujin.edu.mn"); page.click("#magic button")
        expect(page.locator("#authmsg")).to_contain_text("бүртгэлгүй")
    check("unregistered email gets friendly message", unknown_email)
    def ok_email():
        page.fill("input[name=email]", "anu@tomujin.edu.mn"); page.click("#magic button")
        expect(page.locator("#authmsg")).to_contain_text("илгээгдлээ")
    check("magic link sent message", ok_email)
    def google():
        page.click("#google")
        calls = page.evaluate("JSON.stringify(window.__calls)")
        assert '"hd":"tomujin.edu.mn"' in calls, calls
    check("Google login restricted to school domain", google)
    def url_error():
        page.goto("about:blank"); page.goto(BASE + "/#error=server_error&error_description=Database+error+saving+new+user")
        expect(page.locator(".msg.err")).to_contain_text("бүртгэлгүй")
        assert page.url.endswith("#/"), page.url
    check("auth error in redirect URL shown and cleaned", url_error)
    check("no JS errors (signed out)", lambda: (_ for _ in ()).throw(AssertionError(errs)) if errs else None)

    # ---------------- admin / teacher
    page, errs = new_page(browser, "admin")
    page.goto(BASE + "/")
    check("dashboard renders", lambda: expect(page.locator("h1")).to_have_text("Сайн байна уу"))
    def add_class():
        page.click("text=Ангиуд")
        page.fill("#addClass input[name=name]", "11b"); page.fill("#addClass input[name=grade]", "11"); page.click("#addClass button")
        toast(page, "Анги нэмэгдлээ"); expect(page.locator("table")).to_contain_text("11B")
    check("add class", add_class)
    def add_students():
        page.click("text=11B")
        page.fill("#addStudent input[name=first_name]", "Temuulen"); page.fill("#addStudent input[name=email]", "temuulen@tomujin.edu.mn")
        page.click("#addStudent button"); toast(page, "Сурагч нэмэгдлээ")
        page.fill("#bulk textarea", "first\tlast\temail\nAnu\tBat\tanu@tomujin.edu.mn\nBold\tDorj\t")
        page.click("#bulk button"); toast(page, "2 сурагч нэмэгдлээ")
        expect(page.locator("table").first.locator("tbody tr")).to_have_count(3)
    check("add student + bulk import", add_students)
    check("bulk import rejects gmail", lambda: (page.fill("#bulk textarea", "X,Y,x@gmail.com"), page.click("#bulk button"), toast(page, "биш")))
    def deactivate():
        page.locator("[data-toggle]").last.click()
        expect(page.locator("table").first).to_contain_text("идэвхгүй")
    check("deactivate student", deactivate)
    class_url = page.url
    def lesson():
        page.goto(BASE + "/#/lessons/new")
        page.fill("input[name=title]", "Sprint basics"); page.fill("textarea[name=objectives]", "Хурдны техник")
        page.click("#lform button.primary"); toast(page, "Хадгалагдлаа")
        assert re.search(r"#/lessons/[0-9a-f-]{36}$", page.url), page.url
        page.goto(class_url)
        page.select_option("#assign select[name=lesson_id]", label="Sprint basics"); page.fill("#assign input[name=scheduled_date]", "2026-10-12")
        page.click("#assign button"); toast(page, "хуваарилагдлаа")
        expect(page.locator("body")).to_contain_text("Sprint basics")
    check("create lesson and assign to class", lesson)
    def fitness():
        page.click("text=Фитнес тест")
        inp = page.locator("input[name$='|push_ups']").first
        inp.fill("20"); page.locator("input[name$='|sprint_50m']").first.fill("8.4")
        page.click("#entry button"); toast(page, "2 хадгалж")
        expect(page.locator("input[name$='|push_ups']").first).to_have_value("20")
        page.select_option("#selPeriod", "mid")
        expect(page.locator("input[name$='|push_ups']").first).to_have_value("")
        page.locator("input[name$='|push_ups']").first.fill("26"); page.locator("input[name$='|sprint_50m']").first.fill("8.1")
        page.click("#entry button"); toast(page, "2 хадгалж")
    check("fitness entry baseline + mid", fitness)
    def fitness_clear():
        page.locator("input[name$='|sprint_50m']").first.fill("")
        page.click("#entry button"); toast(page, "1 устгалаа")
        page.locator("input[name$='|sprint_50m']").first.fill("8.1"); page.click("#entry button"); toast(page, "1 хадгалж")
    check("clearing a value deletes it", fitness_clear)
    check("only active students in entry grid", lambda: expect(page.locator("#entry tbody tr")).to_have_count(2))
    def grades():
        page.click("text=Үнэлгээ")
        row = page.locator("tr[data-sid]").first
        for k, v in dict(attendance=100, performance=80, showcase=90, attitude=70, preparation=100, load_awareness=50, bonus=5).items():
            row.locator(f"input[name={k}]").fill(str(v))
        expect(row.locator("[data-core]")).to_have_text("83")
        page.click("#gform button"); toast(page, "1 сурагчийн")
        expect(page.locator("tr[data-sid]").first.locator("[data-core]")).to_have_text("83")
    check("grades: live total 83 and save", grades)
    def report():
        page.locator("tr[data-sid] a").first.click()
        expect(page.locator(".card").first).to_contain_text("▲ +6")   # push-ups 20 -> 26
        expect(page.locator(".card").first).to_contain_text("▲ +0.3") # sprint 8.4 -> 8.1 (lower is better)
        expect(page.locator(".card").nth(1)).to_contain_text("83")
        expect(page.locator("text=Хэвлэх / PDF")).to_be_visible()
    check("student report shows progress and grades", report)
    def edit_student():
        page.click("text=Сурагчийн мэдээлэл засах")
        page.fill("#editStudent input[name=student_code]", "S-001"); page.click("#editStudent button.primary"); toast(page, "Хадгалагдлаа")
        expect(page.locator(".sub").first).to_contain_text("S-001")
    check("edit student", edit_student)
    def csv():
        page.goto(class_url)
        with page.expect_download() as d: page.click("#exportCsv")
        text = pathlib.Path(d.value.path()).read_text(encoding="utf-8-sig")
        assert "Push-ups baseline" in text and ",20," in text and "83" in text, text[:400]
    check("CSV export contains results and grades", csv)
    def delete_class_blocked():
        page.click("text=Ангийн мэдээлэл засах"); page.click("#delClass"); toast(page, "устгах боломжгүй")
    check("cannot delete class that has students", delete_class_blocked)
    def logs_and_staff():
        page.click("text=Дасгалын бүртгэл"); expect(page.locator("h1")).to_have_text("Дасгалын бүртгэл")
        page.click("text=Багш нар")
        page.fill("#sform input[name=email]", "New.Teacher@tomujin.edu.mn"); page.click("#sform button"); toast(page, "Нэмэгдлээ")
        expect(page.locator("table")).to_contain_text("new.teacher@tomujin.edu.mn")
    check("logs view + add teacher (lowercased)", logs_and_staff)
    def mobile():
        page.set_viewport_size({"width": 375, "height": 800}); page.goto(BASE + "/#/classes")
        for route in ["#/", "#/classes", "#/assessment", "#/grades", "#/lessons", "#/staff"]:
            page.goto(BASE + "/" + route); page.wait_for_selector("h1")
            w = page.evaluate("document.documentElement.scrollWidth")
            wide = page.evaluate("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>380 && !e.closest('.tablewrap, .nav')).slice(0,3).map(e=>e.tagName+'.'+e.className).join(' ')")
            assert w <= 376, f"{route}: {w} {wide}"
    check("no horizontal scroll at phone width", mobile)
    check("no JS errors (teacher)", lambda: (_ for _ in ()).throw(AssertionError(errs)) if errs else None)

    # ---------------- student
    page, errs = new_page(browser, "student")
    page.goto(BASE + "/")
    check("student home renders", lambda: expect(page.locator("h1")).to_have_text("Сайн уу, Anu!"))
    check("student sees no teacher menu", lambda: expect(page.locator(".nav a")).to_have_count(1))
    check("student sees own progress", lambda: expect(page.locator("body")).to_contain_text("▲ +6"))
    check("student sees assigned lesson", lambda: expect(page.locator("body")).to_contain_text("Sprint basics"))
    def submit_log():
        page.fill("#logf input[name=activity]", "Гүйлт"); page.fill("#logf input[name=duration_min]", "40")
        page.select_option("#logf select[name=rpe]", "6"); page.click("#logf button"); toast(page, "Бүртгэгдлээ")
        expect(page.locator("body")).to_contain_text("240")
    check("student submits training log (load 40×6=240)", submit_log)
    def teacher_route_blocked():
        page.goto(BASE + "/#/staff"); expect(page.locator("h1")).to_have_text("Сайн уу, Anu!")
    check("teacher routes show student home instead", teacher_route_blocked)
    check("no JS errors (student)", lambda: (_ for _ in ()).throw(AssertionError(errs)) if errs else None)
    browser.close()

srv.shutdown()
print(f"\n{len(passed)} passed, {len(failures)} failed")
sys.exit(1 if failures else 0)
