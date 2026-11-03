# API 명세

front(`feat/front`)와 back(`feat/back`) 사이의 데이터 형식입니다. 바뀌면 이 문서도 함께 수정합니다.

## POST /api/character

얼굴 특징값과 설문 응답을 받아 캐릭터를 만듭니다. **이미지는 보내지 않습니다.**

### 처리 방식 (하이브리드)

| 단계 | 담당 | 결과 |
| --- | --- | --- |
| 특징값 추출 | 브라우저 (MediaPipe) | 비율·자세 수치 |
| 파라미터 변환 | 룰 (`app/services/parameters.py`) | 종족, 속성, 성향, 능력치 |
| 글 생성 | GPT (`app/services/story_generator.py`) | 이름, 외형, 설정, 럭키 아이템, 2027년 메시지 |

GPT에는 변환된 파라미터만 보내며 원본 수치와 이미지는 보내지 않습니다.

### 요청

```json
{
  "features": {
    "face_aspect_ratio": 1.28,
    "eye_spacing_ratio": 0.43,
    "eye_size_ratio": 0.19,
    "nose_length_ratio": 0.29,
    "mouth_width_ratio": 0.52,
    "jaw_width_ratio": 0.81,
    "head_yaw": 2.3,
    "head_pitch": 1.4,
    "head_roll": -0.9
  },
  "answers": {
    "place": "deep_sea",
    "companion": "alone",
    "wish_2027": "adventure"
  }
}
```

| 응답 항목 | 값 |
| --- | --- |
| `place` | `deep_sea`, `night_sky`, `old_library`, `neon_city` |
| `companion` | `alone`, `one_friend`, `crowd` |
| `wish_2027` | `adventure`, `rest`, `growth`, `connection` |

### 응답 (200)

```json
{
  "name": "루미엘",
  "race": "등불 인어족",
  "appearance": "일러스트용 외형 묘사",
  "element": "달빛",
  "disposition": "자기만의 속도로 걷는 차분한 여행자",
  "stats": { "insight": 47, "vitality": 44, "resonance": 63, "agility": 57, "willpower": 52, "luck": 37 },
  "backstory": "캐릭터 설정",
  "lucky_item": "파란 볼펜",
  "message_2027": "2027년 메시지",
  "parameters": { "silhouette": "...", "gaze": "...", "presence": "...", "stance": "...", "realm": "...", "bond": "...", "wish": "...", "race": "...", "element": "...", "disposition": "...", "stats": {} }
}
```

능력치 합계는 항상 300입니다. 어떤 얼굴도 우열이 생기지 않게 하기 위해서입니다.

### 오류

| 상태 | 뜻 | `detail.retryable` |
| --- | --- | --- |
| 422 | 요청 형식이 틀림 (허용되지 않은 응답 값 포함) | - |
| 500 | API 키 오류 등 다시 시도해도 안 되는 문제 | `false` |
| 503 | 연결 오류, 요청 한도 초과, 생성 미완료 | `true` |

오류 본문: `{ "detail": { "message": "화면에 보여줄 문구", "retryable": true } }`
