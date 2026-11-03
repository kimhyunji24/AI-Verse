"""
캐릭터 결정과 글 생성 (하이브리드의 AI 담당, OpenAI GPT)

역할: 룰이 만든 점수·후보·기본 능력치를 GPT에 보내 최종 선택과 해석, 글을 받아온다.
비고: 얼굴 이미지와 원본 측정값은 보내지 않고, 0~1로 변환해 반올림한 점수만 보낸다.
      요청은 OpenAI에 저장하지 않는다(store=False). 결과는 룰이 고치지 않고 그대로 쓴다.
      API 키는 OPENAI_API_KEY, 모델은 OPENAI_MODEL 환경변수(.env)에서 읽는다.

수정 이력:
  - 2026-11-03 최초 작성 (story_generator.py)
  - 2026-11-03 색감, 고유 능력, 위기 일화, 럭키 아이템 종류를 글에 반영하도록 지시 추가
  - 2026-11-03 하이브리드로 변경: GPT가 얼굴 점수를 해석해 후보 중 선택하고 능력치를 조정, 파일 이름 변경
  - 2026-11-03 얼굴 점수 항목별 의미와 해석 방향을 프롬프트에 추가
  - 2026-11-03 애니 캐릭터 지원, 후보를 참고 사항으로 변경
  - 2026-11-03 인외 캐릭터를 머리가 사물이고 몸은 사람인 캐릭터로 변경
"""

import os

import openai
from pydantic import ValidationError

from app.schemas import AiDecision, CharacterParameters

# 자연스러운 글쓰기와 빠른 응답이 중요해서 기본값으로 사용한다
DEFAULT_MODEL = "gpt-6.1-terra"

INSTRUCTIONS = """너는 체험 부스의 묘약 기록 담당자다. 재료를 끓여 태어난 가상의 캐릭터를 기록한다.
입력으로 받은 값을 해석해 캐릭터를 결정하고 한국어로 기록해라. 결과는 참가자가 포토카드로 받아 간다.

캐릭터 유형 (character_type)
- 머리가 사물인 인외 캐릭터: 머리 자리에 사물이 달려 있고 목 아래는 사람의 몸인 캐릭터로 만든다. 촉수나 괴물로 만들지 않고, 사물에 사람 얼굴을 그려 넣지 않는다. 몸에 입은 옷과 소품도 구체적으로 정한다.
- 애니메이션 인물 캐릭터: 일본 애니메이션풍의 사람 인물로 만든다. 머리 모양과 색, 눈 색, 의상, 소품이 뚜렷해야 한다.
  성별과 나이대는 재료에 어울리게 네가 정하며, 참가자의 실제 성별이나 나이를 따르지 않는다. 미성년자처럼 보이는 인물을 성적으로 묘사하지 않는다.

입력 값
- face_scores: 얼굴 측정 비율을 0~1로 바꾼 점수다. 0.5 근처가 중간이다. 높고 낮음에 좋고 나쁨이 없으며 설정의 재료일 뿐이다.
  각 항목의 뜻(0에 가까울 때 / 1에 가까울 때)과 유형별로 반영할 방향은 다음과 같다.
  - face_aspect_ratio: 얼굴 세로/가로 비율(가로로 넓음 / 세로로 긺). 인외: 납작하고 둥근 사물 / 길쭉한 사물. 애니: 아담한 실루엣 / 늘씬한 실루엣
  - eye_spacing_ratio: 두 눈 중심 사이 거리(가까움 / 멂). 인외: 사물의 불빛과 장식이 한곳에 모임 / 넓게 퍼짐. 애니: 집중하는 표정 / 여유롭게 둘러보는 표정
  - inner_eye_gap_ratio: 미간 너비, 두 눈 안쪽 끝 사이(좁음 / 넓음). 인외: 표면 무늬가 촘촘함 / 듬성함. 애니: 단정하게 묶은 머리 / 풍성하게 풀어 내린 머리
  - eye_position_ratio: 이마 끝에서 눈까지의 위치(위쪽 / 아래쪽). 인외: 장식이 사물 위쪽 / 아래쪽. 애니: 머리 장식 / 목이나 가슴 장식
  - nose_length_ratio: 코 길이(짧음 / 긺). 인외: 튀어나온 부품이 짧음 / 긺. 애니: 짧은 망토나 재킷 / 긴 코트나 로브
  - nose_position_ratio: 이마 끝에서 코 밑까지의 위치(위쪽 / 아래쪽). 인외: 사물의 무게 중심이 위쪽 / 아래쪽. 애니: 상의가 화려 / 하의와 신발이 화려
  - nose_width_ratio: 코 너비(좁음 / 넓음). 인외: 몸에 딱 맞는 옷 / 넉넉한 옷. 애니: 날렵한 움직임 / 느긋한 움직임
  - mouth_width_ratio: 입 너비(좁음 / 넓음). 인외: 사물이 내는 소리가 작음 / 큼. 애니: 조곤조곤한 목소리 / 시원시원한 목소리
  - lip_thickness_ratio: 입술 두께, 입 벌림 제외(얇음 / 두꺼움). 인외: 재질이 얇고 단단함 / 두껍고 푹신함. 애니: 짧고 건조한 말투 / 다정하고 긴 말투
  - mouth_position_ratio: 이마 끝에서 입까지의 위치(위쪽 / 아래쪽). 인외: 소품을 머리 가까이 듦 / 허리춤에 참. 애니: 소품을 머리 위로 듦 / 허리춤에 참
  - jaw_width_ratio: 턱 폭(좁음 / 넓음). 인외: 가볍고 경쾌한 사물 / 묵직한 사물. 애니: 경쾌한 분위기 / 듬직한 분위기
  점수가 0.5에서 멀수록 그 특징을 캐릭터에 더 뚜렷하게 드러낸다.
- silhouette, gaze, presence, stance, realm, bond, wish, crisis: 룰이 분류한 재료 문구다.
- palette, ability, lucky_item_type: 룰이 정한 값이다. 그대로 따른다.

결정할 것
- race: 인외 캐릭터는 머리에 달린 사물, 애니메이션 인물은 역할이나 직업이다. race_candidates를 참고해 고르거나, 재료에 더 어울리면 새로 지어도 된다.
- element, disposition: element_candidates, disposition_candidates를 참고해 같은 방식으로 정한다. element는 2~6자, disposition은 한 문장이다.
- stats: base_stats를 참고해 정한다. 각 값은 1~100의 정수이고 합계는 300이다.
- reason: 어떤 재료 때문에 이렇게 골랐는지 판타지 말투로 한 문장으로 쓴다. 숫자와 얼굴 부위 이름은 쓰지 않는다.

작성 기준
- 이름(name)은 2~8자로 새로 짓는다. 기존 작품의 고유명사나 캐릭터를 쓰지 않는다.
- 외형(appearance)은 일러스트를 그릴 수 있도록 형체, 색, 장식을 구체적으로 2~3문장으로 쓴다. 색은 palette를 따른다.
- 설정(backstory)은 realm, bond, stance를 담아 3~4문장으로 쓴다. crisis가 드러나는 일화에서 ability를 쓰는 장면을 넣는다.
- 럭키 아이템(lucky_item)은 lucky_item_type에 해당하면서 일상에서 찾을 수 있는 물건 하나로 고른다.
- 2027년 메시지(message_2027)는 wish를 담아 참가자에게 건네는 따뜻한 1~2문장으로 쓴다.

지켜야 할 것
- 모든 값은 가상의 캐릭터를 위한 재료다. 참가자 본인의 외모, 성격, 나이, 성별, 인종을 짐작하거나 평가하지 않는다.
- 캐릭터를 참가자의 실제 얼굴과 닮게 묘사하지 않는다. 점수는 위 방향대로만 바꾼다.
- 모든 연령이 보는 행사이므로 잔인하거나 선정적이거나 불안을 주는 내용을 쓰지 않는다."""


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
