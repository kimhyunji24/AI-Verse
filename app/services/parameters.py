"""
캐릭터 생성 파라미터 변환 (룰 베이스)

역할: 얼굴 특징값과 참가자 응답을 규칙표로 변환해 종족, 속성, 성향, 능력치를 확정한다.
비고: 규칙을 바꾸려면 이 파일 위쪽의 기준값(THRESHOLDS)과 표(RACES, ELEMENTS, DISPOSITIONS)만 고치면 된다.
      기준값은 초안이며 실제 참가자 수치를 보고 조정해야 한다.
      수치는 판타지 설정의 재료로만 쓴다. 외모·성격을 평가하는 표현을 쓰지 않으며,
      어떤 얼굴도 우열이 없도록 능력치 합계를 같게 맞춘다.

수정 이력:
  - 2026-11-03 최초 작성
  - 2026-11-03 종족·속성·성향·능력치를 규칙표로 확정하도록 변경
"""

from app.schemas import Answers, CharacterParameters, FaceFeatures, Stats

# 3단계 분류 기준값: (이 값 미만이면 0단계, 이 값 초과면 2단계, 사이는 1단계)
THRESHOLDS = {
    "face_aspect_ratio": (1.25, 1.42),
    "eye_spacing_ratio": (0.40, 0.46),
    "jaw_width_ratio": (0.78, 0.88),
    "head_yaw": (-8.0, 8.0),
}

SILHOUETTES = ("넓게 퍼지는 형상", "균형 잡힌 형상", "길게 뻗는 형상")
GAZES = ("한 점에 모이는 시선", "고른 시선", "넓게 살피는 시선")
PRESENCES = ("가볍게 떠도는 기운", "잔잔한 기운", "묵직하게 깔리는 기운")
STANCES = ("왼쪽 차원을 향한 자세", "정면을 응시하는 자세", "오른쪽 차원을 향한 자세")

REALMS = {
    "deep_sea": "빛이 닿지 않는 심해",
    "night_sky": "별이 쏟아지는 밤하늘",
    "old_library": "끝없이 이어진 고대 도서관",
    "neon_city": "네온이 번지는 미래 도시",
}
BONDS = {
    "alone": "홀로 길을 걷는 관측자",
    "one_friend": "단 하나의 동료와 맺어진 짝",
    "crowd": "무리와 함께 움직이는 공명체",
}
WISHES = {
    "adventure": "미지의 세계로 나아가는 모험",
    "rest": "고요한 곳에서 얻는 쉼",
    "growth": "한 단계 올라서는 성장",
    "connection": "소중한 존재와의 연결",
}

# 종족: 응답(장소) × 실루엣 단계
RACES = {
    "deep_sea": ("심해 해파리족", "등불 인어족", "해류 용족"),
    "night_sky": ("성운 고래족", "별지기족", "유성 학족"),
    "old_library": ("서고 두더지족", "책갈피 요정족", "두루마리 뱀족"),
    "neon_city": ("회로 고양이족", "홀로그램 정령족", "네온 사슴족"),
}

# 속성: 기운 단계 × 시선 단계
ELEMENTS = (
    ("미풍", "물안개", "오로라"),
    ("수정", "달빛", "조류"),
    ("흑요", "대지", "심연"),
)

# 성향: 응답(동행) × 시선 단계
DISPOSITIONS = {
    "alone": (
        "한 가지를 끝까지 파고드는 고독한 탐구자",
        "자기만의 속도로 걷는 차분한 여행자",
        "홀로 먼 곳까지 살피는 조용한 파수꾼",
    ),
    "one_friend": (
        "한 사람을 위해 온 힘을 쏟는 수호자",
        "곁에서 묵묵히 발을 맞추는 동반자",
        "동료의 뒤를 넓게 살펴 주는 길잡이",
    ),
    "crowd": (
        "무리의 목표를 또렷하게 짚어 주는 지휘자",
        "모두의 호흡을 고르게 맞추는 조율자",
        "넓은 시야로 흐름을 읽는 전략가",
    ),
}

# 능력치별 계산에 쓰는 특징값과 범위 (범위 안에서 0~1로 변환해 비중으로 쓴다)
STAT_RULES = {
    "insight": ("eye_spacing_ratio", 0.35, 0.50),
    "vitality": ("jaw_width_ratio", 0.70, 0.95),
    "resonance": ("mouth_width_ratio", 0.30, 0.45),
    "agility": ("face_aspect_ratio", 1.15, 1.50),
    "willpower": ("nose_length_ratio", 0.20, 0.32),
}
# 소원 응답이 비중을 더해 주는 능력치
WISH_BONUS = {
    "adventure": "agility",
    "rest": "insight",
    "growth": "willpower",
    "connection": "resonance",
}
STAT_FIELDS = ("insight", "vitality", "resonance", "agility", "willpower", "luck")
STAT_TOTAL = 300
STAT_MINIMUM = 30


def _tier(features: FaceFeatures, feature: str) -> int:
    low, high = THRESHOLDS[feature]
    value = getattr(features, feature)
    if value < low:
        return 0
    if value > high:
        return 2
    return 1


def _normalize(value: float, low: float, high: float) -> float:
    """value를 low~high 기준 0~1로 변환한다. 범위를 벗어나면 잘라낸다."""
    return max(0.0, min(1.0, (value - low) / (high - low)))


def _stats(features: FaceFeatures, answers: Answers) -> Stats:
    weights = {
        stat: _normalize(getattr(features, feature), low, high)
        for stat, (feature, low, high) in STAT_RULES.items()
    }
    # 운은 촬영 순간의 머리 기울기로 정한다
    weights["luck"] = _normalize(abs(features.head_yaw) + abs(features.head_roll), 0, 20)
    weights[WISH_BONUS[answers.wish_2027]] += 0.5

    # 모든 능력치에 최솟값을 보장한 뒤 나머지를 비중대로 나눠 합계를 맞춘다.
    # 비중이 전부 0이어도 나눌 수 있도록 각 항목에 0.1씩 더한다.
    spare = STAT_TOTAL - STAT_MINIMUM * len(STAT_FIELDS)
    total_weight = sum(weights.values()) + 0.1 * len(STAT_FIELDS)
    stats = {
        field: STAT_MINIMUM + int(spare * (weights[field] + 0.1) / total_weight)
        for field in STAT_FIELDS
    }
    # 소수점을 버려서 남은 값은 가장 큰 능력치에 더한다
    top = max(STAT_FIELDS, key=lambda field: stats[field])
    stats[top] += STAT_TOTAL - sum(stats.values())
    return Stats(**stats)


def build_parameters(features: FaceFeatures, answers: Answers) -> CharacterParameters:
    silhouette = _tier(features, "face_aspect_ratio")
    gaze = _tier(features, "eye_spacing_ratio")
    presence = _tier(features, "jaw_width_ratio")
    stance = _tier(features, "head_yaw")

    return CharacterParameters(
        silhouette=SILHOUETTES[silhouette],
        gaze=GAZES[gaze],
        presence=PRESENCES[presence],
        stance=STANCES[stance],
        realm=REALMS[answers.place],
        bond=BONDS[answers.companion],
        wish=WISHES[answers.wish_2027],
        race=RACES[answers.place][silhouette],
        element=ELEMENTS[presence][gaze],
        disposition=DISPOSITIONS[answers.companion][gaze],
        stats=_stats(features, answers),
    )
