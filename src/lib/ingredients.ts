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
 *   - 2026-11-03 설문 4문항의 재료 추가
 *   - 2026-11-03 캐릭터 유형 재료 추가
 *   - 2026-11-03 인외 재료를 촉수에서 찻주전자로 변경
 */

import type { IconType } from "react-icons";
import {
  GiBrain,
  GiBroadsword,
  GiCandleFlame,
  GiCherry,
  GiClover,
  GiCompass,
  GiCookie,
  GiCrystalBall,
  GiDandelionFlower,
  GiDualityMask,
  GiFallingStar,
  GiFeather,
  GiFluffyCloud,
  GiFluffyWing,
  GiFoxTail,
  GiFrog,
  GiHood,
  GiHourglass,
  GiMightyHorn,
  GiMoon,
  GiMushroomGills,
  GiNightSky,
  GiRibbon,
  GiScrollUnfurled,
  GiSewingString,
  GiSparkles,
  GiSpellBook,
  GiSpiralShell,
  GiSprout,
  GiStonePile,
  GiSun,
  GiSunrise,
  GiSunset,
  GiTeapot,
  GiTreasureMap,
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
  nonhuman: { Icon: GiTeapot, label: "말하는 찻주전자", color: "#a78bfa" },
  anime: { Icon: GiRibbon, label: "반짝이는 리본", color: "#f9a8d4" },
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
  dawn: { Icon: GiSunrise, label: "새벽 첫 햇살", color: "#fda4af" },
  noon: { Icon: GiSun, label: "한낮의 태양 조각", color: "#facc15" },
  sunset: { Icon: GiSunset, label: "노을 한 줌", color: "#fb923c" },
  midnight: { Icon: GiNightSky, label: "한밤의 어둠", color: "#a5b4fc" },
  confront: { Icon: GiBroadsword, label: "녹슨 검", color: "#cbd5e1" },
  hide: { Icon: GiHood, label: "그림자 망토", color: "#a78bfa" },
  trick: { Icon: GiFoxTail, label: "여우 꼬리", color: "#fb923c" },
  call_friends: { Icon: GiMightyHorn, label: "뿔피리", color: "#fcd34d" },
  read_minds: { Icon: GiBrain, label: "속삭이는 뇌", color: "#f9a8d4" },
  stop_time: { Icon: GiHourglass, label: "멈춘 모래시계", color: "#fde68a" },
  fly: { Icon: GiFluffyWing, label: "바람 날개", color: "#bae6fd" },
  transform: { Icon: GiDualityMask, label: "둔갑 가면", color: "#d8b4fe" },
  snack: { Icon: GiCookie, label: "마녀 쿠키", color: "#d6b98c" },
  book: { Icon: GiSpellBook, label: "주문서", color: "#c4b5fd" },
  map: { Icon: GiTreasureMap, label: "보물 지도", color: "#fcd34d" },
  charm: { Icon: GiClover, label: "네잎클로버", color: "#4ade80" },
};
