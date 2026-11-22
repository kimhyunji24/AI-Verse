"""
포토카드 라우터

역할: POST /api/photocard: 생성된 캐릭터 정보(와 포즈 뼈대 그림)를 받아 일러스트를 그리고 포토카드 PNG를 합성해 저장한다.
비고: 저장한 파일은 /cards/<id>/ 주소로 제공한다(main.py). 저장 폴더는 CARD_OUTPUT_DIR 환경변수로 바꿀 수 있다.
      참가자 얼굴 이미지는 받지도 저장하지도 않는다. 저장되는 것은 AI가 그린 캐릭터 그림과 관절만 이은 포즈 뼈대 그림뿐이다.

수정 이력:
  - 2026-11-22 최초 작성
  - 2026-11-22 요청 형식을 {character, pose_skeleton}으로 바꾸고 포즈 뼈대 그림 검증 추가
  - 2026-11-22 손 모양(hand_gestures)을 일러스트 생성에 전달
"""

import base64
import binascii
import io
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from PIL import Image, UnidentifiedImageError

from app.schemas import PhotocardRequest, PhotocardResponse
from app.services.illustration import IllustrationError, generate_illustration
from app.services.photocard import compose_card
from app.settings import card_output_dir

router = APIRouter()

# 뼈대 그림은 프론트에서 512×768로 만든다. 이보다 크면 잘못된 요청으로 본다.
MAX_POSE_SIDE = 2048


def _pose_png(encoded: str) -> bytes:
    """base64 PNG를 열어 확인한 뒤 다시 저장한다. 다시 저장하면 그림 외의 메타데이터가 빠진다."""
    data = encoded.split(",", 1)[1] if encoded.startswith("data:") else encoded
    try:
        image = Image.open(io.BytesIO(base64.b64decode(data, validate=True)))
        image.load()
    except (binascii.Error, ValueError, UnidentifiedImageError, OSError) as error:
        raise HTTPException(
            status_code=422,
            detail={"message": "포즈 그림을 읽지 못했어요", "retryable": False},
        ) from error
    if image.format != "PNG" or max(image.size) > MAX_POSE_SIDE:
        raise HTTPException(
            status_code=422,
            detail={"message": "포즈 그림 형식이 올바르지 않아요", "retryable": False},
        )
    output = io.BytesIO()
    image.convert("RGB").save(output, format="PNG")
    return output.getvalue()


@router.post("/photocard", response_model=PhotocardResponse)
def create_photocard(req: PhotocardRequest):
    character = req.character
    pose = _pose_png(req.pose_skeleton) if req.pose_skeleton else None
    try:
        illustration = generate_illustration(character, pose, req.hand_gestures)
    except IllustrationError as error:
        raise HTTPException(
            status_code=503 if error.retryable else 500,
            detail={"message": str(error), "retryable": error.retryable},
        ) from error

    card_id = uuid.uuid4().hex
    folder: Path = card_output_dir() / card_id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "illustration.png").write_bytes(illustration)
    if pose:
        (folder / "pose.png").write_bytes(pose)
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
