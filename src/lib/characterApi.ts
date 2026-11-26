/**
 * 캐릭터 생성 API 클라이언트 (characterApi)
 *
 * 역할: 특징값과 응답을 백엔드 POST /api/character 로 보내고 결과를 받아온다. 포토카드 생성도 요청한다. 요청·응답 타입과 설문 항목도 정의한다.
 * 비고: 형식은 백엔드 schemas.py 와 맞춘다. 주소는 NEXT_PUBLIC_API_URL 로 바꿀 수 있다.
 *       설문 선택지 값을 바꾸면 백엔드 schemas.py 의 Answers 와 parameters.py 의 표도 함께 고친다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 설문 4문항 추가, 응답에 색감과 고유 능력 추가
 *   - 2026-11-03 응답에 GPT의 선택 이유 추가
 *   - 2026-11-03 캐릭터 유형 문항 추가 (인외, 애니)
 *   - 2026-11-03 인외 선택지를 사물 머리 캐릭터로 변경
 *   - 2026-11-03 캐릭터 유형 이름을 오브젝트 헤드, 애니메이션 캐릭터로 변경
 *   - 2026-11-22 포토카드 생성 요청(POST /api/photocard) 추가
 *   - 2026-11-22 포토카드 요청에 포즈 뼈대 그림 추가
 *   - 2026-11-22 포토카드 요청에 손 모양 추가
 *   - 2026-11-22 캐릭터 유형 '애니메이션 캐릭터'를 '실제 동물'로 교체 (값 anime → animal)
 *   - 2026-11-22 캐릭터 유형 표시 이름을 '실제 동물'에서 '동물 머리'로 변경
 *   - 2026-11-24 질문·선택지 화면 문구 수정 (내부 값은 그대로)
 *   - 2026-11-26 설문을 대학교 생활 장면으로 바꾸고 단과대·강의실 자리 문항 추가 (10문항)
 *   - 2026-11-26 닮은 동물상(animal_looks)을 캐릭터 요청에 함께 보냄, 능력치 이름(stat_names) 타입 추가
 */

import type { FaceFeatures } from "@/lib/faceFeatures";
import type { HandGesture } from "@/lib/poseSkeleton";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// 질문은 대학교 생활 장면으로 묻는다. 값(value)은 백엔드 schemas.py 의 Answers 와 같아야 한다.
export const QUESTIONS = [
  {
    key: "character_type",
    title: "어떤 모습으로 태어나게 할까요?",
    options: [
      { value: "nonhuman", label: "오브젝트 헤드" },
      { value: "animal", label: "동물 머리" },
    ],
  },
  {
    key: "place",
    title: "캠퍼스에서 제일 좋아하는 곳은?",
    options: [
      { value: "deep_sea", label: "조용한 연못가 벤치" },
      { value: "night_sky", label: "밤하늘 보이는 옥상" },
      { value: "old_library", label: "중앙도서관 열람실" },
      { value: "neon_city", label: "학교 앞 먹자골목" },
    ],
  },
  {
    key: "major",
    title: "어느 단과대 기운이 끌리나요?",
    options: [
      { value: "engineering", label: "밤샘 코딩 공대" },
      { value: "humanities", label: "토론 좋아 인문대" },
      { value: "science", label: "실험실 자연대" },
      { value: "arts", label: "작업실 예체능" },
    ],
  },
  {
    key: "seat",
    title: "강의실에 들어가면 어디에 앉나요?",
    options: [
      { value: "front", label: "맨 앞 가운데" },
      { value: "window", label: "창가 자리" },
      { value: "back", label: "맨 뒷자리" },
      { value: "door", label: "문 바로 옆" },
    ],
  },
  {
    key: "companion",
    title: "팀플을 하게 된다면?",
    options: [
      { value: "alone", label: "그냥 혼자 다 한다" },
      { value: "one_friend", label: "믿는 단짝 한 명과" },
      { value: "crowd", label: "다 같이 역할 나눠서" },
    ],
  },
  {
    key: "time_of_day",
    title: "과제가 제일 잘 되는 시간은?",
    options: [
      { value: "dawn", label: "해 뜨기 전 새벽" },
      { value: "noon", label: "공강 낮 시간" },
      { value: "sunset", label: "수업 끝난 해 질 녘" },
      { value: "midnight", label: "마감 직전 한밤" },
    ],
  },
  {
    key: "crisis",
    title: "시험 전날인데 하나도 안 봤다면?",
    options: [
      { value: "confront", label: "밤새서 정면 돌파" },
      { value: "hide", label: "일단 자고 내일의 나에게" },
      { value: "trick", label: "요약본부터 구한다" },
      { value: "call_friends", label: "스터디 단톡방 소환" },
    ],
  },
  {
    key: "power",
    title: "학교생활에 딱 하나 초능력이 생긴다면?",
    options: [
      { value: "read_minds", label: "교수님 출제 의도 읽기" },
      { value: "stop_time", label: "마감 1분 전 시간 멈추기" },
      { value: "fly", label: "1교시 강의실로 날아가기" },
      { value: "transform", label: "변신해서 다른 과 수업 듣기" },
    ],
  },
  {
    key: "bag",
    title: "가방에 꼭 들어 있는 것은?",
    options: [
      { value: "snack", label: "당 충전 간식" },
      { value: "book", label: "두꺼운 전공책" },
      { value: "map", label: "캠퍼스 지도와 시간표" },
      { value: "charm", label: "학점 부적" },
    ],
  },
  {
    key: "wish_2027",
    title: "2027년 학교생활에서 가장 바라는 것은?",
    options: [
      { value: "adventure", label: "교환학생 같은 새 도전" },
      { value: "rest", label: "공강 많은 꿀 시간표" },
      { value: "growth", label: "학점·실력 한 단계 업" },
      { value: "connection", label: "좋은 사람들과의 추억" },
    ],
  },
] as const;

export type Answers = {
  character_type: string;
  place: string;
  companion: string;
  wish_2027: string;
  time_of_day: string;
  crisis: string;
  power: string;
  bag: string;
  major: string;
  seat: string;
};

export type Stats = {
  insight: number;
  vitality: number;
  resonance: number;
  agility: number;
  willpower: number;
  luck: number;
};

/** 능력치 이름. 캐릭터마다 GPT가 짓는다 (예: insight → 물결감지) */
export type StatNames = Record<keyof Stats, string>;

/** 닮은 동물상 (faceLook.ts 의 ANIMALS key). 동물 캐릭터의 종족을 고르는 데 쓴다. */
export type AnimalLook = { key: string; percent: number };

export type Character = {
  name: string;
  race: string;
  appearance: string;
  element: string;
  disposition: string;
  palette: string;
  ability: string;
  stats: Stats;
  stat_names?: StatNames;
  /** 고유 능력과 선택 이유는 백엔드가 얼굴 패턴 표로 정한다 */
  reason: string;
  backstory: string;
  lucky_item: string;
  message_2027: string;
  parameters: Record<string, unknown>;
};

export class CharacterApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** 백엔드가 만든 포토카드. 주소는 백엔드 기준 경로라 assetUrl 로 바꿔 쓴다. */
export type Photocard = {
  card_id: string;
  illustration_url: string;
  card_url: string;
};

export const assetUrl = (path: string) => `${API_URL}${path}`;

async function post<T>(path: string, body: unknown, fallback: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CharacterApiError("서버에 연결하지 못했어요", true);
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null))?.detail;
    throw new CharacterApiError(
      detail?.message ?? fallback,
      detail?.retryable ?? false,
    );
  }
  return response.json();
}

export function createCharacter(
  features: FaceFeatures,
  answers: Answers,
  animalLooks: AnimalLook[] = [],
): Promise<Character> {
  return post(
    "/api/character",
    { features, answers, animal_looks: animalLooks },
    "캐릭터 생성에 실패했어요",
  );
}

/**
 * 일러스트를 그리고 포토카드를 합성한다. 이미지 생성이라 수십 초 걸릴 수 있다.
 * poseSkeleton: 얼굴 없이 관절만 이은 뼈대 PNG(data URL). 없으면 자유 자세로 그린다.
 * handGestures: 화면 기준 왼쪽·오른쪽 손의 손 모양 코드 (최대 2개)
 */
export function createPhotocard(
  character: Character,
  poseSkeleton: string | null,
  handGestures: HandGesture[],
): Promise<Photocard> {
  return post(
    "/api/photocard",
    { character, pose_skeleton: poseSkeleton, hand_gestures: handGestures },
    "포토카드를 만들지 못했어요",
  );
}
