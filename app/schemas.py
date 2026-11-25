"""
캐릭터 생성 API 데이터 형식

역할: 프론트 ↔ 백 요청/응답과 GPT 구조화 출력에 쓰는 Pydantic 모델을 정의한다.
비고: 형식을 바꾸면 main 브랜치의 docs/api-spec.md 와 프론트 타입(src/lib/characterApi.ts)도 함께 수정한다.

수정 이력:
  - 2026-11-03 최초 작성
  - 2026-11-03 설문 4문항 추가, 눈 크기를 미간 너비로 교체, 색감·고유 능력 추가
  - 2026-11-03 얼굴 측정 항목 확대, 룰이 후보를 만들고 GPT가 결정하는 하이브리드 구조로 변경
  - 2026-11-03 캐릭터 유형(인외, 애니) 추가, GPT 결과를 재검증하지 않도록 변경
  - 2026-11-22 포토카드 응답 형식 추가
  - 2026-11-22 포토카드 요청에 포즈 뼈대 그림 추가
  - 2026-11-22 애니메이션 캐릭터용 화풍(art_style)과 얼굴 생김새(face_traits) 추가
  - 2026-11-22 얼굴 생김새가 반영된 생김새 특징(art_features) 추가
  - 2026-11-22 이름 음절(name_sounds) 추가
  - 2026-11-22 이름 음절을 뜻 있는 이름 낱말(name_hints)로 변경
  - 2026-11-22 애니메이션 캐릭터를 실제 동물 캐릭터(animal)로 교체, 화풍·특징 필드 삭제
  - 2026-11-22 의상(outfit) 추가
  - 2026-11-22 포토카드 요청에 손 모양(hand_gestures) 추가
  - 2026-11-22 동물 캐릭터의 감정(emotion) 추가
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

    character_type: Literal["nonhuman", "animal"]
    place: Literal["deep_sea", "night_sky", "old_library", "neon_city"]
    companion: Literal["alone", "one_friend", "crowd"]
    wish_2027: Literal["adventure", "rest", "growth", "connection"]
    time_of_day: Literal["dawn", "noon", "sunset", "midnight"]
    crisis: Literal["confront", "hide", "trick", "call_friends"]
    power: Literal["read_minds", "stop_time", "fly", "transform"]
    bag: Literal["snack", "book", "map", "charm"]


# 프론트가 얼굴 랜드마크로 계산한 동물상 (faceLook.ts 의 ANIMALS key와 같다)
AnimalLookKey = Literal["fox", "cat", "dog", "rabbit", "bear", "monkey", "deer", "dino", "wolf", "hamster"]


class AnimalLook(BaseModel):
    key: AnimalLookKey
    percent: int = Field(ge=0, le=100)


class CharacterRequest(BaseModel):
    features: FaceFeatures
    answers: Answers
    # 닮은 동물상 상위 몇 개. 동물 캐릭터의 종족을 고르는 데 쓴다. 없으면 동물 풀 전체에서 고른다.
    animal_looks: list[AnimalLook] = Field(default=[], max_length=10)


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
    # 이름 수식어 후보 3개(예: 보송보송한). 이름은 "수식어 + 종족" 형식이며 참가자마다 무작위로 뽑는다.
    name_hints: list[str] = []
    # 의상 템플릿 6종 중 무작위 하나 (예: 빨간 체크무늬 셔츠). 목 아래 사람 몸이 입는다.
    outfit: str = ""
    # 실제 동물 캐릭터만: 참가자와 닮게 옮길 얼굴 생김새 문구 (인외 캐릭터는 비어 있다)
    face_traits: list[str] = []
    # 동물 캐릭터만: 무작위로 고른 격한 감정 (예: 감격해서 눈물 글썽). 인외 캐릭터는 비어 있다.
    emotion: str = ""
    # 얼굴에서 가장 두드러진 특징 (예: 멀리 떨어진 두 눈). 고유 능력과 선택 이유에 쓴다.
    signature_trait: str = ""
    # 동물 캐릭터만: 가장 닮은 동물상과 비율 (예: 여우상, 41)
    animal_look: str = ""
    animal_look_percent: int = 0


class StatNames(BaseModel):
    """능력치 6개의 이름. GPT가 캐릭터 세계관에 맞게 캐릭터마다 새로 짓는다 (예: insight → 물결감지)."""

    insight: str
    vitality: str
    resonance: str
    agility: str
    willpower: str
    luck: str


class AiDecision(BaseModel):
    """GPT의 결정과 글. 룰이 고치지 않고 그대로 카드에 쓴다."""

    race: str
    element: str
    disposition: str
    stats: Stats
    # 능력치 이름 (캐릭터마다 다름)
    stat_names: StatNames
    name: str
    appearance: str
    backstory: str
    lucky_item: str
    message_2027: str


class CharacterResponse(AiDecision):
    palette: str
    # 고유 능력과 선택 이유는 얼굴 패턴 표로 룰이 정한다 (parameters.py)
    ability: str
    reason: str
    # 예전 카드 요청에는 없을 수 있다. 없으면 기본 이름(통찰·생명력…)을 쓴다.
    stat_names: StatNames | None = None
    # 어떤 파라미터로 만들어졌는지 체험 화면에 보여주기 위해 함께 반환한다
    parameters: CharacterParameters


class HandGesture(BaseModel):
    """손 모양. 화면(거울 모드)과 뼈대 그림 기준 왼쪽·오른쪽 손. 자유 글 대신 정해진 코드만 받는다."""

    side: Literal["left", "right"]
    gesture: Literal["Closed_Fist", "Open_Palm", "Pointing_Up", "Thumb_Down", "Thumb_Up", "Victory", "ILoveYou"]


class PhotocardRequest(BaseModel):
    """포토카드 생성 요청. 포즈 뼈대는 얼굴 없이 관절만 이은 그림이며 없으면 자유 자세로 그린다."""

    character: CharacterResponse
    # base64 PNG (data:image/png;base64, 접두어 허용). 512×768 그림이면 수십 KB 정도다.
    pose_skeleton: str | None = Field(default=None, max_length=2_000_000)
    # 손마다 하나씩, 최대 2개
    hand_gestures: list[HandGesture] = Field(default=[], max_length=2)


class PhotocardResponse(BaseModel):
    """포토카드 생성 결과. 주소는 백엔드 주소 기준의 경로다."""

    card_id: str
    illustration_url: str
    card_url: str
