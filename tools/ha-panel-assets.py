"""Generate the baked SVG art for apps/ha-panel.

The panel's large numerals use InterDisplay Bold at sizes the packaged text
slots do not cover (56 px clock, 44 px percentage), so each glyph is exported
as a filled outline. Icons are Material Design Icons paths (the set Home
Assistant uses) with elliptical arcs rewritten as cubics, because PocketJS's
SVG baker accepts only M/L/H/V/C/S/Q/T/Z.

  mise x uv -- uv run --no-project --with fonttools --with svgelements \
    python tools/ha-panel-assets.py --font <InterDisplay-Bold.ttf>

Writes apps/ha-panel/art/*.svg and apps/ha-panel/ui/art.ts. Do not edit the
outputs by hand.
"""

import argparse
import math
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
import svgelements

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "apps" / "ha-panel"
ART = APP / "art"

TEXT = "#e1e1e1"
SECONDARY = "#9b9b9b"
PRIMARY = "#03a9f4"
PAGE = "#111111"
DIM = "#6f6f6f"
WHITE = "#ffffff"
ON = "#ffc107"
CLOUD = "#cfd3d8"
RAIN = "#4fc3f7"

# Tabular figures keep the clock from shifting as digits change; the case
# colon sits at figure mid-height.
GLYPHS = {**{str(d): f"{['zero','one','two','three','four','five','six','seven','eight','nine'][d]}.tf" for d in range(10)},
          ":": "colon.case.tf", "%": "percent"}
NAMES = {**{str(d): str(d) for d in range(10)}, ":": "colon", "%": "percent"}
SIZES = (56, 44)


def fmt(value: float) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return "0" if text == "-0" else text


def svg(width: float, height: float, view: str, body: str) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{fmt(width)}" height="{fmt(height)}" '
            f'viewBox="{view}">\n{body}\n</svg>\n')


def no_arcs(d: str) -> str:
    path = svgelements.Path(d)
    path.approximate_arcs_with_cubics()
    out = path.d()
    if "A" in out or "a" in out:
        raise ValueError(f"arc survived conversion: {d}")
    return out


def digits(font_path: Path) -> list[str]:
    font = TTFont(font_path)
    glyphs = font.getGlyphSet()
    upem = font["head"].unitsPerEm
    cap = font["OS/2"].sCapHeight
    lines = []
    for size in SIZES:
        scale = size / upem
        pad = round(2 / scale)
        top = cap + pad
        height_px = math.ceil((cap + 2 * pad) * scale)
        height_units = height_px / scale
        entries = []
        for char, glyph_name in GLYPHS.items():
            glyph = glyphs[glyph_name]
            width_px = round(glyph.width * scale)
            width_units = width_px / scale
            pen = SVGPathPen(glyphs, ntos=lambda v: fmt(v))
            # Flip font units (y up, baseline 0) into SVG space (y down).
            glyph.draw(TransformPen(pen, (1, 0, 0, -1, (width_units - glyph.width) / 2, top)))
            body = f'<path fill="{TEXT}" d="{pen.getCommands()}"/>'
            name = f"num{size}-{NAMES[char]}.svg"
            (ART / name).write_text(svg(width_px, height_px, f"0 0 {fmt(width_units)} {fmt(height_units)}", body))
            entries.append((char, name, width_px))
        table = ", ".join(f'"{c}": {{ src: "art/{n}", width: {w} }}' for c, n, w in entries)
        lines.append(f"  {size}: {{ height: {height_px}, glyphs: {{ {table} }} }},")
    return lines


MDI = {
    "home": "M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z",
    "cog": ("M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97"
            "C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73"
            "L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42"
            "C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05"
            "C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12"
            "C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95"
            "L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58"
            "L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27"
            "C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"),
    "bulb": ("M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74"
             "C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z"),
    "wifi": ("M12,21L15.6,16.2C14.6,15.45 13.35,15 12,15C10.65,15 9.4,15.45 8.4,16.2L12,21M12,3C7.95,3 4.21,4.34 1.2,6.6"
             "L3,9C5.5,7.12 8.62,6 12,6C15.38,6 18.5,7.12 21,9L22.8,6.6C19.79,4.34 16.05,3 12,3M12,9C9.3,9 6.81,9.89 4.8,11.4"
             "L6.6,13.8C8.1,12.67 9.97,12 12,12C14.03,12 15.9,12.67 17.4,13.8L19.2,11.4C17.19,9.89 14.7,9 12,9Z"),
    "power": ("M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88"
              "L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M13,3H11V13H13Z"),
    "back": "M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z",
    "chevron": "M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z",
}

CLOUD_PATH = "M7 20a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 11a4.5 4.5 0 0 1 0 9z"
SMALL_CLOUD = "M7 16a4.5 4.5 0 0 1-.54-8.96A5.4 5.4 0 0 1 16.9 7.4a4 4 0 0 1 .1 8.6z"


def icon(name: str, size: int, paths: list[tuple[str, str]]) -> str:
    body = "\n".join(f'<path fill="{color}" d="{no_arcs(d)}"/>' for color, d in paths)
    (ART / name).write_text(svg(size, size, "0 0 24 24", body))
    return name


def sun(cx: float, cy: float, radius: float, ray: float) -> str:
    rays = []
    for i in range(8):
        angle = i * math.pi / 4
        def point(r: float, offset: float) -> str:
            return f"{fmt(cx + r * math.cos(angle) - offset * math.sin(angle))} {fmt(cy + r * math.sin(angle) + offset * math.cos(angle))}"
        inner, outer, half = radius + 1.4, radius + 1.4 + ray, 0.8
        rays.append(f"M{point(inner, -half)}L{point(outer, -half)}L{point(outer, half)}L{point(inner, half)}Z")
    disc = f"M{fmt(cx - radius)} {fmt(cy)}a{fmt(radius)} {fmt(radius)} 0 1 0 {fmt(2 * radius)} 0a{fmt(radius)} {fmt(radius)} 0 1 0 {fmt(-2 * radius)} 0z"
    return disc + "".join(rays)


def drops(color: str) -> list[tuple[str, str]]:
    return [(color, f"M{x} 17.5l1.4 0-1.4 4-1.4 0z") for x in (8.5, 12.5, 16.5)]


def icons() -> list[str]:
    made = []
    for color_name, color in (("text", TEXT), ("secondary", SECONDARY), ("primary", PRIMARY), ("page", PAGE)):
        for key, size in (("home", 24), ("cog", 24), ("bulb", 24), ("wifi", 20), ("power", 28), ("back", 24), ("chevron", 16)):
            made.append(icon(f"{key}-{color_name}.svg", size, [(color, MDI[key])]))
    # Bulbs also show a lit (amber) and an unavailable (dim) state.
    made.append(icon("bulb-on.svg", 24, [(ON, MDI["bulb"])]))
    made.append(icon("bulb-dim.svg", 24, [(DIM, MDI["bulb"])]))
    disc = lambda cx, cy, r: f"M{cx - r} {cy}a{r} {r} 0 1 0 {2 * r} 0a{r} {r} 0 1 0 {-2 * r} 0z"
    made.append(icon("weather-sunny.svg", 40, [(ON, sun(12, 12, 4.5, 3))]))
    made.append(icon("weather-night.svg", 40, [(ON, "M14.5 3a9 9 0 1 0 6.5 13.4a7 7 0 1 1-6.5-13.4z")]))
    made.append(icon("weather-partly.svg", 40, [(ON, disc(9, 8, 4)), (CLOUD, CLOUD_PATH)]))
    made.append(icon("weather-cloudy.svg", 40, [(CLOUD, CLOUD_PATH)]))
    made.append(icon("weather-rainy.svg", 40, [(CLOUD, SMALL_CLOUD), *drops(RAIN)]))
    made.append(icon("weather-snowy.svg", 40, [(CLOUD, SMALL_CLOUD), *[(TEXT, disc(x, 19.5, 1.3)) for x in (8, 12, 16)]]))
    made.append(icon("weather-storm.svg", 40, [(CLOUD, SMALL_CLOUD), (ON, "M12.5 14.5l-3 5h2.4l-1.2 4 3.8-5.6h-2.4l1.6-3.4z")]))
    return made


def qr_placeholder() -> str:
    """A QR-shaped placeholder for the provisioning page: finder patterns plus
    seeded modules, like the design mock. It encodes nothing; the real code
    comes with softAP provisioning."""
    n, seed, modules = 29, 7, []
    def finder(a: int, b: int) -> bool:
        return any(a0 <= a < a0 + 7 and b0 <= b < b0 + 7 for a0, b0 in ((0, 0), (0, n - 7), (n - 7, 0)))
    for i in range(n):
        for j in range(n):
            seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
            if not finder(i, j) and seed % 100 < 48:
                modules.append(f"M{j} {i}h1v1h-1z")
    for a, b in ((0, 0), (0, n - 7), (n - 7, 0)):
        modules.append(f"M{b} {a}h7v7h-7zM{b + 1} {a + 1}v5h5v-5zM{b + 2} {a + 2}h3v3h-3z")
    body = f'<path fill="{WHITE}" d="M0 0h{n}v{n}h-{n}z"/>\n<path fill="#000000" d="{"".join(modules)}"/>'
    name = "qr-placeholder.svg"
    (ART / name).write_text(svg(200, 200, f"0 0 {n} {n}", body))
    return name


def dimmer_masks() -> list[str]:
    paths = {
        "dimmer-mask-top.svg": ('M28 0H104C119.46 0 132 12.54 132 28H0 '
                                'C0 12.54 12.54 0 28 0Z'),
        "dimmer-mask-bottom.svg": ('M0 0H132C132 15.46 119.46 28 104 28H28 '
                                   'C12.54 28 0 15.46 0 0Z'),
    }
    names = []
    for name, inner in paths.items():
        body = f'<path fill="{PAGE}" fill-rule="evenodd" d="M0 0H132V28H0Z {inner}"/>'
        (ART / name).write_text(svg(132, 28, "0 0 132 28", body))
        names.append(name)
    return names


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--font", required=True, type=Path, help="InterDisplay-Bold.ttf")
    args = parser.parse_args()
    ART.mkdir(exist_ok=True)
    for old in ART.glob("*.svg"):
        old.unlink()
    numerals = digits(args.font)
    made = icons() + [qr_placeholder(), *dimmer_masks()]
    names = sorted(made)
    lines = [
        "// Generated by tools/ha-panel-assets.py; do not edit.",
        "// Image sources must be literal strings so the compiler packs them.",
        "",
        "export const NUMERALS = {",
        *numerals,
        "} as const;",
        "",
        "export const ICONS = {",
        *[f'  "{n[:-4]}": "art/{n}",' for n in names],
        "} as const;",
        "",
        "export type IconName = keyof typeof ICONS;",
        "",
    ]
    (APP / "ui" / "art.ts").write_text("\n".join(lines))
    print(f"wrote {len(list(ART.glob('*.svg')))} svg files and ui/art.ts")


if __name__ == "__main__":
    main()
