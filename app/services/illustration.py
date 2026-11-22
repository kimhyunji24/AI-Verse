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
"""

import base64
import logging
import os

import openai

from app.schemas import CharacterResponse, HandGesture
from app.services.parameters import CHARACTER_TYPES

# 부스 대기 시간이 중요해서 빠른 모델과 중간 품질을 기본값으로 쓴다
DEFAULT_MODEL = "gpt-image-2.5-flare"
DEFAULT_QUALITY = "medium"
# 카드의 정보 패널 위 영역(1181×1152)이 거의 정사각이라 정사각으로 그린다
SIZE = "1024x1024"

STYLES = {
    "nonhuman": (
        "머리 자리에 사물이 달려 있고 목 아래는 사람의 몸인 캐릭터. "
        "사물에 사람 얼굴(눈, 코, 입)을 그려 넣지 않는다. 귀엽고 세련된 판타지 일러스트."
    ),
    # 애니메이션은 룰이 고른 화풍(parameters.art_style)을 붙여 쓴다
    "anime": (
        "사람이 아닌 귀여운 캐릭터(작은 동물, 생물, 마스코트) 일러스트. "
        "사람이나 사람 모습의 인물로 그리지 않는다."
    ),
}


logger = logging.getLogger(__name__)


class IllustrationError(Exception):
    """생성 실패. message는 참가자·운영자에게 보여줄 수 있는 문구다."""

    def __init__(self, message: str, *, retryable: bool):
        super().__init__(message)
        self.retryable = retryable


POSE_INSTRUCTIONS = (
    "첨부한 그림은 참가자가 의자에 앉아 취한 상반신 자세를 흰 바탕에 막대 뼈대로 나타낸 것이다. "
    "둥근 원은 머리, 굵은 선은 어깨·팔·몸통, 가는 선과 점은 손가락 관절이다. 캐릭터가 이 자세를 그대로 따르게 그린다: "
    "어깨 기울기, 양팔과 손의 높이와 방향, 손가락을 펴고 접은 모양, 고개 기울기를 맞춘다. 왼쪽과 오른쪽도 그림 그대로 둔다. "
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
    # parameters.character_type 에는 키(nonhuman)가 아니라 설명 문구가 들어 있다
    type_key = next(
        (key for key, label in CHARACTER_TYPES.items() if label == parameters.character_type),
        "anime",
    )
    style = STYLES[type_key]
    anime_lines = []
    if type_key == "anime":
        style += f" 화풍: {parameters.art_style}."
        anime_lines = [
            "이 화풍의 특징은 참고만 하고, 기존 작품의 캐릭터와 구별되는 오리지널 캐릭터로 그린다.",
            *(
                [f"생김새 특징: {' / '.join(parameters.art_features)}."]
                if parameters.art_features
                else []
            ),
            *(
                [f"얼굴 생김새: {', '.join(parameters.face_traits)}. 이 생김새를 캐릭터 얼굴에 반영한다."]
                if parameters.face_traits
                else []
            ),
        ]
    return "\n".join(
        [
            "홀로그램 트레이딩 카드에 들어갈 캐릭터 일러스트 한 장을 정사각 구도로 그려라.",
            f"스타일: {style}",
            *anime_lines,
            f"캐릭터: {character.race}, 속성은 {character.element}.",
            f"외형: {character.appearance}",
            f"색감: {character.palette}",
            f"배경: {parameters.realm}을 은은하게 표현한다.",
            "구도: 캐릭터 한 명이 화면 가운데에 크게 선다. 머리 위로 화면의 약 15%를 비워 두고(제목 자리), "
            "머리, 양손, 몸이 모두 화면 안에 들어오게 그려 어느 부분도 화면 밖으로 잘리지 않게 한다.",
            *([f"자세: {POSE_INSTRUCTIONS}"] if with_pose else []),
            *([gesture_line(hand_gestures)] if hand_gestures else []),
            "연출: 화려한 빛, 반짝이는 입자, 배경과 어우러지는 극적인 조명.",
            "글자, 숫자, 로고, 워터마크, 카드 테두리를 넣지 않는다.",
            "모든 연령이 보는 행사용이므로 잔인하거나 선정적인 요소를 넣지 않는다.",
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
