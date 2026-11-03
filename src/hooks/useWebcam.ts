/**
 * 웹캠 훅 (useWebcam)
 *
 * 역할: 브라우저 웹캠(getUserMedia) 연결/해제와 상태 관리.
 *       반환한 videoRef를 <video>에 연결하면 영상이 재생된다.
 * 비고: 얼굴 랜드마크(MediaPipe)는 별도 브랜치(feat/front-landmark)에서 이 영상을 입력으로 사용한다.
 *       카메라는 HTTPS 또는 localhost 에서만 동작한다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성 (웹캠 연결, 권한 거부/미지원/오류 상태 처리)
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WebcamStatus =
  | "idle" // 아직 시작 전
  | "requesting" // 권한 요청 중
  | "ready" // 영상 재생 중
  | "denied" // 사용자가 권한 거부
  | "unsupported" // 브라우저가 웹캠 미지원
  | "error"; // 그 외 오류 (카메라 없음, 다른 앱이 사용 중 등)

export function useWebcam() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // start/stop 호출마다 증가. 오래된 start 결과가 늦게 도착했을 때 무시하기 위해 사용
  const requestIdRef = useRef(0);
  const [status, setStatus] = useState<WebcamStatus>("idle");

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    release();
    setStatus("idle");
  }, [release]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      return;
    }

    release();
    const requestId = ++requestIdRef.current;
    setStatus("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      // 기다리는 사이에 stop 되었거나 다시 start 된 경우 이 스트림은 버린다
      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("ready");
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const denied =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError");
      setStatus(denied ? "denied" : "error");
    }
  }, [release]);

  // 화면에서 사라질 때 카메라를 반드시 끈다
  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      release();
    };
  }, [release]);

  return { videoRef, status, start, stop };
}
