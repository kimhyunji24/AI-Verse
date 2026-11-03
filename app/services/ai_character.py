"""
캐릭터 결정과 글 생성 (하이브리드의 AI 담당, OpenAI GPT)

역할: 룰이 만든 점수·후보·기본 능력치를 GPT에 보내 최종 선택과 해석, 글을 받아온다.
비고: 얼굴 이미지와 원본 측정값은 보내지 않고, 0~1로 변환해 반올림한 점수만 보낸다.
      요청은 OpenAI에 저장하지 않는다(store=False). 결과 검증은 parameters.py 의 apply_decision 이 한다.
      API 키는 OPENAI_API_KEY, 모델은 OPENAI_MODEL 환경변수(.env)에서 읽는다.

수정 이력:
  - 2026-11-03 최초 작성 (story_generator.py)
  - 2026-11-03 색감, 고유 능력, 위기 일화, 럭키 아이템 종류를 글에 반영하도록 지시 추가
  - 2026-11-03 하이브리드로 변경: GPT가 얼굴 점수를 해석해 후보 중 선택하고 능력치를 조정, 파일 이름 변경
  - 2026-11-03 얼굴 점수 항목별 의미와 해석 방향을 프롬프트에 추가
"""

import os

import openai
from pydantic import ValidationError

from app.schemas import AiDecision, CharacterParameters

# 자연스러운 글쓰기와 빠른 응답이 중요해서 기본값으로 사용한다
DEFAULT_MODEL = "gpt-6.1-terra"

INSTRUCTIONS = """너는 체험 부스 '심연의 관측소'의 묘약 기록 담당자다. 재료를 끓여 태어난 가상의 존재를 기록한다.
입력으로 받은 값을 해석해 판타지 캐릭터를 결정하고 한국어로 기록해라. 결과는 참가자가 포토카드로 받아 간다.

입력 값
- face_scores: 얼굴 측정 비율을 0~1로 바꾼 점수다. 0.5 근처가 중간이다. 높고 낮음에 좋고 나쁨이 없으며 설정의 재료일 뿐이다.
  각 항목의 뜻(0에 가까울 때 / 1에 가까울 때)과 캐릭터에 반영할 방향은 다음과 같다.
  - face_aspect_ratio: 얼굴 세로/가로 비율(가로로 넓음 / 세로로 긺). 몸의 전체 형상: 퍼지고 둥근 형체 / 길게 뻗은 형체
  - eye_spacing_ratio: 두 눈 중심 사이 거리(가까움 / 멂). 관측 방식: 한 점을 깊이 봄 / 넓게 살핌
  - inner_eye_gap_ratio: 미간 너비, 두 눈 안쪽 끝 사이(좁음 / 넓음). 기운의 밀도: 응축된 기운 / 넓게 흩어지는 기운
  - eye_position_ratio: 이마 끝에서 눈까지의 위치(얼굴 위쪽 / 아래쪽). 감각 기관의 위치: 머리 위쪽 / 몸 가까이
  - nose_length_ratio: 코 길이(짧음 / 긺). 뻗어 나온 부위: 뿔, 주둥이, 더듬이 등이 짧음 / 긺
  - nose_position_ratio: 이마 끝에서 코 밑까지의 위치(위쪽 / 아래쪽). 몸의 중심: 위쪽이 발달 / 아래쪽이 발달
  - nose_width_ratio: 코 너비(좁음 / 넓음). 숨결과 호흡: 가늘고 날카로움 / 크고 깊음
  - mouth_width_ratio: 입 너비(좁음 / 넓음). 소리와 목소리: 작고 또렷함 / 넓게 울림
  - lip_thickness_ratio: 입술 두께, 입 벌림 제외(얇음 / 두꺼움). 말과 주문의 결: 날렵하고 짧음 / 부드럽고 깊음
  - mouth_position_ratio: 이마 끝에서 입까지의 위치(위쪽 / 아래쪽). 주문이 나오는 자리: 높은 곳 / 낮은 곳
  - jaw_width_ratio: 턱 폭(좁음 / 넓음). 무게감: 가볍게 떠다님 / 묵직하게 자리 잡음
  점수가 0.5에서 멀수록 그 특징을 캐릭터에 더 뚜렷하게 드러낸다.
- silhouette, gaze, presence, stance, realm, bond, wish, crisis: 룰이 분류한 재료 문구다.
- palette, ability, lucky_item_type: 확정된 값이다. 그대로 따른다.

결정할 것
- race, element, disposition: 각각 race_candidates, element_candidates, disposition_candidates 중 하나를 글자 그대로 고른다.
  face_scores와 재료 문구를 함께 보고 가장 어울리는 것을 고른다.
- stats: base_stats에서 각 값을 10 이내로 조정해 정한다. 합계는 300을 유지한다.
- reason: 어떤 재료 때문에 이렇게 골랐는지 판타지 말투로 한 문장으로 쓴다. 숫자와 얼굴 부위 이름은 쓰지 않는다.

작성 기준
- 이름(name)은 2~8자로 새로 짓는다. 기존 작품의 고유명사는 쓰지 않는다.
- 외형(appearance)은 일러스트를 그릴 수 있도록 형체, 색, 장식을 구체적으로 2~3문장으로 쓴다. 색은 palette를 따른다.
- 설정(backstory)은 realm, bond, stance를 담아 3~4문장으로 쓴다. crisis가 드러나는 일화에서 ability를 쓰는 장면을 넣는다.
- 럭키 아이템(lucky_item)은 lucky_item_type에 해당하면서 일상에서 찾을 수 있는 물건 하나로 고른다.
- 2027년 메시지(message_2027)는 wish를 담아 참가자에게 건네는 따뜻한 1~2문장으로 쓴다.

지켜야 할 것
- 모든 값은 가상의 캐릭터를 위한 재료다. 참가자 본인의 외모, 성격, 나이, 성별, 인종을 짐작하거나 평가하지 않는다.
- 캐릭터의 외형을 사람 얼굴로 묘사하거나 참가자의 실제 얼굴과 닮게 묘사하지 않는다. 점수는 위 방향대로 인외 존재의 특징으로만 바꾼다.
- 모든 연령이 보는 행사이므로 잔인하거나 선정적이거나 불안을 주는 내용을 쓰지 않는다. '심연'은 신비롭게 그린다."""


class CharacterAiError(Exception):
    """생성 실패. message는 참가자·운영자에게 보여줄 수 있는 문구다."""

    def __init__(self, message: str, *, retryable: bool):
        super().__init__(message)
        self.retryable = retryable


def _build_client() -> openai.OpenAI:
    # 부스에서 무한 대기하지 않도록 재시도 포함 대기 시간을 제한한다
    return openai.OpenAI(timeout=45.0, max_retries=1)


def decide_character(parameters: CharacterParameters) -> AiDecision:
    try:
        response = _build_client().responses.parse(
            model=os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
            instructions=INSTRUCTIONS,
            input=parameters.model_dump_json(indent=2),
            text_format=AiDecision,
            max_output_tokens=8000,
            store=False,
        )
    except openai.AuthenticationError as error:
        raise CharacterAiError("API 키를 확인해 주세요", retryable=False) from error
    except openai.BadRequestError as error:
        raise CharacterAiError("캐릭터 생성 요청이 올바르지 않아요", retryable=False) from error
    except openai.RateLimitError as error:
        raise CharacterAiError("요청이 많아요. 잠시 후 다시 시도해 주세요", retryable=True) from error
    except (openai.APIConnectionError, openai.InternalServerError) as error:
        # APITimeoutError는 APIConnectionError의 하위 클래스다
        raise CharacterAiError("AI 서버에 연결하지 못했어요. 다시 시도해 주세요", retryable=True) from error
    except openai.APIStatusError as error:
        raise CharacterAiError("캐릭터 생성에 실패했어요", retryable=error.status_code >= 500) from error
    except ValidationError as error:
        raise CharacterAiError("캐릭터를 완성하지 못했어요. 다시 시도해 주세요", retryable=True) from error
    except openai.OpenAIError as error:
        # 키가 전혀 없을 때 등 클라이언트 쪽 오류
        raise CharacterAiError("AI 연결 설정을 확인해 주세요", retryable=False) from error

    # 거절(refusal)이나 토큰 한도로 잘린 경우 output_parsed가 비어 있다
    if response.status != "completed" or response.output_parsed is None:
        raise CharacterAiError("캐릭터를 완성하지 못했어요. 다시 시도해 주세요", retryable=True)

    return response.output_parsed
