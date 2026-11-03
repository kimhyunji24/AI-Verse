/**
 * 얼굴 특징값 계산 (faceFeatures)
 *
 * 역할: MediaPipe 랜드마크 좌표에서 얼굴 형태 비율과 머리 자세를 계산하고, 촬영 가능 여부를 판단한다.
 * 비고: 화면 밖으로 나가는 것은 이 수치뿐이다. 이미지는 서버로 보내지 않는다.
 *       값의 범위는 백엔드 schemas.py 의 FaceFeatures 와 맞춘다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 눈 크기를 빼고 미간 너비로 교체
 *   - 2026-11-03 눈·코·입 위치, 코 너비, 입술 두께 측정 추가
 */

export type Landmark = { x: number; y: number; z: number };

export type FaceFeatures = {
  face_aspect_ratio: number;
  eye_spacing_ratio: number;
  inner_eye_gap_ratio: number;
  eye_position_ratio: number;
  nose_length_ratio: number;
  nose_position_ratio: number;
  nose_width_ratio: number;
  mouth_width_ratio: number;
  lip_thickness_ratio: number;
  mouth_position_ratio: number;
  jaw_width_ratio: number;
  head_yaw: number;
  head_pitch: number;
  head_roll: number;
};

export type Alignment =
  | "no_face"
  | "multiple_faces"
  | "too_far"
  | "too_close"
  | "off_center"
  | "turned"
  | "ready";

// MediaPipe Face Mesh 랜드마크 번호
const POINTS = {
  forehead: 10,
  chin: 152,
  cheekA: 234,
  cheekB: 454,
  eyeAOuter: 33,
  eyeAInner: 133,
  eyeBInner: 362,
  eyeBOuter: 263,
  noseBridge: 168,
  noseBase: 2,
  noseWingA: 64,
  noseWingB: 294,
  mouthA: 61,
  mouthB: 291,
  lipOuterTop: 0,
  lipOuterBottom: 17,
  lipInnerTop: 13,
  lipInnerBottom: 14,
  jawA: 172,
  jawB: 397,
} as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/**
 * 랜드마크 좌표는 가로·세로가 각각 0~1로 정규화되어 있어 화면 비율을 되돌려야 실제 거리가 된다.
 * z는 x와 같은 축척이다.
 */
function toPixels(point: Landmark, aspect: number): Landmark {
  return { x: point.x * aspect, y: point.y, z: point.z * aspect };
}

function distance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

const midpoint = (a: Landmark, b: Landmark): Landmark => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
});

/** aspect: 영상의 가로 / 세로 */
export function extractFeatures(
  landmarks: Landmark[],
  aspect: number,
): FaceFeatures {
  const p = (name: keyof typeof POINTS) =>
    toPixels(landmarks[POINTS[name]], aspect);

  const faceWidth = distance(p("cheekA"), p("cheekB"));
  const faceHeight = distance(p("forehead"), p("chin"));
  const eyeCenterA = midpoint(p("eyeAOuter"), p("eyeAInner"));
  const eyeCenterB = midpoint(p("eyeBOuter"), p("eyeBInner"));
  const eyeCenter = midpoint(eyeCenterA, eyeCenterB);
  const mouthCenter = midpoint(p("lipInnerTop"), p("lipInnerBottom"));
  // 입을 벌려도 값이 변하지 않도록 입안 높이를 뺀다
  const lipThickness =
    distance(p("lipOuterTop"), p("lipOuterBottom")) -
    distance(p("lipInnerTop"), p("lipInnerBottom"));

  return {
    face_aspect_ratio: clamp(faceHeight / faceWidth, 0.5, 2.5),
    eye_spacing_ratio: clamp(distance(eyeCenterA, eyeCenterB) / faceWidth, 0, 1),
    inner_eye_gap_ratio: clamp(
      distance(p("eyeAInner"), p("eyeBInner")) / faceWidth,
      0,
      1,
    ),
    eye_position_ratio: clamp(distance(p("forehead"), eyeCenter) / faceHeight, 0, 1),
    nose_length_ratio: clamp(
      distance(p("noseBridge"), p("noseBase")) / faceHeight,
      0,
      1,
    ),
    nose_position_ratio: clamp(
      distance(p("forehead"), p("noseBase")) / faceHeight,
      0,
      1,
    ),
    nose_width_ratio: clamp(
      distance(p("noseWingA"), p("noseWingB")) / faceWidth,
      0,
      1,
    ),
    mouth_width_ratio: clamp(distance(p("mouthA"), p("mouthB")) / faceWidth, 0, 1),
    lip_thickness_ratio: clamp(lipThickness / faceHeight, 0, 1),
    mouth_position_ratio: clamp(
      distance(p("forehead"), mouthCenter) / faceHeight,
      0,
      1,
    ),
    jaw_width_ratio: clamp(distance(p("jawA"), p("jawB")) / faceWidth, 0, 1.5),
    // 좌우 뺨, 위아래, 두 눈의 깊이·높이 차이로 머리 방향을 구한다
    head_yaw: clamp(
      toDegrees(
        Math.atan2(p("cheekB").z - p("cheekA").z, p("cheekB").x - p("cheekA").x),
      ),
      -90,
      90,
    ),
    head_pitch: clamp(
      toDegrees(
        Math.atan2(p("chin").z - p("forehead").z, p("chin").y - p("forehead").y),
      ),
      -90,
      90,
    ),
    head_roll: clamp(
      toDegrees(
        Math.atan2(eyeCenterB.y - eyeCenterA.y, eyeCenterB.x - eyeCenterA.x),
      ),
      -180,
      180,
    ),
  };
}

/** 분석 구간의 프레임들을 평균 내어 순간적인 흔들림을 줄인다 */
export function averageFeatures(samples: FaceFeatures[]): FaceFeatures {
  const keys = Object.keys(samples[0]) as (keyof FaceFeatures)[];
  return Object.fromEntries(
    keys.map((key) => [
      key,
      samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length,
    ]),
  ) as FaceFeatures;
}

/** 분석하기에 적절한 위치인지 판단한다 */
export function checkAlignment(
  faces: Landmark[][],
  aspect: number,
): Alignment {
  if (faces.length === 0) return "no_face";
  if (faces.length > 1) return "multiple_faces";

  const face = faces[0];
  const features = extractFeatures(face, aspect);
  const faceWidth = Math.abs(face[POINTS.cheekA].x - face[POINTS.cheekB].x);
  const centerX = (face[POINTS.cheekA].x + face[POINTS.cheekB].x) / 2;
  const centerY = (face[POINTS.forehead].y + face[POINTS.chin].y) / 2;

  if (faceWidth < 0.12) return "too_far";
  if (faceWidth > 0.6) return "too_close";
  if (Math.abs(centerX - 0.5) > 0.2 || Math.abs(centerY - 0.5) > 0.25) {
    return "off_center";
  }
  if (Math.abs(features.head_yaw) > 25 || Math.abs(features.head_pitch) > 25) {
    return "turned";
  }
  return "ready";
}
