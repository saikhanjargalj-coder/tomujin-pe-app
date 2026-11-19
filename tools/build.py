#!/usr/bin/env python3
"""Assemble web/index.html from src/ (no other dependencies).

    python3 tools/build.py

src/template.html  page layout, styles and app code (contains /*__DATA__*/)
src/*.js, *.json   built-in content: exercises, wellbeing framework, articles, calculator
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

t = (SRC / "template.html").read_text(encoding="utf-8")
parts = ["var WBEN=" + json.dumps(json.loads((SRC / "wb_en.json").read_text(encoding="utf-8")), ensure_ascii=False) + ";"]
parts.append("var PASCRIPT=" + json.dumps((ROOT / "tools" / "sheet" / "attendance.gs").read_text(encoding="ascii")) + ";")
for name in ["wb_mn.js", "data.js", "data2.js", "core.js", "content.js", "calc.js", "clubreg.js", "peatt.js", "away.js", "strava.js", "coachx.js", "yavts.js"]:
    parts.append((SRC / name).read_text(encoding="utf-8"))
data = "\n".join(parts).replace(
    "if(typeof module!=='undefined')module.exports={rawJoints:rawJoints,solvePoses:solvePoses,JI:JI};", "")
assert "/*__DATA__*/" in t
body = t.replace("/*__DATA__*/", data)

head_end = body.index("</style>") + len("</style>")
head, rest = body[:head_end], body[head_end:]
page = (
    '<!doctype html>\n<html lang="mn">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    '<link rel="manifest" href="/manifest.webmanifest">\n<meta name="theme-color" content="#5c1090">\n<link rel="apple-touch-icon" href="/icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="Tomujin PE">\n'
    '<meta name="description" content="Tomujin PE — хөдөлгөөн, 4 талт wellbeing, дасгалын сан, хоол тэжээлийн тооцоолуур">\n'
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'6\' fill=\'%235B1F8F\'/%3E%3Ctext x=\'16\' y=\'22\' text-anchor=\'middle\' font-family=\'Arial\' font-size=\'13\' font-weight=\'700\' fill=\'%23F2C230\'%3EPE%3C/text%3E%3C/svg%3E">\n'
    + head.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
    + '\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}</style>'
    + '\n<script src="/config.js"></script>\n<script type="module" src="/fb.js"></script>\n</head>\n<body>\n'
    + rest + "\n</body>\n</html>\n"
)
(ROOT / "web" / "index.html").write_text(page, encoding="utf-8")
print("web/index.html", len(page), "bytes")
