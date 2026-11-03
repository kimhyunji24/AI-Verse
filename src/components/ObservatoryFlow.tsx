/**
 * 체험 흐름 (ObservatoryFlow)
 *
 * 역할: 마녀의 묘약 콘셉트로 전체 체험을 진행한다.
 *       위치 맞추기 → 버튼 → 3초 카운트다운 → 얼굴 측정 → 재료 투입(설문) → 버튼 꾹 누르기
 *       → 항아리 끓이기(캐릭터 생성) → 펑! → 포토카드 등장 → 버튼 → 카드가 아래로 내려감
 * 비고: 버튼은 블루투스 키보드의 Space, Enter 이다. (useArcadeButton)
 *       실제 프린터 출력은 아직 연결되어 있지 않다. 카드가 내려가는 연출까지만 동작한다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 분석 이후의 설문, 캐릭터 생성, 결과 단계 추가
 *   - 2026-11-03 버튼 입력을 useArcadeButton으로 분리해 입력이 씹히는 문제 수정
 *   - 2026-11-03 측정 시간을 프레임 수 대신 실제 시간 기준으로 변경 (느린 기기에서 길어지지 않도록)
 *   - 2026-11-03 마녀 항아리 연출(재료 투입, 꾹 누르기, 끓이기, 펑, 카드 등장·하강)로 변경
 *   - 2026-11-03 재료 목록을 이모지 글자 대신 아이콘으로 표시
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cauldron, { type CauldronMood } from "@/components/Cauldron";
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
import {
  ANSWER_INGREDIENTS,
  faceIngredients,
  type Ingredient,
} from "@/lib/ingredients";
import { playPlop, playPoof } from "@/lib/sound";

type Step =
  | "align"
  | "countdown"
  | "scan"
  | "survey"
  | "spell"
  | "brewing"
  | "failed"
  | "burst"
  | "card"
  | "printing";

const COUNTDOWN_SECONDS = 3;
const SCAN_MS = 2000;
// 프레임이 너무 적으면 평균이 흔들리므로 시간이 지나도 이만큼은 모은다
const SCAN_MIN_SAMPLES = 10;
const SPELL_HOLD_MS = 1500;
// 응답이 빨라도 끓는 연출을 볼 수 있도록 보장하는 최소 시간
const BREW_MIN_MS = 3000;
const BURST_MS = 1200;
const PRINT_MS = 1800;
const INGREDIENT_GAP_MS = 450;

const ALIGNMENT_MESSAGES: Record<Alignment, string> = {
  no_face: "마법 거울 안으로 얼굴을 비춰 주세요",
  multiple_faces: "한 분만 거울 앞에 서 주세요",
  too_far: "조금 더 가까이 와 주세요",
  too_close: "조금 뒤로 물러나 주세요",
  off_center: "얼굴을 거울 가운데로 옮겨 주세요",
  turned: "정면을 바라봐 주세요",
  ready: "준비 완료! 버튼을 눌러 시작하세요",
};

const primaryButton =
  "rounded-full bg-emerald-300 px-6 py-2 font-medium text-black disabled:opacity-40";

export default function ObservatoryFlow() {
  const webcam = useWebcam();
  const { start: startWebcam } = webcam;
  const overlayRef = useRef<OverlayHandle>(null);
  const samplesRef = useRef<FaceFeatures[]>([]);
  const scanStartRef = useRef(0);
  const holdFrameRef = useRef(0);
  // 화면이 다음 단계로 바뀌기 전에 프레임이 더 들어와도 측정 완료를 한 번만 처리한다
  const scanFinishedRef = useRef(false);

  const [step, setStep] = useState<Step>("align");
  const [alignment, setAlignment] = useState<Alignment>("no_face");
  const [count, setCount] = useState(COUNTDOWN_SECONDS);
  const [progress, setProgress] = useState(0);
  const [hold, setHold] = useState(0);
  const [features, setFeatures] = useState<FaceFeatures | null>(null);
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [character, setCharacter] = useState<Character | null>(null);
  const [failure, setFailure] = useState<CharacterApiError | null>(null);

  const addIngredient = useCallback((ingredient: Ingredient) => {
    setIngredients((current) => [...current, ingredient]);
    playPlop();
  }, []);

  const handleFrame = useCallback(
    (faces: Parameters<typeof checkAlignment>[0], video: HTMLVideoElement) => {
      overlayRef.current?.draw(faces, video);
      const aspect = video.videoWidth / video.videoHeight;
      const current = checkAlignment(faces, aspect);
      setAlignment(current);

      if (step !== "scan" || scanFinishedRef.current) return;
      // 측정 중 위치를 벗어나면 잘못된 값이 섞이지 않도록 처음부터 다시 한다
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
        scanFinishedRef.current = true;
        const measured = averageFeatures(samplesRef.current);
        setFeatures(measured);
        setStep("survey");
        // 측정값이 재료로 변해 하나씩 항아리에 빠진다
        faceIngredients(measured).forEach((ingredient, index) => {
          setTimeout(() => addIngredient(ingredient), index * INGREDIENT_GAP_MS);
        });
      }
    },
    [step, addIngredient],
  );

  const landmarkerStatus = useFaceLandmarker(webcam.videoRef, handleFrame);

  const begin = useCallback(() => {
    if (step !== "align" || alignment !== "ready") return;
    samplesRef.current = [];
    scanFinishedRef.current = false;
    setProgress(0);
    setCount(COUNTDOWN_SECONDS);
    setStep("countdown");
  }, [step, alignment]);

  const generate = useCallback(
    async (measured: FaceFeatures, answered: Answers) => {
      setStep("brewing");
      const minimumBrew = new Promise((resolve) =>
        setTimeout(resolve, BREW_MIN_MS),
      );
      try {
        const [created] = await Promise.all([
          createCharacter(measured, answered),
          minimumBrew,
        ]);
        setCharacter(created);
        setStep("burst");
        playPoof();
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
    setIngredients([]);
    setCharacter(null);
    setFailure(null);
    setProgress(0);
    setHold(0);
    setStep("align");
  }, []);

  const startHold = useCallback(() => {
    if (step !== "spell" || !features || !answers) return;
    const startedAt = performance.now();
    const tick = () => {
      const ratio = (performance.now() - startedAt) / SPELL_HOLD_MS;
      setHold(Math.min(ratio, 1));
      if (ratio >= 1) generate(features, answers);
      else holdFrameRef.current = requestAnimationFrame(tick);
    };
    holdFrameRef.current = requestAnimationFrame(tick);
  }, [step, features, answers, generate]);

  const cancelHold = useCallback(() => {
    cancelAnimationFrame(holdFrameRef.current);
    if (step === "spell") setHold(0);
  }, [step]);

  useArcadeButton({
    onPress: () => {
      if (step === "align") begin();
      else if (step === "spell") startHold();
      else if (step === "card") setStep("printing");
      else if (step === "failed") {
        if (failure?.retryable && features && answers) generate(features, answers);
        else restart();
      }
    },
    onRelease: cancelHold,
  });

  useEffect(() => {
    startWebcam();
  }, [startWebcam]);

  useEffect(() => {
    if (step !== "countdown") return;
    const timer = setTimeout(() => {
      if (count <= 1) setStep("scan");
      else setCount(count - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [step, count]);

  useEffect(() => {
    if (step === "burst") {
      const timer = setTimeout(() => setStep("card"), BURST_MS);
      return () => clearTimeout(timer);
    }
    if (step === "printing") {
      const timer = setTimeout(restart, PRINT_MS);
      return () => clearTimeout(timer);
    }
  }, [step, restart]);

  const showCamera = step === "align" || step === "countdown" || step === "scan";
  const showCauldron =
    step === "survey" || step === "spell" || step === "brewing" || step === "failed";
  const mood: CauldronMood =
    step === "brewing" ? "boiling" : hold > 0 ? "charging" : "idle";

  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-4">
      {/* 영상과 랜드마크 계산이 끊기지 않도록 숨기기만 한다 */}
      <div className={showCamera ? "w-full max-w-3xl" : "hidden"}>
        <WebcamView webcam={webcam}>
          <LandmarkOverlay ref={overlayRef} />
          {step === "countdown" && (
            <div className="font-display absolute inset-0 flex items-center justify-center text-8xl text-emerald-200">
              {count}
            </div>
          )}
          {step === "scan" && (
            <div className="absolute inset-x-0 bottom-0 h-2 bg-white/20">
              <div
                className="h-full bg-emerald-300"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </WebcamView>
      </div>

      {showCamera && landmarkerStatus === "loading" && (
        <p>마법 거울을 깨우고 있어요</p>
      )}
      {showCamera && landmarkerStatus === "error" && (
        <p>마법 거울을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 새로고침해 주세요</p>
      )}
      {landmarkerStatus === "ready" && step === "align" && (
        <div className="flex flex-col items-center gap-3" role="status">
          <p>{ALIGNMENT_MESSAGES[alignment]}</p>
          <button
            type="button"
            onClick={begin}
            disabled={alignment !== "ready"}
            className={primaryButton}
          >
            시작
          </button>
        </div>
      )}
      {step === "scan" && <p role="status">얼굴을 묘약 재료로 바꾸고 있어요</p>}

      {showCauldron && (
        <div className="grid w-full items-center gap-6 md:grid-cols-2">
          <div>
            <Cauldron mood={mood} ingredients={ingredients} />
            <ul
              data-testid="ingredients"
              className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-purple-200/80"
            >
              {ingredients.map((item) => (
                <li key={item.key} className="flex items-center gap-1">
                  <item.Icon className="text-base" style={{ color: item.color }} aria-hidden />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col items-center gap-4">
            {step === "survey" && features && (
              <SurveyStep
                onChoose={(value) => {
                  addIngredient({
                    key: `answer:${value}`,
                    ...ANSWER_INGREDIENTS[value],
                  });
                }}
                onComplete={(answered) => {
                  setAnswers(answered);
                  setStep("spell");
                }}
              />
            )}

            {step === "spell" && (
              <div className="flex w-full flex-col items-center gap-4" role="status">
                <h2 className="font-display text-center text-2xl">
                  재료가 모두 모였어요!
                </h2>
                <p>버튼을 꾹 눌러 주문을 외우세요</p>
                <div className="h-3 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-300 to-purple-400"
                    style={{ width: `${hold * 100}%` }}
                  />
                </div>
                <button
                  type="button"
                  onPointerDown={startHold}
                  onPointerUp={cancelHold}
                  onPointerLeave={cancelHold}
                  className={`${primaryButton} touch-none select-none`}
                >
                  꾹 누르기
                </button>
              </div>
            )}

            {step === "brewing" && features && (
              <div className="flex w-full flex-col gap-3">
                <h2 className="font-display text-center text-2xl text-purple-200">
                  부글부글 끓는 중…
                </h2>
                <TerminalLoading features={features} />
              </div>
            )}

            {step === "failed" && failure && (
              <div className="flex flex-col items-center gap-3" role="alert">
                <p>{failure.message}</p>
                <div className="flex gap-3">
                  {failure.retryable && features && answers && (
                    <button
                      type="button"
                      onClick={() => generate(features, answers)}
                      className={primaryButton}
                    >
                      다시 끓이기
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
          </div>
        </div>
      )}

      {step === "burst" && (
        <div
          data-testid="poof"
          className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center"
        >
          <div className="anim-poof h-[70vmin] w-[70vmin] rounded-full bg-white blur-3xl" />
        </div>
      )}

      {(step === "card" || step === "printing") && character && (
        <>
          <CharacterResult character={character} printing={step === "printing"} />
          {step === "card" && (
            <button
              type="button"
              onClick={() => setStep("printing")}
              className={primaryButton}
            >
              버튼을 눌러 카드 완성하기
            </button>
          )}
        </>
      )}
    </div>
  );
}
