/**
 * 캐릭터 생성 API 클라이언트 (characterApi)
 *
 * 역할: 특징값과 응답을 백엔드 POST /api/character 로 보내고 결과를 받아온다. 요청·응답 타입과 설문 항목도 정의한다.
 * 비고: 형식은 백엔드 schemas.py 와 맞춘다. 주소는 NEXT_PUBLIC_API_URL 로 바꿀 수 있다.
 *       설문 선택지 값을 바꾸면 백엔드 schemas.py 의 Answers 와 parameters.py 의 표도 함께 고친다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 설문 4문항 추가, 응답에 색감과 고유 능력 추가
 *   - 2026-11-03 응답에 GPT의 선택 이유 추가
 *   - 2026-11-03 캐릭터 유형 문항 추가 (인외, 애니)
 *   - 2026-11-03 인외 선택지를 사물 머리 캐릭터로 변경
 */

import type { FaceFeatures } from "@/lib/faceFeatures";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const QUESTIONS = [
  {
    key: "character_type",
    title: "어떤 모습으로 태어나게 할까요?",
    options: [
      { value: "nonhuman", label: "머리가 사물인 캐릭터" },
      { value: "anime", label: "애니메이션 주인공" },
    ],
  },
  {
    key: "place",
    title: "가장 끌리는 곳은 어디인가요?",
    options: [
      { value: "deep_sea", label: "깊은 바다" },
      { value: "night_sky", label: "밤하늘" },
      { value: "old_library", label: "오래된 도서관" },
      { value: "neon_city", label: "네온 도시" },
    ],
  },
  {
    key: "companion",
    title: "모험을 떠난다면 누구와 함께할까요?",
    options: [
      { value: "alone", label: "혼자서" },
      { value: "one_friend", label: "단짝 한 명과" },
      { value: "crowd", label: "여럿이 함께" },
    ],
  },
  {
    key: "wish_2027",
    title: "2027년에 가장 바라는 것은?",
    options: [
      { value: "adventure", label: "새로운 모험" },
      { value: "rest", label: "충분한 쉼" },
      { value: "growth", label: "한 뼘의 성장" },
      { value: "connection", label: "소중한 사람들" },
    ],
  },
  {
    key: "time_of_day",
    title: "가장 좋아하는 시간은 언제인가요?",
    options: [
      { value: "dawn", label: "새벽" },
      { value: "noon", label: "한낮" },
      { value: "sunset", label: "노을 질 때" },
      { value: "midnight", label: "한밤" },
    ],
  },
  {
    key: "crisis",
    title: "위기가 닥치면 어떻게 할까요?",
    options: [
      { value: "confront", label: "맞선다" },
      { value: "hide", label: "숨는다" },
      { value: "trick", label: "꾀를 낸다" },
      { value: "call_friends", label: "동료를 부른다" },
    ],
  },
  {
    key: "power",
    title: "하나만 가질 수 있다면 어떤 힘을 고를까요?",
    options: [
      { value: "read_minds", label: "마음 읽기" },
      { value: "stop_time", label: "시간 멈추기" },
      { value: "fly", label: "하늘 날기" },
      { value: "transform", label: "변신" },
    ],
  },
  {
    key: "bag",
    title: "여행 가방에 꼭 넣는 것은?",
    options: [
      { value: "snack", label: "간식" },
      { value: "book", label: "책" },
      { value: "map", label: "지도" },
      { value: "charm", label: "부적" },
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
};

export type Stats = {
  insight: number;
  vitality: number;
  resonance: number;
  agility: number;
  willpower: number;
  luck: number;
};

export type Character = {
  name: string;
  race: string;
  appearance: string;
  element: string;
  disposition: string;
  palette: string;
  ability: string;
  stats: Stats;
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

export async function createCharacter(
  features: FaceFeatures,
  answers: Answers,
): Promise<Character> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/character`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features, answers }),
    });
  } catch {
    throw new CharacterApiError("서버에 연결하지 못했어요", true);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new CharacterApiError(
      body?.detail?.message ?? "캐릭터 생성에 실패했어요",
      body?.detail?.retryable ?? false,
    );
  }
  return response.json();
}
