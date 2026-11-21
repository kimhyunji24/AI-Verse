"""
화풍 추출 (art_style)

역할: 참고 캐릭터 이름을 GPT에 보내 그림체를 일러스트레이터용 화풍 지시문(글)으로 뽑는다.
비고: 애니메이션 캐릭터를 만들 때마다 호출한다. 이름은 이 요청에만 쓰고, 결과 글에서 이름이 보이면 버린다.
      캐릭터 고유의 의상·무늬·소품은 빼고 선, 채색, 비율, 눈 표현, 색감 같은 그림체만 뽑게 한다.
      실패하면 None을 돌려주고, 호출한 쪽은 미리 써 둔 화풍 글(parameters.ART_STYLES)을 쓴다. 부스가 멈추지 않게 하기 위해서다.
      모델은 OPENAI_STYLE_MODEL, 없으면 OPENAI_MODEL 환경변수를 쓴다.

수정 이력:
  - 2026-11-22 최초 작성
"""

import logging
import os

import openai

from app.services.ai_character import DEFAULT_MODEL

logger = logging.getLogger(__name__)

INSTRUCTIONS = """너는 애니메이션 아트 디렉터다. 입력으로 받은 캐릭터의 그림체를 다른 일러스트레이터가 새 캐릭터를 그릴 때 참고할 화풍 지시문으로 바꿔라.
- 선(굵기, 질감), 채색 방식, 등신과 몸 비율, 눈과 얼굴을 표현하는 방식, 색감, 전체 분위기만 쓴다.
- 그 캐릭터만의 고유한 의상, 무늬, 머리 모양, 소품, 상징, 종족은 쓰지 않는다. 새 캐릭터는 다른 모습이어야 한다.
- 작품 이름, 캐릭터 이름, 작가·회사 이름을 쓰지 않는다.
- 한국어로 3~4문장, 다른 말 없이 지시문만 쓴다."""

MAX_LENGTH = 600


def _build_client() -> openai.OpenAI:
    # 부스 대기 시간을 늘리지 않도록 짧게 기다리고 재시도하지 않는다. 실패하면 대체 화풍을 쓴다.
    return openai.OpenAI(timeout=20.0, max_retries=0)


def _name_parts(reference: str) -> list[str]:
    """'작품의 캐릭터' 형식에서 결과 글에 나오면 안 되는 이름 조각을 뽑는다."""
    parts = reference.replace("(", " ").replace(")", " ").replace("의 ", " ").split()
    parts = (part.strip(".,") for part in parts)
    return [part for part in parts if len(part) >= 2]


def extract_art_style(reference: str) -> str | None:
    try:
        response = _build_client().responses.create(
            model=os.getenv("OPENAI_STYLE_MODEL") or os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
            instructions=INSTRUCTIONS,
            input=reference,
            max_output_tokens=2000,
            store=False,
        )
    except openai.OpenAIError as error:
        logger.warning("화풍 추출 실패, 대체 화풍 사용: %s", type(error).__name__)
        return None

    text = (response.output_text or "").strip()
    if response.status != "completed" or not text:
        logger.warning("화풍 추출 결과 없음, 대체 화풍 사용")
        return None
    if any(part in text for part in _name_parts(reference)):
        logger.warning("화풍 추출 결과에 이름이 섞여 대체 화풍 사용")
        return None
    return text[:MAX_LENGTH]
