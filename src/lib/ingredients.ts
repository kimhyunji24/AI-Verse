/**
 * 묘약 재료 (ingredients)
 *
 * 역할: 얼굴 측정값과 설문 응답을 항아리에 넣을 재료(아이콘 + 이름)로 바꾼다.
 * 비고: 화면 연출 전용이다. 실제 캐릭터 값은 백엔드 parameters.py 의 규칙표가 정한다.
 *       얼굴 재료의 기준값은 parameters.py 의 THRESHOLDS 와 같게 둔다.
 *       아이콘은 임시 이모지이며 일러스트가 나오면 교체한다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 */

import type { FaceFeatures } from "@/lib/faceFeatures";

export type Ingredient = { key: string; icon: string; label: string };

const tier = (value: number, low: number, high: number) =>
  value < low ? 0 : value > high ? 2 : 1;

const SILHOUETTE: [string, string][] = [
  ["🍄", "수상한 버섯"],
  ["🌙", "달빛 조각"],
  ["🪶", "긴 꼬리 깃털"],
];
const GAZE: [string, string][] = [
  ["🔮", "수정 구슬 가루"],
  ["✨", "별가루"],
  ["🌬️", "차가운 바람"],
];
const PRESENCE: [string, string][] = [
  ["🌼", "민들레 솜"],
  ["💧", "새벽 이슬"],
  ["🪨", "화산 돌"],
];

export function faceIngredients(features: FaceFeatures): Ingredient[] {
  const pick = (name: string, table: [string, string][], index: number) => ({
    key: `face:${name}`,
    icon: table[index][0],
    label: table[index][1],
  });
  return [
    pick("silhouette", SILHOUETTE, tier(features.face_aspect_ratio, 1.25, 1.42)),
    pick("gaze", GAZE, tier(features.eye_spacing_ratio, 0.4, 0.46)),
    pick("presence", PRESENCE, tier(features.jaw_width_ratio, 0.78, 0.88)),
  ];
}

// 설문 선택지별 재료. 키는 lib/characterApi.ts 의 QUESTIONS 값과 같다.
export const ANSWER_INGREDIENTS: Record<string, [string, string]> = {
  deep_sea: ["🐚", "심해 소라"],
  night_sky: ["⭐", "떨어진 별"],
  old_library: ["📜", "낡은 책장"],
  neon_city: ["🍬", "네온 사탕"],
  alone: ["🕯️", "외딴 촛불"],
  one_friend: ["🍒", "쌍둥이 열매"],
  crowd: ["🐸", "개구리 합창"],
  adventure: ["🧭", "녹슨 나침반"],
  rest: ["☁️", "포근한 구름"],
  growth: ["🌱", "새싹 뿌리"],
  connection: ["🧶", "붉은 실"],
};
