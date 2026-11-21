"""
캐릭터 생성 라우터

역할: POST /api/character: 얼굴 특징값 + 응답 데이터를 받아 캐릭터 정보를 반환한다.
비고: 하이브리드 처리다. 룰(services/parameters.py)이 재료와 후보를 만들고, GPT(services/ai_character.py)가 결정한다.

수정 이력:
  - 2026-11-03 최초 작성
  - 2026-11-03 back/ 폴더를 브랜치 루트로 이동
  - 2026-11-03 더미 응답을 제거하고 룰 파라미터 변환과 GPT 글 생성을 연결
  - 2026-11-22 애니메이션 캐릭터는 참고 캐릭터에서 화풍을 먼저 뽑아 재료에 넣도록 추가
"""

from fastapi import APIRouter, HTTPException

from app.schemas import CharacterRequest, CharacterResponse
from app.services.ai_character import CharacterAiError, decide_character
from app.services.art_style import extract_art_style
from app.services.parameters import art_reference, build_parameters

router = APIRouter()


@router.post("/character", response_model=CharacterResponse)
def create_character(req: CharacterRequest):
    parameters = build_parameters(req.features, req.answers)
    # 애니메이션 캐릭터: 참고 캐릭터의 화풍을 글로 뽑아 대체 화풍 대신 쓴다 (실패하면 대체 화풍 그대로)
    reference = art_reference(req.features, req.answers)
    if reference:
        parameters.art_style = extract_art_style(reference) or parameters.art_style
    try:
        decision = decide_character(parameters)
    except CharacterAiError as error:
        raise HTTPException(
            status_code=503 if error.retryable else 500,
            detail={"message": str(error), "retryable": error.retryable},
        ) from error
    return CharacterResponse(
        **decision.model_dump(),
        palette=parameters.palette,
        ability=parameters.ability,
        parameters=parameters,
    )
