/**
 * 랜드마크 오버레이 (LandmarkOverlay)
 *
 * 역할: 영상 위 캔버스에 얼굴 랜드마크 점과 측정 기준선을 그린다.
 * 비고: 매 프레임 그리므로 React 상태를 쓰지 않고 ref의 draw 함수를 직접 호출한다.
 *       영상과 같은 크기·좌우 반전·object-cover를 적용해 위치를 맞춘다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 코 너비, 미간, 입술 두께 측정선 추가
 */

"use client";

import { useImperativeHandle, useRef, type Ref } from "react";
import type { Landmark } from "@/lib/faceFeatures";

export type OverlayHandle = {
  draw: (faces: Landmark[][], video: HTMLVideoElement) => void;
};

// 측정에 쓰는 지점을 잇는 선 (faceFeatures.ts 의 POINTS 와 같은 번호)
const MEASURE_LINES = [
  [10, 152],
  [234, 454],
  [33, 263],
  [61, 291],
  [172, 397],
  [168, 2],
  [64, 294],
  [133, 362],
  [0, 17],
];

export default function LandmarkOverlay({ ref }: { ref: Ref<OverlayHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    draw(faces, video) {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;

      if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
      if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
      context.clearRect(0, 0, canvas.width, canvas.height);

      for (const face of faces) {
        context.fillStyle = "rgba(94, 234, 212, 0.75)";
        for (const point of face) {
          context.fillRect(point.x * canvas.width - 1, point.y * canvas.height - 1, 2, 2);
        }
        context.strokeStyle = "rgba(244, 114, 182, 0.9)";
        context.lineWidth = 2;
        context.beginPath();
        for (const [from, to] of MEASURE_LINES) {
          context.moveTo(face[from].x * canvas.width, face[from].y * canvas.height);
          context.lineTo(face[to].x * canvas.width, face[to].y * canvas.height);
        }
        context.stroke();
      }
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover"
    />
  );
}
