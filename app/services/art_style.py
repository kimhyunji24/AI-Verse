"""
화풍·특징 추출 (art_style)

역할: 참고 캐릭터 이름과 참가자 얼굴 생김새를 GPT에 보내, 그림체(화풍 지시문)와
      참가자 얼굴이 반영된 생김새 특징 목록을 글로 뽑는다.
비고: 애니메이션 캐릭터를 만들 때마다 호출한다. 이름은 이 요청에만 쓰고, 결과에 이름이 보이면 전부 버린다.
      특징은 눈과 귀 생김새만 뽑고, 각 특징에 참가자 얼굴 생김새(눈 관련)를 반영해 바꾼다.
      눈·귀가 아닌 특징이 섞여 나오면 버린다. 코·입·턱 같은 나머지 생김새는 face_traits로 따로 프롬프트에 들어간다.
      그 캐릭터를 바로 알아보게 하는 고유 의상, 로고·문양, 이름은 뽑지 않는다.
      실패하면 None을 돌려주고, 호출한 쪽은 미리 써 둔 화풍 글(parameters.ART_STYLES)과 얼굴 생김새 문구만 쓴다.
      모델은 OPENAI_STYLE_MODEL, 없으면 OPENAI_MODEL 환경변수를 쓴다.

수정 이력:
  - 2026-11-22 최초 작성
  - 2026-11-22 생김새 특징 추출 추가, 참가자 얼굴 생김새를 특징에 반영하도록 변경
  - 2026-11-22 생김새 특징을 눈과 귀로만 제한
  - 2026-11-22 이름 확인을 이름 자동 분리 대신 지정한 고유 이름 목록으로 변경 (원피스 같은 일반 낱말 오탐 방지)
"""

import json
import logging
import os

import openai
from pydantic import BaseModel, ValidationError

from app.services.ai_character import DEFAULT_MODEL

logger = logging.getLogger(__name__)

INSTRUCTIONS = """너는 애니메이션 아트 디렉터다. 입력의 reference는 참고할 캐릭터, face_traits는 이번 참가자의 얼굴 생김새다.
참고 캐릭터를 바탕으로, 참가자를 닮은 새 캐릭터를 그릴 일러스트레이터에게 줄 지시를 만들어라.

art_style: 참고 캐릭터의 그림체를 화풍 지시문으로 쓴다.
- 선(굵기, 질감), 채색 방식, 등신과 몸 비율, 눈과 얼굴을 표현하는 방식, 색감, 전체 분위기를 3~4문장으로 쓴다.

features: 참고 캐릭터의 눈과 귀 생김새 특징만 2~4개 뽑고, 각 특징에 face_traits를 반영해 바꾼 문장으로 쓴다.
- 눈(크기, 모양, 눈동자, 하이라이트, 눈 사이 간격)과 귀(모양, 크기, 위치)만 다룬다. 귀가 없는 캐릭터면 눈만 쓴다.
- 체형, 얼굴형, 코, 입, 머리카락, 털, 종족은 쓰지 않는다.
- face_traits 중 눈과 관련된 생김새(눈 사이, 미간, 눈 위치)는 빠짐없이 눈 특징에 반영한다. 예: 참고가 작은 점 같은 눈이고 face_traits가 두 눈 사이가 먼 편이면 "서로 멀찍이 떨어진 작은 점 같은 눈".
- 각 특징 문장에는 "눈" 또는 "귀"라는 말을 넣는다.
- 그 캐릭터를 바로 알아보게 하는 고유 의상, 로고나 문양, 상징 소품은 쓰지 않는다.

공통
- 작품 이름, 캐릭터 이름, 작가·회사 이름을 쓰지 않는다.
- 생김새를 좋고 나쁨이나 매력으로 평가하지 않는다.
- 한국어로 쓴다."""

MAX_STYLE_LENGTH = 600
MAX_FEATURES = 4
# 특징 문장은 이 말 중 하나를 담아야 한다 (눈·귀 생김새만 남긴다)
FEATURE_PARTS = ("눈", "귀")


class ArtReference(BaseModel):
    art_style: str
    features: list[str]


def _build_client() -> openai.OpenAI:
    # 부스 대기 시간을 늘리지 않도록 짧게 기다리고 재시도하지 않는다. 실패하면 대체 화풍을 쓴다.
    return openai.OpenAI(timeout=20.0, max_retries=0)


def extract_art_reference(
    reference: str, face_traits: list[str], banned_names: tuple[str, ...]
) -> ArtReference | None:
    """banned_names: 결과 글에 나오면 추출 결과를 버릴 고유 이름 (parameters.ART_REFERENCE_NAMES)"""
    try:
        response = _build_client().responses.parse(
            model=os.getenv("OPENAI_STYLE_MODEL") or os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
            instructions=INSTRUCTIONS,
            input=json.dumps({"reference": reference, "face_traits": face_traits}, ensure_ascii=False),
            text_format=ArtReference,
            max_output_tokens=3000,
            store=False,
        )
    except (openai.OpenAIError, ValidationError) as error:
        logger.warning("화풍·특징 추출 실패, 대체 화풍 사용: %s", type(error).__name__)
        return None

    result = response.output_parsed
    if response.status != "completed" or result is None or not result.art_style.strip():
        logger.warning("화풍·특징 추출 결과 없음, 대체 화풍 사용")
        return None
    text = " ".join([result.art_style, *result.features])
    if any(name in text for name in banned_names):
        logger.warning("화풍·특징 추출 결과에 이름이 섞여 대체 화풍 사용")
        return None
    return ArtReference(
        art_style=result.art_style.strip()[:MAX_STYLE_LENGTH],
        features=[
            feature.strip()
            for feature in result.features
            if any(part in feature for part in FEATURE_PARTS)
        ][:MAX_FEATURES],
    )
