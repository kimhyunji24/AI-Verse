/**
 * 얼굴 랜드마크 훅 (useFaceLandmarker)
 *
 * 역할: MediaPipe FaceLandmarker를 불러오고, 영상의 새 프레임마다 랜드마크를 계산해 onFrame으로 넘긴다.
 * 비고: 모든 계산은 브라우저 안에서 이루어진다. wasm과 모델은 처음 한 번 CDN에서 받으므로 인터넷이 필요하다.
 *       wasm 버전은 package.json 의 @mediapipe/tasks-vision 버전과 같아야 한다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 모델을 한 번만 로드하도록 변경, MediaPipe 안내 로그가 오류로 표시되지 않도록 처리
 */

"use client";

import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { Landmark } from "@/lib/faceFeatures";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type LandmarkerStatus = "loading" | "ready" | "error";

/**
 * MediaPipe는 INFO 로그까지 console.error로 출력해 개발 화면에 오류처럼 표시된다.
 * "INFO:"로 시작하는 줄만 걸러내고 실제 오류는 그대로 둔다.
 */
function silenceMediapipeInfoLogs() {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return;
    original(...args);
  };
}

async function createLandmarker(): Promise<FaceLandmarker> {
  silenceMediapipeInfoLogs();
  // 브라우저 전용 라이브러리라 서버 렌더링에서 제외되도록 여기서 불러온다
  const { FaceLandmarker, FilesetResolver } = await import(
    "@mediapipe/tasks-vision"
  );
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const create = (delegate: "GPU" | "CPU") =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      // 두 명 이상이 잡히면 안내하기 위해 1보다 크게 둔다
      numFaces: 2,
    });

  try {
    return await create("GPU");
  } catch {
    // GPU를 쓸 수 없는 기기에서는 느리더라도 CPU로 동작시킨다
    return await create("CPU");
  }
}

// 모델 로드는 무거우므로 화면을 다시 그리거나 다음 참가자로 넘어가도 하나를 계속 쓴다
let landmarkerPromise: Promise<FaceLandmarker> | null = null;

function getLandmarker() {
  landmarkerPromise ??= createLandmarker().catch((error) => {
    // 실패하면 새로고침 없이도 다시 시도할 수 있게 비워 둔다
    landmarkerPromise = null;
    throw error;
  });
  return landmarkerPromise;
}

export function useFaceLandmarker(
  videoRef: RefObject<HTMLVideoElement | null>,
  onFrame: (faces: Landmark[][], video: HTMLVideoElement) => void,
) {
  const [status, setStatus] = useState<LandmarkerStatus>("loading");
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  useEffect(() => {
    let cancelled = false;
    let frameId = 0;
    let landmarker: FaceLandmarker | null = null;
    let lastVideoTime = -1;

    const loop = () => {
      const video = videoRef.current;
      if (
        landmarker &&
        video &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTime
      ) {
        lastVideoTime = video.currentTime;
        const result = landmarker.detectForVideo(video, performance.now());
        onFrameRef.current(result.faceLandmarks, video);
      }
      frameId = requestAnimationFrame(loop);
    };

    getLandmarker()
      .then((created) => {
        if (cancelled) return;
        landmarker = created;
        setStatus("ready");
        loop();
      })
      .catch((error) => {
        console.error("FaceLandmarker 로드 실패", error);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [videoRef]);

  return status;
}
