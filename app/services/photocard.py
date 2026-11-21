"""
포토카드 합성 (photocard)

역할: 캐릭터 정보와 일러스트를 100×148mm(300dpi) 세로 풀아트 홀로그램 카드 PNG 한 장으로 합성한다.
비고: SELPHY CP1500 엽서 크기(100×148mm)에 맞췄다. 인쇄는 아직 연결하지 않았고 파일로만 저장한다.
      템플릿 구성: 일러스트가 카드 전체를 채우고, 무지개 홀로 포일 테두리와 광택·반짝이를 겹친 뒤,
      위쪽에 이름·종족·대표 능력치, 아래쪽 유리 패널에 고유 능력·능력치·럭키 아이템·2027년 메시지·등급·카드 번호를 얹는다.
      반짝이 위치는 카드 번호로 정해서 카드마다 다르게 나온다. 같은 번호면 늘 같은 카드가 나온다.
      한글 글꼴은 CARD_FONT 환경변수로 바꿀 수 있다. 지정하지 않으면 macOS 기본 글꼴을 찾아 쓴다.

수정 이력:
  - 2026-11-22 최초 작성
  - 2026-11-22 트레이딩 카드 디자인으로 변경 (대표 능력치, 고유 능력 칸, 카드 번호, 등급 별)
  - 2026-11-22 풀아트 홀로그램 템플릿으로 변경 (전면 일러스트, 홀로 포일 테두리, 반짝이, 유리 패널, 1/1 표기)
"""

import colorsys
import io
import math
import os
import random
import zlib
from functools import lru_cache

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

from app.schemas import CharacterResponse

# 100×148mm @ 300dpi
WIDTH, HEIGHT = 1181, 1748
FRAME = 30  # 홀로 포일 테두리 두께
RADIUS = 56
PAD = 72  # 카드 가장자리에서 글자까지
CONTENT = WIDTH - PAD * 2

WHITE = (255, 255, 255)
SHADOW = (12, 8, 24)
GOLD = (255, 214, 120)

STAT_LABELS = {
    "insight": "통찰",
    "vitality": "생명력",
    "resonance": "공명",
    "agility": "민첩",
    "willpower": "의지",
    "luck": "행운",
}

# 별 개수: (등급 이름, 등급 색)
RARITIES = {
    1: ("RARE", (170, 220, 255)),
    2: ("EPIC", (220, 170, 255)),
    3: ("LEGEND", (255, 214, 120)),
}

FONT_CANDIDATES = (
    os.path.expanduser("~/Library/Fonts/PretendardVariable.ttf"),
    "/Library/Fonts/PretendardVariable.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
)


def _font_path() -> str:
    custom = os.getenv("CARD_FONT")
    if custom:
        return custom
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return path
    raise RuntimeError("한글 글꼴을 찾지 못했어요. .env 에 CARD_FONT 경로를 지정해 주세요")


@lru_cache(maxsize=32)
def _font(size: int, weight: int = 400) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(_font_path(), size)
    try:
        # 가변 글꼴이면 굵기를 맞춘다. 일반 글꼴은 이 단계를 건너뛴다.
        font.set_variation_by_axes([weight])
    except OSError:
        pass
    return font


# ---------- 글자 배치 ----------


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, width: int) -> list[str]:
    """띄어쓰기 단위로 줄을 바꾸고, 한 단어가 너무 길면 글자 단위로 자른다."""
    lines: list[str] = []
    for paragraph in text.splitlines() or [""]:
        line = ""
        for word in paragraph.split(" "):
            candidate = f"{line} {word}" if line else word
            if draw.textlength(candidate, font=font) <= width:
                line = candidate
                continue
            if line:
                lines.append(line)
            line = ""
            for char in word:
                if draw.textlength(line + char, font=font) > width and line:
                    lines.append(line)
                    line = char
                else:
                    line += char
        lines.append(line)
    return lines


def _fit(draw, text: str, font, width: float) -> str:
    """한 줄에 들어가도록 줄이고, 잘리면 말줄임표를 붙인다."""
    if draw.textlength(text, font=font) <= width:
        return text
    while text and draw.textlength(text + "…", font=font) > width:
        text = text[:-1]
    return text + "…"


def _paragraph(draw, xy, text, font, width, fill, *, max_lines: int, spacing: float = 1.42) -> int:
    """문단을 그리고 다음 y 좌표를 돌려준다. 넘치는 줄은 말줄임표로 끝낸다."""
    x, y = xy
    lines = _wrap(draw, text, font, width)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = _fit(draw, lines[-1] + "…", font, width)
    line_height = round(font.size * spacing)
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += line_height
    return y


def _outlined(draw, xy, text, font, fill=WHITE, *, stroke=4, anchor="la") -> None:
    """일러스트 위에서도 읽히도록 어두운 외곽선을 두른 글자"""
    draw.text(xy, text, font=font, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=SHADOW)


# ---------- 홀로그램 재료 ----------


def _rainbow(size: tuple[int, int], *, angle_turns: float = 1.6, offset: float = 0.0) -> Image.Image:
    """대각선으로 색이 흐르는 무지개 판. 홀로 포일의 바탕이다."""
    small = (size[0] // 6 + 1, size[1] // 6 + 1)
    image = Image.new("RGB", small)
    pixels = image.load()
    span = small[0] + small[1]
    for y in range(small[1]):
        for x in range(small[0]):
            t = (x * 0.8 + y) / span
            # 물결을 섞어 포일이 구겨진 듯 빛이 번지게 한다
            hue = (t * angle_turns + offset + 0.06 * math.sin(x * 0.09 + y * 0.05)) % 1.0
            r, g, b = colorsys.hsv_to_rgb(hue, 0.55, 1.0)
            pixels[x, y] = (round(r * 255), round(g * 255), round(b * 255))
    return image.resize(size, Image.BICUBIC)


def _gloss(size: tuple[int, int]) -> Image.Image:
    """비스듬히 지나가는 빛줄기 (L 채널, 밝을수록 강하게 빛난다)"""
    width, height = size
    band = Image.new("L", (width + height, 1))
    for x in range(width + height):
        t = x / (width + height)
        value = 0.0
        for center, spread, strength in ((0.32, 0.05, 150), (0.40, 0.012, 200), (0.70, 0.04, 90)):
            value += strength * math.exp(-(((t - center) / spread) ** 2))
        band.putpixel((x, 0), min(255, round(value)))
    band = band.resize((width + height, height))
    # 한 줄짜리 빛을 기울여 대각선으로 만든다
    return band.transform(size, Image.AFFINE, (1, 0.55, 0, 0, 1, 0), Image.BICUBIC)


def _sparkle(draw, center, radius, fill) -> None:
    """네 갈래로 빛나는 반짝이"""
    cx, cy = center
    thin = radius * 0.18
    draw.polygon(
        [(cx, cy - radius), (cx + thin, cy - thin), (cx + radius, cy), (cx + thin, cy + thin),
         (cx, cy + radius), (cx - thin, cy + thin), (cx - radius, cy), (cx - thin, cy - thin)],
        fill=fill,
    )


def _star(draw, center, radius, fill) -> None:
    cx, cy = center
    points = []
    for i in range(10):
        r = radius if i % 2 == 0 else radius * 0.45
        angle = -math.pi / 2 + i * math.pi / 5
        points.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    draw.polygon(points, fill=fill)


def _vertical_fade(size, stops: list[tuple[float, int]]) -> Image.Image:
    """위에서 아래로 투명도가 바뀌는 마스크. stops는 (0~1 위치, 0~255 진하기)"""
    column = Image.new("L", (1, size[1]))
    for y in range(size[1]):
        t = y / max(size[1] - 1, 1)
        for (t0, a0), (t1, a1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                column.putpixel((0, y), round(a0 + (a1 - a0) * (t - t0) / max(t1 - t0, 1e-6)))
                break
    return column.resize(size)


def _rounded_mask(size, radius, inset=0) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (inset, inset, size[0] - 1 - inset, size[1] - 1 - inset), radius=max(radius - inset, 0), fill=255
    )
    return mask


def _cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """비율을 유지한 채 카드 크기에 꽉 차게 자른다. 머리가 잘리지 않도록 위쪽을 더 남긴다."""
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize((math.ceil(image.width * scale), math.ceil(image.height * scale)), Image.LANCZOS)
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 4
    return resized.crop((left, top, left + size[0], top + size[1]))


def rarity(character: CharacterResponse) -> int:
    """가장 높은 능력치로 등급(별 1~3개)을 정한다. 능력치 합계는 모두 같아서 우열이 아니라 개성의 크기다."""
    top = max(character.stats.model_dump().values())
    return 3 if top >= 80 else 2 if top >= 65 else 1


# ---------- 합성 ----------


def compose_card(
    character: CharacterResponse, illustration_png: bytes, card_id: str = ""
) -> bytes:
    size = (WIDTH, HEIGHT)
    seed = zlib.crc32((card_id or character.name).encode())
    rng = random.Random(seed)
    stats = character.stats.model_dump()
    top_key = max(stats, key=stats.get)
    stars = rarity(character)
    rarity_name, rarity_color = RARITIES[stars]

    # 1) 전면 일러스트
    card = _cover(Image.open(io.BytesIO(illustration_png)).convert("RGB"), size)

    # 2) 홀로 광택: 무지개를 은은하게 덮고, 비스듬한 빛줄기를 더한다
    rainbow = _rainbow(size, offset=rng.random())
    holo = ImageChops.screen(card, rainbow)
    card = Image.composite(holo, card, Image.new("L", size, 46 + 20 * stars))
    gloss = _gloss(size)
    card = Image.composite(ImageChops.screen(card, rainbow), card, gloss)

    # 3) 글자가 읽히도록 위아래를 어둡게
    shade = Image.new("RGB", size, SHADOW)
    card = Image.composite(
        shade, card, _vertical_fade(size, [(0, 175), (0.17, 0), (0.55, 0), (0.68, 205), (1, 235)])
    )
    card = card.convert("RGBA")

    # 4) 반짝이 (번진 빛 + 선명한 심)
    sparkles = Image.new("RGBA", size, (0, 0, 0, 0))
    sparkle_draw = ImageDraw.Draw(sparkles)
    points = []
    while len(points) < 18 + 8 * stars:
        x, y = rng.uniform(FRAME + 20, WIDTH - FRAME - 20), rng.uniform(FRAME + 20, HEIGHT * 0.66)
        # 이름과 대표 능력치 글자 위에는 반짝이를 올리지 않는다
        if y < FRAME + 300 and (x < WIDTH * 0.55 or x > WIDTH * 0.62):
            continue
        points.append((x, y, rng.uniform(8, 30)))
    for x, y, r in points:
        sparkle_draw.ellipse((x - r * 1.2, y - r * 1.2, x + r * 1.2, y + r * 1.2), fill=(255, 255, 255, 70))
    sparkles = sparkles.filter(ImageFilter.GaussianBlur(10))
    sparkle_draw = ImageDraw.Draw(sparkles)
    for x, y, r in points:
        _sparkle(sparkle_draw, (x, y), r, (255, 255, 255, 235))
    card.alpha_composite(sparkles)

    # 5) 홀로 포일 테두리 + 안쪽 가는 금선
    foil = ImageChops.screen(_rainbow(size, angle_turns=3.2, offset=rng.random()), Image.new("RGB", size, (60, 60, 70)))
    ring = ImageChops.subtract(_rounded_mask(size, RADIUS), _rounded_mask(size, RADIUS, FRAME))
    card.paste(foil, (0, 0), ring)
    ui = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(ui)
    draw.rounded_rectangle(
        (FRAME, FRAME, WIDTH - FRAME, HEIGHT - FRAME), radius=RADIUS - FRAME, outline=(*GOLD, 255), width=4
    )
    draw.rounded_rectangle((2, 2, WIDTH - 3, HEIGHT - 3), radius=RADIUS, outline=(255, 255, 255, 160), width=3)

    # 6) 위쪽: 등급, 이름, 종족 · 속성 / 오른쪽에 대표 능력치와 속성 문장(紋章)
    y = FRAME + 34
    rarity_font = _font(26, 800)
    rarity_text = f"{rarity_name}"
    star_x = PAD
    for _ in range(stars):
        _star(draw, (star_x + 13, y + 15), 14, (*rarity_color, 255))
        star_x += 32
    _outlined(draw, (star_x + 8, y + 15), rarity_text, rarity_font, rarity_color, stroke=3, anchor="lm")

    emblem_r = 50
    emblem_c = (WIDTH - PAD - emblem_r, y + 74)
    halo = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse(
        (emblem_c[0] - 76, emblem_c[1] - 76, emblem_c[0] + 76, emblem_c[1] + 76), fill=(*rarity_color, 150)
    )
    ui.alpha_composite(halo.filter(ImageFilter.GaussianBlur(18)))
    emblem = Image.new("L", size, 0)
    ImageDraw.Draw(emblem).ellipse(
        (emblem_c[0] - emblem_r, emblem_c[1] - emblem_r, emblem_c[0] + emblem_r, emblem_c[1] + emblem_r), fill=255
    )
    ui.paste(_rainbow(size, angle_turns=5, offset=0.3).convert("RGBA"), (0, 0), emblem)
    draw = ImageDraw.Draw(ui)
    draw.ellipse(
        (emblem_c[0] - emblem_r, emblem_c[1] - emblem_r, emblem_c[0] + emblem_r, emblem_c[1] + emblem_r),
        outline=(255, 255, 255, 255),
        width=5,
    )
    _outlined(draw, emblem_c, character.element[:1], _font(48, 900), WHITE, stroke=3, anchor="mm")

    number_font, label_font = _font(72, 900), _font(28, 800)
    number = str(stats[top_key])
    number_right = emblem_c[0] - emblem_r - 20
    _outlined(draw, (number_right, y + 112), number, number_font, anchor="rs")
    label_right = number_right - draw.textlength(number, font=number_font) - 10
    _outlined(draw, (label_right, y + 104), STAT_LABELS[top_key], label_font, GOLD, stroke=3, anchor="rs")

    name_font = _font(80, 900)
    name_room = label_right - draw.textlength(STAT_LABELS[top_key], font=label_font) - PAD - 24
    _outlined(draw, (PAD, y + 120), _fit(draw, character.name, name_font, name_room), name_font, stroke=6, anchor="ls")
    _outlined(
        draw,
        (PAD, y + 140),
        _fit(draw, f"{character.race} · {character.element} 속성", _font(30, 700), CONTENT),
        _font(30, 700),
        (235, 230, 255),
        stroke=3,
    )

    # 7) 아래쪽 유리 패널
    panel_top = HEIGHT - FRAME - 566
    panel = (FRAME + 26, panel_top, WIDTH - FRAME - 26, HEIGHT - FRAME - 26)
    glass = Image.new("RGBA", size, (0, 0, 0, 0))
    glass_draw = ImageDraw.Draw(glass)
    glass_draw.rounded_rectangle(panel, radius=34, fill=(20, 14, 40, 150), outline=(255, 255, 255, 90), width=2)
    ui.alpha_composite(glass)
    draw = ImageDraw.Draw(ui)

    # 고유 능력: 홀로 배지 + 능력 이름 + 위력
    y = panel_top + 30
    badge_font = _font(24, 800)
    badge = (PAD, y, PAD + 132, y + 44)
    badge_mask = Image.new("L", size, 0)
    ImageDraw.Draw(badge_mask).rounded_rectangle(badge, radius=22, fill=255)
    ui.paste(_rainbow(size, angle_turns=4, offset=0.55).convert("RGBA"), (0, 0), badge_mask)
    draw = ImageDraw.Draw(ui)
    draw.text(((badge[0] + badge[2]) / 2, y + 22), "고유 능력", font=badge_font, fill=SHADOW, anchor="mm")

    power_font = _font(64, 900)
    power = str(stats[top_key] + stats["willpower"] // 2)
    power_width = draw.textlength(power, font=power_font)
    ability_font = _font(40, 800)
    draw.text(
        (badge[2] + 18, y + 22),
        _fit(draw, character.ability, ability_font, CONTENT - (badge[2] - PAD) - 18 - power_width - 24),
        font=ability_font,
        fill=WHITE,
        anchor="lm",
    )
    draw.text((WIDTH - PAD, y + 48), power, font=power_font, fill=GOLD, anchor="rs")
    y += 70
    _paragraph(draw, (PAD, y), character.disposition, _font(28, 500), CONTENT, (225, 220, 245), max_lines=2)
    y += 2 * 40 + 18

    # 능력치: 유리 칸 6개
    gap = 12
    cell = (CONTENT - gap * 5) / 6
    for index, (key, label) in enumerate(STAT_LABELS.items()):
        x0 = PAD + index * (cell + gap)
        highlight = key == top_key
        draw.rounded_rectangle(
            (x0, y, x0 + cell, y + 96),
            radius=16,
            fill=(255, 255, 255, 60 if highlight else 28),
            outline=(*GOLD, 255) if highlight else (255, 255, 255, 70),
            width=3 if highlight else 2,
        )
        draw.text((x0 + cell / 2, y + 14), label, font=_font(22, 700), fill=(210, 205, 235), anchor="ma")
        draw.text(
            (x0 + cell / 2, y + 44), str(stats[key]), font=_font(38, 900), fill=GOLD if highlight else WHITE, anchor="ma"
        )
    y += 96 + 22

    # 럭키 아이템
    lucky_label = _font(26, 800)
    draw.text((PAD, y), "LUCKY", font=lucky_label, fill=GOLD)
    offset = draw.textlength("LUCKY", font=lucky_label) + 18
    draw.text(
        (PAD + offset, y), _fit(draw, character.lucky_item, _font(28, 600), CONTENT - offset), font=_font(28, 600), fill=WHITE
    )
    y += 52

    # 2027년 메시지: 왼쪽에 홀로 막대
    message_end = _paragraph(
        draw,
        (PAD + 22, y),
        f"2027년의 너에게 — {character.message_2027}",
        _font(26, 500),
        CONTENT - 22,
        (240, 236, 255),
        max_lines=3,
    )
    bar = Image.new("L", size, 0)
    ImageDraw.Draw(bar).rounded_rectangle((PAD, y + 2, PAD + 6, message_end - 10), radius=3, fill=255)
    ui.paste(_rainbow(size, angle_turns=6).convert("RGBA"), (0, 0), bar)
    draw = ImageDraw.Draw(ui)

    # 꼬리말: 팀 이름 / 부스 이름 / 카드 번호 · 1/1
    footer_y = panel[3] - 34
    footer_font = _font(22, 800)
    draw.text((PAD, footer_y), "ai-dentity", font=footer_font, fill=(210, 205, 235), anchor="lm")
    draw.text((WIDTH / 2, footer_y), "이게 나라고?", font=footer_font, fill=(210, 205, 235), anchor="mm")
    serial = f"No.{card_id[:4].upper()} · 1/1" if card_id else "1/1"
    draw.text((WIDTH - PAD, footer_y), serial, font=footer_font, fill=GOLD, anchor="rm")

    card.alpha_composite(ui)
    # 테두리 바깥 모서리는 흰색으로 둔다 (인쇄 후 잘라도 깔끔하도록)
    final = Image.new("RGB", size, WHITE)
    final.paste(card.convert("RGB"), (0, 0), _rounded_mask(size, RADIUS))

    output = io.BytesIO()
    final.save(output, format="PNG", dpi=(300, 300))
    return output.getvalue()
