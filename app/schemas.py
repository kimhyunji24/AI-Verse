"""
캐릭터 생성 API 데이터 형식

역할: 프론트 ↔ 백 요청/응답과 GPT 구조화 출력에 쓰는 Pydantic 모델을 정의한다.
비고: 형식을 바꾸면 main 브랜치의 docs/api-spec.md 와 프론트 타입(src/lib/characterApi.ts)도 함께 수정한다.

수정 이력:
  - 2026-11-03 최초 작성
"""

from typing import Literal

from pydantic import BaseModel, Field


class FaceFeatures(BaseModel):
    """MediaPipe 랜드마크에서 계산한 수치. 이미지는 받지 않는다."""

    # 얼굴 형태 비율 (얼굴 폭 또는 높이 대비)
    face_aspect_ratio: float = Field(ge=0.5, le=2.5, description="얼굴 높이 / 얼굴 폭")
    eye_spacing_ratio: float = Field(ge=0.0, le=1.0, description="두 눈 중심 거리 / 얼굴 폭")
    eye_size_ratio: float = Field(ge=0.0, le=1.0, description="평균 눈 폭 / 얼굴 폭")
    nose_length_ratio: float = Field(ge=0.0, le=1.0, description="코 길이 / 얼굴 높이")
    mouth_width_ratio: float = Field(ge=0.0, le=1.0, description="입 폭 / 얼굴 폭")
    jaw_width_ratio: float = Field(ge=0.0, le=1.5, description="턱 폭 / 얼굴 폭")
    # 위치 관계 (촬영 당시 머리 자세, 도 단위)
    head_yaw: float = Field(ge=-90, le=90)
    head_pitch: float = Field(ge=-90, le=90)
    head_roll: float = Field(ge=-180, le=180)


class Answers(BaseModel):
    """참가자 응답. 프롬프트 주입을 막기 위해 자유 입력 없이 선택지만 받는다."""

    place: Literal["deep_sea", "night_sky", "old_library", "neon_city"]
    companion: Literal["alone", "one_friend", "crowd"]
    wish_2027: Literal["adventure", "rest", "growth", "connection"]


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
    """특징값과 응답을 규칙표로 변환한 캐릭터 생성 파라미터. 같은 입력이면 항상 같은 값이 나온다."""

    # 특징값에서 나온 분류
    silhouette: str
    gaze: str
    presence: str
    stance: str
    # 응답에서 나온 분류
    realm: str
    bond: str
    wish: str
    # 규칙표로 확정되는 캐릭터 값
    race: str
    element: str
    disposition: str
    stats: Stats


class GeneratedStory(BaseModel):
    """GPT가 파라미터를 바탕으로 쓰는 글"""

    name: str
    appearance: str
    backstory: str
    lucky_item: str
    message_2027: str


class CharacterResponse(GeneratedStory):
    race: str
    element: str
    disposition: str
    stats: Stats
    # 어떤 파라미터로 만들어졌는지 체험 화면에 보여주기 위해 함께 반환한다
    parameters: CharacterParameters
