# API 명세

> 모델별 입력·출력, 환경변수, 걸리는 시간은 [AI 모델 사용 정리](ai-models.md)를 참고합니다.

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

`race`는 오브젝트 헤드면 머리에 달린 사물(예: `등대 머리`), 애니메이션 캐릭터면 사람이 아닌 생물의 종류(예: `물결수달`)입니다. `parameters.name_sounds`는 이름에 쓰는 음절 3개입니다. `parameters`는 룰이 만든 재료 전체입니다.

애니메이션 캐릭터(`character_type: "anime"`)는 `parameters`에 두 값이 더 들어갑니다. 인외 캐릭터는 빈 값(`""`, `[]`)입니다.

| 필드 | 뜻 |
| --- | --- |
| `art_style` | 화풍 지시문. 참고 캐릭터 6개 중 하나를 응답(`power`) × 얼굴 실루엣 단계로 고르고, GPT가 그 그림체를 글로 뽑습니다. 이름은 들어가지 않으며, 추출이 실패하면 미리 써 둔 화풍 글을 씁니다 |
| `face_traits` | 참가자와 닮게 옮길 얼굴 생김새 문구(최소 3개). 예: `두 눈 사이가 먼 편`, `입이 작은 편`. 좋고 나쁨을 평가하는 말은 쓰지 않습니다 |
| `art_features` | 참고 캐릭터의 눈·귀 특징에 `face_traits`를 반영한 문장(최대 4개). 추출이 실패하면 빈 배열입니다 |

캐릭터는 화풍 특징을 참고만 하고 기존 캐릭터와 구별되는 오리지널로 그리며, 얼굴은 `face_traits`만큼 참가자와 닮게 그립니다. 이 문구는 GPT 글 생성과 이미지 생성 요청에 함께 들어갑니다.

기본 능력치(`base_stats`)는 합계가 항상 300입니다. 어떤 얼굴도 우열이 생기지 않게 하기 위해서입니다. 최종 `stats`는 GPT가 정하며 프롬프트로 같은 규칙을 지시하지만 서버가 강제하지는 않습니다.

### 오류

| 상태 | 뜻 | `detail.retryable` |
| --- | --- | --- |
| 422 | 요청 형식이 틀림 (허용되지 않은 응답 값 포함) | - |
| 500 | API 키 오류 등 다시 시도해도 안 되는 문제 | `false` |
| 503 | 연결 오류, 요청 한도 초과, 거절, 생성 미완료, 형식이 맞지 않는 응답 | `true` |

오류 본문: `{ "detail": { "message": "화면에 보여줄 문구", "retryable": true } }`

## POST /api/photocard

`POST /api/character` 응답을 **그대로** 보내면 일러스트를 그리고 포토카드 PNG를 합성해 저장합니다. 이미지 생성이라 수십 초 걸릴 수 있습니다.

| 단계 | 담당 | 결과 |
| --- | --- | --- |
| 일러스트 | GPT Image (`app/services/illustration.py`) | 1024×1536 세로 PNG. 캐릭터 글(외형, 종족, 속성, 색감, 배경)만 프롬프트로 씁니다 |
| 합성 | Pillow (`app/services/photocard.py`) | 100×148mm(300dpi, 1181×1748) 풀아트 홀로그램 카드 PNG |

- 참가자 얼굴 이미지와 측정값은 이미지 생성 요청에 넣지 않습니다.
- 카드 바탕색은 속성(`element`)으로, 등급 별(1~3개)은 가장 높은 능력치로 정합니다.
- 파일은 백엔드의 `CARD_OUTPUT_DIR`(기본 `output/cards`)에 `<card_id>/card.png`, `illustration.png`, `character.json`으로 저장합니다.

### 요청

```json
{
  "character": { "...": "POST /api/character 응답 본문 전체" },
  "pose_skeleton": "data:image/png;base64,iVBORw0KGgo...",
  "hand_gestures": [{ "side": "left", "gesture": "Victory" }, { "side": "right", "gesture": "Thumb_Up" }]
}
```

- `pose_skeleton`(선택): 포즈 단계에서 찍은 상반신 뼈대 PNG(512×768, 흰 바탕). `data:` 접두어는 있어도 없어도 됩니다.
  - 얼굴이 없는 그림입니다. 머리는 빈 원, 팔은 좌우를 다른 색 선으로 그립니다. 화면과 같은 거울 모드 기준입니다.
  - 있으면 이미지 편집 API에 참고 이미지로 보내 캐릭터가 같은 자세를 취하게 하고, 카드 폴더에 `pose.png`로 함께 저장합니다.
  - 없거나 `null`이면 자유 자세로 그립니다.
  - PNG가 아니거나, 읽을 수 없거나, 한 변이 2048px보다 크면 AI를 호출하지 않고 422로 거절합니다.
- `hand_gestures`(선택, 최대 2개): 포즈를 찍은 순간의 손 모양. `side`는 화면(거울 모드)과 뼈대 그림 기준 `left`/`right`, `gesture`는 MediaPipe Gesture Recognizer 이름 7종(`Closed_Fist`, `Open_Palm`, `Pointing_Up`, `Thumb_Down`, `Thumb_Up`, `Victory`, `ILoveYou`) 중 하나입니다.
  - 서버가 정해 둔 문장으로 바꿔 이미지 프롬프트에 넣습니다(예: `그림의 왼쪽 손은 검지와 중지만 펴서 V자를 만든 손(브이)`). 다른 값은 422로 거절합니다.
  - 뼈대 PNG에는 손가락 관절(손 21점)도 가는 선과 점으로 그려집니다.

### 응답 (200)

```json
{
  "card_id": "6ccf295638dd425d8227f13d889139f6",
  "illustration_url": "/cards/6ccf295638dd425d8227f13d889139f6/illustration.png",
  "card_url": "/cards/6ccf295638dd425d8227f13d889139f6/card.png"
}
```

주소는 백엔드 기준 경로입니다. 프론트는 앞에 `NEXT_PUBLIC_API_URL`을 붙여 씁니다.

### 오류

| 상태 | 뜻 | `detail.retryable` |
| --- | --- | --- |
| 422 | 캐릭터 정보가 빠졌거나 형식이 틀림, 포즈 그림이 올바르지 않음 | - |
| 500 | API 키 오류 등 다시 시도해도 안 되는 문제 | `false` |
| 503 | 연결 오류, 요청 한도 초과, 안전 필터에 걸림 등 다시 그리면 될 수 있는 문제 | `true` |
