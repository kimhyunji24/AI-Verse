/**
 * 포즈 뼈대 (poseSkeleton)
 *
 * 역할: MediaPipe Pose 랜드마크로 상반신 뼈대를 그린다. 화면 위 실시간 표시와, 백엔드에 보낼 뼈대 PNG 만들기에 함께 쓴다.
 * 비고: 앉아서 하는 부스라 상반신(머리, 어깨, 팔, 손, 몸통)만 쓴다.
 *       보내는 그림에는 얼굴이 없다. 머리는 위치와 크기만 나타내는 빈 원으로 그리고, 눈·입 지점은 쓰지 않는다.
 *       화면이 거울 모드라 보내는 그림도 좌우를 뒤집어, 참가자가 화면에서 본 모습 그대로 캐릭터가 따라 하게 한다.
 *
 * 수정 이력:
 *   - 2026-11-22 최초 작성
 */

import type { Landmark } from "@/lib/faceFeatures";

export type PoseLandmark = Landmark & { visibility?: number };

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

/** project: 랜드마크(0~1 정규화 좌표)를 캔버스 좌표로 바꾸는 함수 */
export function drawPose(
  context: CanvasRenderingContext2D,
  pose: PoseLandmark[],
  project: (point: PoseLandmark) => Point,
  lineWidth: number,
) {
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = lineWidth;
  for (const [from, to, color] of LIMBS) {
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

  // 머리: 얼굴 없이 위치와 크기만 나타내는 원
  const nose = pose[P.nose];
  if (visible(nose)) {
    const center = project(nose);
    const shoulderA = project(pose[P.shoulderA]);
    const shoulderB = project(pose[P.shoulderB]);
    const shoulderWidth = Math.hypot(shoulderA.x - shoulderB.x, shoulderA.y - shoulderB.y);
    const earA = pose[P.earA];
    const earB = pose[P.earB];
    const earWidth =
      visible(earA) && visible(earB)
        ? Math.hypot(project(earA).x - project(earB).x, project(earA).y - project(earB).y)
        : 0;
    const radius = Math.max(earWidth * 0.75, shoulderWidth * 0.22);
    context.strokeStyle = TORSO;
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.stroke();
  }
}

const SKELETON_WIDTH = 512;
const SKELETON_HEIGHT = 768;
const SKELETON_PADDING = 70;

/**
 * 백엔드에 보낼 뼈대 PNG(data URL)를 만든다. 흰 바탕 512×768, 상반신이 가운데에 꽉 차게 맞춘다.
 * aspect: 영상의 가로 / 세로 (정규화 좌표를 실제 비율로 되돌리는 데 쓴다)
 */
export function renderSkeletonPng(pose: PoseLandmark[], aspect: number): string {
  // 거울 모드에 맞춰 좌우를 뒤집고, 가로를 실제 비율로 늘린다
  const toVideo = (point: PoseLandmark): Point => ({ x: (1 - point.x) * aspect, y: point.y });

  const points = Object.values(P)
    .map((index) => pose[index])
    .filter(visible)
    .map(toVideo);
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
  );
  return canvas.toDataURL("image/png");
}
