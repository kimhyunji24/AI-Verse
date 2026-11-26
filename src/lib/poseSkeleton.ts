/**
 * 포즈 뼈대 (poseSkeleton)
 *
 * 역할: MediaPipe Pose 랜드마크로 상반신 뼈대를 그린다. 화면 위 실시간 표시와, 백엔드에 보낼 뼈대 PNG 만들기에 함께 쓴다.
 * 비고: 앉아서 하는 부스라 상반신(머리, 어깨, 팔, 손, 몸통)만 쓴다. 손은 손 모델(21점)로 손가락 관절까지 그린다.
 *       손 모양은 정해진 코드(Victory 등)만 백엔드로 보내고, 어느 손인지는 화면(거울 모드) 기준 왼쪽·오른쪽으로 정한다.
 *       보내는 그림에는 얼굴이 없다. 머리는 위치와 크기만 나타내는 빈 원으로 그리고, 눈·입 지점은 쓰지 않는다.
 *       화면이 거울 모드라 보내는 그림도 좌우를 뒤집어, 참가자가 화면에서 본 모습 그대로 캐릭터가 따라 하게 한다.
 *
 * 수정 이력:
 *   - 2026-11-22 최초 작성
 *   - 2026-11-22 손가락 관절(손 21점)과 손 모양 코드 추가
 *   - 2026-11-26 머리 원 안에 눈·코·입을 그려 얼굴 방향과 손-얼굴 위치가 그림 모델에 전달되게 함
 *   - 2026-11-26 눈·입 때문에 사람 얼굴로 그려져서 빼고, 귀 가운데 원 + 코 점 하나로 고개 방향만 표시
 *   - 2026-11-26 손 모양 모델이 못 알아보면(None·낮은 점수) 손가락 21점으로 직접 판정 (handShape)
 */

import type { Landmark } from "@/lib/faceFeatures";

export type PoseLandmark = Landmark & { visibility?: number };

// MediaPipe Gesture Recognizer 가 알려 주는 손 모양 (None 제외)
export const GESTURES = [
  "Closed_Fist",
  "Open_Palm",
  "Pointing_Up",
  "Thumb_Down",
  "Thumb_Up",
  "Victory",
  "ILoveYou",
] as const;
export type Gesture = (typeof GESTURES)[number];

export type Hand = { landmarks: PoseLandmark[]; gesture: Gesture | null; score: number };
export type HandGesture = { side: "left" | "right"; gesture: Gesture };

// 손 21점을 잇는 선 (엄지, 검지, 중지, 약지, 새끼, 손바닥)
const HAND_LINES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
// 손 모양을 믿을 수 있는 최소 점수
export const MIN_GESTURE_SCORE = 0.5;
// 손가락 점으로 직접 판정한 손 모양에 주는 점수 (모델이 믿을 만하게 알아본 쪽이 이긴다)
export const SHAPE_SCORE = 0.55;

/**
 * 손 21점으로 손 모양을 직접 판정한다. 손 모양 모델은 손이 기울거나 얼굴 옆에 있으면 None을 자주 내서,
 * 그럴 때 손가락이 펴졌는지(손목에서 손끝이 둘째 마디보다 멀리 있는지)로 브이·손바닥·주먹 등을 정한다.
 */
export function handShape(hand: Landmark[]): Gesture | null {
  if (hand.length < 21) return null;
  const d = (a: number, b: number) => Math.hypot(hand[a].x - hand[b].x, hand[a].y - hand[b].y);
  // 손가락: [손끝, 둘째 마디]
  const extended = ([tip, pip]: [number, number]) => d(0, tip) > d(0, pip) * 1.15;
  const index = extended([8, 6]);
  const middle = extended([12, 10]);
  const ring = extended([16, 14]);
  const pinky = extended([20, 18]);
  // 엄지는 손끝이 검지 뿌리에서 멀리 벗어나 있으면 편 것으로 본다
  const thumb = d(4, 5) > d(3, 5) * 1.2 && d(4, 5) > d(5, 17) * 0.6;

  if (index && middle && !ring && !pinky) return "Victory";
  if (index && middle && ring && pinky) return "Open_Palm";
  if (index && pinky && !middle && !ring && thumb) return "ILoveYou";
  if (index && !middle && !ring && !pinky) return "Pointing_Up";
  if (!index && !middle && !ring && !pinky) {
    if (!thumb) return "Closed_Fist";
    // 화면 y는 아래로 커진다
    return hand[4].y < hand[2].y ? "Thumb_Up" : "Thumb_Down";
  }
  return null;
}

// MediaPipe Pose 랜드마크 번호
const P = {
  nose: 0,
  earA: 7,
  earB: 8,
  shoulderA: 11,
  shoulderB: 12,
  elbowA: 13,
  elbowB: 14,
  wristA: 15,
  wristB: 16,
  pinkyA: 17,
  pinkyB: 18,
  indexA: 19,
  indexB: 20,
  thumbA: 21,
  thumbB: 22,
  hipA: 23,
  hipB: 24,
} as const;

// 왼쪽·오른쪽 팔을 다른 색으로 그려 이미지 모델이 좌우를 헷갈리지 않게 한다
const SIDE_A = "#e11d48";
const SIDE_B = "#2563eb";
const TORSO = "#334155";

const LIMBS: [number, number, string][] = [
  [P.shoulderA, P.shoulderB, TORSO],
  [P.shoulderA, P.hipA, TORSO],
  [P.shoulderB, P.hipB, TORSO],
  [P.hipA, P.hipB, TORSO],
  [P.shoulderA, P.elbowA, SIDE_A],
  [P.elbowA, P.wristA, SIDE_A],
  [P.wristA, P.pinkyA, SIDE_A],
  [P.wristA, P.indexA, SIDE_A],
  [P.wristA, P.thumbA, SIDE_A],
  [P.shoulderB, P.elbowB, SIDE_B],
  [P.elbowB, P.wristB, SIDE_B],
  [P.wristB, P.pinkyB, SIDE_B],
  [P.wristB, P.indexB, SIDE_B],
  [P.wristB, P.thumbB, SIDE_B],
];

const MIN_VISIBILITY = 0.5;

const visible = (point: PoseLandmark | undefined): point is PoseLandmark =>
  !!point && (point.visibility ?? 1) >= MIN_VISIBILITY;

/** 두 어깨와 팔 하나 이상이 보여야 포즈로 쓸 수 있다 */
export function isUsablePose(pose: PoseLandmark[] | undefined): pose is PoseLandmark[] {
  if (!pose) return false;
  return (
    visible(pose[P.shoulderA]) &&
    visible(pose[P.shoulderB]) &&
    (visible(pose[P.elbowA]) || visible(pose[P.elbowB]))
  );
}

type Point = { x: number; y: number };

/** 손목이 포즈의 어느 손목에 가까운지로 팔과 같은 색을 고른다 */
function handColor(hand: Hand, pose: PoseLandmark[]): string {
  const wrist = hand.landmarks[0];
  const distance = (point: PoseLandmark | undefined) =>
    point ? Math.hypot(point.x - wrist.x, point.y - wrist.y) : Infinity;
  return distance(pose[P.wristA]) <= distance(pose[P.wristB]) ? SIDE_A : SIDE_B;
}

/** project: 랜드마크(0~1 정규화 좌표)를 캔버스 좌표로 바꾸는 함수 */
export function drawPose(
  context: CanvasRenderingContext2D,
  pose: PoseLandmark[],
  project: (point: PoseLandmark) => Point,
  lineWidth: number,
  hands: Hand[] = [],
) {
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = lineWidth;
  // 손 모델로 손가락을 그릴 때는 포즈 모델의 거친 손 선(손목→엄지·검지·새끼)은 생략한다
  const skipPoseHands = hands.length > 0;
  for (const [from, to, color] of LIMBS) {
    if (skipPoseHands && (from === P.wristA || from === P.wristB)) continue;
    const a = pose[from];
    const b = pose[to];
    if (!visible(a) || !visible(b)) continue;
    const pa = project(a);
    const pb = project(b);
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(pa.x, pa.y);
    context.lineTo(pb.x, pb.y);
    context.stroke();
  }

  // 손가락: 팔보다 가는 선과 관절 점
  for (const hand of hands) {
    context.strokeStyle = handColor(hand, pose);
    context.fillStyle = context.strokeStyle;
    context.lineWidth = Math.max(2, lineWidth * 0.45);
    context.beginPath();
    for (const [from, to] of HAND_LINES) {
      const a = project(hand.landmarks[from]);
      const b = project(hand.landmarks[to]);
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
    }
    context.stroke();
    for (const point of hand.landmarks) {
      const p = project(point);
      context.beginPath();
      context.arc(p.x, p.y, lineWidth * 0.35, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.lineWidth = lineWidth;

  // 머리: 얼굴 없이 위치와 크기만 나타내는 원. 원은 두 귀 가운데에 두고, 코 자리에 점 하나만 찍어
  // 고개가 돌아간 쪽을 나타낸다. 눈·입을 그리면 그림 모델이 사람 얼굴로 그려 버려서 넣지 않는다.
  const nose = pose[P.nose];
  if (visible(nose)) {
    const nosePoint = project(nose);
    const shoulderA = project(pose[P.shoulderA]);
    const shoulderB = project(pose[P.shoulderB]);
    const shoulderWidth = Math.hypot(shoulderA.x - shoulderB.x, shoulderA.y - shoulderB.y);
    const earA = pose[P.earA];
    const earB = pose[P.earB];
    const earsVisible = visible(earA) && visible(earB);
    const earWidth = earsVisible
      ? Math.hypot(project(earA).x - project(earB).x, project(earA).y - project(earB).y)
      : 0;
    const radius = Math.max(earWidth * 0.75, shoulderWidth * 0.22);
    const center = earsVisible
      ? { x: (project(earA).x + project(earB).x) / 2, y: (project(earA).y + project(earB).y) / 2 }
      : nosePoint;
    context.strokeStyle = TORSO;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = TORSO;
    context.beginPath();
    context.arc(nosePoint.x, nosePoint.y, radius * 0.12, 0, Math.PI * 2);
    context.fill();
  }
}

const SKELETON_WIDTH = 512;
const SKELETON_HEIGHT = 768;
const SKELETON_PADDING = 70;

/**
 * 백엔드에 보낼 뼈대 PNG(data URL)를 만든다. 흰 바탕 512×768, 상반신이 가운데에 꽉 차게 맞춘다.
 * aspect: 영상의 가로 / 세로 (정규화 좌표를 실제 비율로 되돌리는 데 쓴다)
 */
export function renderSkeletonPng(
  pose: PoseLandmark[],
  aspect: number,
  hands: Hand[] = [],
): string {
  // 거울 모드에 맞춰 좌우를 뒤집고, 가로를 실제 비율로 늘린다
  const toVideo = (point: PoseLandmark): Point => ({ x: (1 - point.x) * aspect, y: point.y });

  const points = [
    ...Object.values(P)
      .map((index) => pose[index])
      .filter(visible),
    ...hands.flatMap((hand) => hand.landmarks),
  ].map(toVideo);
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  // 머리 원이 잘리지 않도록 위쪽으로 조금 더 여유를 둔다
  const headroom = (maxX - minX) * 0.15;
  const scale = Math.min(
    (SKELETON_WIDTH - SKELETON_PADDING * 2) / Math.max(maxX - minX, 1e-3),
    (SKELETON_HEIGHT - SKELETON_PADDING * 2) / Math.max(maxY - minY + headroom, 1e-3),
  );
  const offsetX = (SKELETON_WIDTH - (maxX - minX) * scale) / 2;
  const offsetY = SKELETON_PADDING + headroom * scale;

  const canvas = document.createElement("canvas");
  canvas.width = SKELETON_WIDTH;
  canvas.height = SKELETON_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("캔버스를 만들 수 없어요");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, SKELETON_WIDTH, SKELETON_HEIGHT);
  drawPose(
    context,
    pose,
    (point) => {
      const p = toVideo(point);
      return { x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale };
    },
    14,
    hands,
  );
  return canvas.toDataURL("image/png");
}

/**
 * 믿을 만한 손 모양만 골라 화면(거울 모드) 기준 왼쪽·오른쪽 손으로 정리한다. 한쪽에 둘이 잡히면 점수가 높은 것을 쓴다.
 */
export function handGestures(hands: Hand[]): HandGesture[] {
  const bySide = new Map<HandGesture["side"], Hand>();
  for (const hand of hands) {
    if (!hand.gesture || hand.score < MIN_GESTURE_SCORE) continue;
    // 영상은 뒤집히지 않은 원본이라, 화면에서 보이는 위치는 1 - x 다
    const side = 1 - hand.landmarks[0].x < 0.5 ? "left" : "right";
    const current = bySide.get(side);
    if (!current || hand.score > current.score) bySide.set(side, hand);
  }
  return [...bySide].map(([side, hand]) => ({ side, gesture: hand.gesture as Gesture }));
}

export const GESTURE_LABELS: Record<Gesture, string> = {
  Closed_Fist: "주먹",
  Open_Palm: "손바닥 펴기",
  Pointing_Up: "검지 위로",
  Thumb_Down: "엄지 아래",
  Thumb_Up: "엄지 척",
  Victory: "브이",
  ILoveYou: "사랑해",
};
