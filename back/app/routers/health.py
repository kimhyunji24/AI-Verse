"""
헬스체크 라우터

역할: 서버 동작 여부 확인용 GET /health 엔드포인트.
비고: 프론트/운영 환경에서 서버 상태 점검에 사용

수정 이력:
  - 2026-11-03 최초 작성
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok"}
