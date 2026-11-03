"""
캐릭터 생성 API 데이터 형식

역할: 프론트 ↔ 백 요청/응답과 GPT 구조화 출력에 쓰는 Pydantic 모델을 정의한다.
비고: 형식을 바꾸면 main 브랜치의 docs/api-spec.md 와 프론트 타입(src/lib/characterApi.ts)도 함께 수정한다.

수정 이력:
  - 2026-11-03 최초 작성
  - 2026-11-03 설문 4문항 추가, 눈 크기를 미간 너비로 교체, 색감·고유 능력 추가
  - 2026-11-03 얼굴 측정 항목 확대, 룰이 후보를 만들고 GPT가 결정하는 하이브리드 구조로 변경
  - 2026-11-03 캐릭터 유형(인외, 애니) 추가, GPT 결과를 재검증하지 않도록 변경
"""

from typing import Literal

from pydantic import BaseModel, Field


class FaceFeatures(BaseModel):
    """MediaPipe 랜드마크에서 계산한 수치. 이미지는 받지 않는다."""

    # 얼굴 형태 비율 (얼굴 폭 또는 높이 대비)
    face_aspect_ratio: float = Field(ge=0.5, le=2.5, description="얼굴 높이 / 얼굴 폭")
    eye_spacing_ratio: float = Field(ge=0.0, le=1.0, description="두 눈 중심 거리 / 얼굴 폭")
    inner_eye_gap_ratio: float = Field(ge=0.0, le=1.0, description="미간 너비(두 눈 안쪽 사이) / 얼굴 폭")
    eye_position_ratio: float = Field(ge=0.0, le=1.0, description="이마 끝~눈 거리 / 얼굴 높이")
    nose_length_ratio: float = Field(ge=0.0, le=1.0, description="코 길이 / 얼굴 높이")
    nose_position_ratio: float = Field(ge=0.0, le=1.0, description="이마 끝~코 밑 거리 / 얼굴 높이")
    nose_width_ratio: float = Field(ge=0.0, le=1.0, description="코 너비 / 얼굴 폭")
    mouth_width_ratio: float = Field(ge=0.0, le=1.0, description="입 폭 / 얼굴 폭")
    lip_thickness_ratio: float = Field(ge=0.0, le=1.0, description="입술 두께(입 벌림 제외) / 얼굴 높이")
    mouth_position_ratio: float = Field(ge=0.0, le=1.0, description="이마 끝~입 거리 / 얼굴 높이")
    jaw_width_ratio: float = Field(ge=0.0, le=1.5, description="턱 폭 / 얼굴 폭")
    # 위치 관계 (촬영 당시 머리 자세, 도 단위)
    head_yaw: float = Field(ge=-90, le=90)
    head_pitch: float = Field(ge=-90, le=90)
    head_roll: float = Field(ge=-180, le=180)


class Answers(BaseModel):
    """참가자 응답. 프롬프트 주입을 막기 위해 자유 입력 없이 선택지만 받는다."""

    character_type: Literal["nonhuman", "anime"]
    place: Literal["deep_sea", "night_sky", "old_library", "neon_city"]
    companion: Literal["alone", "one_friend", "crowd"]
    wish_2027: Literal["adventure", "rest", "growth", "connection"]
    time_of_day: Literal["dawn", "noon", "sunset", "midnight"]
    crisis: Literal["confront", "hide", "trick", "call_friends"]
    power: Literal["read_minds", "stop_time", "fly", "transform"]
    bag: Literal["snack", "book", "map", "charm"]


class CharacterRequest(BaseModel):
    features: FaceFeatures
    answers: Answers


class Stats(BaseModel):
    """능력치 (각 1~100). 룰로 계산한다."""

    insight: int
    vitality: int
    resonance: int
    agility: int
    willpower: int
    luck: int


class CharacterParameters(BaseModel):
    """룰이 만든 결과. 같은 입력이면 항상 같은 값이 나오며, 이 전체가 GPT의 입력이 된다."""

    # 얼굴 측정값을 0~1로 변환하고 반올림한 점수. 원본 수치 대신 이 값만 GPT로 보낸다.
    face_scores: dict[str, float]
    character_type: str
    # 분류 문구
    silhouette: str
    gaze: str
    presence: str
    stance: str
    realm: str
    bond: str
    wish: str
    crisis: str
    lucky_item_type: str
    # 룰로 확정되는 값
    palette: str
    ability: str
    # GPT가 참고하는 후보
    race_candidates: list[str]
    element_candidates: list[str]
    disposition_candidates: list[str]
    # GPT가 참고해 조정하는 기본 능력치
    base_stats: Stats


class AiDecision(BaseModel):
    """GPT의 결정과 글. 룰이 고치지 않고 그대로 카드에 쓴다."""

    race: str
    element: str
    disposition: str
    stats: Stats
    reason: str
    name: str
    appearance: str
    backstory: str
    lucky_item: str
    message_2027: str


class CharacterResponse(AiDecision):
    palette: str
    ability: str
    # 어떤 파라미터로 만들어졌는지 체험 화면에 보여주기 위해 함께 반환한다
    parameters: CharacterParameters
