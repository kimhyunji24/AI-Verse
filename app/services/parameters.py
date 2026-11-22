"""
캐릭터 파라미터 룰 (하이브리드의 룰 담당)

역할: 얼굴 측정값과 응답을 점수, 후보, 기본 능력치로 변환해 GPT에 넘길 재료를 만든다.
비고: 규칙을 바꾸려면 이 파일 위쪽의 기준값과 표만 고치면 된다. 기준값은 초안이며 실제 참가자 수치로 조정해야 한다.
      수치는 판타지 설정의 재료로만 쓴다. 외모·성격을 평가하는 표현을 쓰지 않으며,
      어떤 얼굴도 우열이 없도록 능력치 합계를 같게 맞춘다.

수정 이력:
  - 2026-11-03 최초 작성
  - 2026-11-03 종족·속성·성향·능력치를 규칙표로 확정하도록 변경
  - 2026-11-03 설문 4문항 규칙 추가, 미간 너비로 색감 결정
  - 2026-11-03 하이브리드로 변경: 값을 확정하는 대신 후보를 만들고 GPT 결정을 검증, 측정 항목 확대
  - 2026-11-03 애니 캐릭터 후보 추가, GPT 결과 재검증 제거
  - 2026-11-03 인외 후보를 머리가 사물인 캐릭터로 변경
  - 2026-11-22 애니메이션 캐릭터에 화풍(유명 만화 화풍에서 뽑은 특징 텍스트)과 얼굴 생김새 문구 추가
  - 2026-11-22 참고 캐릭터 목록 추가: 화풍은 참가자마다 GPT가 참고 캐릭터에서 뽑고, 아래 화풍 글은 실패 시 대체용으로 사용
  - 2026-11-22 인외 콘셉트에 맞춰 참고 캐릭터와 대체 화풍을 사람이 아닌 캐릭터(동물·생물·마스코트)로만 구성
  - 2026-11-22 애니메이션 캐릭터 후보를 사람 직업에서 생물 종류로 교체
  - 2026-11-22 이름이 겹치지 않도록 참가자마다 다른 이름 음절(name_sounds) 추가
  - 2026-11-22 뜻 없는 음절 대신 뜻이 있는 이름 낱말(name_hints: 의태어 + 장소별 간식·작은 물건)로 변경
"""

import zlib

from app.schemas import Answers, CharacterParameters, FaceFeatures, Stats

# 3단계 분류 기준값: (이 값 미만이면 0단계, 이 값 초과면 2단계, 사이는 1단계)
THRESHOLDS = {
    "face_aspect_ratio": (1.25, 1.42),
    "eye_spacing_ratio": (0.40, 0.46),
    "inner_eye_gap_ratio": (0.22, 0.27),
    "jaw_width_ratio": (0.78, 0.88),
    "head_yaw": (-8.0, 8.0),
}

# 측정값을 0~1 점수로 바꾸는 범위. 머리 자세는 외모가 아니므로 점수에 넣지 않는다.
SCORE_RANGES = {
    "face_aspect_ratio": (1.15, 1.50),
    "eye_spacing_ratio": (0.35, 0.50),
    "inner_eye_gap_ratio": (0.18, 0.30),
    "eye_position_ratio": (0.30, 0.45),
    "nose_length_ratio": (0.20, 0.32),
    "nose_position_ratio": (0.50, 0.68),
    "nose_width_ratio": (0.20, 0.34),
    "mouth_width_ratio": (0.30, 0.55),
    "lip_thickness_ratio": (0.04, 0.14),
    "mouth_position_ratio": (0.62, 0.82),
    "jaw_width_ratio": (0.70, 0.95),
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

CHARACTER_TYPES = {
    "nonhuman": "머리가 사물인 인외 캐릭터",
    "anime": "애니메이션 캐릭터",
}

# 애니메이션 캐릭터의 화풍을 뽑을 참고 캐릭터. 이름은 화풍 추출(services/art_style.py)에만 쓰고,
# 응답·카드·이미지 프롬프트에는 넣지 않는다. 순서는 아래 ART_STYLES(대체용 화풍 글)와 맞춘다.
# 인외 콘셉트라 사람 캐릭터는 넣지 않는다.
ART_REFERENCES = (
    "먼작귀(치이카와)의 치이카와",
    "포켓몬스터의 피카츄",
    "별의 커비의 커비",
    "산리오의 마이멜로디",
    "이웃집 토토로의 토토로",
    "몰랑이의 몰랑이",
)
# 추출 결과에 나오면 안 되는 고유 이름. "원피스"(옷)처럼 일반 낱말과 겹치는 이름은 넣지 않는다.
ART_REFERENCE_NAMES = {
    ART_REFERENCES[0]: ("치이카와", "먼작귀"),
    ART_REFERENCES[1]: ("피카츄", "포켓몬"),
    ART_REFERENCES[2]: ("커비",),
    ART_REFERENCES[3]: ("마이멜로디", "산리오"),
    ART_REFERENCES[4]: ("토토로",),
    ART_REFERENCES[5]: ("몰랑이",),
}

# 대체용 화풍 글: 화풍 추출이 실패하면 쓴다. 위 참고 캐릭터의 화풍을 미리 글로 뽑아 둔 것이며 작품 이름은 쓰지 않는다.
ART_STYLES = (
    "2등신의 작고 말랑한 동물 캐릭터. 동글동글한 몸, 짧은 팔다리, 작은 점 같은 눈, 분홍 볼터치, "
    "굵고 부드러운 손그림 외곽선, 연한 파스텔 채색",
    "몬스터 수집 게임풍 작은 생물. 단순하고 또렷한 실루엣, 짧은 팔다리, 큰 눈과 볼 무늬, 선명한 단색 몸과 포인트 색, "
    "깔끔한 외곽선과 셀 채색",
    "공처럼 동그란 몸 하나로 된 생물. 얼굴과 몸의 구분이 없고, 아주 짧은 팔과 큰 발, 세로로 긴 타원 눈, "
    "부드러운 파스텔 단색과 은은한 그러데이션",
    "둥근 마스코트 캐릭터풍. 커다랗고 동그란 머리와 작은 몸, 단순한 도형으로 된 이목구비, 작은 리본이나 모자 소품, "
    "평면적인 단색 채색",
    "숲속 정령 같은 큰 생물. 푹신한 털, 넓은 배, 작고 동그란 눈, 크레용과 수채가 섞인 따뜻한 질감",
    "말랑한 찹쌀떡 같은 작은 생물. 흘러내리듯 둥근 몸, 아주 단순한 점 눈과 작은 입, 하얀 몸에 연한 파스텔 포인트, "
    "얇고 부드러운 선",
)
# 화풍 고르기: 응답(갖고 싶은 힘) × 실루엣 단계 -> ART_REFERENCES / ART_STYLES 번호
# 같은 실루엣 단계 안에서는 힘마다 화풍이 모두 다르도록 배치했다
ART_STYLE_TABLE = {
    "read_minds": (4, 2, 3),
    "stop_time": (0, 4, 2),
    "fly": (1, 3, 0),
    "transform": (5, 0, 1),
}

# 이름 낱말: 뜻이 있는 낱말을 참가자마다 골라 주고, GPT가 그중 하나로 애칭을 짓게 한다.
# (뜻 없는 음절을 주면 "부쿠루"처럼 아무 뜻 없는 이름이 나온다.)
# 같은 입력이면 늘 같은 낱말이 나오고, 참가자마다 달라 이름이 겹치지 않는다.
NAME_MIMETIC = (
    "몽실", "뽀송", "말랑", "보들", "포동", "동글", "폭신", "쫀득", "꼬물", "몰랑", "뭉게", "토실",
    "보송", "옹알", "꼬마", "콩닥", "방울", "살랑", "아롱", "또롱",
)
NAME_THINGS = {
    "deep_sea": ("진주", "소라", "조약돌", "물방울", "미역", "해초", "모래", "산호", "조개", "물결"),
    "night_sky": ("별사탕", "달떡", "솜사탕", "구름빵", "꿀별", "은하수", "새벽", "달빛", "유성", "오로라"),
    "old_library": ("책갈피", "단추", "연필", "쿠키", "잉크", "도장", "종이배", "깃털", "양초", "열쇠"),
    "neon_city": ("젤리", "팝콘", "사이다", "픽셀", "네온", "캔디", "콜라", "버블티", "전구", "스티커"),
}
NAME_HINT_COUNT = (2, 2)  # (의태어, 장소 낱말)

# 애니메이션 캐릭터 얼굴에 옮길 생김새: 점수가 0.5에서 이만큼 벗어나면 (낮을 때, 높을 때) 문구를 쓴다.
# 좋고 나쁨이 없는 생김새 묘사만 쓴다.
FACE_TRAIT_THRESHOLD = 0.15
FACE_TRAITS = {
    "face_aspect_ratio": ("가로로 넓고 둥근 얼굴형", "세로로 갸름한 얼굴형"),
    "eye_spacing_ratio": ("두 눈 사이가 가까운 편", "두 눈 사이가 먼 편"),
    "inner_eye_gap_ratio": ("미간이 좁은 편", "미간이 넓은 편"),
    "eye_position_ratio": ("눈이 얼굴 위쪽에 자리함", "눈이 얼굴 아래쪽에 자리함"),
    "nose_length_ratio": ("코가 짧은 편", "코가 긴 편"),
    "nose_width_ratio": ("코가 좁은 편", "코가 넓은 편"),
    "mouth_width_ratio": ("입이 작은 편", "입이 큰 편"),
    "lip_thickness_ratio": ("입술이 얇은 편", "입술이 도톰한 편"),
    "jaw_width_ratio": ("턱선이 갸름한 편", "턱선이 넓은 편"),
}
# 두드러진 특징이 없을 때도 닮은 느낌이 나도록 최소한 이만큼은 고른다
FACE_TRAIT_MIN = 3

# 인외 캐릭터(머리가 사물, 몸은 사람)의 머리 후보: 응답(장소) × 실루엣 단계별 2개
NONHUMAN_RACES = {
    "deep_sea": (("조개 머리", "어항 머리"), ("등대 머리", "닻 머리"), ("잠수 헬멧 머리", "나침반 머리")),
    "night_sky": (("달 모양 램프 머리", "지구본 머리"), ("망원경 머리", "모래시계 머리"), ("로켓 머리", "시계탑 머리")),
    "old_library": (("잉크병 머리", "찻주전자 머리"), ("책 머리", "촛대 머리"), ("두루마리 머리", "깃펜 머리")),
    "neon_city": (("자판기 머리", "게임기 머리"), ("브라운관 TV 머리", "헤드폰 머리"), ("네온사인 머리", "신호등 머리")),
}

# 애니메이션 캐릭터(사람이 아닌 생물)의 종류 후보: 응답(장소) × 실루엣 단계별 2개
# 실루엣: 넓게 퍼지는(동글·통통) / 균형 / 길게 뻗는(늘씬·긴 꼬리)
ANIME_ROLES = {
    "deep_sea": (("방울해파리", "조약돌게"), ("물결수달", "산호해마"), ("꼬리고래", "리본장어")),
    "night_sky": (("별사탕햄스터", "달토끼"), ("구름고양이", "별똥다람쥐"), ("은하여우", "밤하늘부엉이")),
    "old_library": (("책벌레쥐", "잉크고슴도치"), ("책갈피펭귄", "촛불너구리"), ("두루마리족제비", "고서올빼미")),
    "neon_city": (("픽셀병아리", "네온개구리"), ("배터리강아지", "전구오리"), ("홀로그램고양이", "네온라쿤")),
}
RACE_TABLES = {"nonhuman": NONHUMAN_RACES, "anime": ANIME_ROLES}

# 속성 후보: 기운 단계 × 시선 단계
ELEMENTS = (
    ("미풍", "물안개", "오로라"),
    ("수정", "달빛", "조류"),
    ("흑요", "대지", "심연"),
)

# 성향 후보: 응답(동행) × 시선 단계
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

# 색감: 응답(시간대) × 미간 너비 단계
PALETTES = {
    "dawn": ("연보라와 새벽 안개색", "분홍과 옅은 금색", "푸른 회색과 은색"),
    "noon": ("레몬빛과 하늘색", "흰색과 금색", "초록과 맑은 파랑"),
    "sunset": ("주황과 자주색", "산호색과 금색", "붉은 보라와 남색"),
    "midnight": ("남색과 은색", "검정과 달빛색", "짙은 보라와 에메랄드색"),
}

# 고유 능력: 응답(갖고 싶은 힘)
ABILITIES = {
    "read_minds": "마음의 소리를 듣는 힘",
    "stop_time": "시간의 흐름을 멈추는 힘",
    "fly": "바람을 타고 하늘을 나는 힘",
    "transform": "무엇으로든 모습을 바꾸는 힘",
}

# 설정 글에 들어갈 일화의 방향: 응답(위기 대처)
CRISES = {
    "confront": "위기에 정면으로 맞서는 모습",
    "hide": "몸을 숨겨 때를 기다리는 모습",
    "trick": "꾀를 내어 빠져나가는 모습",
    "call_friends": "동료를 불러 함께 헤쳐 가는 모습",
}

# 럭키 아이템의 종류: 응답(가방에 넣는 것). 구체적인 물건은 GPT가 고른다.
LUCKY_ITEM_TYPES = {
    "snack": "먹을거리",
    "book": "읽을거리",
    "map": "길을 찾는 데 쓰는 물건",
    "charm": "행운을 비는 물건",
}

# 능력치별로 참고하는 얼굴 점수 (평균을 비중으로 쓴다)
STAT_SCORES = {
    "insight": ("eye_spacing_ratio", "inner_eye_gap_ratio", "eye_position_ratio"),
    "vitality": ("jaw_width_ratio", "nose_width_ratio"),
    "resonance": ("mouth_width_ratio", "lip_thickness_ratio"),
    "agility": ("face_aspect_ratio", "mouth_position_ratio"),
    "willpower": ("nose_length_ratio", "nose_position_ratio"),
}
# 응답이 비중을 더해 주는 능력치
WISH_BONUS = {
    "adventure": "agility",
    "rest": "insight",
    "growth": "willpower",
    "connection": "resonance",
}
CRISIS_BONUS = {
    "confront": "vitality",
    "hide": "agility",
    "trick": "insight",
    "call_friends": "resonance",
}
STAT_FIELDS = ("insight", "vitality", "resonance", "agility", "willpower", "luck")
STAT_TOTAL = 300
STAT_MINIMUM = 30
STAT_MAXIMUM = 100


def _tier(features: FaceFeatures, feature: str) -> int:
    low, high = THRESHOLDS[feature]
    value = getattr(features, feature)
    if value < low:
        return 0
    if value > high:
        return 2
    return 1


def _nearest_other_tier(features: FaceFeatures, feature: str, tier: int) -> int:
    """측정값이 가까운 쪽의 이웃 단계를 고른다. 경계에 있는 얼굴도 알맞은 후보를 받게 하기 위해서다."""
    if tier != 1:
        return 1
    low, high = THRESHOLDS[feature]
    return 0 if getattr(features, feature) < (low + high) / 2 else 2


def _normalize(value: float, low: float, high: float) -> float:
    """value를 low~high 기준 0~1로 변환한다. 범위를 벗어나면 잘라낸다."""
    return max(0.0, min(1.0, (value - low) / (high - low)))


def _face_scores(features: FaceFeatures) -> dict[str, float]:
    return {
        feature: round(_normalize(getattr(features, feature), low, high), 2)
        for feature, (low, high) in SCORE_RANGES.items()
    }


def _base_stats(features: FaceFeatures, answers: Answers, scores: dict[str, float]) -> Stats:
    weights = {
        stat: sum(scores[feature] for feature in feature_names) / len(feature_names)
        for stat, feature_names in STAT_SCORES.items()
    }
    # 운은 촬영 순간의 머리 기울기로 정한다
    weights["luck"] = _normalize(abs(features.head_yaw) + abs(features.head_roll), 0, 20)
    weights[WISH_BONUS[answers.wish_2027]] += 0.5
    weights[CRISIS_BONUS[answers.crisis]] += 0.5

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

    # 보너스가 겹쳐 최댓값을 넘으면 넘친 만큼 가장 낮은 능력치로 옮겨 합계를 유지한다
    for field in STAT_FIELDS:
        excess = stats[field] - STAT_MAXIMUM
        if excess > 0:
            stats[field] = STAT_MAXIMUM
            lowest = min(STAT_FIELDS, key=lambda other: stats[other])
            stats[lowest] += excess
    return Stats(**stats)


def art_reference(features: FaceFeatures, answers: Answers) -> str | None:
    """애니메이션 캐릭터면 화풍을 뽑을 참고 캐릭터 이름을, 아니면 None을 돌려준다."""
    if answers.character_type != "anime":
        return None
    return ART_REFERENCES[ART_STYLE_TABLE[answers.power][_tier(features, "face_aspect_ratio")]]


def _face_traits(scores: dict[str, float]) -> list[str]:
    """0.5에서 많이 벗어난 순서로 생김새 문구를 고른다."""
    ranked = sorted(FACE_TRAITS, key=lambda name: abs(scores[name] - 0.5), reverse=True)
    picked = [
        name
        for index, name in enumerate(ranked)
        if index < FACE_TRAIT_MIN or abs(scores[name] - 0.5) >= FACE_TRAIT_THRESHOLD
    ]
    return [FACE_TRAITS[name][scores[name] >= 0.5] for name in picked]


def _pick(pool: tuple[str, ...], count: int, seed: int) -> list[str]:
    picked: list[str] = []
    while len(picked) < count:
        word = pool[seed % len(pool)]
        if word not in picked:
            picked.append(word)
        seed = seed // len(pool) + 7919 * (len(picked) + 1)
    return picked


def _name_hints(features: FaceFeatures, answers: Answers) -> list[str]:
    seed = zlib.crc32((features.model_dump_json() + answers.model_dump_json()).encode())
    mimetic, things = NAME_HINT_COUNT
    return _pick(NAME_MIMETIC, mimetic, seed) + _pick(NAME_THINGS[answers.place], things, seed // 97)


def build_parameters(features: FaceFeatures, answers: Answers) -> CharacterParameters:
    silhouette = _tier(features, "face_aspect_ratio")
    gaze = _tier(features, "eye_spacing_ratio")
    presence = _tier(features, "jaw_width_ratio")
    stance = _tier(features, "head_yaw")
    eye_gap = _tier(features, "inner_eye_gap_ratio")
    scores = _face_scores(features)

    races = RACE_TABLES[answers.character_type][answers.place]
    near_silhouette = _nearest_other_tier(features, "face_aspect_ratio", silhouette)
    near_gaze = _nearest_other_tier(features, "eye_spacing_ratio", gaze)
    near_presence = _nearest_other_tier(features, "jaw_width_ratio", presence)
    anime = answers.character_type == "anime"

    return CharacterParameters(
        face_scores=scores,
        character_type=CHARACTER_TYPES[answers.character_type],
        silhouette=SILHOUETTES[silhouette],
        gaze=GAZES[gaze],
        presence=PRESENCES[presence],
        stance=STANCES[stance],
        realm=REALMS[answers.place],
        bond=BONDS[answers.companion],
        wish=WISHES[answers.wish_2027],
        crisis=CRISES[answers.crisis],
        lucky_item_type=LUCKY_ITEM_TYPES[answers.bag],
        palette=PALETTES[answers.time_of_day][eye_gap],
        ability=ABILITIES[answers.power],
        race_candidates=[*races[silhouette], races[near_silhouette][0]],
        element_candidates=[
            ELEMENTS[presence][gaze],
            ELEMENTS[presence][near_gaze],
            ELEMENTS[near_presence][gaze],
        ],
        disposition_candidates=[
            DISPOSITIONS[answers.companion][gaze],
            DISPOSITIONS[answers.companion][near_gaze],
        ],
        base_stats=_base_stats(features, answers, scores),
        name_hints=_name_hints(features, answers),
        art_style=ART_STYLES[ART_STYLE_TABLE[answers.power][silhouette]] if anime else "",
        face_traits=_face_traits(scores) if anime else [],
    )
