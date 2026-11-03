"""
블랙박스 테스트 공통 준비

역할: OpenAI API 자리에 가짜 HTTP 서버를 띄운다. 앱 내부는 건드리지 않고 환경변수(OPENAI_BASE_URL)로만 연결한다.
비고: 테스트는 공개 API(/api/character)의 입력과 출력, 그리고 밖으로 나간 요청만 보고 판단한다.
      실제 OpenAI를 호출하지 않으므로 비용이 들지 않는다.

수정 이력:
  - 2026-11-03 최초 작성
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from fastapi.testclient import TestClient

from app.main import app

STORY = {
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
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            fake.requests.append(request)
            if fake.status == 200:
                payload = fake.body(request)
            else:
                payload = {"error": {"message": "fake error", "type": "fake"}}
            data = json.dumps(payload).encode()
            self.send_response(fake.status)
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
