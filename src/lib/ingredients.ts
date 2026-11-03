/**
 * 묘약 재료 (ingredients)
 *
 * 역할: 얼굴 측정값과 설문 응답을 항아리에 넣을 재료(아이콘 + 이름 + 색)로 바꾼다.
 * 비고: 화면 연출 전용이다. 실제 캐릭터 값은 백엔드 parameters.py 의 규칙표가 정한다.
 *       얼굴 재료의 기준값은 parameters.py 의 THRESHOLDS 와 같게 둔다.
 *       아이콘은 Game-icons(CC BY 3.0)이므로 출처 표기를 유지한다. (README 참고)
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 임시 이모지를 Game-icons 아이콘과 재료별 색으로 교체
 */

import type { IconType } from "react-icons";
import {
  GiCandleFlame,
  GiCherry,
  GiCompass,
  GiCrystalBall,
  GiDandelionFlower,
  GiFallingStar,
  GiFeather,
  GiFluffyCloud,
  GiFrog,
  GiMoon,
  GiMushroomGills,
  GiScrollUnfurled,
  GiSewingString,
  GiSparkles,
  GiSpiralShell,
  GiSprout,
  GiStonePile,
  GiWaterDrop,
  GiWhirlwind,
  GiWrappedSweet,
} from "react-icons/gi";
import type { FaceFeatures } from "@/lib/faceFeatures";

type IngredientLook = { Icon: IconType; label: string; color: string };

export type Ingredient = IngredientLook & { key: string };

const tier = (value: number, low: number, high: number) =>
  value < low ? 0 : value > high ? 2 : 1;

const SILHOUETTE: IngredientLook[] = [
  { Icon: GiMushroomGills, label: "수상한 버섯", color: "#f472b6" },
  { Icon: GiMoon, label: "달빛 조각", color: "#fde68a" },
  { Icon: GiFeather, label: "긴 꼬리 깃털", color: "#7dd3fc" },
];
const GAZE: IngredientLook[] = [
  { Icon: GiCrystalBall, label: "수정 구슬 가루", color: "#c4b5fd" },
  { Icon: GiSparkles, label: "별가루", color: "#fef08a" },
  { Icon: GiWhirlwind, label: "차가운 바람", color: "#a5f3fc" },
];
const PRESENCE: IngredientLook[] = [
  { Icon: GiDandelionFlower, label: "민들레 솜", color: "#fef9c3" },
  { Icon: GiWaterDrop, label: "새벽 이슬", color: "#7dd3fc" },
  { Icon: GiStonePile, label: "화산 돌", color: "#fb923c" },
];

export function faceIngredients(features: FaceFeatures): Ingredient[] {
  const pick = (name: string, table: IngredientLook[], index: number) => ({
    key: `face:${name}`,
    ...table[index],
  });
  return [
    pick("silhouette", SILHOUETTE, tier(features.face_aspect_ratio, 1.25, 1.42)),
    pick("gaze", GAZE, tier(features.eye_spacing_ratio, 0.4, 0.46)),
    pick("presence", PRESENCE, tier(features.jaw_width_ratio, 0.78, 0.88)),
  ];
}

// 설문 선택지별 재료. 키는 lib/characterApi.ts 의 QUESTIONS 값과 같다.
export const ANSWER_INGREDIENTS: Record<string, IngredientLook> = {
  deep_sea: { Icon: GiSpiralShell, label: "심해 소라", color: "#5eead4" },
  night_sky: { Icon: GiFallingStar, label: "떨어진 별", color: "#fde047" },
  old_library: { Icon: GiScrollUnfurled, label: "낡은 책장", color: "#d6b98c" },
  neon_city: { Icon: GiWrappedSweet, label: "네온 사탕", color: "#f0abfc" },
  alone: { Icon: GiCandleFlame, label: "외딴 촛불", color: "#fdba74" },
  one_friend: { Icon: GiCherry, label: "쌍둥이 열매", color: "#fb7185" },
  crowd: { Icon: GiFrog, label: "개구리 합창", color: "#86efac" },
  adventure: { Icon: GiCompass, label: "녹슨 나침반", color: "#fbbf24" },
  rest: { Icon: GiFluffyCloud, label: "포근한 구름", color: "#e0e7ff" },
  growth: { Icon: GiSprout, label: "새싹 뿌리", color: "#4ade80" },
  connection: { Icon: GiSewingString, label: "붉은 실", color: "#f87171" },
};
