/**
 * 체험 흐름 (ObservatoryFlow)
 *
 * 역할: 마녀의 묘약 콘셉트로 전체 체험을 진행한다.
 *       위치 맞추기 → 버튼 → 3초 카운트다운 → 얼굴 측정 → 포즈 잡기 → 재료 투입(설문) → 버튼 꾹 누르기
 *       → 항아리 끓이기(캐릭터 생성) → 펑! → 포토카드 등장 → 버튼 → 카드가 아래로 내려감
 * 비고: 버튼은 블루투스 키보드의 Space, Enter 이다. (useArcadeButton)
 *       캐릭터 글이 나오면 바로 카드를 보여주고, 그 사이 백엔드가 일러스트를 그려 포토카드를 합성한다.
 *       실제 프린터 출력은 아직 연결되어 있지 않다. 포토카드는 백엔드에 파일로 저장되고, 카드가 내려가는 연출까지만 동작한다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 분석 이후의 설문, 캐릭터 생성, 결과 단계 추가
 *   - 2026-11-03 버튼 입력을 useArcadeButton으로 분리해 입력이 씹히는 문제 수정
 *   - 2026-11-03 측정 시간을 프레임 수 대신 실제 시간 기준으로 변경 (느린 기기에서 길어지지 않도록)
 *   - 2026-11-03 마녀 항아리 연출(재료 투입, 꾹 누르기, 끓이기, 펑, 카드 등장·하강)로 변경
 *   - 2026-11-03 재료 목록을 이모지 글자 대신 아이콘으로 표시
 *   - 2026-11-03 펑 터질 때 "나야, 부캐" 문구 표시
 *   - 2026-11-22 캐릭터 생성 뒤 포토카드(일러스트 + 합성) 요청, 완성 전에는 카드 완성 버튼을 막음
 *   - 2026-11-22 얼굴 측정 뒤 포즈 잡기 단계 추가, 뼈대 그림을 포토카드 요청에 함께 보냄
 *   - 2026-11-22 포즈 단계에서 손가락과 손 모양을 잡아 뼈대 그림과 포토카드 요청에 반영, 인식한 손 모양 표시
 *   - 2026-11-24 화면 멘트 정리: 마법 거울 문구를 카메라·솥 문구로, 얼굴 측정 때 사진 미저장 안내, '찰칵' 대신 포즈가 정해진다는 안내
 *   - 2026-11-24 끓는 중 화면: 얼굴 수치 터미널 대신 솥을 가운데 크게 두고 단계 표시(BrewingProgress), 질문 화면: 솥 작게·질문 크게, 재료 이름을 읽히는 크기로
 *   - 2026-11-24 "카드 준비 중" 화면 없앰: 그림까지 솥에서 끓인 뒤, 솥이 번쩍하며 카드 등장 연출(CardReveal)이 바로 시작되게 함 (펑 문구 제거)
 *   - 2026-11-24 솥에서 나온 카드는 뒷면으로 기다리다 누르면 앞면이 보이고, 그 뒤 "내 카드 인쇄하기"로 실제 인쇄(100×148mm)
 *   - 2026-11-24 얼굴 세부 수치 14개로 동물상 유사도를 계산해 상위 3개를 재료로 넣고, 질문 화면에 AI 얼굴 분석 패널 표시
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cauldron, { type CauldronMood } from "@/components/Cauldron";
import { createPortal } from "react-dom";

import CharacterResult from "@/components/CharacterResult";
import FaceLookPanel from "@/components/FaceLookPanel";
import LandmarkOverlay, { type OverlayHandle } from "@/components/LandmarkOverlay";
import PoseOverlay, { type PoseOverlayHandle } from "@/components/PoseOverlay";
import SurveyStep from "@/components/SurveyStep";
import BrewingProgress from "@/components/BrewingProgress";
import WebcamView from "@/components/WebcamView";
import { useArcadeButton } from "@/hooks/useArcadeButton";
import { useFaceLandmarker } from "@/hooks/useFaceLandmarker";
import { usePoseLandmarker } from "@/hooks/usePoseLandmarker";
import { useWebcam } from "@/hooks/useWebcam";
import {
  assetUrl,
  type Answers,
  type Character,
  CharacterApiError,
  createCharacter,
  createPhotocard,
  type Photocard,
} from "@/lib/characterApi";
import {
  type Alignment,
  averageFeatures,
  checkAlignment,
  extractFeatures,
  type FaceFeatures,
} from "@/lib/faceFeatures";
import { analyzeFaceLook, averageDetail, type FaceDetail, type FaceLook, measureFace } from "@/lib/faceLook";
import {
  ANSWER_INGREDIENTS,
  faceLookIngredients,
  type Ingredient,
} from "@/lib/ingredients";
import {
  GESTURE_LABELS,
  type Hand,
  type HandGesture,
  handGestures,
  isUsablePose,
  type PoseLandmark,
  renderSkeletonPng,
} from "@/lib/poseSkeleton";
import { playPlop, playPoof } from "@/lib/sound";

type Step =
  | "align"
  | "countdown"
  | "scan"
  | "pose"
  | "survey"
  | "spell"
  | "brewing"
  | "failed"
  | "card"
  | "printing";

const COUNTDOWN_SECONDS = 3;
const SCAN_MS = 2000;
// 프레임이 너무 적으면 평균이 흔들리므로 시간이 지나도 이만큼은 모은다
const SCAN_MIN_SAMPLES = 10;
// 포즈를 잡을 시간. 끝나는 순간의 자세를 찍는다.
const POSE_SECONDS = 5;
// 상반신이 안 잡히면 다시 세는 횟수. 넘으면 포즈 없이 진행한다.
const POSE_ATTEMPTS = 2;
const SPELL_HOLD_MS = 1500;
// 응답이 빨라도 끓는 연출을 볼 수 있도록 보장하는 최소 시간
const BREW_MIN_MS = 3000;
const BURST_MS = 1200;
const PRINT_MS = 1800;
const INGREDIENT_GAP_MS = 450;

const ALIGNMENT_MESSAGES: Record<Alignment, string> = {
  no_face: "카메라에 얼굴이 보이게 앉아 주세요",
  multiple_faces: "한 분만 카메라 앞에 앉아 주세요",
  too_far: "조금 더 가까이 와 주세요",
  too_close: "조금 뒤로 물러나 주세요",
  off_center: "얼굴을 화면 가운데로 옮겨 주세요",
  turned: "정면을 바라봐 주세요",
  ready: "준비 완료! 버튼을 눌러 시작하세요",
};

const primaryButton =
  "rounded-full bg-emerald-300 px-6 py-2 font-medium text-black disabled:opacity-40";

export default function ObservatoryFlow() {
  const webcam = useWebcam();
  const { start: startWebcam } = webcam;
  const overlayRef = useRef<OverlayHandle>(null);
  const poseOverlayRef = useRef<PoseOverlayHandle>(null);
  const latestPoseRef = useRef<{ pose: PoseLandmark[]; hands: Hand[]; aspect: number } | null>(
    null,
  );
  const samplesRef = useRef<FaceFeatures[]>([]);
  // 동물상 분석용 세부 수치 (화면 연출용, 백엔드로 보내지 않는다)
  const detailSamplesRef = useRef<FaceDetail[]>([]);
  const scanStartRef = useRef(0);
  const holdFrameRef = useRef(0);
  // 화면이 다음 단계로 바뀌기 전에 프레임이 더 들어와도 측정 완료를 한 번만 처리한다
  const scanFinishedRef = useRef(false);

  const [step, setStep] = useState<Step>("align");
  const [alignment, setAlignment] = useState<Alignment>("no_face");
  const [count, setCount] = useState(COUNTDOWN_SECONDS);
  const [poseCount, setPoseCount] = useState(POSE_SECONDS);
  const [poseAttempt, setPoseAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  const [hold, setHold] = useState(0);
  const [features, setFeatures] = useState<FaceFeatures | null>(null);
  const [faceLook, setFaceLook] = useState<FaceLook | null>(null);
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [character, setCharacter] = useState<Character | null>(null);
  const [failure, setFailure] = useState<CharacterApiError | null>(null);
  const [photocard, setPhotocard] = useState<Photocard | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [cardFailure, setCardFailure] = useState<CharacterApiError | null>(null);
  // 카드가 나타나는 순간 화면을 덮는 번쩍임 (카드 연출과 동시에 시작한다)
  const [flash, setFlash] = useState(false);
  // 솥에서 나온 카드는 뒷면으로 기다리다가, 누르면 앞면이 보인다
  const [revealed, setRevealed] = useState(false);
  // 찍은 포즈 뼈대 그림. 화면에 그리지 않고 포토카드 요청에만 쓴다.
  const poseSkeletonRef = useRef<string | null>(null);
  const handGesturesRef = useRef<HandGesture[]>([]);
  // 포즈 단계 화면에 보여줄 인식한 손 모양 (바뀔 때만 다시 그린다)
  const [gestureText, setGestureText] = useState("");
  // 다음 참가자로 넘어간 뒤 늦게 도착한 이전 참가자의 포토카드를 버리기 위한 번호
  const cardRequestRef = useRef(0);

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
        detailSamplesRef.current = [];
        setProgress(0);
        setStep("align");
        return;
      }
      const now = performance.now();
      if (samplesRef.current.length === 0) scanStartRef.current = now;
      samplesRef.current.push(extractFeatures(faces[0], aspect));
      detailSamplesRef.current.push(measureFace(faces[0], aspect));
      const elapsed = now - scanStartRef.current;
      setProgress(Math.min(elapsed / SCAN_MS, 1));
      if (elapsed >= SCAN_MS && samplesRef.current.length >= SCAN_MIN_SAMPLES) {
        scanFinishedRef.current = true;
        setFeatures(averageFeatures(samplesRef.current));
        setFaceLook(analyzeFaceLook(averageDetail(detailSamplesRef.current)));
        latestPoseRef.current = null;
        setPoseCount(POSE_SECONDS);
        setPoseAttempt(0);
        setStep("pose");
      }
    },
    [step],
  );

  const landmarkerStatus = useFaceLandmarker(webcam.videoRef, handleFrame);

  const handlePose = useCallback(
    (pose: PoseLandmark[] | undefined, hands: Hand[], video: HTMLVideoElement) => {
      poseOverlayRef.current?.draw(pose, hands, video);
      if (isUsablePose(pose)) {
        latestPoseRef.current = { pose, hands, aspect: video.videoWidth / video.videoHeight };
      }
      const text = handGestures(hands)
        .sort((a, b) => a.side.localeCompare(b.side))
        .map(({ side, gesture }) => `${side === "left" ? "왼손" : "오른손"} ${GESTURE_LABELS[gesture]}`)
        .join(" · ");
      setGestureText((current) => (current === text ? current : text));
    },
    [],
  );
  const poseStatus = usePoseLandmarker(webcam.videoRef, step === "pose", handlePose);

  // 포즈를 찍은 뒤(또는 포즈 없이) 설문으로 넘어간다
  const finishPose = useCallback(
    (skeleton: string | null, gestures: HandGesture[] = []) => {
      poseSkeletonRef.current = skeleton;
      handGesturesRef.current = gestures;
      setStep("survey");
      if (!faceLook) return;
      // 얼굴 분석 결과(닮은 동물상 상위 3개)가 재료로 변해 하나씩 항아리에 빠진다
      faceLookIngredients(faceLook).forEach((ingredient, index) => {
        setTimeout(() => addIngredient(ingredient), index * INGREDIENT_GAP_MS);
      });
    },
    [faceLook, addIngredient],
  );

  const begin = useCallback(() => {
    if (step !== "align" || alignment !== "ready") return;
    samplesRef.current = [];
    detailSamplesRef.current = [];
    scanFinishedRef.current = false;
    setProgress(0);
    setCount(COUNTDOWN_SECONDS);
    setStep("countdown");
  }, [step, alignment]);

  const drawCard = useCallback(async (created: Character) => {
    const request = ++cardRequestRef.current;
    setDrawing(true);
    setCardFailure(null);
    try {
      const card = await createPhotocard(
        created,
        poseSkeletonRef.current,
        handGesturesRef.current,
      );
      if (request === cardRequestRef.current) setPhotocard(card);
    } catch (error) {
      if (request !== cardRequestRef.current) return;
      setCardFailure(
        error instanceof CharacterApiError
          ? error
          : new CharacterApiError("포토카드를 만들지 못했어요", true),
      );
    } finally {
      if (request === cardRequestRef.current) setDrawing(false);
    }
  }, []);

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
        // 그림까지 솥에서 끓인다. "카드 준비 중" 화면 없이, 다 되면 솥이 번쩍하며 카드 연출이 바로 시작된다.
        await drawCard(created);
        setStep("card");
        setFlash(true);
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
    [drawCard],
  );

  // 다음 참가자를 위해 이전 참가자의 데이터를 모두 지운다
  const restart = useCallback(() => {
    samplesRef.current = [];
    detailSamplesRef.current = [];
    setFeatures(null);
    setFaceLook(null);
    setAnswers(null);
    setIngredients([]);
    setCharacter(null);
    setFailure(null);
    latestPoseRef.current = null;
    poseSkeletonRef.current = null;
    handGesturesRef.current = [];
    setGestureText("");
    cardRequestRef.current += 1;
    setPhotocard(null);
    setDrawing(false);
    setCardFailure(null);
    setFlash(false);
    setRevealed(false);
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

  const revealCard = useCallback(() => {
    if (photocard) setRevealed(true);
  }, [photocard]);

  // 앞면을 본 뒤 인쇄한다. 인쇄 창이 닫히면 카드가 아래로 내려가며 다음 참가자로 넘어간다.
  // 다시 그려도 소용없는 실패면 글 카드로라도 마무리한다.
  const pressCard = useCallback(() => {
    if (photocard && !revealed) setRevealed(true);
    else if (photocard) {
      window.print();
      setStep("printing");
    } else if (cardFailure && !cardFailure.retryable) setStep("printing");
    else if (cardFailure && character) drawCard(character);
  }, [photocard, revealed, cardFailure, character, drawCard]);

  useArcadeButton({
    onPress: () => {
      if (step === "align") begin();
      else if (step === "spell") startHold();
      else if (step === "card") pressCard();
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
    if (step !== "pose" || poseStatus === "loading") return;
    // 포즈 모델을 못 쓰면 기다리지 않고 포즈 없이 진행한다
    const failed = poseStatus === "error";
    const timer = setTimeout(() => {
      if (failed) {
        finishPose(null);
        return;
      }
      if (poseCount > 1) {
        setPoseCount(poseCount - 1);
        return;
      }
      const captured = latestPoseRef.current;
      if (captured) {
        finishPose(
          renderSkeletonPng(captured.pose, captured.aspect, captured.hands),
          handGestures(captured.hands),
        );
      } else if (poseAttempt + 1 < POSE_ATTEMPTS) {
        setPoseAttempt(poseAttempt + 1);
        setPoseCount(POSE_SECONDS);
      } else {
        finishPose(null);
      }
    }, failed ? 0 : 1000);
    return () => clearTimeout(timer);
  }, [step, poseStatus, poseCount, poseAttempt, finishPose]);

  useEffect(() => {
    if (step === "printing") {
      const timer = setTimeout(restart, PRINT_MS);
      return () => clearTimeout(timer);
    }
  }, [step, restart]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(false), BURST_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  const showCamera =
    step === "align" || step === "countdown" || step === "scan" || step === "pose";
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
          {step === "pose" && <PoseOverlay ref={poseOverlayRef} />}
          {step === "pose" && poseStatus === "ready" && (
            <div className="font-display absolute top-4 right-6 text-7xl text-emerald-200 drop-shadow-lg">
              {poseCount}
            </div>
          )}
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
        <p>솥에 불을 붙이는 중이에요</p>
      )}
      {showCamera && landmarkerStatus === "error" && (
        <p>솥에 불을 붙이지 못했어요. 인터넷 연결을 확인한 뒤 새로고침해 주세요</p>
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
      {step === "scan" && <p role="status">잠깐 그대로! 얼굴 모양을 살펴보고 있어요 · 사진은 저장하지 않아요</p>}
      {step === "pose" && (
        <div className="flex flex-col items-center gap-1 text-center" role="status">
          <p className="font-display text-2xl text-emerald-200">
            캐릭터가 따라 할 포즈를 잡아 주세요!
          </p>
          <p>
            {poseAttempt > 0
              ? "어깨와 팔이 화면에 보이게 조금 뒤로 앉아 주세요"
              : "손과 팔을 자유롭게 움직여 보세요. 숫자가 0이 되면 포즈가 정해져요"}
          </p>
          {gestureText && (
            <p className="text-sm text-amber-200">인식한 손 모양: {gestureText}</p>
          )}
        </div>
      )}

      {showCauldron && (
        <div
          className={
            step === "brewing"
              ? "flex w-full flex-col items-center gap-6"
              : "grid w-full items-center gap-8 md:grid-cols-[2fr_3fr]"
          }
        >
          <div className={step === "brewing" ? "w-full max-w-md" : undefined}>
            <Cauldron mood={mood} ingredients={ingredients} />
            {step !== "brewing" && (
              <ul
                data-testid="ingredients"
                className="mt-3 flex flex-wrap justify-center gap-2 text-sm"
              >
                {ingredients.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center gap-1.5 rounded-full bg-amber-200/10 px-3 py-1 text-amber-100"
                  >
                    <item.Icon className="text-base" style={{ color: item.color }} aria-hidden />
                    {item.label}
                  </li>
                ))}
              </ul>
            )}
            {step !== "brewing" && faceLook && <FaceLookPanel look={faceLook} />}
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

            {step === "brewing" && <BrewingProgress ingredients={ingredients} />}

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

      {flash && (
        <div
          data-testid="poof"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
        >
          {/* 솥이 번쩍하는 빛. 아래에서 카드 연출이 동시에 시작돼 빛이 걷히면 카드 뒷면이 떠오른다. */}
          <div className="anim-poof absolute h-[80vmin] w-[80vmin] rounded-full bg-[#fff3d1] blur-3xl" />
        </div>
      )}

      {(step === "card" || step === "printing") && character && (
        <>
          <CharacterResult
            character={character}
            photocard={photocard}
            drawing={drawing}
            printing={step === "printing"}
            revealed={revealed}
            onReveal={revealCard}
          />
          {step === "card" && drawing && (
            <p role="status">솥에서 모습이 떠오르고 있어요. 조금만 기다려 주세요</p>
          )}
          {step === "card" && cardFailure && (
            <div className="flex flex-col items-center gap-3" role="alert">
              <p>{cardFailure.message}</p>
              <div className="flex gap-3">
                <button type="button" onClick={pressCard} className={primaryButton}>
                  {cardFailure.retryable ? "다시 그리기" : "이대로 완성하기"}
                </button>
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
          {step === "card" && photocard && !revealed && (
            <p className="anim-card-appear text-xl text-amber-100" role="status">
              카드를 눌러서 내 부캐를 확인해 보세요
            </p>
          )}
          {step === "card" && photocard && revealed && (
            // 카드가 다 뒤집힌 뒤에 나타난다
            <button
              type="button"
              onClick={pressCard}
              className={`anim-card-appear ${primaryButton}`}
              style={{ animationDelay: "1.1s" }}
            >
              내 카드 인쇄하기
            </button>
          )}
          {/* 인쇄할 때만 보이는 카드 이미지. body 바로 아래에 둬야 인쇄 때 나머지 화면을 통째로 뺄 수 있다 (globals.css의 .print-card) */}
          {photocard &&
            createPortal(
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assetUrl(photocard.card_url)} alt="" className="print-card" />,
              document.body,
            )}
        </>
      )}
    </div>
  );
}
