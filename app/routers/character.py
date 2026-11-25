"""
캐릭터 생성 라우터

역할: POST /api/character: 얼굴 특징값 + 응답 데이터를 받아 캐릭터 정보를 반환한다.
비고: 하이브리드 처리다. 룰(services/parameters.py)이 재료와 후보를 만들고, GPT(services/ai_character.py)가 결정한다.

수정 이력:
  - 2026-11-03 최초 작성
  - 2026-11-03 back/ 폴더를 브랜치 루트로 이동
  - 2026-11-03 더미 응답을 제거하고 룰 파라미터 변환과 GPT 글 생성을 연결
  - 2026-11-22 애니메이션 캐릭터는 참고 캐릭터에서 화풍을 먼저 뽑아 재료에 넣도록 추가
  - 2026-11-22 화풍과 함께 얼굴 생김새가 반영된 생김새 특징도 재료에 넣도록 변경
  - 2026-11-22 실제 동물 캐릭터로 바뀌어 화풍·특징 추출 단계 삭제
  - 2026-11-22 이름이 '~한 + 종족' 형식이 되도록 종족이 빠진 이름에 종족을 붙임
  - 2026-11-22 이름을 서버가 '수식어 후보 중 하나 + 종족'으로 조립하고, 종족에 붙은 수식어는 뗌
"""

from fastapi import APIRouter, HTTPException

from app.schemas import CharacterRequest, CharacterResponse
from app.services.ai_character import CharacterAiError, decide_character
from app.services.parameters import build_parameters

router = APIRouter()


def _settle_name(decision, name_hints: list[str]) -> None:
    """이름을 "수식어 + 종족" 형식으로 맞춘다.
    모델이 종족에 수식어를 붙이거나(동글동글한 오리), 후보에 없는 수식어를 쓰는 경우가 있어 서버가 조립한다."""
    for hint in name_hints:
        if decision.race.startswith(hint + " "):
            decision.race = decision.race[len(hint) + 1 :]
    modifier = next((hint for hint in name_hints if hint in decision.name), name_hints[0] if name_hints else "")
    decision.name = f"{modifier} {decision.race}".strip()


@router.post("/character", response_model=CharacterResponse)
def create_character(req: CharacterRequest):
    parameters = build_parameters(req.features, req.answers)
    try:
        decision = decide_character(parameters)
    except CharacterAiError as error:
        raise HTTPException(
            status_code=503 if error.retryable else 500,
            detail={"message": str(error), "retryable": error.retryable},
        ) from error
    _settle_name(decision, parameters.name_hints)
    return CharacterResponse(
        **decision.model_dump(),
        palette=parameters.palette,
        parameters=parameters,
    )
