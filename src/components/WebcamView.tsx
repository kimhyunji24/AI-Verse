/**
 * 웹캠 화면 컴포넌트 (WebcamView)
 *
 * 역할: 웹캠 영상을 거울처럼 좌우 반전해 보여주고, 연결 상태(권한 요청/거부/오류)를 안내한다.
 *       children으로 받은 요소(랜드마크, 안내 문구)를 영상 위에 겹쳐 보여준다.
 * 비고: 카메라 연결은 부모가 useWebcam으로 관리하고 결과를 webcam으로 넘겨준다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 웹캠 상태를 부모에서 받고 영상 위에 children을 겹치도록 변경
 */

"use client";

import type { ReactNode } from "react";
import type { useWebcam, WebcamStatus } from "@/hooks/useWebcam";

const MESSAGES: Record<WebcamStatus, string> = {
  idle: "카메라를 준비하고 있어요",
  requesting: "카메라 사용을 허용해 주세요",
  ready: "",
  denied: "카메라 권한이 거부되었어요. 브라우저 주소창의 카메라 설정에서 허용해 주세요",
  unsupported: "이 브라우저는 웹캠을 지원하지 않아요 (HTTPS 또는 localhost 에서 열어 주세요)",
  error: "카메라를 켤 수 없어요. 연결 상태와 다른 앱의 사용 여부를 확인해 주세요",
};

export default function WebcamView({
  webcam,
  children,
}: {
  webcam: ReturnType<typeof useWebcam>;
  children?: ReactNode;
}) {
  const { videoRef, status, start } = webcam;
  const showRetry = status === "denied" || status === "error";

  return (
    <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-xl bg-black">
      {/* 거울 모드: 좌우 반전 */}
      <video
        ref={videoRef}
        className="h-full w-full -scale-x-100 object-cover"
        playsInline
        muted
      />
      {children}
      {status !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-zinc-200">
          <p>{MESSAGES[status]}</p>
          {showRetry && (
            <button
              type="button"
              onClick={start}
              className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black"
            >
              다시 시도
            </button>
          )}
        </div>
      )}
    </div>
  );
}
