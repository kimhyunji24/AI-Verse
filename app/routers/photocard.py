"""
포토카드 라우터

역할: POST /api/photocard: 생성된 캐릭터 정보를 받아 일러스트를 그리고 포토카드 PNG를 합성해 저장한다.
비고: 저장한 파일은 /cards/<id>/ 주소로 제공한다(main.py). 저장 폴더는 CARD_OUTPUT_DIR 환경변수로 바꿀 수 있다.
      참가자 얼굴 이미지는 받지도 저장하지도 않는다. 저장되는 것은 AI가 그린 캐릭터 그림뿐이다.

수정 이력:
  - 2026-11-22 최초 작성
"""

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.schemas import CharacterResponse, PhotocardResponse
from app.services.illustration import IllustrationError, generate_illustration
from app.services.photocard import compose_card
from app.settings import card_output_dir

router = APIRouter()


@router.post("/photocard", response_model=PhotocardResponse)
def create_photocard(character: CharacterResponse):
    try:
        illustration = generate_illustration(character)
    except IllustrationError as error:
        raise HTTPException(
            status_code=503 if error.retryable else 500,
            detail={"message": str(error), "retryable": error.retryable},
        ) from error

    card_id = uuid.uuid4().hex
    folder: Path = card_output_dir() / card_id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "illustration.png").write_bytes(illustration)
    (folder / "card.png").write_bytes(compose_card(character, illustration, card_id))
    # 나중에 다시 뽑거나 확인할 수 있도록 카드에 들어간 내용도 함께 남긴다
    (folder / "character.json").write_text(
        character.model_dump_json(indent=2), encoding="utf-8"
    )

    return PhotocardResponse(
        card_id=card_id,
        illustration_url=f"/cards/{card_id}/illustration.png",
        card_url=f"/cards/{card_id}/card.png",
    )
