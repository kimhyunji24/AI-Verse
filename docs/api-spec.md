# API 명세

front(`feat/front`)와 back(`feat/back`) 사이의 데이터 형식입니다. 바뀌면 이 문서도 함께 수정합니다.

## POST /api/character

얼굴 측정값과 설문 응답을 받아 캐릭터를 만듭니다. **이미지는 보내지 않습니다.**

### 처리 방식 (하이브리드)

| 단계 | 담당 | 결과 |
| --- | --- | --- |
| 측정 | 브라우저 (MediaPipe) | 얼굴 비율과 머리 자세 수치 |
| 재료 만들기 | 룰 (`app/services/parameters.py`) | 얼굴 점수(0~1), 종족·역할·속성·성향 후보, 기본 능력치, 색감, 고유 능력 |
| 결정과 글쓰기 | GPT (`app/services/ai_character.py`) | 최종 종족·역할, 속성, 성향, 능력치, 선택 이유, 이름, 외형, 설정, 럭키 아이템, 2027년 메시지 |

- GPT 결과는 룰이 고치지 않고 그대로 사용합니다. 후보와 기본 능력치는 참고 재료입니다.
- 색감(`palette`)과 고유 능력(`ability`)은 룰이 정합니다.
- GPT에는 **반올림한 얼굴 점수**와 룰의 재료만 보내고, 원본 측정값과 머리 자세 수치, 이미지는 보내지 않습니다.

### 요청

```json
{
  "features": {
    "face_aspect_ratio": 1.28,
    "eye_spacing_ratio": 0.43,
    "inner_eye_gap_ratio": 0.25,
    "eye_position_ratio": 0.31,
    "nose_length_ratio": 0.28,
    "nose_position_ratio": 0.57,
    "nose_width_ratio": 0.34,
    "mouth_width_ratio": 0.52,
    "lip_thickness_ratio": 0.08,
    "mouth_position_ratio": 0.70,
    "jaw_width_ratio": 0.81,
    "head_yaw": 2.3,
    "head_pitch": 1.4,
    "head_roll": -0.9
  },
  "answers": {
    "character_type": "anime",
    "place": "deep_sea",
    "companion": "alone",
    "wish_2027": "adventure",
    "time_of_day": "dawn",
    "crisis": "confront",
    "power": "fly",
    "bag": "book"
  }
}
```

| 측정값 | 뜻 | 범위 |
| --- | --- | --- |
| `face_aspect_ratio` | 얼굴 높이 / 얼굴 폭 | 0.5~2.5 |
| `eye_spacing_ratio` | 두 눈 중심 거리 / 얼굴 폭 | 0~1 |
| `inner_eye_gap_ratio` | 미간 너비 / 얼굴 폭 | 0~1 |
| `eye_position_ratio` | 이마 끝~눈 / 얼굴 높이 | 0~1 |
| `nose_length_ratio` | 코 길이 / 얼굴 높이 | 0~1 |
| `nose_position_ratio` | 이마 끝~코 밑 / 얼굴 높이 | 0~1 |
| `nose_width_ratio` | 코 너비 / 얼굴 폭 | 0~1 |
| `mouth_width_ratio` | 입 폭 / 얼굴 폭 | 0~1 |
| `lip_thickness_ratio` | 입술 두께(입 벌림 제외) / 얼굴 높이 | 0~1 |
| `mouth_position_ratio` | 이마 끝~입 / 얼굴 높이 | 0~1 |
| `jaw_width_ratio` | 턱 폭 / 얼굴 폭 | 0~1.5 |
| `head_yaw`, `head_pitch` | 머리 좌우, 위아래 방향(도) | -90~90 |
| `head_roll` | 머리 기울기(도) | -180~180 |

| 응답 항목 | 값 |
| --- | --- |
| `character_type` | `nonhuman`, `anime` |
| `place` | `deep_sea`, `night_sky`, `old_library`, `neon_city` |
| `companion` | `alone`, `one_friend`, `crowd` |
| `wish_2027` | `adventure`, `rest`, `growth`, `connection` |
| `time_of_day` | `dawn`, `noon`, `sunset`, `midnight` |
| `crisis` | `confront`, `hide`, `trick`, `call_friends` |
| `power` | `read_minds`, `stop_time`, `fly`, `transform` |
| `bag` | `snack`, `book`, `map`, `charm` |

### 응답 (200)

```json
{
  "name": "루미엘",
  "race": "바다 마법사",
  "appearance": "일러스트용 외형 묘사",
  "element": "달빛",
  "disposition": "자기만의 속도로 걷는 차분한 여행자",
  "palette": "분홍과 옅은 금색",
  "ability": "바람을 타고 하늘을 나는 힘",
  "stats": { "insight": 47, "vitality": 44, "resonance": 63, "agility": 57, "willpower": 52, "luck": 37 },
  "reason": "이렇게 고른 이유 한 문장",
  "backstory": "캐릭터 설정",
  "lucky_item": "파란 볼펜",
  "message_2027": "2027년 메시지",
  "parameters": { "face_scores": {}, "character_type": "...", "race_candidates": [], "element_candidates": [], "disposition_candidates": [], "base_stats": {} }
}
```

`race`는 인외 캐릭터면 종족, 애니 캐릭터면 역할입니다. `parameters`는 룰이 만든 재료 전체입니다.

기본 능력치(`base_stats`)는 합계가 항상 300입니다. 어떤 얼굴도 우열이 생기지 않게 하기 위해서입니다. 최종 `stats`는 GPT가 정하며 프롬프트로 같은 규칙을 지시하지만 서버가 강제하지는 않습니다.

### 오류

| 상태 | 뜻 | `detail.retryable` |
| --- | --- | --- |
| 422 | 요청 형식이 틀림 (허용되지 않은 응답 값 포함) | - |
| 500 | API 키 오류 등 다시 시도해도 안 되는 문제 | `false` |
| 503 | 연결 오류, 요청 한도 초과, 거절, 생성 미완료, 형식이 맞지 않는 응답 | `true` |

오류 본문: `{ "detail": { "message": "화면에 보여줄 문구", "retryable": true } }`
