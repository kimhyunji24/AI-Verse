"""
포토카드 합성 (photocard)

역할: 캐릭터 정보와 일러스트를 100×148mm(300dpi) 세로 풀아트 홀로그램 카드 PNG 한 장으로 합성한다.
비고: SELPHY CP1500 엽서 크기(100×148mm)에 맞췄다. 인쇄는 아직 연결하지 않았고 파일로만 저장한다.
      템플릿 구성: 일러스트는 정보 패널 위 영역(ART_BOX)을 채우고 패널 뒤는 같은 그림을 흐리게 깔아 풀아트처럼 보이게 하며, 무지개 홀로 포일 테두리와 광택·반짝이를 겹친 뒤,
      아래쪽 유리 패널에 이름·등급·속성·대표 능력치, 고유 능력, 2027년 메시지를 얹고 꼬리말에 카드 번호를 둔다.
      반짝이 위치는 카드 번호로 정해서 카드마다 다르게 나온다. 같은 번호면 늘 같은 카드가 나온다.
      한글 글꼴은 CARD_FONT 환경변수로 바꿀 수 있다. 지정하지 않으면 macOS 기본 글꼴을 찾아 쓴다.

수정 이력:
  - 2026-11-22 최초 작성
  - 2026-11-22 트레이딩 카드 디자인으로 변경 (대표 능력치, 고유 능력 칸, 카드 번호, 등급 별)
  - 2026-11-22 풀아트 홀로그램 템플릿으로 변경 (전면 일러스트, 홀로 포일 테두리, 반짝이, 유리 패널, 1/1 표기)
  - 2026-11-22 일러스트를 정보 패널 위 영역에만 배치해 캐릭터가 패널에 가려지지 않게 변경, 패널 뒤는 흐린 그림으로 채움
  - 2026-11-22 그림이 뿌옇게 보이던 문제 수정: 그림 전체 무지개 막을 없애고 광택은 가늘고 약하게, 반짝이는 가장자리에만 적게
  - 2026-11-22 카드 번호를 카드 ID의 끝 4자리로 변경 (ID가 생성 시각으로 시작하게 바뀜)
  - 2026-11-22 긴 이름('~한 + 종족')은 말줄임 대신 글자 크기를 줄여 넣고, 이름에 종족이 있으면 아래 줄에서 종족을 뺌
  - 2026-11-22 타로풍 천체 프레임 이미지(CARD_FRAME)를 얹고, 이름·정보를 프레임 안쪽 아래 패널로 옮김 (무지개 테두리 대체)
  - 2026-11-22 투명 배경 일러스트가 검게 나오던 문제 수정 (밝은 바탕에 얹은 뒤 합성)
  - 2026-11-24 캐릭터가 잘리지 않게 그림 전체를 프레임 안쪽 안전 영역에 비율 그대로 배치 (잘라서 채우지 않음)
  - 2026-11-24 정보 패널 정리: 능력치 6칸과 설명 없는 위력 숫자 제거, 2027년 메시지를 크게, 꼬리말 단순화
  - 2026-11-24 패널을 더 덜어냄: 성향·럭키 아이템 줄을 빼고 패널을 낮춰 그림과 패널 사이에 여유를 둠
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
# 정보 패널이 시작하는 높이. 일러스트는 이 위에만 선명하게 배치해 캐릭터가 패널에 가려지지 않게 한다.
PANEL_TOP = 1175
# 선명한 일러스트 자리: 프레임 장식(테두리, 양옆 메달)과 패널에 가리지 않는 안쪽 정사각형.
# 그림을 자르지 않고 이 안에 통째로 넣어 캐릭터가 절대 잘리지 않게 한다.
ART_SIDE = 1181 - 150 * 2
ART_LEFT = 150
# 프레임 위 장식 아래(130)부터 패널 위까지 남는 높이의 가운데
ART_TOP = (130 + PANEL_TOP - 22 - ART_SIDE) // 2
# 그림 위를 지나가는 빛줄기 세기 (0~1). 높이면 홀로 느낌이 세지지만 그림이 바랜다.
GLOSS_STRENGTH = 0.3
# 프레임 이미지: 금색 선이 어두운 바탕 위에 그려진 그림. 화면(screen) 합성으로 밝은 선만 얹는다.
# 없으면 같은 자리에 단순한 금색 선 프레임을 그린다. 경로는 CARD_FRAME 환경변수로 바꿀 수 있다.
DEFAULT_FRAME_PATH = "output/frame.jpeg"
# 프레임 장식(모서리, 옆·아래 메달)을 피한 안쪽 영역
SAFE_X = 150
PANEL_BOTTOM = 1585
FOOTER_Y = 1610

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




def _cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """비율을 유지한 채 카드 크기에 꽉 차게 자른다. 머리가 잘리지 않도록 위쪽을 더 남긴다."""
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize((math.ceil(image.width * scale), math.ceil(image.height * scale)), Image.LANCZOS)
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 4
    return resized.crop((left, top, left + size[0], top + size[1]))


# 이미지 모델이 배경을 투명하게 줄 때 깔아 줄 밝은 바탕색
ART_BACKDROP = (250, 246, 238)


def _flatten(image: Image.Image) -> Image.Image:
    """투명한 부분이 있으면 밝은 바탕에 얹는다. 그냥 RGB로 바꾸면 투명한 곳이 검게 나온다."""
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        backdrop = Image.new("RGBA", rgba.size, (*ART_BACKDROP, 255))
        return Image.alpha_composite(backdrop, rgba).convert("RGB")
    return image.convert("RGB")


@lru_cache(maxsize=2)
def _frame(size: tuple[int, int]) -> Image.Image:
    path = os.getenv("CARD_FRAME", DEFAULT_FRAME_PATH)
    if os.path.exists(path):
        return Image.open(path).convert("RGB").resize(size, Image.LANCZOS)
    # 프레임 파일이 없을 때: 같은 자리에 금색 이중선만 그린다
    frame = Image.new("RGB", size, (0, 0, 0))
    draw = ImageDraw.Draw(frame)
    draw.rounded_rectangle((62, 62, size[0] - 63, size[1] - 63), radius=36, outline=GOLD, width=4)
    draw.rounded_rectangle((84, 84, size[0] - 85, size[1] - 85), radius=24, outline=GOLD, width=2)
    return frame


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

    # 1) 일러스트: 카드 전체에 흐린 그림을 깔고, 프레임 안쪽 안전 영역에 선명한 그림을 통째로 얹는다.
    #    자르지 않고 비율 그대로 줄여 넣으므로 머리·손·몸이 잘리거나 장식에 가리지 않는다.
    art = _flatten(Image.open(io.BytesIO(illustration_png)))
    card = _cover(art, size).filter(ImageFilter.GaussianBlur(28))
    card = Image.blend(card, Image.new("RGB", size, SHADOW), 0.45)
    scale = min(ART_SIDE / art.width, ART_SIDE / art.height)
    sharp = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
    art_x = ART_LEFT + (ART_SIDE - sharp.width) // 2
    art_y = ART_TOP + (ART_SIDE - sharp.height) // 2
    edge = Image.new("L", sharp.size, 0)
    ImageDraw.Draw(edge).rounded_rectangle((6, 6, sharp.width - 7, sharp.height - 7), radius=24, fill=255)
    card.paste(sharp, (art_x, art_y), edge.filter(ImageFilter.GaussianBlur(5)))

    # 2) 홀로 광택: 그림이 뿌옇게 바래지 않도록 그림 위에는 무지개 막을 씌우지 않고,
    #    비스듬한 빛줄기만 약하게 지나가게 한다. 홀로 느낌은 테두리·배지·문장(紋章)이 맡는다.
    rainbow = _rainbow(size, offset=rng.random())
    gloss = _gloss(size).point(lambda value: round(value * GLOSS_STRENGTH))
    card = Image.composite(ImageChops.screen(card, rainbow), card, gloss)

    # 3) 글자가 읽히도록 위아래를 어둡게
    shade = Image.new("RGB", size, SHADOW)
    card = Image.composite(
        shade,
        card,
        _vertical_fade(
            size, [(0, 90), (0.1, 0), ((PANEL_TOP - 120) / HEIGHT, 0), (PANEL_TOP / HEIGHT, 150), (1, 235)]
        ),
    )

    # 4) 프레임: 금색 선과 별만 화면 합성으로 얹는다
    card = ImageChops.screen(card, _frame(size))
    ui = Image.new("RGBA", size, (0, 0, 0, 0))

    # 5) 아래 패널: 이름, 등급, 속성·대표 능력치, 고유 능력, 2027년 메시지 (성향·럭키 아이템은 화면에만)
    panel = (SAFE_X - 14, PANEL_TOP, WIDTH - SAFE_X + 14, PANEL_BOTTOM)
    content = panel[2] - panel[0] - 56
    left = panel[0] + 28
    right = panel[2] - 28
    glass = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(glass).rounded_rectangle(panel, radius=28, fill=(12, 10, 28, 190), outline=(*GOLD, 150), width=2)
    ui.alpha_composite(glass)
    draw = ImageDraw.Draw(ui)

    y = PANEL_TOP + 26
    # 등급: 오른쪽 위 별
    star_x = right - 13
    for _ in range(stars):
        _star(draw, (star_x, y + 22), 15, (*rarity_color, 255))
        star_x -= 34
    rarity_font = _font(22, 800)
    draw.text((star_x + 8, y + 22), rarity_name, font=rarity_font, fill=rarity_color, anchor="rm")
    rarity_width = right - star_x + draw.textlength(rarity_name, font=rarity_font) + 20

    # 이름: 길면 글자를 줄인다 (64 → 최소 40)
    name_room = content - rarity_width
    name_size = 64
    while name_size > 40 and draw.textlength(character.name, font=_font(name_size, 900)) > name_room:
        name_size -= 4
    name_font = _font(name_size, 900)
    draw.text((left, y + 48), _fit(draw, character.name, name_font, name_room), font=name_font, fill=GOLD, anchor="ls")
    y += 64
    subtitle = (
        f"{character.element} 속성"
        if character.race in character.name
        else f"{character.race} · {character.element} 속성"
    )
    subtitle += f"  ·  {STAT_LABELS[top_key]} {stats[top_key]}"
    draw.text((left, y), _fit(draw, subtitle, _font(24, 600), content), font=_font(24, 600), fill=(215, 208, 240))
    y += 44
    draw.line((left, y, right, y), fill=(*GOLD, 90), width=2)
    y += 16

    # 고유 능력
    badge_font = _font(20, 800)
    badge = (left, y, left + 108, y + 36)
    draw.rounded_rectangle(badge, radius=18, fill=(*GOLD, 255))
    draw.text(((badge[0] + badge[2]) / 2, y + 18), "고유 능력", font=badge_font, fill=SHADOW, anchor="mm")
    ability_font = _font(32, 800)
    draw.text(
        (badge[2] + 14, y + 18),
        _fit(draw, character.ability, ability_font, content - (badge[2] - left) - 14),
        font=ability_font,
        fill=WHITE,
        anchor="lm",
    )
    y += 56
    draw.line((left, y, right, y), fill=(*GOLD, 70), width=2)
    y += 20

    # 2027년 메시지: 카드에서 가장 크게 읽히는 글
    draw.text((left, y), "2027년의 너에게", font=_font(24, 800), fill=GOLD)
    y += 42
    _paragraph(
        draw,
        (left, y),
        character.message_2027,
        _font(29, 500),
        content,
        (244, 240, 230),
        max_lines=max(1, (PANEL_BOTTOM - 18 - y) // 41),
    )

    # 6) 꼬리말: 아래 메달 양옆
    footer_font = _font(20, 800)
    draw.text((WIDTH * 0.27, FOOTER_Y), "이게 나라고?", font=footer_font, fill=GOLD, anchor="mm")
    serial = f"No.{card_id[-4:].upper()} · 1/1" if card_id else "1/1"
    draw.text((WIDTH * 0.73, FOOTER_Y), serial, font=footer_font, fill=GOLD, anchor="mm")

    card = card.convert("RGBA")
    card.alpha_composite(ui)
    final = card.convert("RGB")

    output = io.BytesIO()
    final.save(output, format="PNG", dpi=(300, 300))
    return output.getvalue()
