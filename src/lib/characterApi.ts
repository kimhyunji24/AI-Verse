/**
 * 캐릭터 생성 API 클라이언트 (characterApi)
 *
 * 역할: 특징값과 응답을 백엔드 POST /api/character 로 보내고 결과를 받아온다. 요청·응답 타입과 설문 항목도 정의한다.
 * 비고: 형식은 백엔드 schemas.py 와 맞춘다. 주소는 NEXT_PUBLIC_API_URL 로 바꿀 수 있다.
 *       설문 선택지 값을 바꾸면 백엔드 schemas.py 의 Answers 와 parameters.py 의 표도 함께 고친다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 */

import type { FaceFeatures } from "@/lib/faceFeatures";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const QUESTIONS = [
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
] as const;

export type Answers = {
  place: string;
  companion: string;
  wish_2027: string;
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
  stats: Stats;
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
