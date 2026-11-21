"""
FastAPI 앱 진입점

역할: CORS 설정과 라우터 등록을 담당한다.
비고: 실행: uvicorn app.main:app --reload --port 8000

수정 이력:
  - 2026-11-03 최초 작성
  - 2026-11-03 back/ 폴더를 브랜치 루트로 이동
  - 2026-11-03 .env 자동 로드 추가
  - 2026-11-22 포토카드 라우터와 카드 파일 제공(/cards) 추가
"""

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import character, health, photocard
from app.settings import card_output_dir

load_dotenv()

app = FastAPI(title="AI-Verse API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(character.router, prefix="/api")
app.include_router(photocard.router, prefix="/api")
app.mount("/cards", StaticFiles(directory=card_output_dir()), name="cards")
