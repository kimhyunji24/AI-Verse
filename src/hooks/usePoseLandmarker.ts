/**
 * 포즈 랜드마크 훅 (usePoseLandmarker)
 *
 * 역할: MediaPipe PoseLandmarker와 GestureRecognizer를 불러오고, active일 때만 영상의 새 프레임마다
 *       상반신 관절과 손(손가락 21점, 손 모양)을 계산해 onFrame으로 넘긴다.
 * 비고: 모델은 처음 화면이 열릴 때 미리 불러 두고, 계산은 포즈 단계에서만 돌려 얼굴 측정을 느리게 하지 않는다.
 *       얼굴 훅(useFaceLandmarker)과 같은 wasm 파일을 쓴다. 손 모델을 못 불러오면 손 없이 포즈만 계산한다.
 *
 * 수정 이력:
 *   - 2026-11-22 최초 작성
 *   - 2026-11-22 손가락과 손 모양을 잡는 GestureRecognizer 추가
 */

"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import type { GestureRecognizer, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { LandmarkerStatus } from "@/hooks/useFaceLandmarker";
import { type Gesture, GESTURES, type Hand, type PoseLandmark } from "@/lib/poseSkeleton";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const GESTURE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

type Models = { pose: PoseLandmarker; gesture: GestureRecognizer | null };

/** GPU를 쓸 수 없는 기기에서는 느리더라도 CPU로 동작시킨다 */
async function withFallback<T>(create: (delegate: "GPU" | "CPU") => Promise<T>) {
  try {
    return await create("GPU");
  } catch {
    return await create("CPU");
  }
}

async function createModels(): Promise<Models> {
  // 브라우저 전용 라이브러리라 서버 렌더링에서 제외되도록 여기서 불러온다
  const { PoseLandmarker, GestureRecognizer, FilesetResolver } = await import(
    "@mediapipe/tasks-vision"
  );
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const [pose, gesture] = await Promise.all([
    withFallback((delegate) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      }),
    ),
    withFallback((delegate) =>
      GestureRecognizer.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: GESTURE_MODEL_URL, delegate },
        runningMode: "VIDEO",
        numHands: 2,
      }),
    ).catch((error) => {
      // 손 모델이 없어도 포즈 단계는 진행할 수 있다
      console.error("GestureRecognizer 로드 실패, 손 없이 진행", error);
      return null;
    }),
  ]);
  return { pose, gesture };
}

// 모델 로드는 무거우므로 다음 참가자로 넘어가도 하나를 계속 쓴다
let modelsPromise: Promise<Models> | null = null;

function getModels() {
  modelsPromise ??= createModels().catch((error) => {
    // 실패하면 새로고침 없이도 다시 시도할 수 있게 비워 둔다
    modelsPromise = null;
    throw error;
  });
  return modelsPromise;
}

const isGesture = (name: string | undefined): name is Gesture =>
  GESTURES.includes(name as Gesture);

export function usePoseLandmarker(
  videoRef: RefObject<HTMLVideoElement | null>,
  active: boolean,
  onFrame: (pose: PoseLandmark[] | undefined, hands: Hand[], video: HTMLVideoElement) => void,
) {
  const [status, setStatus] = useState<LandmarkerStatus>("loading");
  const [models, setModels] = useState<Models | null>(null);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  useEffect(() => {
    let cancelled = false;
    getModels()
      .then((created) => {
        if (cancelled) return;
        setModels(created);
        setStatus("ready");
      })
      .catch((error) => {
        console.error("PoseLandmarker 로드 실패", error);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active || !models) return;
    let frameId = 0;
    let lastVideoTime = -1;

    const loop = () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const now = performance.now();
        const pose = models.pose.detectForVideo(video, now).landmarks[0];
        const hands: Hand[] = [];
        if (models.gesture) {
          const result = models.gesture.recognizeForVideo(video, now);
          result.landmarks.forEach((landmarks, index) => {
            const top = result.gestures[index]?.[0];
            hands.push({
              landmarks,
              gesture: isGesture(top?.categoryName) ? top.categoryName : null,
              score: top?.score ?? 0,
            });
          });
        }
        onFrameRef.current(pose, hands, video);
      }
      frameId = requestAnimationFrame(loop);
    };
    loop();

    return () => cancelAnimationFrame(frameId);
  }, [active, models, videoRef]);

  return status;
}
