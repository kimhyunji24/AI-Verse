"""
캐릭터 일러스트 생성 (OpenAI GPT Image)

역할: GPT가 쓴 캐릭터 외형 글을 프롬프트로 만들어 일러스트 PNG를 생성한다.
비고: 참가자 얼굴 이미지나 측정값은 보내지 않는다. 캐릭터 글(외형, 종족, 색감, 배경)만 쓴다.
      포즈 뼈대 그림(얼굴 없이 관절을 선으로 이은 그림)이 있으면 참고 이미지로 함께 보내 같은 자세로 그리게 한다.
      모델은 OPENAI_IMAGE_MODEL, 품질은 OPENAI_IMAGE_QUALITY 환경변수(.env)로 바꿀 수 있다.

수정 이력:
  - 2026-11-22 최초 작성
  - 2026-11-22 풀아트 카드에 맞게 세로 2:3 구도로 변경, 위아래에 글자 자리를 비우도록 지시
  - 2026-11-22 포즈 뼈대 그림을 참고 이미지로 받아 참가자와 같은 자세로 그리도록 추가
  - 2026-11-22 애니메이션 캐릭터는 화풍(art_style)과 얼굴 생김새(face_traits)를 프롬프트에 넣도록 변경
  - 2026-11-22 참가자 얼굴이 반영된 생김새 특징(art_features)을 프롬프트에 추가
  - 2026-11-22 애니메이션 캐릭터를 사람이 아닌 캐릭터로만 그리도록 변경
  - 2026-11-22 이미지 생성 오류를 서버 로그에 남기도록 추가
  - 2026-11-22 손 모양(hand_gestures)을 글로 바꿔 프롬프트에 추가, 뼈대 설명에 손가락 추가
  - 2026-11-22 카드가 그림을 패널 위에만 배치하도록 바뀌어 정사각 구도로 변경, 손과 몸이 화면 안에 들어오도록 지시
  - 2026-11-22 애니메이션 캐릭터를 실제 동물 캐릭터로 교체 (사실적인 털과 질감, 옷 없음, 얼굴 생김새 반영)
  - 2026-11-22 90년대 사진관 프로필 사진 스타일로 변경: 머리만 바뀐 사람 몸, 의상 템플릿, 우주·무지개 레이저 배경 고정, 근엄한 표정
  - 2026-11-22 동물 캐릭터는 고정 프롬프트(2등신 찹쌀떡 몸, 손그림 갈색 선, 파스텔)로 그리고 격한 감정과
              설문 장소에 맞춘 단순한 배경을 넣도록 변경. 사물 머리 캐릭터는 사진관 스타일 그대로.
  - 2026-11-26 사물 머리가 사람 얼굴로 그려지던 문제: 머리 자리는 사물만, 사진관 문구에서 얼굴·표정 표현 제거, 뼈대 설명을 '얼굴 아님'으로
  - 2026-11-26 종족과 이어지는 동작(action, 없으면 소품 prop)을 프롬프트에 추가, 뼈대의 눈·코·입으로 얼굴 방향과 손-얼굴 위치를 맞추도록 지시
  - 2026-11-26 동물 캐릭터가 손 모양(브이 등)을 무시하고 주먹으로 그려지던 문제: 손 모양을 영어로 최우선 지시
"""

import base64
import logging
import os

import openai

from app.schemas import CharacterResponse, HandGesture
from app.services.parameters import CHARACTER_TYPES, EMOTIONS, REALMS

# 부스 대기 시간이 중요해서 빠른 모델과 중간 품질을 기본값으로 쓴다
DEFAULT_MODEL = "gpt-image-2.5-flare"
DEFAULT_QUALITY = "medium"
# 카드의 정보 패널 위 영역(1181×1152)이 거의 정사각이라 정사각으로 그린다
SIZE = "1024x1024"

NONHUMAN_STYLE = (
    "머리 자리에 사물이 달려 있고 목 아래는 사람의 몸인 인물. 사람 머리는 없고 그 자리를 사물 하나가 통째로 차지한다. "
    "옷깃 위로는 사물만 보이고 사람의 얼굴, 피부, 머리카락, 귀, 목은 전혀 보이지 않는다. "
    "사물은 사진처럼 사실적인 재질로 그리고, 사물에 사람 얼굴(눈, 코, 입)을 그려 넣지 않는다. "
    "HEAD = OBJECT: no human head, face, skin, hair or ears anywhere above the collar; the object replaces the head entirely."
)
# 사물 머리 캐릭터: 진지해서 오히려 웃긴 90년대 사진관 프로필 사진
PORTRAIT = (
    "90년대 사진관에서 찍은 프로필 사진처럼 사실적으로 그린다. 스튜디오 조명이 머리 자리의 사물과 어깨를 부드럽게 비추고, "
    "몸은 진지하고 근엄한 자세로 정면을 향한다. 진지해서 오히려 웃긴 사진이다."
)
BACKGROUND = "우주와 은하수, 반짝이는 별, 그 사이를 휘감아 흐르는 무지개빛 레이저 띠. 90년대 사진관 레이저 배경 느낌."

# 동물 캐릭터: 고정 프롬프트. 기존 작품·작가 이름은 넣지 않고 특징만 글로 적는다.
ANIMAL_STYLE = """[Character Design & Anatomy]
- Proportions: Chibi 2-head-tall round mochi-like body, no neck, chubby torso, and very short, stubby stub arms and legs with no fingers (for hand signs, tiny nub fingers are allowed).
- The whole body is the animal: animal ears and fur patterns instead of human hair.
- Face: Completely omit the nose. Big, round, glossy black eyes with two small white highlights, soft pink oval blush on the cheeks, and a tiny wavy 'w' or 'ω' mouth (the emotion below may change the eyes and mouth).
- Outfit: simplified into minimal lines and flat colors fitted to the tiny body.
[Art Style & Linework]
- Outlines: Soft, slightly uneven hand-drawn dark brown (#3B2820) outlines instead of harsh black.
- Coloring: Flat 2D cel-shading combined with gentle, low-saturation pastel watercolor wash textures. Minimal shadows, zero 3D rendering or realistic lighting.
- An original character that does not resemble any existing character."""
EMOTION_TEXT = dict(EMOTIONS)
# 설문 장소(realm 문구) -> 동물 캐릭터 배경
ANIMAL_BACKGROUNDS = {
    REALMS["deep_sea"]: "a cozy, simple pastel campus cafe with a coffee counter and a few warm lamps",
    REALMS["night_sky"]: "a cozy, simple pastel campus bench under a starry night sky with a few trees",
    REALMS["old_library"]: "a cozy, simple pastel corner of a big library with tall bookshelves",
    REALMS["neon_city"]: "a cozy, simple pastel dormitory cafeteria with steaming rice bowls on trays",
}


logger = logging.getLogger(__name__)


class IllustrationError(Exception):
    """생성 실패. message는 참가자·운영자에게 보여줄 수 있는 문구다."""

    def __init__(self, message: str, *, retryable: bool):
        super().__init__(message)
        self.retryable = retryable


POSE_INSTRUCTIONS = (
    "첨부한 그림은 참가자가 의자에 앉아 취한 상반신 자세를 흰 바탕에 막대 뼈대로 나타낸 것이다. "
    "둥근 원은 머리의 위치와 크기만 나타내고, 원 안의 작은 점 하나는 머리가 돌아간 쪽(코가 향한 쪽)을 나타낸다. 이것은 얼굴이 아니다. "
    "굵은 선은 어깨·팔·몸통, 가는 선과 점은 손가락 관절이다. "
    "캐릭터가 이 자세를 그대로 따르게 그린다: 머리가 돌아간 방향(점이 원의 어느 쪽에 있는지)과 고개 기울기, "
    "몸이 화면의 어느 쪽으로 치우치거나 기울었는지, 어깨 기울기, 양팔과 손의 높이와 방향, 손가락을 펴고 접은 모양을 맞춘다. "
    "특히 손이 얼굴의 어느 쪽, 어느 높이에 있는지(볼 옆, 턱 아래, 머리 위, 얼굴 앞 등)를 정확히 맞춘다. 왼쪽과 오른쪽도 그림 그대로 둔다. "
    "뼈대의 선, 점, 흰 바탕은 결과 그림에 남기지 않는다."
)


# 손 모양 코드 -> 프롬프트 문장. 코드만 받으므로 참가자가 글을 넣을 수 없다.
GESTURE_TEXT = {
    "Closed_Fist": "주먹을 쥔 손",
    "Open_Palm": "손가락을 모두 활짝 편 손바닥",
    "Pointing_Up": "검지 하나만 펴서 위를 가리키는 손",
    "Thumb_Down": "엄지만 펴서 아래로 향한 손",
    "Thumb_Up": "엄지만 펴서 위로 치켜든 손(엄지 척)",
    "Victory": "검지와 중지만 펴서 V자를 만든 손(브이)",
    "ILoveYou": "엄지·검지·새끼손가락만 편 손",
}
SIDE_TEXT = {"left": "그림의 왼쪽 손", "right": "그림의 오른쪽 손"}

# 동물 캐릭터용 영어 문장. 동물 화풍은 "손가락 없는 뭉툭한 손"이 기본이라, 손 모양은 영어로 따로 세게 지시해야 그려진다.
GESTURE_TEXT_EN = {
    "Closed_Fist": "a closed fist",
    "Open_Palm": "an open palm with all five fingers spread wide",
    "Pointing_Up": "only the index finger raised, pointing up",
    "Thumb_Down": "a thumbs-down (only the thumb out, pointing down)",
    "Thumb_Up": "a thumbs-up (only the thumb raised)",
    "Victory": "a V sign / peace sign: index and middle fingers raised and spread apart in a clear V, other fingers folded",
    "ILoveYou": "the 'I love you' sign: thumb, index finger and pinky raised, middle and ring fingers folded",
}
SIDE_TEXT_EN = {"left": "the paw on the LEFT side of the image", "right": "the paw on the RIGHT side of the image"}


def gesture_line_en(hand_gestures: list[HandGesture]) -> str:
    parts = [f"{SIDE_TEXT_EN[hand.side]} makes {GESTURE_TEXT_EN[hand.gesture]}" for hand in hand_gestures]
    return (
        f"HAND SIGN (top priority, must be clearly readable at a glance): {'; '.join(parts)}. "
        "For this hand sign, give the paw small but distinct fingers with the correct finger count, "
        "raise the paw beside the face so it is not hidden, and do NOT draw a fist or a mitten paw instead."
    )


def gesture_line(hand_gestures: list[HandGesture]) -> str:
    parts = [f"{SIDE_TEXT[hand.side]}은 {GESTURE_TEXT[hand.gesture]}" for hand in hand_gestures]
    return f"손 모양: {', '.join(parts)}. 손가락 개수와 모양을 정확하게 그린다."


def build_prompt(
    character: CharacterResponse,
    *,
    with_pose: bool = False,
    hand_gestures: list[HandGesture] | None = None,
) -> str:
    parameters = character.parameters
    action = character.action or parameters.prop
    # parameters.character_type 에는 키(nonhuman)가 아니라 설명 문구가 들어 있다
    if parameters.character_type != CHARACTER_TYPES["nonhuman"]:
        return _animal_prompt(character, with_pose=with_pose, hand_gestures=hand_gestures)
    return "\n".join(
        [
            "홀로그램 트레이딩 카드에 들어갈 그림 한 장을 정사각 구도로 그려라.",
            f"주인공: {NONHUMAN_STYLE}",
            f"사진 스타일: {PORTRAIT}",
            *([f"옷: {parameters.outfit}."] if parameters.outfit else []),
            *([f"동작과 소품: {action}. 손 모양이 있으면 그 손 모양을 가리지 않게 다른 손으로 한다."] if action else []),
            f"캐릭터: 목 위에 사람 머리 대신 {character.race} 하나가 통째로 올라가 있다(사람 얼굴·머리카락 없음). 속성은 {character.element}.",
            f"외형: {character.appearance}",
            f"배경: {BACKGROUND}",
            "구도: 가슴 위 상반신이 화면 가운데에 크게, 정면 증명사진처럼. 머리 위로 화면의 약 15%를 비워 두고, "
            "머리, 양손, 몸이 모두 화면 안에 들어오게 그려 어느 부분도 화면 밖으로 잘리지 않게 한다.",
            *([f"자세: {POSE_INSTRUCTIONS}"] if with_pose else []),
            *([gesture_line(hand_gestures)] if hand_gestures else []),
            "글자, 숫자, 로고, 워터마크, 카드 테두리를 넣지 않는다.",
            "무섭거나 기괴하지 않게 그린다. 모든 연령이 보는 행사용이므로 잔인하거나 선정적인 요소를 넣지 않는다.",
        ]
    )


def _animal_prompt(
    character: CharacterResponse,
    *,
    with_pose: bool,
    hand_gestures: list[HandGesture] | None,
) -> str:
    parameters = character.parameters
    action = character.action or parameters.prop
    emotion = EMOTION_TEXT.get(parameters.emotion)
    background = ANIMAL_BACKGROUNDS.get(parameters.realm, "a cozy, simple pastel room")
    return "\n".join(
        [
            "Draw one square illustration of a single cute 2D animal character for a trading card.",
            ANIMAL_STYLE,
            f"Character: a {character.race} (Korean name of the animal), wearing {parameters.outfit or 'a simple outfit'}.",
            f"Appearance notes (Korean): {character.appearance}",
            *(
                [f"Action with a prop (Korean): {action}. If a hand sign is given, do this with the other paw so the sign stays visible."]
                if action
                else []
            ),
            *(
                [f"Face traits to reflect (Korean): {', '.join(parameters.face_traits)}."]
                if parameters.face_traits
                else []
            ),
            *(
                [f"Expression: MAXIMUM EMOTION, exaggerate it as much as possible: {emotion}."]
                if emotion
                else ["Expression: MAXIMUM EMOTION, pick one strong feeling and exaggerate it as much as possible."]
            ),
            *([f"Pose (Korean): {POSE_INSTRUCTIONS}"] if with_pose else []),
            *([gesture_line_en(hand_gestures), f"Hands (Korean): {gesture_line(hand_gestures)}"] if hand_gestures else []),
            f"Background: {background}, hand-drawn picture-book style. Keep it soft and secondary to the character.",
            "Composition: one character only, full body, centered and large, ears, tail and feet not cut off, "
            "about 15% empty space above the head.",
            "No text, numbers, logos, watermarks, speech bubbles or card borders.",
            "Nothing scary or grotesque; this is an all-ages event.",
        ]
    )


def _build_client() -> openai.OpenAI:
    # 이미지 생성은 글보다 오래 걸려서 대기 시간을 더 길게 잡는다
    return openai.OpenAI(timeout=120.0, max_retries=1)


def generate_illustration(
    character: CharacterResponse,
    pose_png: bytes | None = None,
    hand_gestures: list[HandGesture] | None = None,
) -> bytes:
    options = {
        "model": os.getenv("OPENAI_IMAGE_MODEL", DEFAULT_MODEL),
        "prompt": build_prompt(character, with_pose=pose_png is not None, hand_gestures=hand_gestures),
        "size": SIZE,
        "quality": os.getenv("OPENAI_IMAGE_QUALITY", DEFAULT_QUALITY),
        "output_format": "png",
        "n": 1,
    }
    try:
        client = _build_client()
        if pose_png is None:
            response = client.images.generate(**options)
        else:
            # 참고 이미지가 있으면 편집 API로 보낸다. 뼈대는 자세 참고용일 뿐 그대로 남기지 않는다.
            response = client.images.edit(image=("pose.png", pose_png, "image/png"), **options)
    except openai.OpenAIError as error:
        # 원인(안전 필터, 모델 이름 등)을 운영자가 볼 수 있게 남긴다. 키 같은 비밀 값은 담기지 않는다.
        logger.warning("일러스트 생성 실패: %s %s", type(error).__name__, getattr(error, "message", error))
        raise _friendly_error(error) from error

    if not response.data or not response.data[0].b64_json:
        raise IllustrationError("일러스트를 그리지 못했어요. 다시 시도해 주세요", retryable=True)
    return base64.b64decode(response.data[0].b64_json)


def _friendly_error(error: openai.OpenAIError) -> IllustrationError:
    """OpenAI 오류를 참가자·운영자에게 보여줄 문구로 바꾼다."""
    if isinstance(error, openai.AuthenticationError):
        return IllustrationError("API 키를 확인해 주세요", retryable=False)
    if isinstance(error, openai.BadRequestError):
        # 안전 필터에 걸린 경우도 여기로 온다. 다시 그리면 통과할 수 있다.
        return IllustrationError("일러스트를 그리지 못했어요. 다시 시도해 주세요", retryable=True)
    if isinstance(error, openai.RateLimitError):
        return IllustrationError("요청이 많아요. 잠시 후 다시 시도해 주세요", retryable=True)
    if isinstance(error, (openai.APIConnectionError, openai.InternalServerError)):
        return IllustrationError("AI 서버에 연결하지 못했어요. 다시 시도해 주세요", retryable=True)
    if isinstance(error, openai.APIStatusError):
        return IllustrationError("일러스트 생성에 실패했어요", retryable=error.status_code >= 500)
    return IllustrationError("AI 연결 설정을 확인해 주세요", retryable=False)
