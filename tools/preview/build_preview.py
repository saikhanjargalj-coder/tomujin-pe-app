#!/usr/bin/env python3
"""Make a single-file PREVIEW of the site that runs on test data only (never the real database).

    python3 tools/build.py && python3 tools/preview/build_preview.py [out.html]

The page loads tools/preview/mockfb.js instead of web/fb.js, so sign-in, saving and club registration
work in the browser without touching Firebase. A dark bar at the top switches role and registration time.
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
args = [a for a in sys.argv[1:] if not a.startswith("--")]
ARTIFACT = "--artifact" in sys.argv   # page content only: the claude.ai artifact host adds doctype/head/body
out = pathlib.Path(args[0]) if args else ROOT / "preview.html"
page = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
config = (ROOT / "web" / "config.js").read_text(encoding="utf-8")
mock = (pathlib.Path(__file__).parent / "mockfb.js").read_text(encoding="utf-8")
a = '<script src="/config.js"></script>\n<script type="module" src="/fb.js"></script>'
assert a in page, "script tags not found"
page = page.replace(a, "<script>\n" + config + "\n</script>\n<script>\n" + mock + "\n</script>")
page = page.replace('<link rel="manifest" href="/manifest.webmanifest">\n', "")
page = page.replace("<title>Tomujin PE</title>", "<title>Tomujin PE Preview</title>", 1)
if ARTIFACT:
    head_end = page.index("<title>")
    page = page[head_end:]
    page = page.replace("<title>Tomujin PE Preview</title>", '<title>Tomujin PE Preview</title>\n<meta name="claude:viewport-fit-sides" content="cover">', 1)
    page = page.replace("\n</head>\n<body>\n", "\n", 1)
    page = re.sub(r"\s*</body>\s*</html>\s*$", "\n", page)
out.write_text(page, encoding="utf-8")
print(out, len(page.encode("utf-8")), "bytes")
