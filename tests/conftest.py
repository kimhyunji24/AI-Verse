"""
블랙박스 테스트 공통 준비

역할: OpenAI API 자리에 가짜 HTTP 서버를 띄운다. 앱 내부는 건드리지 않고 환경변수(OPENAI_BASE_URL)로만 연결한다.
비고: 테스트는 공개 API(/api/character)의 입력과 출력, 그리고 밖으로 나간 요청만 보고 판단한다.
      실제 OpenAI를 호출하지 않으므로 비용이 들지 않는다.

수정 이력:
  - 2026-11-03 최초 작성
  - 2026-11-22 이미지 생성 요청 응답과 포토카드 저장 폴더(임시 폴더) 추가
  - 2026-11-22 이미지 편집 요청(multipart, 포즈 참고 이미지)도 기록하도록 추가
  - 2026-11-22 화풍 추출 요청에 응답하고, 화풍 추출만 실패시키는 설정 추가
  - 2026-11-22 화풍 추출 응답을 화풍 + 생김새 특징(JSON)으로 변경
  - 2026-11-22 화풍 추출 단계가 없어져 관련 가짜 응답 삭제
"""

import base64
import email.parser
import email.policy
import io
import json
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from fastapi.testclient import TestClient
from PIL import Image

# 앱을 불러오기 전에 정해야 카드 파일 제공 폴더(/cards)도 임시 폴더를 가리킨다
CARD_DIR = tempfile.mkdtemp(prefix="cards-")
os.environ["CARD_OUTPUT_DIR"] = CARD_DIR

from app.main import app  # noqa: E402


def _png(size=(64, 64), color=(120, 80, 200)) -> str:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


FAKE_IMAGE_B64 = _png()


def _parse_multipart(content_type: str, raw: bytes) -> dict:
    """이미지 편집 요청(multipart)에서 글자 칸은 문자열로, 파일 칸은 바이트로 꺼낸다."""
    message = email.parser.BytesParser(policy=email.policy.HTTP).parsebytes(
        f"Content-Type: {content_type}\r\n\r\n".encode() + raw
    )
    fields = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        payload = part.get_payload(decode=True)
        fields[name] = payload if part.get_filename() else payload.decode()
    return fields

STORY = {
    "stat_names": {
        "insight": "물결감지",
        "vitality": "끈기",
        "resonance": "메아리",
        "agility": "헤엄",
        "willpower": "버팀",
        "luck": "진주운",
    },
    "ability": "안개 속 속마음 청진",
    "reason": "달빛 조각이 먼저 끓어올랐다.",
    "name": "루미",
    "appearance": "푸른 빛을 내는 지느러미를 가졌다.",
    "backstory": "심연에서 태어났다.",
    "lucky_item": "파란 볼펜",
    "message_2027": "2027년에는 새로운 바다로 나아가요.",
}


class FakeOpenAI:
    """받은 요청을 기록하고, 정해 둔 내용으로 응답하는 가짜 OpenAI 서버"""

    def __init__(self):
        self.requests = []
        self.choose = self.first_candidates
        self.status = 200
        self.response_status = "completed"
        self.refuse = False

    @staticmethod
    def first_candidates(parameters):
        return {
            "race": parameters["race_candidates"][0],
            "element": parameters["element_candidates"][0],
            "disposition": parameters["disposition_candidates"][0],
            "stats": parameters["base_stats"],
            **STORY,
        }

    def body(self, request):
        content = (
            {"type": "refusal", "refusal": "거절"}
            if self.refuse
            else {
                "type": "output_text",
                "text": json.dumps(self.choose(json.loads(request["input"])), ensure_ascii=False),
                "annotations": [],
            }
        )
        return {
            "id": "resp_test",
            "object": "response",
            "created_at": 0,
            "model": request["model"],
            "status": self.response_status,
            "output": [
                {
                    "type": "message",
                    "id": "msg_test",
                    "status": "completed",
                    "role": "assistant",
                    "content": [content],
                }
            ],
            "parallel_tool_calls": True,
            "tool_choice": "auto",
            "tools": [],
        }


@pytest.fixture
def openai_server(monkeypatch):
    fake = FakeOpenAI()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            raw = self.rfile.read(int(self.headers["Content-Length"]))
            if self.headers["Content-Type"].startswith("multipart/form-data"):
                request = _parse_multipart(self.headers["Content-Type"], raw)
            else:
                request = json.loads(raw)
            request["_path"] = self.path
            fake.requests.append(request)
            status = fake.status
            if status != 200:
                payload = {"error": {"message": "fake error", "type": "fake"}}
            elif "/images/" in self.path:
                payload = {"created": 0, "data": [{"b64_json": FAKE_IMAGE_B64}]}
            else:
                payload = fake.body(request)
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    monkeypatch.setenv("OPENAI_BASE_URL", f"http://127.0.0.1:{server.server_port}/v1")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    yield fake
    server.shutdown()


@pytest.fixture
def client():
    return TestClient(app)
