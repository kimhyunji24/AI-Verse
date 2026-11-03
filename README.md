# AI 캐릭터 생성 시스템

웹캠으로 참가자의 얼굴 특징 데이터를 추출하고, 간단한 응답 정보와 결합해 개인별 AI 캐릭터를 생성한 뒤, 컬러 포토카드로 현장에서 즉시 출력하는 체험형 부스 서비스입니다.

- 얼굴 데이터는 성격·외모 평가에 사용하지 않으며, 캐릭터 생성에 필요한 시각적 특징값 추출 목적으로만 사용합니다.
- 출력: Canon SELPHY CP1500

## 체험 프로세스

1. **등록·촬영 준비** — 착석 시 웹캠이 얼굴 위치/방향을 인식, 분석 가능하면 시작 가능 상태 표시
2. **체험 시작** — 아케이드 버튼 입력 → 3초 카운트다운 → 분석 시작
3. **랜드마크·특징 분석** — MediaPipe 얼굴 랜드마크 추출 및 시각화
4. **캐릭터 매핑** — 특징값 + 응답 데이터 → 캐릭터 생성 파라미터 (종족, 속성, 능력치, 설정)
5. **콘텐츠 생성** — 캐릭터 설정/일러스트, 2027년 메시지, 럭키 아이템 (터미널형 로딩 화면)
6. **결과 확인** — 이름, 능력치, 설정, 럭키 메시지 표시
7. **포토카드 출력** — 템플릿에 자동 배치 후 즉시 인쇄

결과물: 캐릭터 이름/종족, 일러스트, 고유 속성·능력치, 소개·설정, 럭키 아이템, 2027년 메시지

## 레포 구조

하나의 레포에서 **브랜치로 front / back을 분리**합니다. 각 브랜치의 루트가 곧 해당 프로젝트입니다.

| 브랜치 | 내용 |
| --- | --- |
| `main` | README, docs (기획서, API 명세) |
| `feat/front` | Next.js — 웹캠, MediaPipe 랜드마크 시각화, 터미널 로딩 화면, 결과 화면 |
| `feat/back` | FastAPI — 캐릭터 생성 API(LLM, 이미지 생성), 포토카드 합성, 프린터 출력 |

역할 분담 (초안)
- **front**: 얼굴 인식·랜드마크 추출(MediaPipe, 브라우저), 카운트다운/로딩/결과 UI, 아케이드 버튼 입력
- **back**: 캐릭터 생성(API 키 보관), 포토카드 이미지 합성, SELPHY 출력

## 실행 방법

해당 브랜치로 체크아웃한 뒤 루트에서 실행합니다.

**back (`feat/back`, FastAPI, 포트 8000)**

```bash
git checkout feat/back
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # API 키 입력
uvicorn app.main:app --reload --port 8000
```

확인: http://localhost:8000/health, API 문서: http://localhost:8000/docs

**front (`feat/front`, Next.js, 포트 3000)**

```bash
git checkout feat/front
npm install
npm run dev
```

확인: http://localhost:3000

front와 back을 함께 띄우려면 `git worktree add ../AI-Verse-back feat/back`처럼 작업 폴더를 하나 더 만들어 각각 실행합니다.

## 작업 규칙

- 새 파일은 맨 위에 헤더 주석(파일 이름, 역할, 비고, 수정 이력)을 답니다.
- 파일을 수정할 때마다 그 파일 헤더의 `수정 이력`에 `날짜 + 변경 내용`을 한 줄 추가합니다.
- AI가 코드를 수정할 때도 예외 없이 **항상 AI가 직접** 해당 파일 헤더의 `수정 이력`을 작성합니다.

## 브랜치 전략

기능 하나당 브랜치 하나를 만들어 작업하고, **push도 기능 브랜치 단위로** 합니다.

```
main                 문서 전용 (README, docs)
├─ feat/front        front 통합 브랜치 (Next.js)
│   ├─ feat/front-camera
│   ├─ feat/front-landmark
│   └─ ...
└─ feat/back         back 통합 브랜치 (FastAPI)
    ├─ feat/back-character-api
    ├─ feat/back-photocard
    └─ ...
```

| 구분 | 브랜치 | 규칙 |
| --- | --- | --- |
| 문서 | `main` | README, docs만 수정 |
| 통합 | `feat/front`, `feat/back` | 직접 커밋/push 금지. 기능 브랜치를 PR로 합치는 곳 |
| 기능 | `feat/front-<기능>`, `feat/back-<기능>` | 통합 브랜치에서 따서 작업하고 기능 브랜치로 push |
| 수정 | `fix/front-<내용>`, `fix/back-<내용>` | 버그 수정, 통합 브랜치에서 땀 |

브랜치 이름 예시
- front: `feat/front-camera`(웹캠), `feat/front-landmark`(랜드마크 시각화), `feat/front-loading`(터미널 로딩 화면), `feat/front-result`(결과 화면)
- back: `feat/back-character-api`(캐릭터 생성), `feat/back-photocard`(포토카드 합성), `feat/back-printer`(프린터 출력)

주의: `feat/front` 브랜치가 이미 있어서 `feat/front/camera`처럼 `/`로 이어 붙이면 만들어지지 않습니다. 반드시 `feat/front-camera`처럼 `-`로 잇습니다.

작업 순서

```bash
# 1. 통합 브랜치를 최신으로 받고 기능 브랜치 생성
git checkout feat/front
git pull
git checkout -b feat/front-camera

# 2. 작업 후 커밋하고 기능 브랜치로 push
git add .
git commit -m "웹캠 연결과 얼굴 위치 인식 추가"
git push -u origin feat/front-camera

# 3. GitHub에서 feat/front-camera -> feat/front 로 PR 생성, 리뷰 후 merge
```

- 기능 하나가 끝나면 PR로 통합 브랜치(`feat/front` 또는 `feat/back`)에 합칩니다.
- 합쳐진 기능 브랜치는 삭제합니다.
- front와 back 사이 데이터 형식(요청/응답)이 바뀌면 `docs/`의 API 명세를 `main`에서 함께 수정합니다.

## Git 규칙

- 커밋 메시지는 **한국어**로, 다른 팀원이 읽고 바로 이해할 수 있게 **무엇을 왜 바꿨는지** 씁니다.
  - 예: `웹캠 연결과 얼굴 위치 인식 추가`, `캐릭터 생성 응답에 럭키 아이템 필드 추가`
  - 변경이 여러 개면 제목 아래 `-` 목록으로 풀어 씁니다.
- 원격 변경은 rebase 하지 않고 `git pull`(merge)로 받습니다.
- 커밋/PR에 **Claude 공동작업자(Co-Authored-By) 및 Claude 관련 표시를 절대 추가하지 않습니다.**
