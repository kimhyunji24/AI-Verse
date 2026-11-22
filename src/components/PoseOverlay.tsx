/**
 * 포즈 뼈대 오버레이 (PoseOverlay)
 *
 * 역할: 포즈 단계에서 웹캠 영상 위에 상반신 뼈대를 실시간으로 그린다.
 * 비고: 영상과 같이 CSS로 좌우를 뒤집으므로 좌표는 그대로 쓴다. 그리기는 poseSkeleton.ts 와 같은 함수를 쓴다.
 *
 * 수정 이력:
 *   - 2026-11-22 최초 작성
 *   - 2026-11-22 손가락 관절 표시 추가
 */

import { useImperativeHandle, useRef, type Ref } from "react";
import { drawPose, type Hand, type PoseLandmark } from "@/lib/poseSkeleton";

export type PoseOverlayHandle = {
  draw: (pose: PoseLandmark[] | undefined, hands: Hand[], video: HTMLVideoElement) => void;
};

export default function PoseOverlay({ ref }: { ref: Ref<PoseOverlayHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    draw(pose, hands, video) {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;

      if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
      if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (!pose) return;

      drawPose(
        context,
        pose,
        (point) => ({ x: point.x * canvas.width, y: point.y * canvas.height }),
        Math.max(4, canvas.width / 120),
        hands,
      );
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover"
    />
  );
}
