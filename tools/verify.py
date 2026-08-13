#!/usr/bin/env python3
"""
Verificação do projeto antes do deploy.

Checa:
  1. links e assets internos que não existem
  2. <script> inline (quebraria a CSP script-src 'self')
  3. JSON válido nos arquivos de configuração
  4. contraste WCAG dos pares de cor do design system
  5. imagens sem alt e páginas sem <h1>

Uso: python3 tools/verify.py
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
problems = []
notes = []


# ---------------------------------------------------------------- links -----
def check_links():
    pages = sorted(ROOT.glob("*.html"))
    pattern = re.compile(r'(?:href|src)\s*=\s*"([^"]+)"')
    for page in pages:
        html = page.read_text(encoding="utf-8")
        for target in pattern.findall(html):
            if target.startswith(("http://", "https://", "mailto:", "#", "data:", "//")):
                continue
            clean = target.split("#")[0].split("?")[0]
            if not clean:
                continue
            path = ROOT / clean.lstrip("/")
            if not path.exists():
                problems.append("{}: alvo inexistente -> {}".format(page.name, target))


# ------------------------------------------------------------------ CSP -----
def check_csp():
    inline = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>", re.I)
    for page in sorted(ROOT.glob("*.html")):
        html = page.read_text(encoding="utf-8")
        for tag in inline.findall(html):
            if 'type="application/ld+json"' in tag:
                continue  # JSON-LD é dado, não script executável
            problems.append("{}: <script> inline viola a CSP -> {}".format(page.name, tag[:70]))

    for handler in re.finditer(r'\son(click|load|error|submit)=', "\n".join(
            p.read_text(encoding="utf-8") for p in ROOT.glob("*.html"))):
        problems.append("handler inline on{} encontrado (viola a CSP)".format(handler.group(1)))


# ----------------------------------------------------------------- JSON -----
def check_json():
    for name in ["data/seed.json", "vercel.json", "package.json"]:
        path = ROOT / name
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as err:
            problems.append("{}: JSON inválido -> {}".format(name, err))


# ------------------------------------------------------------- contraste ----
def luminance(hex_color):
    hex_color = hex_color.lstrip("#")
    channels = []
    for i in (0, 2, 4):
        c = int(hex_color[i:i + 2], 16) / 255
        channels.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
    r, g, b = channels
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(fg, bg):
    a, b = luminance(fg), luminance(bg)
    lighter, darker = max(a, b), min(a, b)
    return (lighter + 0.05) / (darker + 0.05)


PAIRS = [
    ("texto secundário sobre o fundo",   "#A3AEC2", "#0B0F1A", 4.5),
    ("texto secundário sobre card",      "#A3AEC2", "#141B2B", 4.5),
    ("texto primário sobre o fundo",     "#EDEFF4", "#0B0F1A", 4.5),
    ("acento sienna sobre o fundo",      "#D07231", "#0B0F1A", 4.5),
    ("acento esmeralda sobre o fundo",   "#2FA37A", "#0B0F1A", 4.5),
    ("texto do botão primário",          "#0B0F1A", "#D07231", 4.5),
    ("borda de campo (não textual)",     "#5B6580", "#0B0F1A", 3.0),
    ("badge LinkedIn",                   "#FFFFFF", "#0A66C2", 4.5),
    ("badge Instagram",                  "#FFFFFF", "#C13584", 4.5),
]


def check_contrast():
    for label, fg, bg, minimum in PAIRS:
        r = ratio(fg, bg)
        if r < minimum:
            problems.append("contraste: {} = {:.2f}:1 (mínimo {}:1)".format(label, r, minimum))
        else:
            notes.append("  {:<34} {:>6.2f}:1  (min {}:1)".format(label, r, minimum))


# ------------------------------------------------------------------ a11y ----
def check_a11y():
    for page in sorted(ROOT.glob("*.html")):
        html = page.read_text(encoding="utf-8")
        if page.name not in ("login.html",) and "<h1" not in html:
            problems.append("{}: página sem <h1>".format(page.name))
        for tag in re.findall(r"<img\b[^>]*>", html):
            if "alt=" not in tag:
                problems.append("{}: <img> sem alt -> {}".format(page.name, tag[:70]))
        if 'lang="pt-BR"' not in html:
            problems.append("{}: <html> sem lang".format(page.name))


if __name__ == "__main__":
    check_links()
    check_csp()
    check_json()
    check_contrast()
    check_a11y()

    print("Contraste WCAG 2.1 AA")
    for note in notes:
        print(note)

    print()
    if problems:
        print("{} problema(s):".format(len(problems)))
        for p in problems:
            print("  ✗ " + p)
        sys.exit(1)
    print("✓ Nenhum problema encontrado.")
