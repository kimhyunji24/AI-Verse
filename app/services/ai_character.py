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
  - 2026-11-22 애니메이션 캐릭터를 화풍(art_style)을 따르고 얼굴 생김새(face_traits)가 참가자와 닮은 오리지널 캐릭터로 변경
  - 2026-11-22 생김새 특징(art_features)을 외형에 모두 담도록 지시 추가
  - 2026-11-22 인외 콘셉트에 맞춰 애니메이션 캐릭터를 사람이 아닌 캐릭터(동물·생물·마스코트)로만 만들도록 변경
  - 2026-11-22 이름을 부르기 쉬운 2~4글자로, 종족·역할을 짧은 이름으로 쓰도록 규칙 변경
  - 2026-11-22 이름에 name_sounds 음절을 쓰도록 변경 (예시 이름 반복 방지)
  - 2026-11-22 이름을 뜻 있는 낱말(name_hints)에서 짓도록 변경 (뜻 없는 음절 조합 방지)
  - 2026-11-22 애니메이션 캐릭터를 실제 동물 캐릭터로 교체, 얼굴 점수의 동물 해석 추가
  - 2026-11-22 이름을 애칭 대신 '~한 + 종족' 형식(예: 보송보송한 토끼)으로 변경
  - 2026-11-22 실제 동물을 '동물 머리 + 사람 몸'으로 바꾸고, 두 유형 모두 의상(outfit)을 따르도록 변경
  - 2026-11-22 동물 캐릭터를 2등신 찹쌀떡 몸의 귀여운 손그림 동물로 바꾸고, 격한 감정(emotion)을 글에 담도록 변경
  - 2026-11-26 종족과 이어지는 물건을 쓰는 동작(action) 추가 (예: 찻주전자 머리가 찻잔에 차를 따름)
  - 2026-11-26 체형·살집 표현 금지, 얼굴 점수의 동물 해석에서 체형(통통·듬직한 몸집)을 귀·무늬·꼬리로 바꿈
  - 2026-11-26 능력치 이름(stat_names)을 캐릭터마다 새로 짓도록 변경. 고유 능력·선택 이유는 룰이 얼굴 패턴으로 정하므로 쓰지 않음
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
- 머리가 사물인 인외 캐릭터: 머리 자리에 사물이 달려 있고 목 아래는 사람의 몸인 캐릭터로 만든다. 촉수나 괴물로 만들지 않고, 사물에 사람 얼굴을 그려 넣지 않는다. 몸에는 outfit의 옷을 입는다.
- 머리가 실제 동물인 인외 캐릭터: race_candidates의 동물을 2등신 찹쌀떡 같은 둥근 몸의 귀여운 손그림 캐릭터로 만든다.
  온몸이 동물이며 머리카락 대신 동물 귀와 털 무늬가 있다. 몸에는 outfit의 옷을 단순하게 입는다.
  얼굴은 face_traits의 생김새를 자연스럽게 옮겨 참가자와 닮은 느낌이 나게 하고, 외형(appearance)에 이 생김새를 꼭 적는다.
  emotion의 감정을 한껏 과장해 드러낸다. 외형에 그 감정의 표정과 몸짓을, 설정(backstory)에 그렇게 된 사연을 담는다.
  털 색과 무늬가 뚜렷해야 한다. 성별과 나이를 정하지 않는다.

입력 값
- face_scores: 얼굴 측정 비율을 0~1로 바꾼 점수다. 0.5 근처가 중간이다. 높고 낮음에 좋고 나쁨이 없으며 설정의 재료일 뿐이다.
  각 항목의 뜻(0에 가까울 때 / 1에 가까울 때)과 유형별로 반영할 방향은 다음과 같다.
  - face_aspect_ratio: 얼굴 세로/가로 비율(가로로 넓음 / 세로로 긺). 인외: 납작하고 둥근 사물 / 길쭉한 사물. 동물: 귀가 둥글고 짧음 / 귀가 길고 쭉 뻗음
  - eye_spacing_ratio: 두 눈 중심 사이 거리(가까움 / 멂). 인외: 사물의 불빛과 장식이 한곳에 모임 / 넓게 퍼짐. 동물: 눈이 가운데로 모인 얼굴 / 눈이 양옆으로 벌어진 얼굴
  - inner_eye_gap_ratio: 미간 너비, 두 눈 안쪽 끝 사이(좁음 / 넓음). 인외: 표면 무늬가 촘촘함 / 듬성함. 동물: 이마가 좁은 얼굴 / 이마가 넓은 얼굴
  - eye_position_ratio: 이마 끝에서 눈까지의 위치(위쪽 / 아래쪽). 인외: 장식이 사물 위쪽 / 아래쪽. 동물: 눈이 높이 달린 얼굴 / 눈이 낮게 달린 얼굴
  - nose_length_ratio: 코 길이(짧음 / 긺). 인외: 튀어나온 부품이 짧음 / 긺. 동물: 주둥이가 짧음 / 주둥이가 긺
  - nose_position_ratio: 이마 끝에서 코 밑까지의 위치(위쪽 / 아래쪽). 인외: 사물의 무게 중심이 위쪽 / 아래쪽. 동물: 얼굴 위쪽 무늬가 진함 / 턱과 가슴 쪽 무늬가 진함
  - nose_width_ratio: 코 너비(좁음 / 넓음). 인외: 몸에 딱 맞는 옷 / 넉넉한 옷. 동물: 코가 작고 뾰족함 / 코가 크고 둥긂
  - mouth_width_ratio: 입 너비(좁음 / 넓음). 인외: 사물이 내는 소리가 작음 / 큼. 동물: 입이 작음 / 입이 큼
  - lip_thickness_ratio: 입술 두께, 입 벌림 제외(얇음 / 두꺼움). 인외: 재질이 얇고 단단함 / 두껍고 푹신함. 동물: 털이 짧고 매끈함 / 털이 길고 복슬복슬함
  - mouth_position_ratio: 이마 끝에서 입까지의 위치(위쪽 / 아래쪽). 인외: 소품을 머리 가까이 듦 / 허리춤에 참. 동물: 무늬가 얼굴 위쪽에 진함 / 무늬가 턱 쪽에 진함
  - jaw_width_ratio: 턱 폭(좁음 / 넓음). 인외: 가볍고 경쾌한 사물 / 묵직한 사물. 동물: 꼬리가 가늘고 김 / 꼬리가 풍성하고 복슬복슬함
  점수가 0.5에서 멀수록 그 특징을 캐릭터에 더 뚜렷하게 드러낸다.
- silhouette, gaze, presence, stance, realm, bond, wish, crisis: 룰이 분류한 재료 문구다.
- palette, lucky_item_type: 룰이 정한 값이다. 그대로 따른다.
- ability: 룰이 정한 고유 능력 이름이다. 바꾸지 않고 그대로 쓴다.
- signature_trait, animal_look: 얼굴에서 가장 두드러진 특징과 가장 닮은 동물상이다. 외형과 설정에 자연스럽게 묻어나게 한다.

결정할 것
- race: 사물 머리 캐릭터는 머리에 달린 사물(예: 등대 머리), 동물 머리 캐릭터는 동물 이름(예: 수달)이다.
  race_candidates에 하나만 있다. 룰이 고른 것이므로 꾸밈말 없이 그대로 쓴다.
  12자 이내의 짧은 이름으로 쓰고, "~를 돕는 작은 ~"처럼 설명하는 문장으로 쓰지 않는다.
- element, disposition: element_candidates, disposition_candidates를 참고해 같은 방식으로 정한다. element는 2~6자, disposition은 한 문장이다.
- stats: base_stats를 참고해 정한다. 각 값은 1~100의 정수이고 합계는 300이다.
- stat_names: 능력치 6개(insight 통찰, vitality 생명력, resonance 공명, agility 민첩, willpower 의지, luck 행운)에
  이 캐릭터의 race, element, realm이 묻어나는 이름을 하나씩 새로 짓는다. 각 2~4자 한국어 명사로, 원래 뜻이 짐작되게 하되
  원래 이름(통찰, 생명력, 공명, 민첩, 의지, 행운)을 그대로 쓰지 않는다. 6개는 서로 달라야 한다.
  예(심해의 기니피그): 물결감지, 끈기, 메아리, 헤엄, 버팀, 진주운 / 예(구름 위 등대 머리): 먼빛, 불씨, 신호, 회전, 등대심, 맑은날

작성 기준
- 이름(name)은 "~한 + 종족" 형식으로 짓는다. 종족은 정한 race를 그대로 쓰고, race 자체에는 수식어를 붙이지 않는다. 예: 보송보송한 토끼, 몽실한 수달, 말랑한 등대 머리.
  앞의 수식어는 name_hints의 낱말 중 캐릭터의 생김새나 성격에 가장 어울리는 하나를 고쳐 쓰지 말고 그대로 쓴다.
  name_hints에 없는 말을 지어내거나 뜻 없는 소리, 평가하는 말(예쁜, 잘생긴 등)을 붙이지 않는다.
  기존 작품의 고유명사나 캐릭터 이름을 쓰지 않는다.
- 동작(action): race와 바로 이어지는 물건 하나를 쓰고 있는 장면을 한 문장으로 쓴다. 머리(사물)나 동물의 특징이 그 물건과 함께 쓰이면 좋다.
  사물 머리 예) 찻주전자 머리: 한 손에 든 찻잔에 머리를 기울여 차를 따르는 중 / 등대 머리: 손전등을 비추며 머리 불빛과 맞추는 중 /
  잉크병 머리: 깃펜을 머리에 찍어 편지를 쓰는 중
  동물 예) 수달: 배 위에 올린 조개를 돌로 두드리는 중 / 다람쥐: 볼에 도토리를 넣는 중 / 햄스터: 해바라기씨를 두 손으로 갉아 먹는 중 /
  펭귄: 작은 물고기를 입에 물고 있는 중 / 나무늘보: 나뭇가지를 끌어안고 매달린 중
  물건은 race를 듣자마자 떠오르는 것(사물의 쓰임새, 동물이 즐겨 먹거나 하는 것)으로 고른다. 옷(outfit)에 달린 물건은 쓰지 않는다.
  물건은 하나만 쓰고 30자 안팎의 한 문장으로 쓴다. 앞에 race 이름이나 화살표를 붙이지 않는다. 한 손으로 하는 동작이면 좋다(다른 손은 손 모양에 쓸 수 있다).
- 외형(appearance)은 일러스트를 그릴 수 있도록 머리(동물은 몸 전체)의 형체·색과 outfit 옷차림, action의 물건을 구체적으로 2~3문장으로 쓴다. 색은 palette를 따른다.
- 설정(backstory)은 realm, bond, stance를 담아 3~4문장으로 쓴다. crisis가 드러나는 일화에서 고유 능력을 쓰는 장면을 넣는다.
- 럭키 아이템(lucky_item)은 lucky_item_type에 해당하면서 일상에서 찾을 수 있는 물건 하나로 고른다.
- 2027년 메시지(message_2027)는 wish를 담아 참가자에게 건네는 따뜻한 1~2문장으로 쓴다.

지켜야 할 것
- 모든 값은 가상의 캐릭터를 위한 재료다. 참가자 본인의 외모, 성격, 나이, 성별, 인종을 짐작하거나 평가하지 않는다.
- 인외 캐릭터는 참가자의 얼굴과 닮게 묘사하지 않는다. 점수는 위 방향대로만 바꾼다.
- 동물 머리 캐릭터는 face_traits에 적힌 생김새만큼만 닮게 하고, 생김새를 좋고 나쁨이나 매력으로 표현하지 않는다.
- 모든 연령이 보는 행사이므로 잔인하거나 선정적이거나 불안을 주는 내용을 쓰지 않는다.
- 체형이나 살집을 떠올리게 하는 말(통통, 포동포동, 토실토실, 뚱뚱, 살집, 몸집이 큰 등)을 어디에도 쓰지 않는다.
  캐릭터가 참가자의 얼굴로 만들어져서 본인 외모를 두고 하는 말처럼 들릴 수 있다."""


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
            # 무작위 소품(prop)은 보내지 않는다. 주면 종족과 상관없는 소품으로 끌려간다. 그림에서 동작이 비었을 때만 쓴다.
            input=parameters.model_dump_json(indent=2, exclude={"prop"}),
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
