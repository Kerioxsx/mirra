"""Chinese size labels: what they mean, and which one fits a shopper.

Sources and how sure we are, per system (every reading says which basis it rests on):

* **GB/T 1335 codes** ("175/92A") are the Chinese national garment size standard (GB/T 1335.1
  men, GB/T 1335.2 women). The first number is the wearer's height in cm (号), the second the
  body girth in cm (型): chest for tops, waist for bottoms. The letter is the body type from the
  chest-minus-waist difference. These readings are ``standard``: they describe the body the
  garment is cut for, not the garment.
* **Letter sizes** (S, M, L, XL ...) have no national definition. The mapping used here is the one
  most Chinese hang tags print next to the code (men's M = 170/88A, women's M = 160/84A). Shops
  vary, so these readings are ``typical``.
* **Waist numbers** (26 to 38) on Taobao trousers are waist inches; "2尺2" is waist in 市尺
  (1 chi = 1/3 m). ``typical``.
* **Shoe numbers** (34 to 47) are EU-style; Chinese shoe charts commonly pair them with foot length
  as mm = 5 x size + 50 (42 = 260 mm). ``typical``.

Nothing here is a fit guarantee: the shop's own size chart wins, and the API says so.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

Kind = Literal["top", "bottom", "shoe", "unknown"]
Cut = Literal["mens", "womens", "unisex"]
System = Literal["gb_code", "letter", "waist_inches", "waist_chi", "eu_shoe", "one_size"]
Basis = Literal["standard", "typical"]

INCH_CM = 2.54
CHI_CM = 100 / 3

# chest minus waist (cm) for each body type, GB/T 1335.1-2008 (men) and 1335.2-2008 (women)
BODY_TYPES: dict[Cut, dict[str, tuple[int, int]]] = {
    "mens": {"Y": (17, 22), "A": (12, 16), "B": (7, 11), "C": (2, 6)},
    "womens": {"Y": (19, 24), "A": (14, 18), "B": (9, 13), "C": (4, 8)},
    "unisex": {"Y": (17, 24), "A": (12, 18), "B": (7, 13), "C": (2, 8)},
}

LETTERS = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]
_LETTER_ALIASES = {"XXL": "2XL", "XXXL": "3XL", "XXXXL": "4XL", "XXXXXL": "5XL"}

# (height cm, girth cm) printed beside each letter on typical Chinese hang tags
TYPICAL_TOPS: dict[Cut, dict[str, tuple[int, int]]] = {
    "mens": {
        "XS": (160, 80),
        "S": (165, 84),
        "M": (170, 88),
        "L": (175, 92),
        "XL": (180, 96),
        "2XL": (185, 100),
        "3XL": (190, 104),
        "4XL": (195, 108),
        "5XL": (200, 112),
    },
    "womens": {
        "XS": (150, 76),
        "S": (155, 80),
        "M": (160, 84),
        "L": (165, 88),
        "XL": (170, 92),
        "2XL": (175, 96),
        "3XL": (180, 100),
        "4XL": (185, 104),
        "5XL": (190, 108),
    },
}
TYPICAL_BOTTOMS: dict[Cut, dict[str, tuple[int, int]]] = {
    "mens": {
        "XS": (160, 68),
        "S": (165, 72),
        "M": (170, 76),
        "L": (175, 80),
        "XL": (180, 84),
        "2XL": (185, 88),
        "3XL": (190, 92),
        "4XL": (195, 96),
        "5XL": (200, 100),
    },
    "womens": {
        "XS": (150, 60),
        "S": (155, 64),
        "M": (160, 68),
        "L": (165, 72),
        "XL": (170, 76),
        "2XL": (175, 80),
        "3XL": (180, 84),
        "4XL": (185, 88),
        "5XL": (190, 92),
    },
}

ONE_SIZE_WORDS = ("均码", "one size", "free size", "onesize", "freesize")

_GB = re.compile(r"(?<!\d)(1[3-9]\d)\s*/\s*([5-9]\d|1[0-3]\d)\s*([YABC])?(?![\d/])", re.I)
_CHI = re.compile(r"([1-3])\s*尺\s*([0-9])?")
_LETTER = re.compile(r"(?<![A-Z0-9])((?:[2-5]X|X{0,5})L|XS|S|M)(?![A-Z0-9])", re.I)
_LETTER_RANGE = re.compile(
    r"(?<![A-Z0-9])((?:[2-5]X|X{0,5})L|XS|S|M)\s*(?:-|~|\u2013|to|至|到)\s*((?:[2-5]X|X{0,5})L|XS|S|M)(?![A-Z0-9])",
    re.I,
)
_NUM_RANGE = re.compile(
    r"(?<!\d)(2[4-9]|3[0-9]|4[0-8])\s*(?:-|~|\u2013|to|至|到)\s*(2[4-9]|3[0-9]|4[0-8])(?!\d)"
)
_SIZE_WORDS = re.compile(r"码|尺码|size|sizes|yards", re.I)


@dataclass(frozen=True)
class Body:
    """The body a label is cut for. Each value is an inclusive (low, high) range in cm or mm."""

    height_cm: tuple[float, float] | None = None
    chest_cm: tuple[float, float] | None = None
    waist_cm: tuple[float, float] | None = None
    foot_mm: tuple[float, float] | None = None


@dataclass(frozen=True)
class Reading:
    label: str
    system: System
    kind: Kind
    basis: Basis
    body: Body
    body_type: str | None = None
    cut: Cut | None = None
    note: str = ""


@dataclass
class Measurements:
    height_cm: float | None = None
    chest_cm: float | None = None
    waist_cm: float | None = None
    foot_mm: float | None = None

    def empty(self) -> bool:
        return all(v is None for v in (self.height_cm, self.chest_cm, self.waist_cm, self.foot_mm))


@dataclass
class Advice:
    label: str | None
    reason: str
    readings: list[Reading] = field(default_factory=list)


def normalise_letter(raw: str) -> str | None:
    s = raw.strip().upper()
    s = _LETTER_ALIASES.get(s, s)
    m = re.fullmatch(r"([2-5])XL", s)
    if m:
        return f"{m.group(1)}XL"
    return s if s in LETTERS else None


def _rng(center: float, step: float) -> tuple[float, float]:
    return (round(center - step / 2, 1), round(center + step / 2, 1))


def read_label(label: str, kind: Kind = "unknown", cut: Cut = "unisex") -> Reading | None:
    """Interpret one size label. Returns None for labels it does not recognise."""
    raw = label.strip()
    if not raw:
        return None
    lower = raw.lower()
    if any(w in lower for w in ONE_SIZE_WORDS):
        return Reading(
            label=raw,
            system="one_size",
            kind=kind,
            basis="typical",
            body=Body(),
            note="One size: cut to fit a range; check the shop's chart for its measurements.",
        )

    m = _GB.search(raw)
    if m:
        height = int(m.group(1))
        girth = int(m.group(2))
        bt = (m.group(3) or "").upper() or None
        k: Kind = kind if kind != "unknown" else ("bottom" if girth < 80 else "top")
        types = BODY_TYPES[cut]
        note = f"National size code: for a wearer about {height} cm tall with a {girth} cm " + (
            "waist." if k == "bottom" else "chest."
        )
        if bt and bt in types:
            lo, hi = types[bt]
            note += f" Body type {bt}: chest {lo} to {hi} cm larger than the waist."
        return Reading(
            label=raw,
            system="gb_code",
            kind=k,
            basis="standard",
            body=Body(
                height_cm=_rng(height, 5),
                chest_cm=_rng(girth, 4) if k != "bottom" else None,
                waist_cm=_rng(girth, 4) if k == "bottom" else None,
            ),
            body_type=bt,
            cut=cut,
            note=note,
        )

    m = _CHI.fullmatch(raw.replace(" ", ""))
    if m:
        chi = int(m.group(1)) + int(m.group(2) or 0) / 10
        waist = chi * CHI_CM
        return Reading(
            label=raw,
            system="waist_chi",
            kind="bottom",
            basis="typical",
            body=Body(waist_cm=_rng(round(waist, 1), 3.3)),
            note=f"Waist in chi (1 chi = 33.3 cm): about {waist:.0f} cm.",
        )

    letter = normalise_letter(raw)
    if letter:
        k = kind if kind in ("top", "bottom") else "top"
        table = TYPICAL_BOTTOMS if k == "bottom" else TYPICAL_TOPS
        cuts: list[Cut] = ["mens", "womens"] if cut == "unisex" else [cut]
        hs = [table[c][letter][0] for c in cuts]
        gs = [table[c][letter][1] for c in cuts]
        body = Body(
            height_cm=(min(hs) - 2.5, max(hs) + 2.5),
            chest_cm=(min(gs) - 2, max(gs) + 2) if k == "top" else None,
            waist_cm=(min(gs) - 2, max(gs) + 2) if k == "bottom" else None,
        )
        codes = " or ".join(f"{table[c][letter][0]}/{table[c][letter][1]}" for c in cuts)
        return Reading(
            label=raw,
            system="letter",
            kind=k,
            basis="typical",
            body=body,
            cut=cut,
            note=f"Usually printed as {codes} on Chinese tags; shops vary. Chinese letter sizes "
            "run smaller than US and EU ones.",
        )

    if re.fullmatch(r"\d{2}(?:\.5)?", raw):
        n = float(raw)
        # 34 to 38 could be a shoe or a waist: only the garment's kind can tell
        shoe = kind == "shoe" or (kind not in ("shoe", "bottom") and n >= 39)
        waist = kind == "bottom" or (kind not in ("shoe", "bottom") and n <= 33)
        if shoe and 34 <= n <= 48:
            mm = 5 * n + 50
            return Reading(
                label=raw,
                system="eu_shoe",
                kind="shoe",
                basis="typical",
                body=Body(foot_mm=(mm - 2.5, mm + 2.5)),
                note=f"EU-style shoe size; Chinese charts usually pair it with a {mm:.0f} mm "
                "foot length.",
            )
        if waist and 24 <= n <= 44:
            cm = n * INCH_CM
            return Reading(
                label=raw,
                system="waist_inches",
                kind="bottom",
                basis="typical",
                body=Body(waist_cm=_rng(round(cm, 1), INCH_CM)),
                note=f"Waist in inches: about {cm:.0f} cm.",
            )
    return None


def _expand_letters(a: str, b: str) -> list[str]:
    la, lb = normalise_letter(a), normalise_letter(b)
    if not la or not lb:
        return []
    i, j = LETTERS.index(la), LETTERS.index(lb)
    if i > j:
        i, j = j, i
    return LETTERS[i : j + 1]


def labels_in_text(text: str) -> list[str]:
    """Size labels a listing title mentions: national codes, letter ranges ("S-3XL"), number
    ranges next to a size word ("35-44码"), chi waists, one-size. In order, without repeats."""
    out: list[str] = []

    def add(x: str) -> None:
        if x not in out:
            out.append(x)

    for m in _GB.finditer(text):
        add(f"{m.group(1)}/{m.group(2)}{(m.group(3) or '').upper()}")
    for m in _LETTER_RANGE.finditer(text):
        for x in _expand_letters(m.group(1), m.group(2)):
            add(x)
    if _SIZE_WORDS.search(text):
        for m in _NUM_RANGE.finditer(text):
            lo, hi = sorted((int(m.group(1)), int(m.group(2))))
            if hi - lo <= 14:
                for n in range(lo, hi + 1):
                    add(str(n))
    for m in _CHI.finditer(text):
        add(f"{m.group(1)}尺{m.group(2) or ''}")
    lower = text.lower()
    if any(w in lower for w in ONE_SIZE_WORDS):
        add("One size")
    return out


def guess_cut(text: str) -> Cut:
    t = text.lower()
    men = "男" in text or re.search(r"\bmen'?s?\b|\bmale\b", t) is not None
    women = "女" in text or re.search(r"\bwomen'?s?\b|\bladies\b|\bfemale\b", t) is not None
    if men and not women:
        return "mens"
    if women and not men:
        return "womens"
    return "unisex"


def _distance(r: Reading, m: Measurements) -> tuple[float, list[str]] | None:
    """How far the shopper sits from a reading's body, in cm-equivalents (0 = inside every range).
    None when no measurement applies."""
    pairs: list[tuple[tuple[float, float] | None, float | None, float, str]] = [
        (r.body.chest_cm, m.chest_cm, 1.0, "chest"),
        (r.body.waist_cm, m.waist_cm, 1.0, "waist"),
        (r.body.foot_mm, m.foot_mm, 0.1, "foot"),
        (r.body.height_cm, m.height_cm, 0.35, "height"),
    ]
    total = 0.0
    used: list[str] = []
    for rng, value, weight, name in pairs:
        if rng is None or value is None:
            continue
        lo, hi = rng
        gap = 0.0 if lo <= value <= hi else min(abs(value - lo), abs(value - hi))
        total += gap * weight
        used.append(name)
    if not used:
        return None
    return total, used


def advise(labels: list[str], kind: Kind, cut: Cut, m: Measurements) -> Advice:
    readings = [r for r in (read_label(x, kind, cut) for x in labels) if r]
    if not readings:
        return Advice(None, "No size labels Mirra can read.", readings)
    if m.empty():
        return Advice(None, "Add your measurements to get a suggestion.", readings)
    scored = [(d, r) for r in readings if (d := _distance(r, m)) is not None]
    if not scored:
        return Advice(None, "Your measurements don't apply to these sizes.", readings)
    # the closest; on a tie the larger size (Chinese sizes run small)
    best_d, best = min(scored, key=lambda dr: (round(dr[0][0], 1), -readings.index(dr[1])))
    gap, used = best_d
    basis = "the national size code" if best.basis == "standard" else "a typical Chinese chart"
    fit = "fits your" if gap == 0 else "is the closest to your"
    named = " and ".join(used) if len(used) < 3 else ", ".join(used[:-1]) + " and " + used[-1]
    reason = f"{best.label} {fit} {named} on {basis}. An estimate: check the shop's size chart."
    return Advice(best.label, reason, readings)
