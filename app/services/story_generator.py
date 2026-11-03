"""
캐릭터 글 생성 (OpenAI GPT)

역할: 룰로 확정된 파라미터를 GPT에 보내 이름, 외형, 설정, 럭키 아이템, 2027년 메시지를 받아온다.
비고: 얼굴 이미지와 원본 수치는 보내지 않고 변환된 파라미터만 보낸다. 요청은 OpenAI에 저장하지 않는다(store=False).
      API 키는 OPENAI_API_KEY, 모델은 OPENAI_MODEL 환경변수(.env)에서 읽는다.

수정 이력:
  - 2026-11-03 최초 작성
"""

import os

import openai
from pydantic import ValidationError

from app.schemas import CharacterParameters, GeneratedStory

# 자연스러운 글쓰기와 빠른 응답이 중요해서 기본값으로 사용한다
DEFAULT_MODEL = "gpt-6.1-terra"

INSTRUCTIONS = """너는 체험 부스 '심연의 관측소'의 기록 담당자다. 관측소가 심연에서 찾아낸 가상의 존재를 기록한다.
입력으로 받은 파라미터에 맞춰 판타지 캐릭터의 글을 한국어로 써라. 결과는 참가자가 포토카드로 받아 간다.

종족(race), 속성(element), 성향(disposition), 능력치(stats)는 이미 확정된 값이다. 바꾸거나 모순되게 쓰지 말고 글에 녹여라.

작성 기준
- 이름(name)은 2~8자로 새로 짓는다. 기존 작품의 고유명사는 쓰지 않는다.
- 외형(appearance)은 일러스트를 그릴 수 있도록 형체, 색, 장식을 구체적으로 2~3문장으로 쓴다. silhouette, presence를 반영한다.
- 설정(backstory)은 realm, bond, stance를 담아 3~4문장으로 쓴다. 가장 높은 능력치가 드러나는 일화를 넣는다.
- 럭키 아이템(lucky_item)은 일상에서 찾을 수 있는 물건 하나로 고른다.
- 2027년 메시지(message_2027)는 wish를 담아 참가자에게 건네는 따뜻한 1~2문장으로 쓴다.

지켜야 할 것
- 파라미터는 가상의 캐릭터를 위한 재료다. 참가자 본인의 외모, 성격, 나이, 성별, 인종을 짐작하거나 평가하지 않는다.
- 모든 연령이 보는 행사이므로 잔인하거나 선정적이거나 불안을 주는 내용을 쓰지 않는다. '심연'은 신비롭게 그린다."""


class StoryGenerationError(Exception):
    """생성 실패. message는 참가자·운영자에게 보여줄 수 있는 문구다."""

    def __init__(self, message: str, *, retryable: bool):
        super().__init__(message)
        self.retryable = retryable


def _build_client() -> openai.OpenAI:
    # 부스에서 무한 대기하지 않도록 재시도 포함 대기 시간을 제한한다
    return openai.OpenAI(timeout=45.0, max_retries=1)


def generate_story(parameters: CharacterParameters) -> GeneratedStory:
    try:
        response = _build_client().responses.parse(
            model=os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
            instructions=INSTRUCTIONS,
            input=parameters.model_dump_json(indent=2),
            text_format=GeneratedStory,
            max_output_tokens=8000,
            store=False,
        )
    except openai.AuthenticationError as error:
        raise StoryGenerationError("API 키를 확인해 주세요", retryable=False) from error
    except openai.BadRequestError as error:
        raise StoryGenerationError("캐릭터 생성 요청이 올바르지 않아요", retryable=False) from error
    except openai.RateLimitError as error:
        raise StoryGenerationError("요청이 많아요. 잠시 후 다시 시도해 주세요", retryable=True) from error
    except (openai.APIConnectionError, openai.InternalServerError) as error:
        # APITimeoutError는 APIConnectionError의 하위 클래스다
        raise StoryGenerationError("AI 서버에 연결하지 못했어요. 다시 시도해 주세요", retryable=True) from error
    except openai.APIStatusError as error:
        raise StoryGenerationError("캐릭터 생성에 실패했어요", retryable=error.status_code >= 500) from error
    except ValidationError as error:
        raise StoryGenerationError("캐릭터를 완성하지 못했어요. 다시 시도해 주세요", retryable=True) from error
    except openai.OpenAIError as error:
        # 키가 전혀 없을 때 등 클라이언트 쪽 오류
        raise StoryGenerationError("AI 연결 설정을 확인해 주세요", retryable=False) from error

    # 거절(refusal)이나 토큰 한도로 잘린 경우 output_parsed가 비어 있다
    if response.status != "completed" or response.output_parsed is None:
        raise StoryGenerationError("캐릭터를 완성하지 못했어요. 다시 시도해 주세요", retryable=True)

    return response.output_parsed
