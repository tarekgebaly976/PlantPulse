"""Shared layout for the Arabic guides: right-to-left HTML with the app's Arabic font (IBM Plex Sans Arabic, OFL),
printed to A4 PDF by Chromium (Playwright, via html2pdf.js), which shapes Arabic and lays out RTL correctly."""

import base64
import html
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "fonts")
IMG = os.path.join(HERE, "..", "img")
DOCS = os.path.join(HERE, "..", "..")

NAVY, TEAL, AMBER, SOFT, LINE = "#102A33", "#23616D", "#B9781A", "#44535A", "#D5DDDF"


def _font_faces() -> str:
    out = []
    for w in (400, 600, 700):
        for sub, rng in (("arabic", "U+0600-06FF, U+0750-077F, U+0870-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200E, U+2010-2011, U+204F, U+2E41"),
                         ("latin", "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2190-2193, U+2212, U+2215, U+25A0, U+2192, U+03C3")):
            data = base64.b64encode(open(os.path.join(FONTS, f"ibm-plex-sans-arabic-{sub}-{w}-normal.woff2"), "rb").read()).decode()
            out.append(f"@font-face{{font-family:'Plex Arabic';font-weight:{w};src:url(data:font/woff2;base64,{data}) format('woff2');unicode-range:{rng}}}")
    return "\n".join(out)


CSS = """
@page { size: A4; margin: 18mm 18mm 20mm 18mm; }
* { box-sizing: border-box; }
body { font-family: 'Plex Arabic', 'DejaVu Sans', sans-serif; color: %(navy)s; font-size: 10.6pt; line-height: 1.65; margin: 0; }
h1.title { font-size: 34pt; margin: 0; color: %(navy)s; font-weight: 700; }
.subtitle { font-size: 15pt; color: %(soft)s; margin: 4px 0 14mm; }
.cover { padding-top: 45mm; }
.coverbox { border-inline-start: 4px solid %(amber)s; padding: 6px 14px; margin-bottom: 12mm; }
h2.part { font-size: 19pt; margin: 0 0 2px; color: %(navy)s; break-after: avoid; }
.partintro { color: %(soft)s; margin: 0 0 8px; break-after: avoid; }
.proc { break-inside: avoid; margin: 10px 0 8px; }
.proc.long { break-inside: auto; }
h3 { font-size: 13pt; color: %(teal)s; margin: 10px 0 2px; break-after: avoid; }
.meta { color: %(soft)s; font-size: 9.4pt; margin-bottom: 4px; break-after: avoid; }
ol.steps li:first-child { break-before: avoid; }
ol.steps { margin: 2px 0 4px; padding-inline-start: 22px; }
ol.steps li { margin-bottom: 3px; }
ol.steps li::marker { color: %(teal)s; font-weight: 700; }
.box { background: #E6F0F1; border-inline-start: 3px solid %(teal)s; padding: 5px 9px; margin: 6px 0; font-size: 9.8pt; break-inside: avoid; }
.box.warn { background: #FBF0DC; border-color: %(amber)s; }
table.grid { width: 100%%; border-collapse: collapse; margin: 6px 0; font-size: 9.6pt; break-inside: auto; }
table.grid th { background: #E6F0F1; text-align: start; }
table.grid th, table.grid td { border: 0.6pt solid %(line)s; padding: 4px 6px; vertical-align: top; }
table.grid tr { break-inside: avoid; }
td.sw { color: #fff; font-weight: 700; }
.code { direction: ltr; text-align: left; font-family: 'DejaVu Sans Mono', monospace; font-size: 8.4pt; background: #EEF1F2; border: 0.5pt solid %(line)s; padding: 6px 8px; margin: 6px 0; white-space: pre-wrap; word-break: break-all; }
.toc .tp { color: %(teal)s; font-weight: 700; margin-top: 6px; }
.toc .ti { padding-inline-start: 18px; }
.pb { break-after: page; }
.ltr { direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
figure { margin: 6px 0 12px; break-inside: avoid; text-align: center; }
figure img { max-width: 100%%; border: 0.6pt solid %(line)s; }
figcaption { color: %(soft)s; font-size: 9pt; font-style: italic; margin-top: 3px; }
.check { background: #EBFBEE; border: 0.6pt solid #37B24D; padding: 5px 8px; display: flex; gap: 8px; align-items: flex-start; margin-top: 3px; }
.check .tick { width: 4.5mm; height: 4.5mm; border: 1.2pt solid #2B8A3E; background: #fff; flex: none; margin-top: 2px; }
.ex { break-inside: avoid; margin-bottom: 8px; }
""" % {"navy": NAVY, "soft": SOFT, "amber": AMBER, "teal": TEAL, "line": LINE}


def esc(s: str) -> str:
    """Escape plain text (procedure texts here are written as small HTML snippets, so most are passed as-is)."""
    return html.escape(s)


def page(title: str, body: str) -> str:
    return f"""<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>{esc(title)}</title>
<style>{_font_faces()}{CSS}</style></head><body>{body}</body></html>"""


def steps(items: list[str]) -> str:
    return '<ol class="steps">' + "".join(f"<li>{i}</li>" for i in items) + "</ol>"


def box(kind: str, text: str) -> str:
    label = {"tip": "نصيحة", "note": "ملاحظة", "warn": "مهم"}[kind]
    return f'<div class="box{" warn" if kind == "warn" else ""}"><b>{label}:</b> {text}</div>'


def grid(rows: list[list[str]], widths: list[int] | None = None) -> str:
    """Table; a cell written "#RRGGBB|text" gets that background (colour keys)."""
    out = ['<table class="grid">']
    if widths:
        out.append("<colgroup>" + "".join(f'<col style="width:{w}%">' for w in widths) + "</colgroup>")
    for i, r in enumerate(rows):
        tag = "th" if i == 0 else "td"
        cells = []
        for c in r:
            if c.startswith("#") and "|" in c:
                hx, c = c.split("|", 1)
                cells.append(f'<td class="sw" style="background:{hx}">{c}</td>')
            else:
                cells.append(f"<{tag}>{c}</{tag}>")
        out.append("<tr>" + "".join(cells) + "</tr>")
    out.append("</table>")
    return "".join(out)


def image(name: str, caption: str, width: str = "100%") -> str:
    data = base64.b64encode(open(os.path.join(IMG, name), "rb").read()).decode()
    return f'<figure><img src="data:image/png;base64,{data}" style="width:{width}"><figcaption>{caption}</figcaption></figure>'


def doc_image(path: str, width: str = "100%") -> str:
    data = base64.b64encode(open(path, "rb").read()).decode()
    return f'<figure><img src="data:image/png;base64,{data}" style="width:{width}"></figure>'


def render(html_text: str, out_pdf: str, footer: str) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write(html_text)
        src = f.name
    try:
        subprocess.run(["node", os.path.join(HERE, "html2pdf.js"), src, os.path.abspath(out_pdf), footer], check=True)
    finally:
        os.unlink(src)
