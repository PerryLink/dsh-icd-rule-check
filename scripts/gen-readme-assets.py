#!/usr/bin/env python3
"""README visuals for dsh-icd-rule-check — derived from the plugin's real pipeline.

Two figures, both read off the shipped material rather than a generic template:

  hero 1440×576 (Pillow, zh/en × light/dark → 4 webp)
      Left: kicker, plugin name, two value lines, two-line caveat, meta, footer.
      Right: one coded inpatient episode exactly as it appears in
      `samples/quickstart/input/IC-001-unsafe.json` — principal diagnosis,
      other diagnoses, principal procedure, admission condition, chief
      complaint. The principal-diagnosis cell is ringed because its "code" is a
      diagnosis name (IC-001, severity error); the chief complaint is ringed
      because it shares no two-character run with either diagnosis name
      (IC-008, severity info). The card below lists those two findings, the
      evidence→severity ceiling, and the sample run's own tally: 2 issues and
      10 skipped (`samples/quickstart/expected/result.json`).

  flow 1100×660 (hand-written SVG, light/dark)
      A staircase, not a row of five boxes: the record on the left feeds twelve
      rules arranged on three evidence shelves — direct (ceiling error),
      derived-from-principle (ceiling warn), institutional-configuration
      (ceiling info). Each chip carries the rule's own configured severity.
      Two channels leave to the right: `issues[]` (located by column) and
      `skipped[]` (each with its reason), and a green manifold joins both to
      the reviewer — the verdict is not in the report. No catalogue lookup, no
      compliance verdict, the original is never modified.

Facts come from the repository, not from imagination:
  rules/icd-rule-check.yaml        rule ids, severities, basis kinds, empty
                                   `pairs` / `correspondence`
  samples/quickstart/…             the record, 2 issues, 10 skipped
  tests/fixtures/IC-001/…          the failing "code" 急性心肌梗死
  src/check.ts                     every checker either adds an issue or
                                   reports itself in `skipped` with a reason
  src/view.ts                      report fields locator / found / expected /
                                   skipped, disclaimer

Run once:  python scripts/gen-readme-assets.py
Requires:  Pillow + Windows fonts msyh.ttc / msyhbd.ttc / consola.ttf
           (the sibling family skeleton is dsh-mask/scripts/gen-readme-assets.py;
           the figures below are specific to this plugin).
"""
from __future__ import annotations

import math
import os
from html import escape

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets")

FONT_CJK = r"C:\Windows\Fonts\msyh.ttc"
FONT_CJK_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"
FONT_MONO_BOLD = r"C:\Windows\Fonts\consolab.ttf"
for _p in (FONT_CJK, FONT_CJK_BOLD, FONT_MONO, FONT_MONO_BOLD):
    if not os.path.exists(_p):
        raise SystemExit(f"FATAL: font missing: {_p}")

RADIUS = 20
SHADOW = 24

SKIN = {
    "light": dict(
        bg_from="#f9f6fd", bg_to="#e4eaf8",
        card="#ffffff", card_edge="#e6e2ef",
        text="#141419", sub="#4d5261", faint="#8f94a4",
        accent="#4B67B4", accent2="#16a34a",
        pill="#ece7f9", band="#f5f2fb", grid="#e7e4f0",
        mark="#b42318", mark_bg="#fdeeec",
        info="#5a6478", info_bg="#eef0f5",
        shadow=(32, 26, 64), glow2="#7a68c9",
    ),
    "dark": dict(
        bg_from="#131a2a", bg_to="#0c1016",
        card="#1b2231", card_edge="#2e374b",
        text="#f0f3f9", sub="#a8b1c4", faint="#737b8d",
        accent="#8496f5", accent2="#3fb950",
        pill="#242d42", band="#202839", grid="#262f42",
        mark="#ff8f85", mark_bg="#2c1a1e",
        info="#98a2b3", info_bg="#232a38",
        shadow=(0, 0, 0), glow2="#8496f5",
    ),
}

# severity colour language used by both figures
SEV = {
    "light": {
        "error": ("#b42318", "#fdeeec"),
        "warn": ("#b45309", "#fdf3e9"),
        "info": ("#5a6478", "#eef0f5"),
    },
    "dark": {
        "error": ("#ff8f85", "#2c1a1e"),
        "warn": ("#d9a441", "#2a2216"),
        "info": ("#98a2b3", "#232a38"),
    },
}

FONT_FILES = {"cjk": FONT_CJK, "cjk_bold": FONT_CJK_BOLD,
              "mono": FONT_MONO, "mono_bold": FONT_MONO_BOLD}


def font(size: int, kind: str = "cjk_bold") -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_FILES[kind], size)


def hx(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def gradient(w: int, h: int, c1: str, c2: str) -> Image.Image:
    base = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(base)
    a, b = hx(c1), hx(c2)
    for y in range(h):
        t = 0.15 * (y / h) + 0.85 * (y / h) ** 1.35
        d.line([(0, y), (w, y)],
               fill=tuple(int(p + (q - p) * t) for p, q in zip(a, b)))
    return base


def glow(img: Image.Image, cx: int, cy: int, r: int, color: tuple,
         alpha: int = 40) -> Image.Image:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(9, 0, -1):
        rr = r * i / 9
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                  fill=color + (int(alpha * (1 - i / 10)),))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def card(img: Image.Image, box: tuple, s: dict, radius: int = RADIUS,
         shadow: int = SHADOW, fill: str | None = None,
         edge: str | None = None, width: int = 2) -> Image.Image:
    """A soft-shadowed rounded card on the gradient background."""
    x0, y0, x1, y1 = box
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for i in range(shadow, 0, -3):
        sd.rounded_rectangle([x0 - i // 5, y0 + i // 2, x1 + i // 5, y1 + i],
                             radius=radius + i // 5,
                             fill=s["shadow"] + (int(9 * (1 - i / shadow)),))
    base = Image.alpha_composite(img.convert("RGBA"),
                                 sh.filter(ImageFilter.GaussianBlur(11)))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle(box, radius=radius, fill=hx(fill or s["card"]),
                        outline=hx(edge or s["card_edge"]), width=width)
    return base.convert("RGB")


_SCRATCH = ImageDraw.Draw(Image.new("RGB", (8, 8)))


def measure(text: str, size: float, kind: str) -> float:
    return _SCRATCH.textlength(text, font=font(size, kind))


def require_w(text: str, size: float, kind: str, max_w: float,
              what: str) -> None:
    """Fail loudly instead of shipping a clipped label."""
    w = measure(text, size, kind)
    if w > max_w + 0.4:
        raise SystemExit(
            f"FATAL: {what} overflows: {text!r} needs {w:.1f}px > {max_w}px")


def fit(text: str, kind: str, max_w: float, start: int, minimum: int) -> int:
    size = start
    while size > minimum:
        if measure(text, size, kind) <= max_w:
            return size
        size -= 1
    raise SystemExit(
        f"FATAL: text does not fit {max_w}px at >= {minimum}px: {text!r}")


def fit_lines(lines: list[str], kind: str, max_w: float, start: int,
              minimum: int) -> int:
    return min(fit(t, kind, max_w, start, minimum) for t in lines)


def pill(img: Image.Image, xy: tuple[int, int], text: str, s: dict,
         size: int = 16, fg: str | None = None, bg: str | None = None,
         kind: str = "cjk_bold") -> tuple[int, int]:
    d = ImageDraw.Draw(img)
    f = font(size, kind)
    w = d.textlength(text, font=f)
    x, y = xy
    h = size + 20
    d.rounded_rectangle([x, y, x + w + 30, y + h], radius=h // 2,
                        fill=hx(bg or s["pill"]))
    d.text((x + 15, y + h / 2), text, font=f, fill=hx(fg or s["accent"]),
           anchor="lm")
    return int(x + w + 30), int(y + h)


def chip(img: Image.Image, xy: tuple[int, int], text: str, fg: str, bg: str,
         size: float = 11, kind: str = "cjk_bold", padx: int = 9,
         height: int = 20) -> int:
    d = ImageDraw.Draw(img)
    f = font(size, kind)
    w = d.textlength(text, font=f)
    x, y = xy
    d.rounded_rectangle([x, y, x + w + padx * 2, y + height],
                        radius=height // 2, fill=hx(bg))
    d.text((x + padx, y + height / 2), text, font=f, fill=hx(fg), anchor="lm")
    return int(w + padx * 2)


def dash_rect(d: ImageDraw.ImageDraw, box: tuple[float, float, float, float],
              color: str, width: int = 2, dash: int = 7,
              gap: int = 5) -> None:
    x0, y0, x1, y1 = box
    for a, b in (((x0, y0), (x1, y0)), ((x0, y1), (x1, y1)),
                 ((x0, y0), (x0, y1)), ((x1, y0), (x1, y1))):
        dist = math.hypot(b[0] - a[0], b[1] - a[1])
        if dist == 0:
            continue
        n = int(dist // (dash + gap)) + 1
        for i in range(n):
            t0 = min(i * (dash + gap) / dist, 1.0)
            t1 = min((i * (dash + gap) + dash) / dist, 1.0)
            if t0 >= 1:
                break
            d.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0),
                    (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)],
                   fill=hx(color), width=width)


def run_text(d: ImageDraw.ImageDraw, x: float, y: float,
             parts: list[tuple[str, float, str, str]], anchor: str = "ls") -> float:
    for text, size, kind, fill in parts:
        d.text((x, y), text, font=font(size, kind), fill=hx(fill), anchor=anchor)
        x += measure(text, size, kind)
    return x


# --------------------------------------------------------------------------- hero
# Every value below is an excerpt of this repository's own quickstart fixture
# and its expected result; see the module docstring for the mapping.
HERO = {
    "zh": dict(
        kicker="DeepSeek Harness 插件 · 核查器",
        value=["诊断与手术编码，逐份核对", "差在哪一行、哪一栏"],
        sub=["形式、重复、剑星成对、字段齐备——只列字面差异；",
             "不查编码目录、不判合规，结论留给编码员。"],
        meta="IC-001…IC-012 · 规则包即数据 · 严重级跟着依据走",
        foot="Apache-2.0 · PerryLink DSH plugin family",
        rec_title="住院病案首页 · 编码记录",
        rec_chip="只读原件",
        rec_sub="一次住院 · JSON / YAML · 字段名即 locator.column",
        headers=["栏 · 字段", "编码 / 值", "名称 / 备注"],
        rows=[
            ("主要诊断", "急性心肌梗死", "编码栏填的是诊断名称", "cjk", "error"),
            ("其他诊断", "I10", "高血压", "mono", None),
            ("主要手术", "36.0600", "冠状动脉支架植入术", "mono", None),
            ("入院病情", "I21.900 → 1", "IC-006 按编码查", "mono", None),
            ("主诉", "突发胸痛 3 小时", "IC-008 字面比对", "cjk", "info"),
        ],
        rec_note="† / * 先剥离再做形式核对：A18.1† → A18.1；原件只读，永不修改。",
        issues_title="差异清单 issues[]",
        issues_chip="2 条",
        issues=[
            ("IC-001", "error", "主要诊断", "「急性心肌梗死」不是 ICD-10 编码"),
            ("IC-008", "info", "主诉", "与诊断名称无两字以上重叠"),
        ],
        skip_title="skipped[]",
        skip_chip="10 条",
        skip_rows=["IC-003 · pairs 未配置", "IC-005 · correspondence 空"],
        skip_foot="空的差异清单不读成通过",
        cap_title="严重级跟着依据走",
        cap_line="direct ≤ error · 原则性条款 ≤ warn · 本机构配置 ≤ info",
        strip_l="issues 2 条 · skipped 10 条",
        strip_r="结论留给编码员",
    ),
    "en": dict(
        kicker="DeepSeek Harness plugin · checker",
        value=["Check one coded episode", "locate every difference"],
        sub=["Form, duplicates, †/* pairing, completeness —",
             "literal differences only; no catalogue lookup."],
        meta="IC-001…IC-012 · rules are data · severity follows evidence",
        foot="Apache-2.0 · PerryLink DSH plugin family",
        rec_title="Inpatient record · coded episode",
        rec_chip="read-only",
        rec_sub="one episode · JSON / YAML · field names become locator.column",
        headers=["Field · column", "Code / value", "Name / note"],
        rows=[
            ("Principal dx", "急性心肌梗死", "the code column holds a name", "cjk", "error"),
            ("Other dx", "I10", "高血压", "mono", None),
            ("Principal proc.", "36.0600", "冠状动脉支架植入术", "mono", None),
            ("Admission", "I21.900 → 1", "IC-006 looks it up", "mono", None),
            ("Chief complaint", "突发胸痛 3 小时", "IC-008 literal compare", "cjk", "info"),
        ],
        rec_note="† / * are stripped before the form check (A18.1† → A18.1); the original is read-only.",
        issues_title="Differences issues[]",
        issues_chip="2 found",
        issues=[
            ("IC-001", "error", "Principal dx", "「急性心肌梗死」 is not an ICD-10 code"),
            ("IC-008", "info", "Chief complaint", "no 2-char run shared with names"),
        ],
        skip_title="skipped[]",
        skip_chip="10",
        skip_rows=["IC-003 · pairs not configured", "IC-005 · correspondence empty"],
        skip_foot="an empty diff list is not a pass",
        cap_title="Severity follows the evidence",
        cap_line="direct ≤ error · principle ≤ warn · institution ≤ info",
        strip_l="issues 2 · skipped 10",
        strip_r="the verdict stays human",
    ),
}


def hero(lang: str, skin: str) -> None:
    s = SKIN[skin]
    H = HERO[lang]
    W, HT = 1440, 576
    img = gradient(W, HT, s["bg_from"], s["bg_to"])
    img = glow(img, 1160, 20, 430, hx(s["accent"]),
               22 if skin == "light" else 36)
    img = glow(img, 70, 580, 300, hx(s["glow2"]),
               10 if skin == "light" else 16)

    d = ImageDraw.Draw(img)
    m = 64
    col_w = 596

    # ---- left column: kicker / title / value / sub / meta / footer -----------
    pill(img, (m, 40), H["kicker"], s, size=17)
    d = ImageDraw.Draw(img)

    title_size = fit("dsh-icd-rule-check", "mono_bold", col_w, 58, 48)
    d.text((m - 2, 130), "dsh-icd-rule-check",
           font=font(title_size, "mono_bold"), fill=hx(s["text"]))

    vf = fit_lines(H["value"], "cjk_bold", col_w, 42, 34)
    for i, line in enumerate(H["value"]):
        require_w(line, vf, "cjk_bold", col_w, "hero value")
        d.text((m, 218 + i * 56), line, font=font(vf, "cjk_bold"),
               fill=hx(s["text"]))

    for i, line in enumerate(H["sub"]):
        require_w(line, 22, "cjk", col_w, "hero sub")
        d.text((m + 1, 350 + i * 34), line, font=font(22, "cjk"),
               fill=hx(s["sub"]))

    require_w(H["meta"], 19, "cjk", col_w, "hero meta")
    require_w(H["foot"], 16, "cjk", col_w, "hero footer")
    d.text((m + 1, 444), H["meta"], font=font(19, "cjk"), fill=hx(s["faint"]))
    d.line([m + 1, 486, m + col_w - 4, 486], fill=hx(s["grid"]), width=2)
    d.text((m + 1, 506), H["foot"], font=font(16, "cjk"), fill=hx(s["faint"]))

    # ---- right: the coded episode card --------------------------------------
    img = card(img, (700, 36, 1376, 324), s, radius=22, shadow=SHADOW)
    d = ImageDraw.Draw(img)
    d.text((724, 76), H["rec_title"], font=font(17, "cjk_bold"),
           fill=hx(s["text"]), anchor="ls")
    cw = measure(H["rec_chip"], 10.5, "cjk")
    chip(img, (1352 - int(cw) - 18, 50), H["rec_chip"], s["accent"], s["pill"],
         size=10.5)
    d = ImageDraw.Draw(img)
    d.text((724, 99), H["rec_sub"], font=font(12.5, "cjk"),
           fill=hx(s["faint"]), anchor="ls")
    require_w(H["rec_sub"], 12.5, "cjk", 628, "record subline")

    # table header band
    d.rounded_rectangle([716, 102, 1360, 126], radius=9, fill=hx(s["band"]))
    for x, head in ((724, H["headers"][0]), (846, H["headers"][1]),
                    (1010, H["headers"][2])):
        d.text((x, 119), head, font=font(11, "cjk_bold"), fill=hx(s["sub"]),
               anchor="ls")
    for r in range(1, 5):
        y = 128 + r * 34
        d.line([724, y, 1352, y], fill=hx(s["grid"]), width=1)

    row_h = 34
    for r, (label, value, note, kind, sev) in enumerate(H["rows"]):
        y = 128 + r * row_h + 23
        require_w(label, 12, "cjk", 108, "record label")
        d.text((724, y), label, font=font(12, "cjk"), fill=hx(s["text"]),
               anchor="ls")
        vkind = "cjk" if kind == "cjk" else "mono"
        require_w(value, 13, vkind, 150, "record value")
        if sev is None:
            d.text((846, y), value, font=font(13, vkind), fill=hx(s["text"]),
                   anchor="ls")
        else:
            fg, bg = SEV[skin][sev]
            vw = measure(value, 13, vkind)
            d.rounded_rectangle([838, y - 16, 846 + vw + 11, y + 8], radius=9,
                                fill=hx(bg))
            dash_rect(d, (838, y - 16, 846 + vw + 11, y + 8), fg, width=2,
                      dash=6, gap=4)
            d.text((846, y), value, font=font(13, vkind), fill=hx(fg),
                   anchor="ls")
        nf = font(11, "cjk") if lang == "zh" else font(10.5, "cjk")
        require_w(note, 10.5 if lang == "en" else 11, "cjk", 334,
                  "record note")
        d.text((1010, y), note, font=nf,
               fill=hx(s["faint"] if r else s["sub"]), anchor="ls")
    d.text((724, 317), H["rec_note"], font=font(11.5, "cjk"),
           fill=hx(s["faint"]), anchor="ls")
    require_w(H["rec_note"], 11.5, "cjk", 628, "record footer")

    # ---- right: the two findings -------------------------------------------
    img = card(img, (700, 336, 1376, 440), s, radius=20, shadow=20)
    d = ImageDraw.Draw(img)
    d.text((724, 366), H["issues_title"], font=font(16.5, "cjk_bold"),
           fill=hx(s["text"]), anchor="ls")
    cw = measure(H["issues_chip"], 10.5, "cjk")
    chip(img, (1352 - int(cw) - 18, 350), H["issues_chip"], s["accent"],
         s["pill"], size=10.5)
    d = ImageDraw.Draw(img)
    for i, (rid, sev, locator, text) in enumerate(H["issues"]):
        y = 400 + i * 30
        fg, bg = SEV[skin][sev]
        d.text((724, y), rid, font=font(12, "mono_bold"), fill=hx(fg),
               anchor="ls")
        x = 724 + measure(rid, 12, "mono_bold") + 8
        w = chip(img, (int(x), y - 14), sev, fg, bg, size=9.5, kind="mono_bold",
                 padx=7, height=18)
        d = ImageDraw.Draw(img)
        x += w + 10
        require_w(locator, 10.5, "cjk", 110, "issue locator")
        d.text((x, y), locator, font=font(10.5, "cjk"), fill=hx(s["sub"]),
               anchor="ls")
        x += measure(locator, 10.5, "cjk") + 12
        require_w(text, 12.5, "cjk", 1352 - x, "issue text")
        d.text((x, y), text, font=font(12.5, "cjk"), fill=hx(s["text"]),
               anchor="ls")

    # ---- right: severity ceiling + run tally --------------------------------
    img = card(img, (700, 452, 1376, 500), s, radius=18, shadow=16)
    d = ImageDraw.Draw(img)
    d.text((724, 474), H["cap_title"], font=font(12.5, "cjk_bold"),
           fill=hx(s["accent"]), anchor="ls")
    require_w(H["cap_line"], 11.5, "cjk", 620, "severity ceiling")
    d.text((724, 494), H["cap_line"], font=font(11.5, "cjk"),
           fill=hx(s["sub"]), anchor="ls")

    img = card(img, (700, 510, 1376, 556), s, radius=18, shadow=16,
               edge=s["accent"], width=2)
    d = ImageDraw.Draw(img)
    require_w(H["strip_l"], 13, "cjk", 430, "tally left")
    d.text((724, 542), H["strip_l"], font=font(13, "cjk"),
           fill=hx(s["text"]), anchor="ls")
    rw = measure(H["strip_r"], 13, "cjk_bold")
    d.text((1352 - rw, 542), H["strip_r"], font=font(13, "cjk_bold"),
           fill=hx(s["accent2"]), anchor="ls")

    name = f"dsh-icd-rule-check-hero-{lang}-{skin}.webp"
    img.save(os.path.join(OUT, name), "WEBP", quality=92, method=6)
    print(f"wrote {name} ({W}×{HT})")


# --------------------------------------------------------------------------- flow
FLOW = {
    "light": dict(
        bg_from="#f9f6fd", bg_to="#e4eaf8",
        panel="#ffffff", edge="#e6e2ef", band="#f5f2fb", band_alt="#faf8fe",
        text="#141419", sub="#4d5261", faint="#8f94a4",
        accent="#4B67B4", accent2="#16a34a", rule="#dcd8ea",
        card="#ffffff", shadow="0.10",
    ),
    "dark": dict(
        bg_from="#131a2a", bg_to="#0c1016",
        panel="#1b2231", edge="#2e374b", band="#202839", band_alt="#1e2534",
        text="#f0f3f9", sub="#a8b1c4", faint="#737b8d",
        accent="#8496f5", accent2="#3fb950", rule="#2b3348",
        card="#1b2231", shadow="0.45",
    ),
}

FONT_CSS_CJK = ("'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',"
                "'Source Han Sans SC',sans-serif")
FONT_CSS_MONO = ("'Consolas','SFMono-Regular','Menlo',ui-monospace,monospace")

# The twelve rules of rules/icd-rule-check.yaml, in the order the pack lists
# them, with the severity the pack gives and the evidence kind that sets the
# ceiling. `pairs: []` (IC-003) and `correspondence: []` (IC-005) ship empty.
TIERS = [
    dict(cap="≤ error", sev="error", en="direct", zh="直接条款",
         rules=[("IC-001", "error"), ("IC-003", "error"), ("IC-005", "warn"),
                ("IC-007", "error"), ("IC-009", "error"), ("IC-011", "error")],
         caption="读：编码形态 · 剑星配对 · 主诊断栏 · 手术编码"),
    dict(cap="≤ warn", sev="warn", en="derived-from-principle", zh="原则性条款",
         rules=[("IC-002", "warn"), ("IC-006", "warn"), ("IC-008", "info"),
                ("IC-012", "warn")],
         caption="读：诊断重复 · 入院病情 · 主诉与名称 · 第十八章"),
    dict(cap="≤ info", sev="info", en="institutional-configuration",
         zh="本机构配置",
         rules=[("IC-004", "info"), ("IC-010", "info")],
         caption="读：星号形式开关 · 诊断名称开关"),
]

# (field key, Chinese label, value, second column, value font, ring severity)
RECORD = [
    ("principalDiagnosis", "主要诊断", "急性心肌梗死", "急性心肌梗死", "cjk", "error"),
    ("otherDiagnoses[]", "其他诊断", "I10", "高血压", "mono", None),
    ("principalProcedure", "主要手术", "36.0600", "冠状动脉支架植入术", "mono", None),
    ("otherProcedures[]", "其他手术", "[]", "空", "mono", None),
    ("chiefComplaint", "主诉", "突发胸痛 3 小时", "", "cjk", "info"),
    ("admissionCondition", "入院病情", "I21.900 → 1", "", "mono", None),
]


class Svg:
    """Tiny SVG writer that measures every label before it is emitted."""

    def __init__(self) -> None:
        self.parts: list[str] = []
        self.overflows: list[str] = []

    def add(self, markup: str) -> None:
        self.parts.append(markup)

    def _measure(self, content: str, size: float, mono: bool,
                 weight: int | None) -> float:
        kind = ("mono" if mono else "cjk") + ("_bold" if weight else "")
        if mono and weight:
            kind = "mono_bold"
        return measure(content, size, kind)

    def text(self, x: float, y: float, content: str, size: float, fill: str, *,
             anchor: str = "start", weight: int | None = None,
             mono: bool = False, max_w: float | None = None,
             opacity: float | None = None) -> None:
        if max_w is not None:
            w = self._measure(content, size, mono, weight)
            if w > max_w + 0.4:
                self.overflows.append(
                    f"{content!r} needs {w:.1f}px > {max_w}px")
        family = FONT_CSS_MONO if mono else FONT_CSS_CJK
        attrs = [f'x="{x}"', f'y="{y}"', f'fill="{fill}"',
                 f'font-family="{family}"', f'font-size="{size}"']
        if anchor != "start":
            attrs.append(f'text-anchor="{anchor}"')
        if weight:
            attrs.append(f'font-weight="{weight}"')
        if opacity is not None:
            attrs.append(f'opacity="{opacity}"')
        self.add(f'<text {" ".join(attrs)}>{escape(content)}</text>')

    def run(self, x: float, y: float,
            parts: list[tuple[str, float, str, bool, int | None]],
            max_w: float | None = None) -> float:
        """Draw mono/CJK runs in sequence, advancing by measured width."""
        for content, size, fill, mono, weight in parts:
            kind = ("mono" if mono else "cjk") + ("_bold" if weight else "")
            if mono and weight:
                kind = "mono_bold"
            self.text(x, y, content, size, fill, mono=mono, weight=weight)
            x += measure(content, size, kind)
        if max_w is not None and x > max_w + 0.4:
            self.overflows.append(f"run ends at {x:.1f}px > {max_w}px")
        return x

    def rect(self, x: float, y: float, w: float, h: float, *, fill: str,
             rx: float = 0, stroke: str | None = None, sw: float = 1.5,
             shadow: bool = False, dash: str | None = None,
             opacity: float | None = None) -> None:
        attrs = [f'x="{x}"', f'y="{y}"', f'width="{w}"', f'height="{h}"']
        if rx:
            attrs.append(f'rx="{rx}"')
        attrs.append(f'fill="{fill}"')
        if stroke:
            attrs.append(f'stroke="{stroke}"')
            attrs.append(f'stroke-width="{sw}"')
        if dash:
            attrs.append(f'stroke-dasharray="{dash}"')
        if opacity is not None:
            attrs.append(f'opacity="{opacity}"')
        if shadow:
            attrs.append('filter="url(#soft)"')
        self.add(f'<rect {" ".join(attrs)}/>')

    def line(self, x1: float, y1: float, x2: float, y2: float, *, stroke: str,
             sw: float = 1.5, dash: str | None = None,
             marker: str | None = None, opacity: float | None = None) -> None:
        attrs = [f'x1="{x1}"', f'y1="{y1}"', f'x2="{x2}"', f'y2="{y2}"',
                 f'stroke="{stroke}"', f'stroke-width="{sw}"']
        if dash:
            attrs.append(f'stroke-dasharray="{dash}"')
        if marker:
            attrs.append(f'marker-end="url(#{marker})"')
        if opacity is not None:
            attrs.append(f'opacity="{opacity}"')
        self.add(f'<line {" ".join(attrs)}/>')

    def path(self, d: str, *, stroke: str, sw: float = 1.5,
             marker: str | None = None, dash: str | None = None,
             fill: str = "none") -> None:
        attrs = [f'd="{d}"', f'fill="{fill}"', f'stroke="{stroke}"',
                 f'stroke-width="{sw}"', 'stroke-linecap="round"']
        if dash:
            attrs.append(f'stroke-dasharray="{dash}"')
        if marker:
            attrs.append(f'marker-end="url(#{marker})"')
        self.add(f'<path {" ".join(attrs)}/>')

    def chip(self, x: float, y: float, label: str, fg: str, bg: str, *,
             size: float = 11, pad: float = 9, height: float = 20,
             mono: bool = False, weight: int | None = None,
             stroke: str | None = None, rx: float | None = None) -> float:
        """A left-anchored pill; returns its right edge."""
        kind = ("mono" if mono else "cjk") + ("_bold" if weight else "")
        if mono and weight:
            kind = "mono_bold"
        w = measure(label, size, kind) + pad * 2
        self.rect(x, y, w, height, fill=bg, rx=height / 2 if rx is None else rx,
                  stroke=stroke, sw=1.2)
        self.text(x + pad, y + height / 2 + size * 0.34, label, size, fg,
                  weight=weight, mono=mono)
        return x + w

    def chip_right(self, x_right: float, y: float, label: str, fg: str,
                   bg: str, *, size: float = 11, pad: float = 9,
                   height: float = 20, mono: bool = False,
                   weight: int | None = None) -> float:
        kind = ("mono" if mono else "cjk") + ("_bold" if weight else "")
        if mono and weight:
            kind = "mono_bold"
        w = measure(label, size, kind) + pad * 2
        self.chip(x_right - w, y, label, fg, bg, size=size, pad=pad,
                  height=height, mono=mono, weight=weight)
        return x_right - w

    def svg(self, w: int, h: int, label: str) -> str:
        head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" '
                f'height="{h}" viewBox="0 0 {w} {h}" role="img" '
                f'aria-label="{escape(label)}">')
        return "\n".join([head, *self.parts, "</svg>"]) + "\n"


def flow_svg(skin: str) -> str:
    s = FLOW[skin]
    sev = SEV[skin]
    W, H = 1100, 660
    v = Svg()

    v.add("<defs>")
    v.add(f'<linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">'
          f'<stop offset="0" stop-color="{s["bg_from"]}"/>'
          f'<stop offset="1" stop-color="{s["bg_to"]}"/></linearGradient>')
    v.add(f'<filter id="soft" x="-30%" y="-30%" width="160%" height="170%">'
          f'<feDropShadow dx="0" dy="7" stdDeviation="9" '
          f'flood-color="#16122c" flood-opacity="{s["shadow"]}"/></filter>')
    v.add('<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" '
          'markerWidth="6.4" markerHeight="6.4" orient="auto-start-reverse">'
          f'<path d="M0 0 L10 5 L0 10 z" fill="{s["accent"]}"/></marker>')
    v.add('<marker id="arr2" viewBox="0 0 10 10" refX="9" refY="5" '
          'markerWidth="6.2" markerHeight="6.2" orient="auto-start-reverse">'
          f'<path d="M0 0 L10 5 L0 10 z" fill="{s["accent2"]}"/></marker>')
    v.add("</defs>")
    v.add(f'<rect width="{W}" height="{H}" fill="url(#bg)"/>')

    # ---- header -------------------------------------------------------------
    v.text(44, 58, "dsh-icd-rule-check", 28, s["text"], weight=700, mono=True,
           max_w=620)
    v.text(44, 86,
           "一份编码记录 → 12 条规则按依据分三层 → issues[] 与 skipped[] 两条清单 → 编码员复核",
           15, s["sub"], max_w=812)
    v.chip_right(1056, 36, "规则包 2026.1 · 12 条", s["accent"], s["band"],
                 size=12, pad=12, height=26)

    # ---- record panel -------------------------------------------------------
    v.rect(44, 112, 272, 428, fill=s["panel"], rx=20, stroke=s["edge"],
           sw=1.5, shadow=True)
    v.text(62, 136, "记录 IcdInput", 11.5, s["accent"], weight=700, mono=True,
           max_w=120)
    v.chip_right(300, 125, "示例 · 只读", s["accent"], s["band"], size=11,
                 pad=8, height=19)
    v.text(62, 154, "字段名即 locator.column", 11, s["faint"], max_w=220)

    y = 180
    for key, label, value, second, kind, ring in RECORD:
        v.text(62, y, label, 11, s["sub"], max_w=80)
        v.text(62 + measure(label, 11, "cjk") + 7, y, key, 11, s["faint"],
               mono=True, max_w=300)
        vy = y + 22
        vkind = "cjk" if kind == "cjk" else "mono"
        vsize = 13
        vw = measure(value, vsize, "mono" if kind == "mono" else "cjk")
        if ring is not None:
            fg, bg = sev[ring]
            v.rect(57, vy - 15, vw + 14, 23, fill=bg, rx=8)
            v.rect(57, vy - 15, vw + 14, 23, fill="none", rx=8, stroke=fg,
                   sw=1.6, dash="6 4")
            v.text(64, vy, value, vsize, fg, mono=(kind == "mono"))
        else:
            v.text(62, vy, value, vsize, s["text"], mono=(kind == "mono"))
        if second:
            v.text(170, vy, second, 11.5, s["sub"], max_w=128)
        y += 56
    v.text(62, 504, "† / * 先剥离：A18.1† → A18.1", 11, s["faint"], max_w=238)
    v.text(62, 522, "原件只读 · 永不修改", 11, s["faint"], max_w=238)

    # ---- the three evidence shelves (staircase) -----------------------------
    v.text(340, 132, "规则台 · 12 条规则，依据决定封顶", 12.5, s["sub"],
           weight=700, max_w=320)

    for i, tier in enumerate(TIERS):
        x = 340 + 20 * i
        y0 = 146 + 116 * i
        fg, bg = sev[tier["sev"]]
        v.rect(x, y0, 800 - x, 104, fill=s["panel"], rx=16, stroke=s["edge"],
               sw=1.5, shadow=True)
        v.rect(x + 1, y0 + 14, 4, 76, fill=fg, rx=2)
        cap_end = v.chip(x + 16, y0 + 11, tier["cap"], fg, bg, size=11,
                         pad=8, height=20, weight=700, stroke=fg)
        en_w = measure(tier["en"], 13, "mono_bold")
        v.text(cap_end + 10, y0 + 29, tier["en"], 13, s["accent"],
               weight=700, mono=True, max_w=300)
        dot_x = cap_end + 10 + en_w + 7
        v.text(dot_x, y0 + 29, "·", 13, s["faint"], max_w=20)
        v.text(dot_x + measure("·", 13, "cjk") + 7, y0 + 29, tier["zh"], 13,
               s["sub"], max_w=200)
        cx = x + 16
        for rid, rsev in tier["rules"]:
            rfg, rbg = sev[rsev]
            cx = v.chip(cx, y0 + 47, rid, rfg, rbg, size=13, pad=8,
                        height=24, mono=True, weight=700, stroke=rfg) + 6
        if cx - 6 > 800 - 16:
            v.overflows.append(f"tier {i} chips end at {cx - 7:.1f}px")
        v.text(x + 16, y0 + 89, tier["caption"], 11, s["faint"],
               max_w=800 - x - 32)

    # ---- note under the shelves --------------------------------------------
    v.rect(340, 496, 460, 44, fill=s["band"], rx=14, stroke=s["edge"], sw=1.2)
    v.text(356, 514,
           "命中 → issues[]；前置条件不满足 → skipped[] 并写明原因。",
           11, s["sub"], max_w=430)
    v.text(356, 532,
           "三层 = 依据类型（左上角为封顶）；chip 颜色 = 该条自身的严重级。",
           11, s["faint"], max_w=430)

    # ---- two output channels ------------------------------------------------
    v.rect(830, 112, 226, 184, fill=s["panel"], rx=18, stroke=s["edge"],
           sw=1.5, shadow=True)
    v.text(846, 140, "issues[]", 15, s["text"], weight=700, mono=True,
           max_w=120)
    v.chip_right(1040, 124, "2 条", s["accent"], s["band"], size=11, pad=8,
                 height=19)
    v.text(846, 160, "locator · found · expected", 11, s["faint"], mono=True,
           max_w=194)

    issues = [("IC-001", "error", "主要诊断", "「急性心肌梗死」非 ICD-10 形式"),
              ("IC-008", "info", "主诉", "与诊断名称无两字以上重叠")]
    for i, (rid, rsev, locator, text) in enumerate(issues):
        fg, bg = sev[rsev]
        y = 188 + i * 48
        v.text(846, y, rid, 13, fg, weight=700, mono=True, max_w=60)
        x = 846 + measure(rid, 13, "mono_bold") + 6
        x = v.chip(x, y - 13, rsev, fg, bg, size=10.5, pad=6, height=18,
                   mono=True, weight=700, stroke=fg) + 8
        v.text(x, y, locator, 11, s["sub"], max_w=1040 - x)
        v.text(846, y + 20, text, 13, s["text"], max_w=198)
    v.text(846, 280, "只定位，不下结论", 11, s["faint"], max_w=194)

    v.rect(830, 312, 226, 124, fill=s["panel"], rx=18, stroke=s["edge"],
           sw=1.5, shadow=True)
    v.text(846, 338, "skipped[]", 15, s["sub"], weight=700, mono=True,
           max_w=120)
    v.chip_right(1040, 324, "10 条", s["sub"], s["band"], size=11, pad=8,
                 height=19)
    v.text(846, 358, "每条都写明原因", 11, s["faint"], max_w=194)
    v.text(846, 384, "IC-003 · pairs 未配置", 12.5, s["text"], max_w=194)
    v.text(846, 404, "IC-005 · correspondence 空", 12.5, s["text"], max_w=194)
    v.text(846, 426, "空的差异清单不读成通过", 11, s["faint"], max_w=194)

    v.rect(830, 452, 226, 88, fill=s["panel"], rx=18, stroke=s["accent2"],
           sw=1.8, shadow=True)
    v.text(846, 478, "编码员复核", 14, s["text"], weight=700, max_w=140)
    v.text(846, 500, "issues 与 skipped 一起读", 11, s["sub"], max_w=194)
    v.text(846, 518, "结论不在报告里", 11, s["accent2"], weight=700,
           max_w=194)
    v.text(846, 535, "原件永不修改", 11, s["faint"], max_w=194)

    # ---- connectors: record → shelves; shelves → two lists; lists → human ---
    v.path("M316 198 H328 V430", stroke=s["accent"], sw=1.6)
    v.line(328, 198, 338, 198, stroke=s["accent"], sw=1.6, marker="arr")
    v.line(328, 314, 358, 314, stroke=s["accent"], sw=1.6, marker="arr")
    v.line(328, 430, 378, 430, stroke=s["accent"], sw=1.6, marker="arr")

    for y in (198, 314, 430):
        v.line(800, y, 806, y, stroke=s["accent"], sw=1.6)
    v.path("M806 430 V180", stroke=s["accent"], sw=1.6)
    v.line(806, 180, 828, 180, stroke=s["accent"], sw=1.6, marker="arr")
    v.line(806, 374, 828, 374, stroke=s["accent"], sw=1.6, marker="arr")

    v.path("M1056 240 H1070 V496 H1058", stroke=s["accent2"], sw=1.6,
           marker="arr2")
    v.line(1056, 400, 1070, 400, stroke=s["accent2"], sw=1.6)

    # ---- footer -------------------------------------------------------------
    v.line(44, 564, 1056, 564, stroke=s["rule"], sw=1)
    v.text(44, 588,
           "条款逐字引用：excerpt ≥ 8 字符；依据为原则或本机构配置的规则不得标 error；空 issues ≠ 没问题。",
           11.5, s["sub"], max_w=1012)
    v.text(44, 612,
           "config：rulesFile · disabledRules · onlyRules · skipNotes · timeoutMs ｜ 只读材料 · 无网络 · 不调用模型。",
           11.5, s["faint"], max_w=1012)

    if v.overflows:
        raise SystemExit("FATAL: SVG label overflow:\n  " + "\n  ".join(v.overflows))
    return v.svg(W, H, "dsh-icd-rule-check structure: one coded episode feeds "
                       "twelve rules on three evidence shelves with severity "
                       "ceilings; issues[] and skipped[] leave to the reviewer")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for lang in ("zh", "en"):
        for skin in ("light", "dark"):
            hero(lang, skin)
    for skin in ("light", "dark"):
        with open(os.path.join(OUT, f"dsh-icd-rule-check-flow-v5-{skin}.svg"),
                  "w", encoding="utf-8", newline="\n") as fh:
            fh.write(flow_svg(skin))
    print("wrote 6 assets to docs/assets/ (4 hero webp + 2 flow-v5 svg)")


if __name__ == "__main__":
    main()
