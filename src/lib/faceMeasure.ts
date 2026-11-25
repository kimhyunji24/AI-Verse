/**
 * 얼굴 실측 (faceMeasure)
 *
 * 역할: MediaPipe 얼굴 랜드마크(얼굴 468점 + 홍채 10점)로 얼굴 각 부위의 길이를 mm 단위로 잰다.
 *       눈 가로·세로, 눈꼬리 각도, 미간, 동공 사이, 코 길이·너비, 입 너비, 윗·아랫입술, 인중, 턱 길이,
 *       얼굴 가로·세로, 턱 너비, 턱끝 각도, 중안부·하안부, 좌우 대칭도를 계산하고 얼굴형을 판정한다.
 * 비고: 카메라 화면의 길이를 mm로 바꾸는 기준은 홍채 지름이다. 사람 홍채 지름은 나이·체격과 상관없이
 *       거의 11.7mm로 일정해서, 화면에서 홍채가 몇 칸인지 재면 1칸이 몇 mm인지 알 수 있다.
 *       홍채 점이 없으면(구형 모델) 성인 얼굴 폭 평균 140mm를 기준으로 한다.
 *       평균값(REF)은 MediaPipe 표준 얼굴 모델(canonical_face_model.obj)을 mm로 잰 값이다.
 *       이미지는 저장하지 않고 이 숫자들만 화면에 보여 준다.
 *
 * 수정 이력:
 *   - 2026-11-24 최초 작성
 */

import type { Landmark } from "@/lib/faceFeatures";

const IRIS_MM = 11.7;
const FALLBACK_FACE_WIDTH_MM = 140;

export type FaceMeasure = {
  face_width: number; // 얼굴 가로 (광대 끝~끝)
  face_height: number; // 얼굴 세로 (이마 중앙~턱끝)
  jaw_width: number; // 턱 너비 (양쪽 턱각)
  chin_angle: number; // 턱끝 각도 (도). 작을수록 V라인
  eye_width_r: number; // 오른눈 가로
  eye_width_l: number; // 왼눈 가로
  eye_height_r: number; // 오른눈 세로 (뜬 높이)
  eye_height_l: number; // 왼눈 세로
  eye_tilt_r: number; // 오른눈 눈꼬리 각도 (도, +면 올라감)
  eye_tilt_l: number; // 왼눈 눈꼬리 각도
  inner_eye_gap: number; // 미간 (두 눈 안쪽 끝 사이)
  pupil_distance: number; // 동공 사이 거리
  brow_to_eye: number; // 눈썹~눈 거리
  nose_length: number; // 코 길이 (콧대 시작~코끝 밑)
  nose_width: number; // 코 너비 (콧볼)
  mouth_width: number; // 입 너비
  upper_lip: number; // 윗입술 두께
  lower_lip: number; // 아랫입술 두께
  philtrum: number; // 인중 길이
  chin_length: number; // 턱 길이 (아랫입술 밑~턱끝)
  midface: number; // 중안부 (눈썹선~코 밑)
  lowerface: number; // 하안부 (코 밑~턱끝)
  symmetry: number; // 좌우 대칭도 (%)
};

/** MediaPipe 표준 얼굴을 mm로 잰 평균값 */
export const REF: FaceMeasure = {
  face_width: 153.3,
  face_height: 176.7,
  jaw_width: 118.8,
  chin_angle: 123.7,
  eye_width_r: 26.6,
  eye_width_l: 26.6,
  eye_height_r: 6.8,
  eye_height_l: 6.8,
  eye_tilt_r: 1.7,
  eye_tilt_l: 1.7,
  inner_eye_gap: 37.1,
  pupil_distance: 63.0,
  brow_to_eye: 23.7,
  nose_length: 54.2,
  nose_width: 31.8,
  mouth_width: 49.1,
  upper_lip: 9.6,
  lower_lip: 8.3,
  philtrum: 13.2,
  chin_length: 42.3,
  midface: 72.0,
  lowerface: 73.1,
  symmetry: 100,
};

type P = { x: number; y: number; z: number };

export function measureMillimeters(landmarks: Landmark[], aspect: number): FaceMeasure {
  const p = (i: number): P => ({ x: landmarks[i].x * aspect, y: landmarks[i].y, z: landmarks[i].z * aspect });
  const d = (a: number, b: number) => {
    const A = p(a);
    const B = p(b);
    return Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z);
  };
  const mid = (a: number, b: number): P => {
    const A = p(a);
    const B = p(b);
    return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: (A.z + B.z) / 2 };
  };

  // 1) 화면 1칸이 몇 mm인지: 두 홍채 지름의 평균
  const hasIris = landmarks.length >= 478;
  const irisUnits = hasIris ? (d(469, 471) + d(474, 476)) / 2 : 0;
  const mmPerUnit = hasIris && irisUnits > 0 ? IRIS_MM / irisUnits : FALLBACK_FACE_WIDTH_MM / d(234, 454);
  const mm = (a: number, b: number) => d(a, b) * mmPerUnit;

  // 눈꼬리가 눈 안쪽보다 얼마나 위에 있는지 (화면 y는 아래로 커진다). 고개 기울기(roll)는 빼고 본다
  const roll = Math.atan2(p(263).y - p(33).y, p(263).x - p(33).x);
  const level = (pt: P, origin: P) => {
    const dx = pt.x - origin.x;
    const dy = pt.y - origin.y;
    return { x: dx * Math.cos(-roll) - dy * Math.sin(-roll), y: dx * Math.sin(-roll) + dy * Math.cos(-roll) };
  };
  const tilt = (outer: number, inner: number) => {
    const v = level(p(outer), p(inner));
    return (Math.atan2(-v.y, Math.abs(v.x)) * 180) / Math.PI;
  };

  // 턱끝 각도: 턱끝에서 양쪽 턱각을 잇는 두 선 사이 각
  const angleAt = (c: number, a: number, b: number) => {
    const C = p(c);
    const A = p(a);
    const B = p(b);
    const u = { x: A.x - C.x, y: A.y - C.y };
    const v = { x: B.x - C.x, y: B.y - C.y };
    const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
    return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
  };

  // 눈썹선: 두 눈썹 가운데 높이. 중안부는 눈썹선~코 밑, 하안부는 코 밑~턱끝 (얼굴 세로 방향 거리)
  const browLine = mid(105, 334);
  const vertical = (a: P, b: P) => Math.abs(level(b, a).y) * mmPerUnit;

  // 좌우 대칭: 콧대~턱끝을 잇는 가운데 선에서 양쪽 짝 점까지의 거리·높이 차이
  const top = p(168);
  const bottom = p(152);
  const axis = { x: bottom.x - top.x, y: bottom.y - top.y };
  const axisLen = Math.hypot(axis.x, axis.y);
  const side = (i: number) => {
    const v = { x: p(i).x - top.x, y: p(i).y - top.y };
    return {
      across: Math.abs(v.x * axis.y - v.y * axis.x) / axisLen,
      along: (v.x * axis.x + v.y * axis.y) / axisLen,
    };
  };
  const pairs = [
    [33, 263], [133, 362], [159, 386], [105, 334], [64, 294], [61, 291], [234, 454], [172, 397],
  ];
  const faceHeightUnits = d(10, 152);
  const asym =
    pairs.reduce((sum, [a, b]) => {
      const A = side(a);
      const B = side(b);
      const across = Math.abs(A.across - B.across) / ((A.across + B.across) / 2 || 1);
      const along = Math.abs(A.along - B.along) / faceHeightUnits;
      return sum + across * 0.7 + along * 0.3;
    }, 0) / pairs.length;

  return {
    face_width: mm(234, 454),
    face_height: mm(10, 152),
    jaw_width: mm(172, 397),
    chin_angle: angleAt(152, 172, 397),
    eye_width_r: mm(33, 133),
    eye_width_l: mm(263, 362),
    eye_height_r: mm(159, 145),
    eye_height_l: mm(386, 374),
    eye_tilt_r: tilt(33, 133),
    eye_tilt_l: tilt(263, 362),
    inner_eye_gap: mm(133, 362),
    pupil_distance: hasIris ? mm(468, 473) : d(33, 263) * mmPerUnit * 0.69,
    brow_to_eye: (mm(105, 159) + mm(334, 386)) / 2,
    nose_length: mm(168, 2),
    nose_width: mm(64, 294),
    mouth_width: mm(61, 291),
    upper_lip: mm(0, 13),
    lower_lip: mm(14, 17),
    philtrum: mm(2, 0),
    chin_length: mm(17, 152),
    midface: vertical(browLine, p(2)),
    lowerface: vertical(p(2), p(152)),
    symmetry: Math.max(0, Math.min(100, 100 * (1 - asym))),
  };
}

export function averageMeasure(samples: FaceMeasure[]): FaceMeasure {
  const keys = Object.keys(samples[0]) as (keyof FaceMeasure)[];
  return Object.fromEntries(
    keys.map((key) => [key, samples.reduce((sum, s) => sum + s[key], 0) / samples.length]),
  ) as FaceMeasure;
}

export type FaceShape = "계란형" | "둥근형" | "각진형" | "긴 얼굴형" | "역삼각형";

/** 얼굴 세로/가로 비율, 턱 너비, 턱끝 각도로 얼굴형을 정한다 */
export function faceShape(m: FaceMeasure): { shape: FaceShape; reason: string } {
  const ratio = m.face_height / m.face_width;
  const jaw = m.jaw_width / m.face_width;
  if (ratio > 1.27) return { shape: "긴 얼굴형", reason: `세로가 가로의 ${ratio.toFixed(2)}배로 긴 편` };
  if (jaw > 0.83) return { shape: "각진형", reason: `턱 너비가 얼굴 폭의 ${Math.round(jaw * 100)}%로 넓은 편` };
  if (jaw < 0.72 && m.chin_angle < 118) {
    return { shape: "역삼각형", reason: `턱이 좁고(${Math.round(jaw * 100)}%) 턱끝이 뾰족함(${Math.round(m.chin_angle)}°)` };
  }
  if (ratio < 1.08 && m.chin_angle > 128) {
    return { shape: "둥근형", reason: `가로세로가 비슷하고(${ratio.toFixed(2)}) 턱끝이 둥긂(${Math.round(m.chin_angle)}°)` };
  }
  return { shape: "계란형", reason: `세로/가로 ${ratio.toFixed(2)}, 턱끝 ${Math.round(m.chin_angle)}°로 균형 잡힌 비율` };
}
