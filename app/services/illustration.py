"""
캐릭터 일러스트 생성 (OpenAI GPT Image)

역할: GPT가 쓴 캐릭터 외형 글을 프롬프트로 만들어 일러스트 PNG를 생성한다.
비고: 참가자 얼굴 이미지나 측정값은 보내지 않는다. 캐릭터 글(외형, 종족, 색감, 배경)만 쓴다.
      모델은 OPENAI_IMAGE_MODEL, 품질은 OPENAI_IMAGE_QUALITY 환경변수(.env)로 바꿀 수 있다.

수정 이력:
  - 2026-11-22 최초 작성
  - 2026-11-22 풀아트 카드에 맞게 세로 2:3 구도로 변경, 위아래에 글자 자리를 비우도록 지시
"""

import base64
import os

import openai

from app.schemas import CharacterResponse
from app.services.parameters import CHARACTER_TYPES

# 부스 대기 시간이 중요해서 빠른 모델과 중간 품질을 기본값으로 쓴다
DEFAULT_MODEL = "gpt-image-2.5-flare"
DEFAULT_QUALITY = "medium"
# 카드 전체를 채우는 세로 구도 (카드 100×148mm와 비슷한 2:3)
SIZE = "1024x1536"

STYLES = {
    "nonhuman": (
        "머리 자리에 사물이 달려 있고 목 아래는 사람의 몸인 캐릭터. "
        "사물에 사람 얼굴(눈, 코, 입)을 그려 넣지 않는다. 귀엽고 세련된 판타지 일러스트."
    ),
    "anime": "일본 애니메이션풍의 인물 캐릭터 일러스트. 선명한 선과 셀 채색.",
}


class IllustrationError(Exception):
    """생성 실패. message는 참가자·운영자에게 보여줄 수 있는 문구다."""

    def __init__(self, message: str, *, retryable: bool):
        super().__init__(message)
        self.retryable = retryable


def build_prompt(character: CharacterResponse) -> str:
    parameters = character.parameters
    # parameters.character_type 에는 키(nonhuman)가 아니라 설명 문구가 들어 있다
    type_key = next(
        (key for key, label in CHARACTER_TYPES.items() if label == parameters.character_type),
        "anime",
    )
    style = STYLES[type_key]
    return "\n".join(
        [
            "풀아트 홀로그램 트레이딩 카드의 전면 일러스트 한 장을 세로 구도로 그려라.",
            f"스타일: {style}",
            f"캐릭터: {character.race}, 속성은 {character.element}.",
            f"외형: {character.appearance}",
            f"색감: {character.palette}",
            f"배경: {parameters.realm}을 은은하게 표현한다.",
            "구도: 캐릭터 한 명이 화면 가운데에서 역동적인 자세로 선다. 머리는 위에서 20% 아래에 오게 하고, "
            "화면 아래 3분의 1은 캐릭터의 다리와 배경으로 채운다(나중에 글자 패널이 덮는다).",
            "연출: 화려한 빛, 반짝이는 입자, 배경과 어우러지는 극적인 조명.",
            "글자, 숫자, 로고, 워터마크, 카드 테두리를 넣지 않는다.",
            "모든 연령이 보는 행사용이므로 잔인하거나 선정적인 요소를 넣지 않는다.",
        ]
    )


def _build_client() -> openai.OpenAI:
    # 이미지 생성은 글보다 오래 걸려서 대기 시간을 더 길게 잡는다
    return openai.OpenAI(timeout=120.0, max_retries=1)


def generate_illustration(character: CharacterResponse) -> bytes:
    try:
        response = _build_client().images.generate(
            model=os.getenv("OPENAI_IMAGE_MODEL", DEFAULT_MODEL),
            prompt=build_prompt(character),
            size=SIZE,
            quality=os.getenv("OPENAI_IMAGE_QUALITY", DEFAULT_QUALITY),
            output_format="png",
            n=1,
        )
    except openai.AuthenticationError as error:
        raise IllustrationError("API 키를 확인해 주세요", retryable=False) from error
    except openai.BadRequestError as error:
        # 안전 필터에 걸린 경우도 여기로 온다. 다시 그리면 통과할 수 있다.
        raise IllustrationError("일러스트를 그리지 못했어요. 다시 시도해 주세요", retryable=True) from error
    except openai.RateLimitError as error:
        raise IllustrationError("요청이 많아요. 잠시 후 다시 시도해 주세요", retryable=True) from error
    except (openai.APIConnectionError, openai.InternalServerError) as error:
        raise IllustrationError("AI 서버에 연결하지 못했어요. 다시 시도해 주세요", retryable=True) from error
    except openai.APIStatusError as error:
        raise IllustrationError("일러스트 생성에 실패했어요", retryable=error.status_code >= 500) from error
    except openai.OpenAIError as error:
        raise IllustrationError("AI 연결 설정을 확인해 주세요", retryable=False) from error

    if not response.data or not response.data[0].b64_json:
        raise IllustrationError("일러스트를 그리지 못했어요. 다시 시도해 주세요", retryable=True)
    return base64.b64decode(response.data[0].b64_json)
