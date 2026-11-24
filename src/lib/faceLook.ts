/**
 * 얼굴 세부 분석과 동물상 유사도 (faceLook)
 *
 * 역할: MediaPipe 얼굴 랜드마크(468점)에서 눈매·눈 크기·코·광대·턱·입술·인중 등 세부 수치 14개를 재고,
 *       평균 얼굴과 비교한 표준 점수(z)로 바꾼 뒤, 동물상 8가지의 특징 방향과 얼마나 닮았는지(코사인 유사도)를
 *       백분율로 낸다. 결과는 "여우상 41%" 같은 재료와 화면의 분석 패널에 쓴다.
 * 비고: 화면 연출용 계산이다. 이미지는 저장하거나 보내지 않고, 백엔드로 가는 값(faceFeatures)도 바꾸지 않는다.
 *       평균값(MEAN)은 MediaPipe 표준 얼굴 모델(canonical_face_model.obj)에서 같은 방식으로 잰 값이다.
 *       퍼짐(SPREAD)은 사람 얼굴 비율의 흔한 편차(평균의 약 8%, 눈매 각도는 3.5도)로 잡았다.
 *       부스에서 여러 명을 재 보고 한쪽으로 쏠리면 MEAN을 실측 평균으로 바꾸면 된다.
 *
 * 수정 이력:
 *   - 2026-11-24 최초 작성
 */

import type { IconType } from "react-icons";
import {
  GiBearFace,
  GiCat,
  GiDeer,
  GiDinosaurRex,
  GiFoxHead,
  GiMonkey,
  GiRabbit,
  GiSittingDog,
} from "react-icons/gi";
import type { Landmark } from "@/lib/faceFeatures";

export type FaceDetail = {
  eye_tilt: number; // 눈꼬리 각도(도). +면 올라간 눈매
  eye_open: number; // 눈 세로 / 얼굴 높이
  eye_width: number; // 눈 가로 / 얼굴 폭
  eye_round: number; // 눈 세로 / 눈 가로
  nose_width: number; // 콧볼 너비 / 얼굴 폭
  nose_length: number; // 콧대 길이 / 얼굴 높이
  cheekbone: number; // 광대 폭 / 관자놀이 폭
  jaw: number; // 턱 폭 / 얼굴 폭
  face_length: number; // 얼굴 높이 / 얼굴 폭
  lip: number; // 입술 두께 / 얼굴 높이
  mouth_width: number; // 입 폭 / 얼굴 폭
  philtrum: number; // 인중 길이 / 얼굴 높이
  brow_gap: number; // 눈썹~눈 거리 / 얼굴 높이
  inner_gap: number; // 미간 / 얼굴 폭
};

type Key = keyof FaceDetail;

const MEAN: FaceDetail = {
  eye_tilt: 1.74,
  eye_open: 0.0383,
  eye_width: 0.1733,
  eye_round: 0.2551,
  nose_width: 0.2078,
  nose_length: 0.307,
  cheekbone: 1.2023,
  jaw: 0.7751,
  face_length: 1.1525,
  lip: 0.0809,
  mouth_width: 0.3205,
  philtrum: 0.0747,
  brow_gap: 0.134,
  inner_gap: 0.2422,
};

const SPREAD: FaceDetail = Object.fromEntries(
  (Object.keys(MEAN) as Key[]).map((key) => [key, key === "eye_tilt" ? 3.5 : MEAN[key] * 0.08]),
) as FaceDetail;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function px(point: Landmark, aspect: number): Landmark {
  return { x: point.x * aspect, y: point.y, z: point.z * aspect };
}

/** aspect: 영상의 가로 / 세로 */
export function measureFace(landmarks: Landmark[], aspect: number): FaceDetail {
  const p = (i: number) => px(landmarks[i], aspect);
  const d = (a: number, b: number) => {
    const A = p(a);
    const B = p(b);
    return Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z);
  };
  // 눈꼬리가 눈 안쪽보다 얼마나 위에 있는지 (화면 y는 아래로 커진다)
  const tilt = (outer: number, inner: number) => {
    const O = p(outer);
    const I = p(inner);
    return (Math.atan2(I.y - O.y, Math.abs(O.x - I.x)) * 180) / Math.PI;
  };
  const faceWidth = d(234, 454);
  const faceHeight = d(10, 152);
  return {
    eye_tilt: (tilt(33, 133) + tilt(263, 362)) / 2,
    eye_open: (d(159, 145) + d(386, 374)) / 2 / faceHeight,
    eye_width: (d(33, 133) + d(263, 362)) / 2 / faceWidth,
    eye_round: (d(159, 145) / d(33, 133) + d(386, 374) / d(263, 362)) / 2,
    nose_width: d(64, 294) / faceWidth,
    nose_length: d(168, 2) / faceHeight,
    cheekbone: faceWidth / d(71, 301),
    jaw: d(172, 397) / faceWidth,
    face_length: faceHeight / faceWidth,
    // 입을 벌려도 값이 변하지 않도록 입안 높이를 뺀다
    lip: (d(0, 17) - d(13, 14)) / faceHeight,
    mouth_width: d(61, 291) / faceWidth,
    philtrum: d(2, 0) / faceHeight,
    brow_gap: (d(105, 159) + d(334, 386)) / 2 / faceHeight,
    inner_gap: d(133, 362) / faceWidth,
  };
}

export function averageDetail(samples: FaceDetail[]): FaceDetail {
  const keys = Object.keys(samples[0]) as Key[];
  return Object.fromEntries(
    keys.map((key) => [key, samples.reduce((sum, s) => sum + s[key], 0) / samples.length]),
  ) as FaceDetail;
}

/** 평균 얼굴 대비 몇 표준편차 떨어져 있는지 (-3 ~ 3) */
function zScores(detail: FaceDetail): FaceDetail {
  return Object.fromEntries(
    (Object.keys(MEAN) as Key[]).map((key) => [key, clamp((detail[key] - MEAN[key]) / SPREAD[key], -3, 3)]),
  ) as FaceDetail;
}

// "눈 크기"는 눈 세로와 가로를 합쳐서 본다
const eyeSize = (z: FaceDetail) => (z.eye_open + z.eye_width) / 2;

type Animal = {
  key: string;
  label: string;
  Icon: IconType;
  color: string;
  // 이 동물상에서 두드러지는 방향 (표준 점수 기준). 적지 않은 항목은 0
  traits: Partial<Record<Key | "eye_size", number>>;
};

export const ANIMALS: Animal[] = [
  {
    key: "fox",
    label: "여우상",
    Icon: GiFoxHead,
    color: "#fb923c",
    traits: { eye_tilt: 1.5, eye_round: -1, face_length: 0.8, jaw: -0.8, philtrum: -0.3, nose_width: -0.5 },
  },
  {
    key: "cat",
    label: "고양이상",
    Icon: GiCat,
    color: "#fcd34d",
    traits: { eye_tilt: 1.2, eye_size: 0.6, cheekbone: 0.6, jaw: -0.6, nose_width: -0.6, mouth_width: -0.4 },
  },
  {
    key: "dog",
    label: "강아지상",
    Icon: GiSittingDog,
    color: "#d6b98c",
    traits: { eye_tilt: -1.4, eye_size: 0.8, eye_round: 1, face_length: -0.3, nose_width: 0.4, brow_gap: 0.4 },
  },
  {
    key: "rabbit",
    label: "토끼상",
    Icon: GiRabbit,
    color: "#f9a8d4",
    traits: { eye_size: 1.2, eye_round: 0.8, mouth_width: -0.8, lip: 0.4, philtrum: -0.6, face_length: -0.4, inner_gap: 0.3 },
  },
  {
    key: "bear",
    label: "곰상",
    Icon: GiBearFace,
    color: "#a16207",
    traits: { face_length: -1.2, jaw: 1.2, nose_width: 0.8, eye_size: -0.8, cheekbone: 0.3, mouth_width: 0.3 },
  },
  {
    key: "monkey",
    label: "원숭이상",
    Icon: GiMonkey,
    color: "#c08457",
    traits: { philtrum: 1.4, mouth_width: 0.8, lip: 0.6, inner_gap: -0.8, nose_length: -0.6, brow_gap: -0.4 },
  },
  {
    key: "deer",
    label: "사슴상",
    Icon: GiDeer,
    color: "#e7c9a0",
    traits: { eye_size: 1, face_length: 1, jaw: -0.8, nose_length: 0.6, eye_tilt: -0.3, eye_round: 0.4 },
  },
  {
    key: "dino",
    label: "공룡상",
    Icon: GiDinosaurRex,
    color: "#86efac",
    traits: { cheekbone: 1.2, jaw: 0.8, face_length: 0.8, eye_size: -0.8, nose_length: 0.6, brow_gap: -0.5 },
  },
];

export type AnimalScore = { animal: Animal; percent: number };

export type FaceLook = {
  detail: FaceDetail;
  z: FaceDetail;
  /** 닮은 순서대로, 8가지 합이 100 */
  animals: AnimalScore[];
};

// 유사도 차이를 백분율로 벌리는 정도. 클수록 1등이 더 높게 나온다
const SHARPNESS = 4;

export function analyzeFaceLook(detail: FaceDetail): FaceLook {
  const z = zScores(detail);
  const vector = (traits: Animal["traits"] | null) => {
    const keys = [...(Object.keys(MEAN) as Key[]), "eye_size" as const];
    return keys.map((key) => {
      if (traits) return traits[key] ?? 0;
      if (key === "eye_size") return eyeSize(z);
      return key === "eye_open" || key === "eye_width" ? 0 : z[key];
    });
  };
  const face = vector(null);
  const norm = (v: number[]) => Math.hypot(...v) || 1;
  const cosines = ANIMALS.map((animal) => {
    const t = vector(animal.traits);
    return t.reduce((sum, value, i) => sum + value * face[i], 0) / (norm(t) * norm(face));
  });
  const weights = cosines.map((c) => Math.exp(c * SHARPNESS));
  const total = weights.reduce((a, b) => a + b, 0);
  // 반올림해도 합이 100이 되도록 가장 큰 값에서 오차를 맞춘다
  const raw = weights.map((w) => (w / total) * 100);
  const rounded = raw.map((v) => Math.round(v));
  const diff = 100 - rounded.reduce((a, b) => a + b, 0);
  rounded[raw.indexOf(Math.max(...raw))] += diff;
  const animals = ANIMALS.map((animal, i) => ({ animal, percent: rounded[i] })).sort((a, b) => b.percent - a.percent);
  return { detail, z, animals };
}

/** 표준 점수를 "상위 몇 %"로 (정규분포 근사) */
export function topPercent(zValue: number) {
  const cdf = 0.5 * (1 + Math.tanh(0.8 * zValue + 0.035 * zValue ** 3));
  return clamp(Math.round((1 - cdf) * 100), 1, 99);
}

/** 화면에 보여 줄 세부 측정 몇 가지 (사람이 알아듣는 말로) */
export function describeDetails(look: FaceLook) {
  const { z, detail } = look;
  const level = (v: number, low: string, mid: string, high: string) => (v > 0.6 ? high : v < -0.6 ? low : mid);
  // 두드러진 쪽으로 몇 % 안에 드는지 (보통이면 평균권)
  const rank = (v: number) => (Math.abs(v) > 0.6 ? `상위 ${topPercent(Math.abs(v))}%` : "평균권");
  return [
    {
      label: "눈매",
      value: level(z.eye_tilt, "내려간 눈꼬리", "일자 눈매", "올라간 눈꼬리"),
      note: `${detail.eye_tilt >= 0 ? "+" : ""}${detail.eye_tilt.toFixed(1)}°`,
      z: z.eye_tilt,
    },
    { label: "눈 크기", value: level(eyeSize(z), "작은 편", "보통", "큰 편"), note: rank(eyeSize(z)), z: eyeSize(z) },
    { label: "코", value: level(z.nose_width, "오똑하고 좁은 코", "보통", "넓은 콧볼"), note: rank(z.nose_width), z: z.nose_width },
    { label: "광대", value: level(z.cheekbone, "매끈한 광대", "보통", "도드라진 광대"), note: rank(z.cheekbone), z: z.cheekbone },
    { label: "턱선", value: level(z.jaw, "갸름한 턱", "보통", "각진 턱"), note: rank(z.jaw), z: z.jaw },
    { label: "입술", value: level(z.lip, "얇은 입술", "보통", "도톰한 입술"), note: rank(z.lip), z: z.lip },
  ];
}
