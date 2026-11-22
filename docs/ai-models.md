# AI 모델 사용 정리

체험 한 번에 어떤 모델이 어디서, 무엇을 받아서, 무엇을 만드는지 정리한 문서입니다.
모델이나 프롬프트를 바꾸면 이 문서도 함께 수정합니다.
프롬프트 원문과 조립된 예시는 공유용 페이지 "이게 나라고? 프롬프트 노트"에도 정리되어 있습니다.

## 한눈에 보기

```
[브라우저]                                   [백엔드]                                  [OpenAI]
웹캠 ─ MediaPipe Face ─ 얼굴 수치 14개 ──┐
      MediaPipe Pose ─ 뼈대 PNG ────────┼─▶ ① 룰: 점수·후보·능력치 (parameters.py)
설문 8문항 ─────────────────────────────┘
                                              ③ 캐릭터 결정·글 (ai_character.py) ─────▶ 글 모델
                                              ④ 일러스트 (illustration.py) ───────────▶ 이미지 모델
                                              ⑤ 카드 합성 (photocard.py, Pillow) ── 모델 아님
```

| 단계 | 어디서 | 모델 | 입력 | 출력 | API |
| --- | --- | --- | --- | --- | --- |
| 얼굴 측정 | 브라우저 | MediaPipe Face Landmarker | 웹캠 영상 | 얼굴 점 478개 → 수치 14개 | - |
| 포즈 | 브라우저 | MediaPipe Pose Landmarker (lite) + Gesture Recognizer | 웹캠 영상 | 상반신 관절·손가락 → 뼈대 PNG, 손 모양 코드 | - |
| ① 룰 | 백엔드 | 없음 (규칙 표) | 수치 14개, 설문 | 점수, 후보, 기본 능력치, 색감, 고유 능력 | - |
| ③ 캐릭터 결정 | 백엔드 → OpenAI | 글 모델 | ①의 재료 (무작위 동물 후보·이름 낱말, 얼굴 생김새 포함) | 이름, 종족, 외형, 설정, 메시지 등 | `POST /v1/responses` (구조화 출력) |
| ④ 일러스트 | 백엔드 → OpenAI | 이미지 모델 | 캐릭터 글 (+ 뼈대 PNG, 손 모양) | 1024×1024 PNG | `POST /v1/images/generations` 또는 `/v1/images/edits` |
| ⑤ 카드 합성 | 백엔드 | 없음 (Pillow) | 캐릭터 글, 일러스트 | 100×148mm 홀로그램 카드 PNG | - |

## 브라우저 모델 (MediaPipe)

- 패키지: `@mediapipe/tasks-vision` 1.2.0. wasm은 jsdelivr, 모델 파일은 Google 저장소에서 처음 한 번 받습니다 (인터넷 필요).
- GPU가 안 되면 CPU로 다시 만듭니다.
- **영상은 브라우저 밖으로 나가지 않습니다.** 나가는 것은 얼굴 수치와 뼈대 그림뿐입니다.

| 모델 | 파일 | 코드 | 쓰는 곳 |
| --- | --- | --- | --- |
| Face Landmarker | `face_landmarker/float16/1/face_landmarker.task` | `src/hooks/useFaceLandmarker.ts` | 위치 맞추기, 얼굴 측정 (2초 평균) |
| Pose Landmarker lite | `pose_landmarker_lite/float16/1/pose_landmarker_lite.task` | `src/hooks/usePoseLandmarker.ts` | 포즈 단계에서만 계산 |
| Gesture Recognizer | `gesture_recognizer/float16/1/gesture_recognizer.task` | `src/hooks/usePoseLandmarker.ts` | 포즈 단계에서만, 손 21점과 손 모양 7종 |

뼈대 PNG(`src/lib/poseSkeleton.ts`): 흰 바탕 512×768, 얼굴 없이 머리는 빈 원, 왼팔·오른팔은 다른 색 선. 화면과 같은 거울 모드 기준입니다.

## 백엔드 모델 (OpenAI)

공통: `openai` 파이썬 SDK, 키는 `.env`의 `OPENAI_API_KEY`. 글 요청은 `store=False`로 OpenAI에 저장하지 않습니다.


### ③ 캐릭터 결정과 글 — `app/services/ai_character.py`

- **요청**: `responses.parse`로 `AiDecision` 형식(JSON)을 강제합니다. 입력은 ①의 재료 전체(JSON).
  - 얼굴은 **0~1로 바꿔 반올림한 점수**만 보냅니다. 원본 수치, 머리 자세, 이미지는 보내지 않습니다.
  - 실제 동물 캐릭터는 `face_traits`(예: `두 눈 사이가 먼 편`)도 함께 갑니다. 동물 후보(`race_candidates`)와 이름 낱말(`name_hints`)은 참가자마다 무작위로 뽑습니다.
- **결정하는 것**: 종족·역할, 속성, 성향, 능력치(합계 300), 선택 이유, 이름, 외형, 설정, 럭키 아이템, 2027년 메시지. 색감과 고유 능력은 룰이 정합니다.
- **유형별 지시**
  - 오브젝트 헤드: 머리가 사물이고 몸은 사람. 사물에 사람 얼굴을 그리지 않고, 참가자 얼굴과 닮게 하지 않습니다.
  - 실제 동물: 무작위로 뽑은 동물 후보 중 하나로, 실제 동물의 생김새·털·비율을 따르고 옷을 입히지 않습니다. 얼굴은 `face_traits`만큼 참가자와 닮게 합니다.
  - 이름: `수식어 + 종족` 형식(예: 보송보송한 토끼). 수식어는 무작위로 뽑은 `name_hints` 3개 중 하나이며, 모델이 고른 수식어로 서버가 이름을 조립합니다.
  - 공통: 외모·성격을 평가하지 않고, 모든 연령이 보는 행사에 맞게 씁니다.
- **제한**: 45초, 재시도 1회, 출력 최대 8000토큰.

### ④ 일러스트 — `app/services/illustration.py`

- **프롬프트**: 캐릭터 글(외형, 종족, 속성, 색감, 배경)로 만듭니다. 얼굴 수치는 넣지 않습니다.
  - 실제 동물이면 "실제 동물을 사진처럼 사실적으로, 옷 없이" 스타일 문장과 얼굴 생김새 문구를 넣습니다.
  - 정사각 구도에 머리 위 약 15%를 비우고, 머리·양손·몸이 모두 화면 안에 들어오게 그립니다. 글자·로고·테두리는 넣지 않습니다.
- **손 모양**: `hand_gestures` 코드를 서버의 정해 둔 문장으로 바꿔 "손 모양: 그림의 왼쪽 손은 …" 한 줄을 추가합니다.
- **포즈**: 뼈대 PNG가 있으면 `images.edit`에 참고 이미지로 보내고 "이 자세를 따르되 뼈대 선은 남기지 않는다"고 지시합니다. 없으면 `images.generate`로 자유 자세.
- **제한**: 120초, 재시도 1회. 안전 필터에 걸리면 "다시 그리기"가 가능한 오류(503)로 돌려줍니다.

### ⑤ 카드 합성 — `app/services/photocard.py`

모델이 아니라 Pillow 코드입니다. 일러스트는 정보 패널 위 영역(1181×1192)에만 선명하게 배치하고 패널 뒤는 같은 그림을 흐리게 깔아, 캐릭터가 패널에 가려지지 않으면서 풀아트처럼 보이게 합니다. 그 위에 홀로 포일 테두리, 광택, 반짝이, 유리 패널, 등급 별, 카드 번호(`No.XXXX · 1/1`)를 그립니다. 그래서 그림 모델이 바뀌어도 카드 틀과 홀로 효과는 항상 같습니다.

## 모델 바꾸기 (환경변수)

백엔드 폴더의 `.env`에서 바꿉니다. 코드 기본값은 그대로 두고 `.env`만 바꾸면 됩니다.

| 변수 | 쓰는 단계 | 기본값 | 비고 |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | 전체 | - | 필수 |
| `OPENAI_MODEL` | ③ | `gpt-6.1-terra` | 구조화 출력(`responses.parse`)을 지원해야 함 |
| `OPENAI_IMAGE_MODEL` | ④ | `gpt-image-2.5-flare` | 1024×1024와 편집(`images.edit`)을 지원해야 함 |
| `OPENAI_IMAGE_QUALITY` | ④ | `medium` | `low` / `medium` / `high` |
| `CARD_FONT` | ⑤ | Pretendard → Apple SD 산돌고딕 Neo | 한글 글꼴 경로 |
| `CARD_OUTPUT_DIR` | ⑤ | `output/cards` | 카드 저장 폴더 |

**테스트용 저렴한 설정** (개발할 때 사용 중)

```
OPENAI_MODEL=gpt-5.4-nano
OPENAI_IMAGE_MODEL=gpt-image-1-mini
OPENAI_IMAGE_QUALITY=low
```

키로 쓸 수 있는 모델 목록 확인:

```bash
.venv/bin/python -c "from dotenv import load_dotenv; load_dotenv('.env'); import openai; print(sorted(m.id for m in openai.OpenAI().models.list()))"
```

## 걸리는 시간 (실측, 저렴한 설정)

| 구간 | 시간 |
| --- | --- |
| 캐릭터 글 (오브젝트 헤드) | 약 5~7초 |
| 캐릭터 글 (실제 동물) | 약 5~9초 |
| 일러스트 + 카드 합성 | 약 11~15초 |
| 합계 | 약 17~23초 |

기본 모델(`gpt-6.1-terra`, `gpt-image-2.5-flare` medium)로는 아직 재지 않았습니다.

## 밖으로 나가는 데이터

| 데이터 | 브라우저 밖 | OpenAI로 | 저장 |
| --- | --- | --- | --- |
| 웹캠 영상·얼굴 사진 | 나가지 않음 | 보내지 않음 | 저장하지 않음 |
| 얼굴 수치 14개 | 백엔드로 | 반올림한 점수만 (머리 자세 제외) | 저장하지 않음 |
| 얼굴 생김새 문구 (애니) | - | 글·이미지 요청에 포함 | 카드 폴더 `character.json` |
| 포즈 뼈대 PNG | 백엔드로 | 이미지 편집 요청에 포함 | 카드 폴더 `pose.png` |
| 일러스트, 카드 | - | (OpenAI가 생성) | 카드 폴더 `illustration.png`, `card.png` |

## 테스트

`tests/`의 블랙박스 테스트는 실제 OpenAI 대신 가짜 서버(`tests/conftest.py`)를 띄워 비용 없이 돌립니다.
가짜 서버는 글, 이미지 생성·편집 요청에 모두 응답하고, 받은 요청을 기록해 무엇이 밖으로 나갔는지 확인합니다.
실제 모델의 그림 품질과 시간은 테스트로 확인되지 않으니, 모델을 바꾸면 실제 키로 몇 장 뽑아 확인합니다.
