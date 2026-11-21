"""
포토카드 API 블랙박스 테스트

역할: POST /api/photocard 의 입력과 출력, 저장된 파일, 밖으로 나간 이미지 생성 요청만 보고 동작을 확인한다.
비고: 캐릭터는 실제 흐름처럼 POST /api/character 응답을 그대로 넣는다. 실제 OpenAI는 호출하지 않는다.

수정 이력:
  - 2026-11-22 최초 작성
"""

import io

import pytest
from PIL import Image

from tests.test_character_blackbox import ANSWERS, FEATURES

# 100×148mm @ 300dpi
CARD_SIZE = (1181, 1748)


def make_character(client, **answers):
    response = client.post(
        "/api/character", json={"features": FEATURES, "answers": {**ANSWERS, **answers}}
    )
    assert response.status_code == 200
    return response.json()


def image_requests(openai_server):
    return [r for r in openai_server.requests if r["_path"].endswith("/images/generations")]


def test_photocard_is_composed_and_served(client, openai_server):
    response = client.post("/api/photocard", json=make_character(client))
    assert response.status_code == 200
    body = response.json()
    assert body["card_url"] == f"/cards/{body['card_id']}/card.png"

    card = client.get(body["card_url"])
    assert card.status_code == 200
    image = Image.open(io.BytesIO(card.content))
    assert image.format == "PNG"
    assert image.size == CARD_SIZE

    illustration = client.get(body["illustration_url"])
    assert illustration.status_code == 200


def test_each_card_gets_its_own_id(client, openai_server):
    character = make_character(client)
    first = client.post("/api/photocard", json=character).json()
    second = client.post("/api/photocard", json=character).json()
    assert first["card_id"] != second["card_id"]


def test_prompt_uses_character_text_only(client, openai_server):
    character = make_character(client)
    client.post("/api/photocard", json=character)
    [request] = image_requests(openai_server)
    prompt = request["prompt"]
    assert character["appearance"] in prompt
    assert character["palette"] in prompt
    # 얼굴 측정값은 이미지 생성 요청에 들어가지 않는다
    for name, value in FEATURES.items():
        assert name not in prompt
        assert str(value) not in prompt


@pytest.mark.parametrize(
    "character_type, expected",
    [("nonhuman", "머리 자리에 사물"), ("anime", "애니메이션풍")],
)
def test_prompt_follows_character_type(client, openai_server, character_type, expected):
    client.post("/api/photocard", json=make_character(client, character_type=character_type))
    [request] = image_requests(openai_server)
    assert expected in request["prompt"]


def test_long_text_still_fits_the_card(client, openai_server):
    character = make_character(client)
    character["message_2027"] = "아주 긴 메시지입니다. " * 40
    character["disposition"] = "길고 긴 성향 설명. " * 30
    response = client.post("/api/photocard", json=character)
    assert response.status_code == 200
    card = client.get(response.json()["card_url"])
    assert Image.open(io.BytesIO(card.content)).size == CARD_SIZE


@pytest.mark.parametrize(
    "status, retryable",
    [(401, False), (400, True), (429, True), (500, True)],
)
def test_image_errors_become_clear_messages(client, openai_server, status, retryable):
    character = make_character(client)
    openai_server.status = status
    response = client.post("/api/photocard", json=character)
    assert response.status_code == (503 if retryable else 500)
    detail = response.json()["detail"]
    assert detail["retryable"] is retryable
    assert detail["message"]


def test_incomplete_character_is_rejected(client, openai_server):
    character = make_character(client)
    del character["appearance"]
    assert client.post("/api/photocard", json=character).status_code == 422
    assert image_requests(openai_server) == []
