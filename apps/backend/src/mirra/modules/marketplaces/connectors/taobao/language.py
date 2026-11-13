"""Fashion language helpers for Chinese marketplaces.

- ``translate_query``: English shopper query → Chinese Taobao query using a fashion glossary.
  Unknown words (usually brand names like "Carhartt") pass through unchanged, which Taobao search
  handles well. Deterministic and testable; an LLM translator can replace it later behind the same
  function signature.
- ``detect_category`` / ``detect_colors``: map Chinese or English listing text to Mirra's taxonomy.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from mirra.core.taxonomy import Category

# Longest phrases are matched first. Values are what Taobao sellers actually write.
_GLOSSARY: dict[str, str] = {
    # garments (phrases first)
    "zip-up hoodie": "拉链连帽卫衣",
    "zip up hoodie": "拉链连帽卫衣",
    "zip hoodie": "拉链连帽卫衣",
    "zip-up": "拉链开衫",
    "zip up": "拉链开衫",
    "baggy jeans": "宽松牛仔裤",
    "wide leg jeans": "阔腿牛仔裤",
    "wide-leg jeans": "阔腿牛仔裤",
    "straight jeans": "直筒牛仔裤",
    "cargo pants": "工装裤",
    "cargo trousers": "工装裤",
    "baggy pants": "宽松裤",
    "wide leg pants": "阔腿裤",
    "track pants": "运动裤",
    "puffer jacket": "羽绒服",
    "down jacket": "羽绒服",
    "bomber jacket": "飞行员夹克",
    "denim jacket": "牛仔外套",
    "leather jacket": "皮夹克",
    "varsity jacket": "棒球服",
    "work jacket": "工装夹克",
    "trench coat": "风衣",
    "t-shirt": "T恤",
    "t shirt": "T恤",
    "tee": "T恤",
    "long sleeve": "长袖T恤",
    "tank top": "背心",
    "button up": "衬衫",
    "button-up": "衬衫",
    "crew neck": "圆领",
    "high top": "高帮",
    "low top": "低帮",
    "bucket hat": "渔夫帽",
    "baseball cap": "棒球帽",
    "crossbody bag": "斜挎包",
    "tote bag": "托特包",
    "hoodie": "连帽卫衣",
    "sweatshirt": "卫衣",
    "sweater": "毛衣",
    "cardigan": "开衫",
    "knit": "针织",
    "jacket": "夹克",
    "coat": "大衣",
    "parka": "派克大衣",
    "vest": "马甲",
    "shirt": "衬衫",
    "jeans": "牛仔裤",
    "pants": "裤子",
    "trousers": "长裤",
    "joggers": "束脚裤",
    "sweatpants": "卫裤",
    "shorts": "短裤",
    "skirt": "半身裙",
    "dress": "连衣裙",
    "jumpsuit": "连体裤",
    "sneakers": "运动鞋",
    "trainers": "运动鞋",
    "boots": "靴子",
    "loafers": "乐福鞋",
    "shoes": "鞋",
    "sandals": "凉鞋",
    "slides": "拖鞋",
    "hat": "帽子",
    "cap": "棒球帽",
    "beanie": "毛线帽",
    "bag": "包",
    "backpack": "双肩包",
    "belt": "腰带",
    "sunglasses": "墨镜",
    "glasses": "眼镜",
    "watch": "手表",
    "necklace": "项链",
    "chain": "链条项链",
    "ring": "戒指",
    "bracelet": "手链",
    "earrings": "耳环",
    "scarf": "围巾",
    # fits & styles
    "oversized": "宽松",
    "oversize": "宽松",
    "baggy": "宽松",
    "loose": "宽松",
    "relaxed": "宽松",
    "slim": "修身",
    "skinny": "紧身",
    "cropped": "短款",
    "wide leg": "阔腿",
    "wide-leg": "阔腿",
    "straight": "直筒",
    "high waist": "高腰",
    "vintage": "复古",
    "retro": "复古",
    "streetwear": "街头",
    "street": "街头",
    "japanese": "日系",
    "korean": "韩系",
    "techwear": "机能风",
    "workwear": "工装",
    "minimalist": "极简",
    "minimal": "极简",
    "y2k": "Y2K",
    "preppy": "学院风",
    "gorpcore": "户外机能",
    "washed": "水洗",
    "distressed": "破洞",
    "graphic": "印花",
    "embroidered": "刺绣",
    "plaid": "格子",
    "striped": "条纹",
    "camo": "迷彩",
    "camouflage": "迷彩",
    "men's": "男",
    "mens": "男",
    "men": "男",
    "women's": "女",
    "womens": "女",
    "women": "女",
    "unisex": "男女同款",
    # materials
    "leather": "皮",
    "denim": "牛仔",
    "wool": "羊毛",
    "cashmere": "羊绒",
    "cotton": "纯棉",
    "linen": "亚麻",
    "nylon": "尼龙",
    "fleece": "抓绒",
    "corduroy": "灯芯绒",
    "suede": "麂皮",
    # colours
    "black": "黑色",
    "white": "白色",
    "off-white": "米白色",
    "grey": "灰色",
    "gray": "灰色",
    "charcoal": "深灰色",
    "navy": "藏青色",
    "blue": "蓝色",
    "light blue": "浅蓝色",
    "red": "红色",
    "burgundy": "酒红色",
    "green": "绿色",
    "olive": "橄榄绿",
    "khaki": "卡其色",
    "beige": "米色",
    "cream": "奶白色",
    "brown": "棕色",
    "camel": "驼色",
    "tan": "棕褐色",
    "pink": "粉色",
    "purple": "紫色",
    "yellow": "黄色",
    "orange": "橙色",
}

_STOPWORDS = {
    "a",
    "an",
    "the",
    "for",
    "with",
    "and",
    "or",
    "in",
    "of",
    "to",
    "me",
    "my",
    "find",
    "show",
    "i",
    "want",
    "need",
    "looking",
    "some",
    "that",
    "matches",
    "match",
    "goes",
    "under",
}

_PHRASES = sorted(_GLOSSARY, key=len, reverse=True)
_CJK = re.compile(r"[㐀-鿿]")


@dataclass(frozen=True)
class TranslatedQuery:
    original: str
    query: str
    translated: bool
    passthrough: list[str]


def translate_query(text: str) -> TranslatedQuery:
    """Translate an English fashion query to Chinese. Chinese input is returned unchanged."""
    original = text.strip()
    if not original or _CJK.search(original):
        return TranslatedQuery(original, original, False, [])
    rest = f" {original.lower()} "
    parts: list[str] = []
    for phrase in _PHRASES:
        pattern = re.compile(rf"(?<![\w-]){re.escape(phrase)}(?![\w-])")
        if pattern.search(rest):
            rest = pattern.sub(" ", rest)
            parts.append(_GLOSSARY[phrase])
    passthrough = [
        w for w in re.findall(r"[\w'&.-]+", rest) if w not in _STOPWORDS and not w.isdigit()
    ]
    # keep numbers like sizes/years; brand names stay in their original case
    case_map = {w.lower(): w for w in re.findall(r"[\w'&.-]+", original)}
    query = " ".join([*(case_map.get(w, w) for w in passthrough), *dict.fromkeys(parts)]).strip()
    return TranslatedQuery(original, query or original, bool(parts), passthrough)


# ---- listing text → taxonomy ----------------------------------------------------------------
# First match wins, so specific garments come before generic ones. Chinese terms are chosen so
# substrings don't collide (连帽 contains 帽, 包邮 contains 包).
_CATEGORY_RULES: list[tuple[re.Pattern[str], Category]] = [
    (re.compile(r"拉链卫衣|开衫卫衣|拉链连帽|zip[- ]?up|zip hoodie", re.I), Category.zip_up),
    (re.compile(r"羽绒服|大衣|风衣|派克|\b(coat|parka|puffer|trench)\b", re.I), Category.coat),
    (re.compile(r"夹克|外套|冲锋衣|棒球服|\b(jacket|bomber|windbreaker)\b", re.I), Category.jacket),
    (
        re.compile(r"连帽卫衣|卫衣连帽|连帽衫|\bhoodies?\b|\bhooded sweatshirt\b", re.I),
        Category.hoodie,
    ),
    (re.compile(r"卫衣|\bsweatshirts?\b|\bcrewneck\b", re.I), Category.sweatshirt),
    (re.compile(r"马甲|\bvests?\b|\bgilet\b", re.I), Category.vest),
    (
        re.compile(r"毛衣|针织衫|开衫|\b(sweaters?|cardigans?|knitwear|jumper)\b", re.I),
        Category.sweater,
    ),
    (re.compile(r"连衣裙|\bdress(es)?\b", re.I), Category.dress),
    (re.compile(r"连体裤|背带裤|\b(jumpsuit|overalls)\b", re.I), Category.jumpsuit),
    (re.compile(r"T恤|短袖|\bt-?shirts?\b|\btees?\b", re.I), Category.t_shirt),
    (re.compile(r"长袖", re.I), Category.long_sleeve),
    (re.compile(r"背心|吊带|\btank\b", re.I), Category.tank_top),
    (re.compile(r"衬衫|衬衣|\bshirts?\b|\bbutton[- ]?(up|down)\b", re.I), Category.shirt),
    (re.compile(r"工装裤|\bcargo\b", re.I), Category.cargo_pants),
    (
        re.compile(r"卫裤|运动裤|束脚裤|\b(sweatpants|joggers|track pants)\b", re.I),
        Category.sweatpants,
    ),
    (re.compile(r"短裤|\bshorts\b", re.I), Category.shorts),
    (re.compile(r"半身裙|百褶裙|\bskirts?\b", re.I), Category.skirt),
    (re.compile(r"牛仔裤|\bjeans\b|\bdenim pants\b", re.I), Category.jeans),
    (
        re.compile(r"阔腿裤|宽松裤|\b(baggy|wide[- ]leg) (pants|trousers)\b", re.I),
        Category.baggy_pants,
    ),
    (re.compile(r"西裤|休闲裤|长裤|裤子|\b(trousers|pants|chinos)\b", re.I), Category.trousers),
    (
        re.compile(
            r"运动鞋|板鞋|跑鞋|篮球鞋|帆布鞋|老爹鞋|\b(sneakers?|trainers?"
            r"|(basketball|running|skate|canvas|dad|tennis) shoes)\b",
            re.I,
        ),
        Category.sneakers,
    ),
    (re.compile(r"靴|\bboots?\b", re.I), Category.boots),
    (re.compile(r"凉鞋|拖鞋|\b(sandals?|slides|flip[- ]flops)\b", re.I), Category.sandals),
    (
        re.compile(r"皮鞋|乐福|德比|单鞋|\b(loafers?|derbies|oxfords?|shoes)\b", re.I),
        Category.shoes,
    ),
    (re.compile(r"毛线帽|针织帽|冷帽|\bbeanies?\b", re.I), Category.beanie),
    (re.compile(r"棒球帽|鸭舌帽|\b(caps?|baseball hat)\b", re.I), Category.cap),
    (re.compile(r"帽子|渔夫帽|礼帽|贝雷帽|\b(hats?|bucket hat|beret)\b", re.I), Category.hat),
    (re.compile(r"墨镜|眼镜|太阳镜|\b(sunglasses|glasses|eyewear)\b", re.I), Category.glasses),
    (re.compile(r"手表|腕表|\bwatch(es)?\b", re.I), Category.watch),
    (
        re.compile(
            r"项链|手链|戒指|耳环|耳钉|\b(necklace|bracelet|rings?|earrings?|jewelry|jewellery)\b",
            re.I,
        ),
        Category.jewelry,
    ),
    (re.compile(r"围巾|\bscarf\b", re.I), Category.scarf),
    (re.compile(r"腰带|皮带|\bbelts?\b", re.I), Category.belt),
    (
        re.compile(
            r"包包|背包|双肩包|斜挎包|单肩包|手提包|托特包|腋下包|钱包|\b(bags?|backpack|tote|purse|wallet)\b",
            re.I,
        ),
        Category.bag,
    ),
]


# Marketplace leaf categories are coarse (zip-up hoodies live under "Hoodies"); a title match in
# one of these more specific categories refines the category match.
REFINEMENTS: dict[Category, set[Category]] = {
    Category.hoodie: {Category.zip_up},
    Category.sweatshirt: {Category.hoodie, Category.zip_up},
    Category.jacket: {Category.zip_up, Category.vest},
    Category.sweater: {Category.vest},
    Category.trousers: {
        Category.cargo_pants,
        Category.baggy_pants,
        Category.jeans,
        Category.sweatpants,
    },
    Category.t_shirt: {Category.long_sleeve, Category.tank_top},
    Category.shoes: {Category.sneakers, Category.boots, Category.sandals},
    Category.hat: {Category.cap, Category.beanie},
}


def _match(text: str | None) -> Category | None:
    if not text:
        return None
    for rx, cat in _CATEGORY_RULES:
        if rx.search(text):
            return cat
    return None


def detect_category(*texts: str | None) -> Category | None:
    """Category from the first text that matches (pass leaf category names before the title);
    the last text (the title) may refine a coarse category into a more specific one."""
    found: Category | None = None
    for text in texts[:-1] if len(texts) > 1 else texts:
        found = _match(text)
        if found:
            break
    if len(texts) > 1:
        from_title = _match(texts[-1])
        if found is None:
            return from_title
        if from_title in REFINEMENTS.get(found, set()):
            return from_title
    return found


_COLOR_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"米白|奶白|\b(cream|ivory|off[- ]white)\b", re.I), "cream"),
    (re.compile(r"藏青|藏蓝|深蓝|\bnavy\b", re.I), "navy"),
    (re.compile(r"浅蓝|天蓝|\blight blue\b", re.I), "light blue"),
    (re.compile(r"军绿|橄榄|\bolive\b", re.I), "olive"),
    (re.compile(r"卡其|\bkhaki\b", re.I), "khaki"),
    (re.compile(r"酒红|\bburgundy\b|\bmaroon\b", re.I), "burgundy"),
    (re.compile(r"驼色|\bcamel\b", re.I), "camel"),
    (re.compile(r"深灰|炭灰|\bcharcoal\b", re.I), "charcoal"),
    (re.compile(r"黑|\bblack\b", re.I), "black"),
    (re.compile(r"白|\bwhite\b", re.I), "white"),
    (re.compile(r"灰|\bgr[ae]y\b", re.I), "grey"),
    (re.compile(r"蓝|\bblue\b", re.I), "blue"),
    (re.compile(r"红|\bred\b", re.I), "red"),
    (re.compile(r"绿|\bgreen\b", re.I), "green"),
    (re.compile(r"米色|杏色|\bbeige\b", re.I), "beige"),
    (re.compile(r"棕|咖啡|咖色|\bbrown\b", re.I), "brown"),
    (re.compile(r"粉|\bpink\b", re.I), "pink"),
    (re.compile(r"紫|\bpurple\b", re.I), "purple"),
    (re.compile(r"黄|\byellow\b", re.I), "yellow"),
    (re.compile(r"橙|\borange\b", re.I), "orange"),
]


def detect_colors(text: str | None) -> list[str]:
    """Colour names in order of first appearance, specific shades before base colours."""
    if not text:
        return []
    hits: list[tuple[int, str]] = []
    taken: list[tuple[int, int]] = []
    for rx, name in _COLOR_RULES:
        for m in rx.finditer(text):
            if any(a <= m.start() < b for a, b in taken):
                continue  # 米白 already claimed this 白
            taken.append((m.start(), m.end()))
            hits.append((m.start(), name))
    return list(dict.fromkeys(name for _, name in sorted(hits)))
