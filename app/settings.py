"""
공통 설정 (settings)

역할: 여러 파일에서 함께 쓰는 환경변수 값을 한곳에서 읽는다.
비고: 값은 .env 에서 바꿀 수 있다.

수정 이력:
  - 2026-11-22 최초 작성 (포토카드 저장 폴더)
"""

import os
from pathlib import Path


def card_output_dir() -> Path:
    """포토카드와 일러스트를 저장하는 폴더. git에 올라가지 않는다(.gitignore)."""
    folder = Path(os.getenv("CARD_OUTPUT_DIR", "output/cards"))
    folder.mkdir(parents=True, exist_ok=True)
    return folder
