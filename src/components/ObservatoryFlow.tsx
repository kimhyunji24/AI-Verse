/**
 * 체험 흐름 (ObservatoryFlow)
 *
 * 역할: 위치 맞추기 → 버튼 입력 → 3초 카운트다운 → 얼굴 분석 → 특징값 확정까지의 흐름을 관리한다.
 * 비고: 아케이드 버튼은 키보드 입력(Space, Enter)으로 들어온다고 가정한다. 화면 버튼도 함께 둔다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LandmarkOverlay, { type OverlayHandle } from "@/components/LandmarkOverlay";
import WebcamView from "@/components/WebcamView";
import { useFaceLandmarker } from "@/hooks/useFaceLandmarker";
import { useWebcam } from "@/hooks/useWebcam";
import {
  type Alignment,
  averageFeatures,
  checkAlignment,
  extractFeatures,
  type FaceFeatures,
} from "@/lib/faceFeatures";

type Step = "align" | "countdown" | "scan" | "done";

const COUNTDOWN_SECONDS = 3;
// 평균을 낼 프레임 수 (약 2초)
const SCAN_FRAMES = 60;

const ALIGNMENT_MESSAGES: Record<Alignment, string> = {
  no_face: "화면 안으로 얼굴을 비춰 주세요",
  multiple_faces: "한 분만 화면에 들어와 주세요",
  too_far: "조금 더 가까이 와 주세요",
  too_close: "조금 뒤로 물러나 주세요",
  off_center: "얼굴을 화면 가운데로 옮겨 주세요",
  turned: "정면을 바라봐 주세요",
  ready: "준비 완료! 버튼을 눌러 관측을 시작하세요",
};

export default function ObservatoryFlow() {
  const webcam = useWebcam();
  const { start: startWebcam } = webcam;
  const overlayRef = useRef<OverlayHandle>(null);
  const samplesRef = useRef<FaceFeatures[]>([]);

  const [step, setStep] = useState<Step>("align");
  const [alignment, setAlignment] = useState<Alignment>("no_face");
  const [count, setCount] = useState(COUNTDOWN_SECONDS);
  const [progress, setProgress] = useState(0);
  const [features, setFeatures] = useState<FaceFeatures | null>(null);

  const handleFrame = useCallback(
    (faces: Parameters<typeof checkAlignment>[0], video: HTMLVideoElement) => {
      overlayRef.current?.draw(faces, video);
      const aspect = video.videoWidth / video.videoHeight;
      const current = checkAlignment(faces, aspect);
      setAlignment(current);

      if (step !== "scan") return;
      // 분석 중 위치를 벗어나면 잘못된 값이 섞이지 않도록 처음부터 다시 한다
      if (current !== "ready") {
        samplesRef.current = [];
        setProgress(0);
        setStep("align");
        return;
      }
      samplesRef.current.push(extractFeatures(faces[0], aspect));
      setProgress(samplesRef.current.length / SCAN_FRAMES);
      if (samplesRef.current.length >= SCAN_FRAMES) {
        setFeatures(averageFeatures(samplesRef.current));
        setStep("done");
      }
    },
    [step],
  );

  const landmarkerStatus = useFaceLandmarker(webcam.videoRef, handleFrame);

  const begin = useCallback(() => {
    if (step !== "align" || alignment !== "ready") return;
    samplesRef.current = [];
    setProgress(0);
    setCount(COUNTDOWN_SECONDS);
    setStep("countdown");
  }, [step, alignment]);

  useEffect(() => {
    startWebcam();
  }, [startWebcam]);

  // 아케이드 버튼 입력
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        begin();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [begin]);

  useEffect(() => {
    if (step !== "countdown") return;
    const timer = setTimeout(() => {
      if (count <= 1) setStep("scan");
      else setCount(count - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [step, count]);

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-4">
      <WebcamView webcam={webcam}>
        <LandmarkOverlay ref={overlayRef} />
        {step === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center text-8xl font-bold">
            {count}
          </div>
        )}
        {step === "scan" && (
          <div className="absolute inset-x-0 bottom-0 h-2 bg-white/20">
            <div
              className="h-full bg-teal-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
      </WebcamView>

      {landmarkerStatus === "loading" && <p>분석 장치를 불러오고 있어요</p>}
      {landmarkerStatus === "error" && (
        <p>분석 장치를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 새로고침해 주세요</p>
      )}

      {landmarkerStatus === "ready" && step === "align" && (
        <div className="flex flex-col items-center gap-3" role="status">
          <p>{ALIGNMENT_MESSAGES[alignment]}</p>
          <button
            type="button"
            onClick={begin}
            disabled={alignment !== "ready"}
            className="rounded-full bg-white px-6 py-2 font-medium text-black disabled:opacity-40"
          >
            관측 시작
          </button>
        </div>
      )}
      {step === "scan" && <p role="status">얼굴 데이터를 측정하고 있어요</p>}

      {step === "done" && features && (
        <dl
          data-testid="features"
          className="grid w-full grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-3"
        >
          {Object.entries(features).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-2">
              <dt className="text-zinc-400">{key}</dt>
              <dd>{value.toFixed(3)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
