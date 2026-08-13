#!/usr/bin/env python3
"""
Gera as imagens de apoio do site: favicon, capa de compartilhamento e os
placeholders da galeria.

Os arquivos em img/obras/ são PLACEHOLDERS gerados por código, na paleta da
marca. Substitua pelas fotografias reais das obras de Tales Hack antes do
lançamento — e mantenha o par <slug>.jpg (grande) e <slug>-thumb.jpg (600px).

Uso: python3 tools/make_assets.py
"""

import math
import pathlib
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMG = ROOT / "img"
OBRAS = IMG / "obras"

INK = (11, 15, 26)
SIENNA = (208, 114, 49)
EMERALD = (47, 163, 122)
BONE = (237, 239, 244)


def load_font(size, bold=True):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if pathlib.Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, start, end, angle=100):
    """Gradiente linear simples no ângulo dado."""
    w, h = size
    base = Image.new("RGB", size, start)
    px = base.load()
    rad = math.radians(angle)
    dx, dy = math.cos(rad), math.sin(rad)
    span = abs(dx) * w + abs(dy) * h
    for y in range(h):
        for x in range(w):
            t = ((x * dx + y * dy) + span / 2) / span
            px[x, y] = lerp(start, end, max(0.0, min(1.0, t)))
    return base


# --------------------------------------------------------------------------
# Favicon (SVG — nítido em qualquer tamanho, poucos bytes)
# --------------------------------------------------------------------------
def make_favicon():
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="HTF">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#D07231"/>
      <stop offset="0.5" stop-color="#B98A46"/>
      <stop offset="1" stop-color="#2FA37A"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <g fill="#0B0F1A">
    <rect x="13" y="18" width="4"  height="28" rx="1"/>
    <rect x="13" y="30" width="15" height="4"  rx="1"/>
    <rect x="24" y="18" width="4"  height="28" rx="1"/>
    <rect x="32" y="18" width="18" height="4"  rx="1"/>
    <rect x="39" y="18" width="4"  height="28" rx="1"/>
  </g>
</svg>
"""
    (IMG / "favicon.svg").write_text(svg, encoding="utf-8")


# --------------------------------------------------------------------------
# Capa de compartilhamento (og:image, 1200x630)
# --------------------------------------------------------------------------
def make_og_cover():
    w, h = 1200, 630
    img = Image.new("RGB", (w, h), INK)
    draw = ImageDraw.Draw(img, "RGBA")

    # halos de cor nos cantos, ecoando o fundo do site
    glow = Image.new("RGB", (w, h), INK)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-260, -300, 620, 380], fill=(70, 40, 18))
    gd.ellipse([700, 330, 1500, 950], fill=(16, 60, 46))
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    img = Image.blend(img, glow, 0.85)
    draw = ImageDraw.Draw(img, "RGBA")

    # sulcos diagonais: a assinatura visual da marca
    for i in range(-14, 30):
        x = i * 46
        draw.line([(x, h), (x + 210, 0)], fill=(237, 239, 244, 12), width=2)

    # marca
    draw.rounded_rectangle([80, 74, 140, 134], radius=15, fill=SIENNA)
    draw.text((156, 88), "HACK TECH FARM", font=load_font(30), fill=BONE)

    draw.text((80, 236), "Cultivando tecnologia,", font=load_font(74), fill=BONE)
    draw.text((80, 330), "colhendo arte.", font=load_font(74), fill=SIENNA)

    draw.text((80, 470),
              "Software house familiar em Porto Alegre",
              font=load_font(30, bold=False), fill=(163, 174, 194))

    draw.line([(80, 540), (240, 540)], fill=EMERALD, width=4)
    draw.text((80, 556), "hacktechfarm.com", font=load_font(26, bold=False), fill=(163, 174, 194))

    img.save(IMG / "og-cover.png", "PNG", optimize=True)


# --------------------------------------------------------------------------
# Placeholders da galeria — SUBSTITUIR pelas obras reais
# --------------------------------------------------------------------------
OBRAS = [
    ("obra-01", "Sulco", 3),
    ("obra-02", "Ruído branco", 11),
    ("obra-03", "Colheita", 23),
    ("obra-04", "Sinapse", 41),
    ("obra-05", "Terra batida", 57),
    ("obra-06", "Segunda leitura", 73),
]


def make_placeholder(slug, seed):
    rnd = random.Random(seed)
    size = 1200
    base = gradient((size, size),
                    lerp(INK, SIENNA, 0.12 + rnd.random() * 0.2),
                    lerp(INK, EMERALD, 0.10 + rnd.random() * 0.22),
                    angle=rnd.choice([80, 100, 120, 140]))
    draw = ImageDraw.Draw(base, "RGBA")

    for _ in range(rnd.randint(5, 9)):
        x0 = rnd.randint(-200, size)
        y0 = rnd.randint(-200, size)
        w = rnd.randint(180, 720)
        color = rnd.choice([SIENNA, EMERALD, BONE])
        draw.ellipse([x0, y0, x0 + w, y0 + int(w * rnd.uniform(0.5, 1.4))],
                     fill=color + (rnd.randint(18, 52),))

    for _ in range(rnd.randint(14, 26)):
        y = rnd.randint(0, size)
        draw.line([(rnd.randint(-100, 200), y),
                   (rnd.randint(size - 200, size + 100), y + rnd.randint(-90, 90))],
                  fill=BONE + (rnd.randint(10, 34),), width=rnd.randint(1, 6))

    base = base.filter(ImageFilter.GaussianBlur(1.2))

    out_dir = ROOT / "img" / "obras"
    out_dir.mkdir(parents=True, exist_ok=True)
    base.save(out_dir / (slug + ".jpg"), "JPEG", quality=82, optimize=True, progressive=True)
    base.resize((600, 600), Image.LANCZOS).save(
        out_dir / (slug + "-thumb.jpg"), "JPEG", quality=78, optimize=True, progressive=True)


if __name__ == "__main__":
    IMG.mkdir(parents=True, exist_ok=True)
    make_favicon()
    make_og_cover()
    for slug, _title, seed in OBRAS:
        make_placeholder(slug, seed)
    print("Gerados: img/favicon.svg, img/og-cover.png e {} placeholders em img/obras/".format(len(OBRAS)))
    print("ATENÇÃO: os arquivos em img/obras/ são placeholders. Troque pelas obras reais.")
