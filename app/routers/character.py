"""
캐릭터 생성 라우터

역할: POST /api/character: 얼굴 특징값 + 응답 데이터를 받아 캐릭터 정보를 반환한다.
비고: 현재는 더미 응답. 생성 로직(LLM/이미지)은 services/ 에 구현 예정

수정 이력:
  - 2026-11-03 최초 작성
  - 2026-11-03 back/ 폴더를 브랜치 루트로 이동
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class CharacterRequest(BaseModel):
    # MediaPipe 랜드마크에서 추출한 수치형 특징값
    features: dict[str, float]
    # 참가자의 간단한 응답 결과
    answers: dict[str, str] = {}


class CharacterResponse(BaseModel):
    name: str
    race: str
    element: str
    stats: dict[str, int]
    description: str
    lucky_item: str
    message_2027: str


@router.post("/character", response_model=CharacterResponse)
def create_character(req: CharacterRequest):
    # TODO: 특징값 + 응답 -> 생성 파라미터 변환, LLM/이미지 생성 호출
    return CharacterResponse(
        name="미정",
        race="미정",
        element="미정",
        stats={},
        description="",
        lucky_item="",
        message_2027="",
    )
