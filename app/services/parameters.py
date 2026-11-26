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
  - 2026-11-22 애니메이션 캐릭터를 실제 동물 캐릭터로 교체: 참고 캐릭터·화풍 표 삭제, 종족 후보를 실제 동물로
  - 2026-11-22 동물 종류와 이름 낱말을 입력에 따라 정하던 표 대신 매번 무작위로 뽑도록 변경
  - 2026-11-22 이름 낱말을 '~한'으로 끝나는 완성형 수식어로 변경 (이름이 '~한 + 종족' 형식이 됨)
  - 2026-11-22 의상 템플릿 6종(OUTFITS) 추가, 참가자마다 무작위로 하나, 실제 동물을 '동물 머리 + 사람 몸'으로 변경
  - 2026-11-22 동물 캐릭터를 2등신 찹쌀떡 몸의 손그림 캐릭터로 변경, 격한 감정(EMOTIONS)을 무작위로 하나 추가
  - 2026-11-26 얼굴 패턴으로 정확히 고르기: 동물 종족은 가장 닮은 동물상(ANIMAL_LOOK_POOLS)에서,
               고유 능력은 가장 두드러진 얼굴 특징(ABILITY_FLAVORS) × 갖고 싶은 힘(ABILITY_CORES)으로,
               선택 이유는 같은 특징과 동물상·실루엣을 넣은 문장 틀(build_reason)로 만든다
  - 2026-11-26 장소(REALMS)를 우리 학교 장소로: 교내 카페(하랑), 학관 앞 벤치, 중앙도서관, 기숙사 식당
  - 2026-11-26 사물 머리 종족 이름에서 '머리'를 뺌 (예: 토스터 머리 → 토스터)
  - 2026-11-26 대학교 문항 2개 추가: 끌리는 단과대(MAJORS, 능력치 비중 MAJOR_BONUS), 강의실 자리(SEATS, 버릇 문구)
  - 2026-11-26 사물 머리도 장소·얼굴 표 대신 44종(OBJECT_HEADS)에서 완전히 무작위로 하나, 종족마다 동작(RACE_ACTIONS)
  - 2026-11-26 의상 템플릿을 20종으로 늘리고, 소품(PROPS) 24종 중 하나를 무작위로 추가
  - 2026-11-26 이름 수식어에서 체형을 떠올리게 하는 말(포동포동한, 토실토실한, 동글동글한) 제외
"""

import random

from app.schemas import AnimalLook, Answers, CharacterParameters, FaceFeatures, Stats

# 무작위로 뽑는 재료(동물 종류, 이름 낱말)에 쓴다. 참가자마다 매번 달라진다.
_random = random.SystemRandom()

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
    # 키 이름은 예전 그대로 두고 뜻만 우리 학교 장소로 바꿨다 (화면 선택지: 하랑 / 학관 앞 벤치 / 중앙도서관 / 기숙사 식당)
    "deep_sea": "커피 향이 감도는 아늑한 교내 카페",
    "night_sky": "별빛이 내려앉은 학관 앞 벤치",
    "old_library": "끝없이 이어진 중앙도서관 서가",
    "neon_city": "김이 모락모락 피어오르는 기숙사 식당",
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
    "animal": "머리가 실제 동물인 인외 캐릭터",
}

# 의상 템플릿: 두 유형 모두 목 아래는 사람의 몸이라 이 중 하나를 입는다. 참가자마다 무작위로 고른다.
OUTFITS = {
    "check_shirt": "빨간 체크무늬 셔츠",
    # 머리 장식(왕관 등)은 넣지 않는다. 사물 머리 캐릭터가 사람 머리로 그려지는 원인이 된다.
    "princess_dress": "핑크 톤의 공주 드레스와 허리 리본",
    "suit": "검은 양복, 흰 셔츠, 빨간 넥타이",
    "pajamas": "보송보송한 극세사 수면 잠옷(파스텔 톤)",
    "hanbok": "색동 저고리가 있는 한복",
    "winter_padding": "두툼한 겨울 롱패딩",
    "school_uniform": "남색 재킷과 넥타이를 맨 교복",
    "hoodie": "오버사이즈 후드티와 조거 팬츠",
    "overalls": "청 멜빵바지와 줄무늬 티셔츠",
    "chef": "흰 요리사복과 높은 요리사 모자",
    "doctor": "흰 가운과 목에 건 청진기",
    "raincoat": "노란 비옷과 빨간 장화",
    "knit": "꽈배기 니트 스웨터와 긴 목도리",
    "soccer": "줄무늬 축구 유니폼과 무릎 양말 (글자·숫자 없음)",
    "hawaiian": "알록달록한 꽃무늬 하와이안 셔츠",
    "wizard": "별무늬가 수놓인 마법사 로브와 망토",
    "detective": "베이지 트렌치코트와 체크무늬 머플러",
    "stage": "반짝이가 달린 아이돌 무대 의상",
    "varsity": "가죽 소매의 야구 점퍼 (글자 없음)",
    "pirate": "금단추가 달린 해적 선장 코트",
}

# 종족과 이어지는 동작: 종족을 듣자마자 떠오르는 물건 하나를 한 손으로 쓰는 장면.
# 표에 있는 종족은 이 동작을 그대로 쓰고, GPT가 새로 지은 종족만 GPT가 쓴 동작(action)을 쓴다.
RACE_ACTIONS = {
    # 사물 머리
    "조개": "한 손에 든 진주를 머리 껍데기 틈에 끼우는 중",
    "어항": "손에 든 먹이 통을 머리 위에서 톡톡 터는 중",
    "등대": "손전등을 비추며 머리 불빛과 방향을 맞추는 중",
    "닻": "굵은 밧줄을 한 손에 감아쥐고 당기는 중",
    "잠수 헬멧": "작은 공기 펌프를 한 손으로 누르는 중",
    "나침반": "접은 지도를 펼쳐 머리 바늘과 맞춰 보는 중",
    "달 모양 램프": "손에 든 전구를 머리에 끼우려는 중",
    "지구본": "검지로 머리를 빙그르르 돌리는 중",
    "망원경": "한 손으로 머리 렌즈를 돌려 초점을 맞추는 중",
    "모래시계": "손바닥에 흘러내린 모래를 모으는 중",
    "로켓": "작은 연료 통을 한 손에 들고 있는 중",
    "시계탑": "커다란 태엽 열쇠를 한 손에 쥔 중",
    "잉크병": "깃펜을 머리에 콕 찍어 편지를 쓰는 중",
    "찻주전자": "한 손에 든 찻잔에 머리를 기울여 차를 따르는 중",
    "책": "한 손에 든 책갈피를 머리 페이지 사이에 끼우는 중",
    "촛대": "성냥을 그어 머리 초에 불을 붙이는 중",
    "두루마리": "한 손에 든 붓으로 머리 종이에 글씨를 쓰는 중",
    "깃펜": "작은 잉크병에 머리 끝을 콕 찍는 중",
    "자판기": "한 손에 든 동전을 머리 투입구에 넣는 중",
    "게임기": "한 손에 든 게임 카트리지를 머리에 꽂는 중",
    "브라운관 TV": "한 손에 든 리모컨으로 머리 채널을 돌리는 중",
    "헤드폰": "한 손에 든 카세트 플레이어 버튼을 누르는 중",
    "네온사인": "한 손으로 전선 플러그를 꽂는 중",
    "신호등": "한 손에 든 호루라기를 입가에 대고 있는 중",
    "토스터": "머리에서 튀어나온 식빵을 한 손으로 받는 중",
    "전자레인지": "한 손에 든 도시락을 머리 문에 넣는 중",
    "선풍기": "한 손에 든 바람개비를 머리 바람에 돌리는 중",
    "밥솥": "주걱을 한 손에 들고 머리에서 밥을 푸는 중",
    "컵라면": "한 손에 든 젓가락으로 머리 속 면을 집어 올리는 중",
    "붕어빵": "따끈한 붕어빵 봉투를 한 손에 안고 있는 중",
    "우유팩": "한 손에 든 빨대를 머리에 꽂는 중",
    "전구": "한 손으로 머리 위 줄 스위치를 당기는 중",
    "라디오": "한 손으로 머리 안테나를 길게 뽑는 중",
    "카메라": "한 손으로 머리 셔터 버튼을 누르는 중",
    "우체통": "한 손에 든 편지를 머리 입구에 넣는 중",
    "소화기": "한 손에 든 호스를 앞으로 겨누는 중",
    "화분": "작은 물뿌리개로 머리 새싹에 물을 주는 중",
    "케이크": "한 손에 든 성냥으로 머리 위 초에 불을 붙이는 중",
    "김밥": "한 손에 든 젓가락으로 단무지를 집는 중",
    "세탁기": "한 손에 든 양말을 머리 문에 넣는 중",
    "두루마리 휴지": "머리에서 휴지를 한 칸 뜯어 들고 있는 중",
    "계란프라이": "한 손에 든 뒤집개를 머리 위로 든 중",
    "마이크": "한 손으로 머리 마이크 줄을 잡고 노래하는 중",
    "스노우볼": "한 손으로 머리를 흔들어 눈을 날리는 중",
    # 동물
    "수달": "배 위에 올린 조개를 돌로 두드리는 중",
    "해달": "작은 조개를 두 손으로 꼭 쥐고 있는 중",
    "물범": "작은 물고기를 한 손에 들고 있는 중",
    "복어": "작은 새우를 한 손에 들고 있는 중",
    "펭귄": "작은 물고기를 입에 물고 있는 중",
    "돌고래": "고무공을 코끝에 올려 균형을 잡는 중",
    "해마": "작은 해초 줄기를 꼬리에 감고 있는 중",
    "거북": "상추 잎을 한 손에 들고 오물오물 먹는 중",
    "햄스터": "해바라기씨를 두 손으로 갉아 먹는 중",
    "토끼": "당근을 한 손에 들고 오물오물 먹는 중",
    "다람쥐": "도토리를 볼에 넣는 중",
    "날다람쥐": "커다란 나뭇잎을 우산처럼 들고 있는 중",
    "고슴도치": "작은 사과를 등에 얹고 있는 중",
    "친칠라": "작은 털 빗을 한 손에 들고 있는 중",
    "기니피그": "파슬리 한 줄기를 오물오물 먹는 중",
    "족제비": "작은 열쇠를 한 손에 쥐고 있는 중",
    "고양이": "털실 뭉치를 한 손으로 굴리는 중",
    "강아지": "공을 입에 물고 있는 중",
    "시바견": "작은 뼈다귀 간식을 입에 물고 있는 중",
    "퍼그": "삑삑이 장난감을 한 손으로 누르는 중",
    "여우": "포도 한 송이를 한 손에 들고 있는 중",
    "사막여우": "모래 위의 조개껍데기를 귀에 대고 있는 중",
    "너구리": "작은 수건으로 과일을 닦는 중",
    "라쿤": "사과를 두 손으로 물에 씻는 중",
    "레서판다": "대나무 잎을 한 손에 들고 있는 중",
    "판다": "대나무 줄기를 한 손에 들고 오물오물 먹는 중",
    "코알라": "유칼립투스 잎을 한 손에 들고 있는 중",
    "나무늘보": "나뭇가지를 한 팔로 끌어안고 있는 중",
    "알파카": "건초 한 묶음을 한 손에 들고 있는 중",
    "양": "털실 타래를 한 손에 들고 있는 중",
    "아기돼지": "진흙 묻은 작은 고구마를 한 손에 들고 있는 중",
    "카피바라": "머리 위에 귤 하나를 올리고 있는 중",
    "부엉이": "작은 책을 한 손에 펼쳐 들고 있는 중",
    "올빼미": "작은 등불을 한 손에 들고 있는 중",
    "참새": "쌀알 몇 톨을 손바닥에 올려 둔 중",
    "앵무새": "크래커를 한 손에 들고 있는 중",
    "오리": "작은 빵 조각을 한 손에 들고 있는 중",
    "병아리": "깨진 알껍데기를 모자처럼 쓰고 있는 중",
    "청개구리": "연잎을 우산처럼 들고 있는 중",
    "카멜레온": "작은 곤충 모양 사탕을 한 손에 든 중",
    "늑대": "달 모양 쿠키를 한 손에 들고 있는 중",
    "허스키": "썰매 끈을 한 손에 감아쥐고 있는 중",
}

# 소품(들거나 쓰거나 하고 있는 물건): 참가자마다 무작위로 하나. 종족 동작이 없을 때 그림에 쓰는 마지막 대안이다.
PROPS = (
    "노트북을 한 손에 들고 있음",
    "모자를 뒤로 돌려 씀",
    "주사위를 굴리는 중",
    "김이 나는 커피 잔을 들고 있음",
    "하트 풍선 끈을 쥐고 있음",
    "헤드폰을 목에 걸침",
    "두꺼운 책을 펼쳐 들고 있음",
    "필름 카메라를 목에 걸고 있음",
    "솜사탕을 들고 있음",
    "접은 우산을 어깨에 걸침",
    "스케이트보드를 옆구리에 낌",
    "작은 꽃다발을 들고 있음",
    "휴대용 게임기를 쥐고 있음",
    "선글라스를 머리 위에 올려 씀",
    "붕어빵 봉투를 안고 있음",
    "마이크를 들고 있음",
    "통기타를 등에 메고 있음",
    "끝이 반짝이는 마법 지팡이를 들고 있음",
    "종이비행기를 날리려는 중",
    "커다란 돋보기를 들고 있음",
    "네잎클로버를 들고 있음",
    "작은 화분을 안고 있음",
    "별 모양 막대사탕을 들고 있음",
    "털실 뭉치와 뜨개바늘을 들고 있음",
)

# 동물 캐릭터의 감정: 표정과 몸짓을 한껏 과장해 그린다. 참가자마다 무작위로 하나 고른다.
# (한국어 이름, 이미지 프롬프트 문장). 한국어 이름은 캐릭터 글에, 영어 문장은 그림에 쓴다.
EMOTIONS = (
    ("감격해서 눈물 글썽",
     "so deeply moved that the eyes are brimming with big wobbly tears about to fall, cheeks flushed bright red, "
     "mouth trembling in a wavy line, but clearly bursting with pride; tiny sparkles around the head"),
    ("영혼 가출할 만큼 피곤",
     "so utterly exhausted that its soul is visibly drifting out of its mouth as a tiny white ghost wisp, "
     "eyes half-closed and droopy, a big sweat drop on the forehead, slouched"),
    ("뿌듯해서 터질 것 같음",
     "so proud it might burst: chest puffed out, nose-in-the-air smug face with eyes squeezed shut, "
     "big sparkles and little shine lines all around"),
    ("깜짝 놀라 털이 곤두섬",
     "utterly shocked: eyes wide as tiny dots, mouth a small open circle, fur standing on end, "
     "little exclamation-like shock lines bursting around the head"),
    ("세상 억울함",
     "deeply wronged and sulky: puffed-up cheeks, lower lip pushed out, teary glaring eyes, "
     "a small dark scribble cloud above the head"),
    ("너무 신나서 방방 뜀",
     "overjoyed and bouncing: huge open-mouth smile, eyes curved into happy arcs, feet off the ground, "
     "motion lines and little musical notes around"),
    ("부끄러워서 녹아내림",
     "so embarrassed it is melting: face glowing bright red up to the ears, eyes swirling, "
     "steam puffs rising from the head, body slightly drooping like soft mochi"),
    ("배고파서 침 줄줄",
     "desperately hungry: sparkling starry eyes, drool dripping from the mouth, tummy rumbling with "
     "little rumble lines, tiny food daydream bubble above the head"),
    ("화나서 씩씩",
     "fuming mad in a cute way: puffed red cheeks, furrowed brows, little steam puffs from the ears, "
     "tiny anger vein mark on the head, stomping"),
    ("감동받아 엉엉 울음",
     "crying waterfalls of happy tears: two streams of tears gushing from the eyes, mouth wide open "
     "in a wail, cheeks flushed, little hearts floating around"),
)

# 이름 수식어: 이름은 "~한 + 종족"(보송보송한 토끼) 형식이다. 참가자마다 이 풀에서 무작위로 골라 주고,
# GPT가 그중 캐릭터에 어울리는 하나를 그대로 쓴다. 어색한 말("뭉게한")이 나오지 않도록 완성된 형태로 둔다.
# 체형·살집을 떠올리게 하는 말(포동포동, 토실토실, 통통 등)은 넣지 않는다.
# 참가자 얼굴을 재서 만든 캐릭터라 본인 외모를 두고 하는 말처럼 들릴 수 있다. 성격을 나타내는 말은 괜찮다.
NAME_MODIFIERS = (
    "몽실몽실한", "보송보송한", "말랑말랑한", "보들보들한", "폭신한", "반짝반짝한", "포근한", "꼬물꼬물한",
    "뭉게뭉게한", "새침한", "느긋한", "엉뚱한", "씩씩한", "수줍은", "다정한", "부지런한",
    "의젓한", "명랑한", "꼼꼼한", "호기심 많은", "용감한", "상냥한", "늠름한", "총명한",
    "까칠한", "덜렁대는", "겁 많은", "졸린",
)
NAME_HINT_COUNT = 3

# 실제 동물 캐릭터 얼굴에 옮길 생김새: 점수가 0.5에서 이만큼 벗어나면 (낮을 때, 높을 때) 문구를 쓴다.
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

# 사물 머리 캐릭터의 머리: 응답이나 얼굴로 정하지 않고 참가자마다 이 풀에서 무작위로 하나 고른다.
# 하나하나 RACE_ACTIONS에 어울리는 동작이 있다.
OBJECT_HEADS = (
    "조개", "어항", "등대", "닻", "잠수 헬멧", "나침반",
    "달 모양 램프", "지구본", "망원경", "모래시계", "로켓", "시계탑",
    "잉크병", "찻주전자", "책", "촛대", "두루마리", "깃펜",
    "자판기", "게임기", "브라운관 TV", "헤드폰", "네온사인", "신호등",
    "토스터", "전자레인지", "선풍기", "밥솥", "컵라면", "붕어빵",
    "우유팩", "전구", "라디오", "카메라", "우체통", "소화기",
    "화분", "케이크", "김밥", "세탁기", "두루마리 휴지", "계란프라이",
    "마이크", "스노우볼",
)

# 실제 동물 캐릭터의 종류 전체. 동물상이 없을 때 여기서 무작위로 고른다 (있으면 ANIMAL_LOOK_POOLS).
ANIMAL_POOL = (
    "수달", "해달", "물범", "복어", "펭귄", "돌고래", "해마", "거북",
    "햄스터", "토끼", "다람쥐", "날다람쥐", "고슴도치", "친칠라", "기니피그", "족제비",
    "고양이", "강아지", "시바견", "퍼그", "여우", "사막여우", "너구리", "라쿤",
    "레서판다", "판다", "코알라", "나무늘보", "알파카", "양", "아기돼지", "카피바라",
    "부엉이", "올빼미", "참새", "앵무새", "오리", "병아리", "청개구리", "카멜레온",
)

# 동물상(프론트 faceLook.ts 의 10가지) → 그 인상을 닮은 동물. 가장 닮은 동물상의 풀에서 하나를 무작위로 고른다.
# ANIMAL_POOL의 동물이 빠짐없이 한 번씩 들어 있다 (늑대·허스키는 늑대상용으로 추가).
ANIMAL_LOOK_POOLS = {
    "fox": ("여우상", ("여우", "사막여우", "레서판다", "고슴도치")),
    "cat": ("고양이상", ("고양이", "친칠라", "부엉이", "올빼미")),
    "dog": ("강아지상", ("강아지", "시바견", "퍼그", "물범")),
    "rabbit": ("토끼상", ("토끼", "양", "병아리", "오리")),
    "bear": ("곰상", ("판다", "코알라", "너구리", "카피바라")),
    "monkey": ("원숭이상", ("해달", "수달", "나무늘보", "앵무새")),
    "deer": ("사슴상", ("알파카", "해마", "날다람쥐", "참새", "돌고래", "펭귄")),
    "dino": ("공룡상", ("거북", "카멜레온", "청개구리", "복어")),
    "wolf": ("늑대상", ("늑대", "허스키", "족제비", "라쿤")),
    "hamster": ("햄스터상", ("햄스터", "다람쥐", "기니피그", "아기돼지")),
}

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

# 고유 능력 = 얼굴에서 가장 두드러진 특징의 수식어(ABILITY_FLAVORS) + 갖고 싶은 힘(ABILITY_CORES)
# 예: 멀리 떨어진 두 눈 + 마음 읽기 → "사방을 살피는 마음 청음"
ABILITY_CORES = {
    "read_minds": "마음 청음",
    "stop_time": "시간 멈춤",
    "fly": "바람 타기",
    "transform": "모습 바꾸기",
}
# 얼굴 특징별 (점수가 낮을 때, 높을 때). FACE_TRAITS와 같은 항목이고 좋고 나쁨이 없는 말만 쓴다.
ABILITY_FLAVORS = {
    "face_aspect_ratio": ("둥글게 구르는", "길게 꿰뚫는"),
    "eye_spacing_ratio": ("한 점을 겨누는", "사방을 살피는"),
    "inner_eye_gap_ratio": ("촘촘히 엮는", "넓게 펼치는"),
    "eye_position_ratio": ("높이 내다보는", "낮게 스며드는"),
    "nose_length_ratio": ("재빠른", "멀리 닿는"),
    "nose_width_ratio": ("날카로운", "든든한"),
    "mouth_width_ratio": ("속삭이는", "울려 퍼지는"),
    "lip_thickness_ratio": ("가볍게 스치는", "포근하게 감싸는"),
    "jaw_width_ratio": ("날렵한", "묵직한"),
}
# 선택 이유 문장에 넣는 얼굴 특징 (낮을 때, 높을 때). 명사로 끝나야 조사를 붙일 수 있다.
REASON_TRAITS = {
    "face_aspect_ratio": ("가로로 둥근 얼굴선", "세로로 갸름한 얼굴선"),
    "eye_spacing_ratio": ("가까이 모인 두 눈", "멀리 떨어진 두 눈"),
    "inner_eye_gap_ratio": ("좁은 미간", "넓은 미간"),
    "eye_position_ratio": ("높이 자리한 눈", "낮게 자리한 눈"),
    "nose_length_ratio": ("짧은 콧대", "긴 콧대"),
    "nose_width_ratio": ("좁은 콧볼", "넓은 콧볼"),
    "mouth_width_ratio": ("작은 입", "큰 입"),
    "lip_thickness_ratio": ("얇은 입술", "도톰한 입술"),
    "jaw_width_ratio": ("갸름한 턱선", "넓은 턱선"),
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
# 대학교 문항: 끌리는 단과대 → 설정 재료 문구, 비중을 더해 주는 능력치
MAJORS = {
    "engineering": "밤새 무언가를 만들어 내는 공대의 기운",
    "humanities": "글과 이야기를 사랑하는 인문대의 기운",
    "science": "실험실 불빛 아래 답을 찾는 자연대의 기운",
    "arts": "무대와 작업실을 누비는 예체능의 기운",
}
MAJOR_BONUS = {
    "engineering": "willpower",
    "humanities": "resonance",
    "science": "insight",
    "arts": "agility",
}
# 강의실에서 고르는 자리 → 버릇 문구
SEATS = {
    "front": "늘 맨 앞 가운데 자리에 앉는 버릇",
    "window": "창가 자리에서 바깥을 보며 생각에 잠기는 버릇",
    "back": "맨 뒷자리에서 강의실 전체를 살피는 버릇",
    "door": "문 바로 옆자리에서 언제든 나갈 준비를 하는 버릇",
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
    weights[MAJOR_BONUS[answers.major]] += 0.3

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


def _face_traits(scores: dict[str, float]) -> list[str]:
    """0.5에서 많이 벗어난 순서로 생김새 문구를 고른다."""
    ranked = sorted(FACE_TRAITS, key=lambda name: abs(scores[name] - 0.5), reverse=True)
    picked = [
        name
        for index, name in enumerate(ranked)
        if index < FACE_TRAIT_MIN or abs(scores[name] - 0.5) >= FACE_TRAIT_THRESHOLD
    ]
    return [FACE_TRAITS[name][scores[name] >= 0.5] for name in picked]


def _signature(scores: dict[str, float]) -> tuple[str, int]:
    """얼굴에서 가장 두드러진 특징(0.5에서 가장 먼 점수)과 방향(0 낮음 / 1 높음)."""
    name = max(ABILITY_FLAVORS, key=lambda feature: abs(scores[feature] - 0.5))
    return name, int(scores[name] >= 0.5)


def _animal_look(animal_looks: list[AnimalLook]) -> tuple[str, int, str]:
    """가장 닮은 동물상의 (이름, 비율, 고른 동물). 동물상이 없으면 동물 풀 전체에서 고른다."""
    if not animal_looks:
        return "", 0, _random.choice(ANIMAL_POOL)
    top = max(animal_looks, key=lambda look: look.percent)
    label, animals = ANIMAL_LOOK_POOLS[top.key]
    return label, top.percent, _random.choice(animals)


def _has_batchim(word: str) -> bool:
    last = word.strip()[-1:]
    return bool(last) and "가" <= last <= "힣" and (ord(last) - 0xAC00) % 28 != 0


def _particle(word: str, with_batchim: str, without: str) -> str:
    return word + (with_batchim if _has_batchim(word) else without)


def _to(word: str) -> str:
    """'~으로/로' (ㄹ받침은 '로')"""
    last = word.strip()[-1:]
    if _has_batchim(word) and (ord(last) - 0xAC00) % 28 != 8:
        return word + "으로"
    return word + "로"


def build_reason(parameters: CharacterParameters, race: str) -> str:
    """선택 이유: 가장 두드러진 얼굴 특징 → 고유 능력, 동물상(동물) 또는 실루엣(사물 머리) → 종족을 문장 틀에 넣는다."""
    trait = _particle(parameters.signature_trait, "이", "가")
    # 고유 능력은 "수식어 + 두 낱말 힘"(예: 사방을 살피는 + 마음 청음)이라 뒤 두 낱말을 떼면 수식어가 남는다
    flavor = parameters.ability.rsplit(" ", 2)[0] if parameters.ability else ""
    first = f"{trait} '{flavor}' 힘으로 끓어올랐고"
    if parameters.animal_look:
        return f"{first}, {parameters.animal_look}의 기운이 {parameters.animal_look_percent}%로 가장 짙어 {_to(race)} 태어났어요."
    # 사물 머리는 무작위라 얼굴과 잇지 않는다
    return f"{first}, 솥이 고른 {_to(race)} 태어났어요."


def _name_hints() -> list[str]:
    return _random.sample(NAME_MODIFIERS, NAME_HINT_COUNT)


def build_parameters(
    features: FaceFeatures, answers: Answers, animal_looks: list[AnimalLook] | None = None
) -> CharacterParameters:
    silhouette = _tier(features, "face_aspect_ratio")
    gaze = _tier(features, "eye_spacing_ratio")
    presence = _tier(features, "jaw_width_ratio")
    stance = _tier(features, "head_yaw")
    eye_gap = _tier(features, "inner_eye_gap_ratio")
    scores = _face_scores(features)

    animal = answers.character_type == "animal"
    signature, direction = _signature(scores)
    look_label, look_percent, look_animal = _animal_look(animal_looks or []) if animal else ("", 0, "")
    near_gaze = _nearest_other_tier(features, "eye_spacing_ratio", gaze)
    near_presence = _nearest_other_tier(features, "jaw_width_ratio", presence)

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
        major=MAJORS[answers.major],
        seat=SEATS[answers.seat],
        palette=PALETTES[answers.time_of_day][eye_gap],
        ability=f"{ABILITY_FLAVORS[signature][direction]} {ABILITY_CORES[answers.power]}",
        signature_trait=REASON_TRAITS[signature][direction],
        animal_look=look_label,
        animal_look_percent=look_percent,
        race_candidates=(
            [look_animal]
            if animal
            else [_random.choice(OBJECT_HEADS)]
        ),
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
        name_hints=_name_hints(),
        outfit=OUTFITS[_random.choice(list(OUTFITS))],
        emotion=_random.choice(EMOTIONS)[0] if animal else "",
        prop=_random.choice(PROPS),
        face_traits=_face_traits(scores) if animal else [],
    )
