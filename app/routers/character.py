"""
캐릭터 생성 라우터

역할: POST /api/character: 얼굴 특징값 + 응답 데이터를 받아 캐릭터 정보를 반환한다.
비고: 룰 변환은 services/parameters.py, 글 생성은 services/story_generator.py 에 있다.

수정 이력:
  - 2026-11-03 최초 작성
  - 2026-11-03 back/ 폴더를 브랜치 루트로 이동
  - 2026-11-03 더미 응답을 제거하고 룰 파라미터 변환과 GPT 글 생성을 연결
"""

from fastapi import APIRouter, HTTPException

from app.schemas import CharacterRequest, CharacterResponse
from app.services.parameters import build_parameters
from app.services.story_generator import StoryGenerationError, generate_story

router = APIRouter()


@router.post("/character", response_model=CharacterResponse)
def create_character(req: CharacterRequest):
    parameters = build_parameters(req.features, req.answers)
    try:
        story = generate_story(parameters)
    except StoryGenerationError as error:
        raise HTTPException(
            status_code=503 if error.retryable else 500,
            detail={"message": str(error), "retryable": error.retryable},
        ) from error
    return CharacterResponse(
        **story.model_dump(),
        race=parameters.race,
        element=parameters.element,
        disposition=parameters.disposition,
        stats=parameters.stats,
        parameters=parameters,
    )
