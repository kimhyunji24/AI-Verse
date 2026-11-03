"""
파라미터 변환 테스트

역할: 특징값·응답 → 파라미터 변환이 항상 같은 결과를 내고 능력치 합계가 일정한지 확인한다.

수정 이력:
  - 2026-11-03 최초 작성
"""

import itertools

from app.schemas import Answers, FaceFeatures
from app.services.parameters import STAT_TOTAL, build_parameters

FEATURES = dict(
    face_aspect_ratio=1.33,
    eye_spacing_ratio=0.43,
    eye_size_ratio=0.2,
    nose_length_ratio=0.26,
    mouth_width_ratio=0.38,
    jaw_width_ratio=0.83,
    head_yaw=2.0,
    head_pitch=-3.0,
    head_roll=1.0,
)
ANSWERS = Answers(place="deep_sea", companion="alone", wish_2027="adventure")


def test_same_input_gives_same_parameters():
    features = FaceFeatures(**FEATURES)
    assert build_parameters(features, ANSWERS) == build_parameters(features, ANSWERS)


def test_stat_total_is_fixed_for_extreme_faces():
    ranges = {
        "face_aspect_ratio": (0.5, 2.5),
        "eye_spacing_ratio": (0.0, 1.0),
        "mouth_width_ratio": (0.0, 1.0),
        "jaw_width_ratio": (0.0, 1.5),
        "nose_length_ratio": (0.0, 1.0),
        "head_yaw": (-90, 90),
    }
    for values in itertools.product(*ranges.values()):
        features = FaceFeatures(**{**FEATURES, **dict(zip(ranges, values))})
        for wish in ("adventure", "rest", "growth", "connection"):
            answers = ANSWERS.model_copy(update={"wish_2027": wish})
            stats = build_parameters(features, answers).stats
            assert sum(stats.model_dump().values()) == STAT_TOTAL
            assert all(1 <= value <= 100 for value in stats.model_dump().values()), stats


def test_different_faces_change_parameters():
    wide = FaceFeatures(**{**FEATURES, "face_aspect_ratio": 1.1})
    long = FaceFeatures(**{**FEATURES, "face_aspect_ratio": 1.6})
    assert build_parameters(wide, ANSWERS).silhouette != build_parameters(long, ANSWERS).silhouette


def test_rule_tables_decide_character_values():
    parameters = build_parameters(FaceFeatures(**FEATURES), ANSWERS)
    # 균형 잡힌 형상 + 심해, 잔잔한 기운 + 고른 시선, 혼자 + 고른 시선
    assert parameters.race == "등불 인어족"
    assert parameters.element == "달빛"
    assert parameters.disposition == "자기만의 속도로 걷는 차분한 여행자"


def test_every_rule_combination_has_a_value():
    for place, companion in itertools.product(
        ("deep_sea", "night_sky", "old_library", "neon_city"), ("alone", "one_friend", "crowd")
    ):
        for ratio, spacing, jaw in itertools.product((1.0, 1.33, 1.6), (0.3, 0.43, 0.6), (0.6, 0.83, 1.0)):
            features = FaceFeatures(
                **{**FEATURES, "face_aspect_ratio": ratio, "eye_spacing_ratio": spacing, "jaw_width_ratio": jaw}
            )
            answers = Answers(place=place, companion=companion, wish_2027="rest")
            parameters = build_parameters(features, answers)
            assert parameters.race and parameters.element and parameters.disposition
