# 보안 정책

## 취약점 제보

보안 문제를 발견하면 공개 이슈로 올리지 말고 레포 주인(@kimhyunji24)에게 비공개로 알려 주세요.
GitHub의 **Security → Report a vulnerability** 메뉴를 사용할 수 있습니다.

## 비밀 값(API 키 등) 관리 원칙

- API 키, 토큰, 비밀번호는 **절대 커밋하지 않습니다.** 이 레포는 public입니다.
- 비밀 값은 `back`의 `.env` 파일에만 두며, `.env*`는 `.gitignore`로 git에서 제외합니다.
- `.env.example` 같은 예시 파일도 레포에 두지 않습니다. 필요한 키 이름은 README에 적습니다.
- 실수로 올렸다면 지우는 것만으로는 부족합니다. **해당 키를 즉시 폐기하고 새로 발급**한 뒤 레포 주인에게 알려 주세요.
- 참가자의 얼굴 이미지와 특징 데이터는 캐릭터 생성에만 쓰고 레포에 저장하지 않습니다.

## 레포 보호 설정

- `main`, `feat/front`, `feat/back`: force push 금지, 브랜치 삭제 금지, PR 필수
- PR은 코드 소유자(`.github/CODEOWNERS`)의 승인 후 merge
- GitHub secret scanning 및 push protection 사용
