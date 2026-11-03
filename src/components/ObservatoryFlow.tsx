/**
 * 체험 흐름 (ObservatoryFlow)
 *
 * 역할: 위치 맞추기 → 버튼 입력 → 3초 카운트다운 → 얼굴 분석 → 설문 → 캐릭터 생성 → 결과 확인까지의 흐름을 관리한다.
 * 비고: 아케이드 버튼은 키보드 입력(Space, Enter)으로 들어온다고 가정한다. 화면 버튼도 함께 둔다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 분석 이후의 설문, 캐릭터 생성, 결과 단계 추가
 *   - 2026-11-03 버튼 입력을 useArcadeButton으로 분리해 입력이 씹히는 문제 수정
 *   - 2026-11-03 측정 시간을 프레임 수 대신 실제 시간 기준으로 변경 (느린 기기에서 길어지지 않도록)
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CharacterResult from "@/components/CharacterResult";
import LandmarkOverlay, { type OverlayHandle } from "@/components/LandmarkOverlay";
import SurveyStep from "@/components/SurveyStep";
import TerminalLoading from "@/components/TerminalLoading";
import WebcamView from "@/components/WebcamView";
import { useArcadeButton } from "@/hooks/useArcadeButton";
import { useFaceLandmarker } from "@/hooks/useFaceLandmarker";
import { useWebcam } from "@/hooks/useWebcam";
import {
  type Answers,
  type Character,
  CharacterApiError,
  createCharacter,
} from "@/lib/characterApi";
import {
  type Alignment,
  averageFeatures,
  checkAlignment,
  extractFeatures,
  type FaceFeatures,
} from "@/lib/faceFeatures";

type Step =
  | "align"
  | "countdown"
  | "scan"
  | "survey"
  | "generating"
  | "failed"
  | "result";

const COUNTDOWN_SECONDS = 3;
const SCAN_MS = 2000;
// 프레임이 너무 적으면 평균이 흔들리므로 시간이 지나도 이만큼은 모은다
const SCAN_MIN_SAMPLES = 10;

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
  const scanStartRef = useRef(0);

  const [step, setStep] = useState<Step>("align");
  const [alignment, setAlignment] = useState<Alignment>("no_face");
  const [count, setCount] = useState(COUNTDOWN_SECONDS);
  const [progress, setProgress] = useState(0);
  const [features, setFeatures] = useState<FaceFeatures | null>(null);
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [failure, setFailure] = useState<CharacterApiError | null>(null);

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
      const now = performance.now();
      if (samplesRef.current.length === 0) scanStartRef.current = now;
      samplesRef.current.push(extractFeatures(faces[0], aspect));
      const elapsed = now - scanStartRef.current;
      setProgress(Math.min(elapsed / SCAN_MS, 1));
      if (elapsed >= SCAN_MS && samplesRef.current.length >= SCAN_MIN_SAMPLES) {
        setFeatures(averageFeatures(samplesRef.current));
        setStep("survey");
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

  const generate = useCallback(
    async (measured: FaceFeatures, answered: Answers) => {
      setStep("generating");
      try {
        setCharacter(await createCharacter(measured, answered));
        setStep("result");
      } catch (error) {
        setFailure(
          error instanceof CharacterApiError
            ? error
            : new CharacterApiError("캐릭터 생성에 실패했어요", true),
        );
        setStep("failed");
      }
    },
    [],
  );

  // 다음 참가자를 위해 이전 참가자의 데이터를 모두 지운다
  const restart = useCallback(() => {
    samplesRef.current = [];
    setFeatures(null);
    setAnswers(null);
    setCharacter(null);
    setFailure(null);
    setProgress(0);
    setStep("align");
  }, []);

  useEffect(() => {
    startWebcam();
  }, [startWebcam]);

  useArcadeButton({ onPress: begin });

  useEffect(() => {
    if (step !== "countdown") return;
    const timer = setTimeout(() => {
      if (count <= 1) setStep("scan");
      else setCount(count - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [step, count]);

  const showCamera = step === "align" || step === "countdown" || step === "scan";

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-4">
      {/* 영상과 랜드마크 계산이 끊기지 않도록 숨기기만 한다 */}
      <div className={showCamera ? "w-full" : "hidden"}>
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
      </div>

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

      {step === "survey" && features && (
        <SurveyStep
          onComplete={(answered) => {
            setAnswers(answered);
            generate(features, answered);
          }}
        />
      )}

      {step === "generating" && features && (
        <TerminalLoading features={features} />
      )}

      {step === "failed" && failure && (
        <div className="flex flex-col items-center gap-3" role="alert">
          <p>{failure.message}</p>
          <div className="flex gap-3">
            {failure.retryable && features && answers && (
              <button
                type="button"
                onClick={() => generate(features, answers)}
                className="rounded-full bg-white px-6 py-2 font-medium text-black"
              >
                다시 시도
              </button>
            )}
            <button
              type="button"
              onClick={restart}
              className="rounded-full border border-zinc-500 px-6 py-2"
            >
              처음으로
            </button>
          </div>
        </div>
      )}

      {step === "result" && character && (
        <CharacterResult character={character} onRestart={restart} />
      )}
    </div>
  );
}
