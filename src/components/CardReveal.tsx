"use client";

/**
 * 카드 등장 연출 (CardReveal)
 *
 * 역할: 완성된 포토카드를 바로 띄우지 않고, 카드 뒷면이 떠오른 뒤 빛 리본이 카드를 감싸며 돌다가
 *       카드를 누르면 빛이 터지며 뒤집혀 앞면(완성 카드)이 나온다. 누르기 전까지는 리본이 계속 감아 돈다.
 * 비고: 레퍼런스 영상 구성(나선 빛 리본, 불씨, 빛살 폭발)을 따르고 색만 부스 콘셉트 색
 *       (밤하늘 남보라 + 골드 + 솥의 에메랄드)으로 바꿨다. 빛 효과는 lib/revealFx.ts가 캔버스에 그린다.
 *       움직임 줄이기 설정을 켠 사용자에게는 빛 없이 누르면 바로 앞면을 보여준다.
 *       카드 뒷면 문양은 코드로 직접 그린 오리지널이다.
 *
 * 수정 이력:
 *   - 2026-11-24 최초 작성
 *   - 2026-11-24 카드를 눌러야 뒤집히도록 변경 (revealed / onReveal)
 *   - 2026-11-24 레퍼런스 영상처럼 나선 리본·불씨·빛살로 다시 만듦 (캔버스로 그림, 카드는 살짝 흔들리다 뒤집힘)
 */

import { useEffect, useRef, type ReactNode } from "react";

import { runRevealFx, type RevealFx } from "@/lib/revealFx";

function CardBack() {
  return (
    <div className="reveal-face reveal-back" aria-hidden="true">
      <svg viewBox="0 0 100 148" className="h-full w-full">
        <defs>
          <radialGradient id="reveal-back-bg" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="#2a2156" />
            <stop offset="100%" stopColor="#0b0a1c" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100" height="148" rx="6" fill="url(#reveal-back-bg)" />
        <rect x="4" y="4" width="92" height="140" rx="4" fill="none" stroke="#ecd09c" strokeWidth="0.8" />
        <rect x="6.5" y="6.5" width="87" height="135" rx="3" fill="none" stroke="#ecd09c" strokeOpacity="0.5" strokeWidth="0.4" />
        {/* 위 초승달, 아래 작은 별 */}
        <path d="M50 14 a5 5 0 1 0 4 8 a4 4 0 1 1 -4 -8z" fill="#ecd09c" />
        <path d="M50 128 l1.2 3.2 3.2 1.2 -3.2 1.2 -1.2 3.2 -1.2 -3.2 -3.2 -1.2 3.2 -1.2z" fill="#ecd09c" />
        {/* 가운데 문양: 원 두 개와 팔각 별 */}
        <g transform="translate(50 74)" fill="none" stroke="#ecd09c">
          <circle r="22" strokeWidth="0.7" />
          <circle r="16" strokeWidth="0.4" strokeOpacity="0.7" />
          <path d="M0 -26 L5 -5 L26 0 L5 5 L0 26 L-5 5 L-26 0 L-5 -5 Z" strokeWidth="0.7" />
          <path d="M0 -26 L5 -5 L26 0 L5 5 L0 26 L-5 5 L-26 0 L-5 -5 Z" strokeWidth="0.7" transform="rotate(45)" />
          <circle r="4" fill="#6ee7b7" fillOpacity="0.85" stroke="none" />
        </g>
        <line x1="50" y1="32" x2="50" y2="44" stroke="#ecd09c" strokeWidth="0.5" />
        <line x1="50" y1="104" x2="50" y2="116" stroke="#ecd09c" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

export default function CardReveal({
  children,
  revealed,
  onReveal,
  className = "",
}: {
  children: ReactNode;
  /** true가 되는 순간 빛이 터지며 앞면으로 뒤집힌다 */
  revealed: boolean;
  /** 뒷면 상태에서 카드를 누르면 부른다 */
  onReveal: () => void;
  className?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<RevealFx | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const card = cardRef.current;
    if (!stage || !card || !backRef.current || !frontRef.current) return;
    // 움직임 줄이기 설정이면 빛 없이 누를 때 바로 뒤집는다
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fxRef.current = { reveal: () => (card.style.transform = "rotateY(180deg)"), stop: () => {} };
      return;
    }
    const fx = runRevealFx(backRef.current, frontRef.current, card, stage.clientWidth, stage.clientHeight);
    fxRef.current = fx;
    return () => fx.stop();
  }, []);

  useEffect(() => {
    if (revealed) fxRef.current?.reveal();
  }, [revealed]);

  return (
    <div
      ref={stageRef}
      onClick={revealed ? undefined : onReveal}
      className={`reveal-stage relative aspect-[100/148] w-[min(92vw,26rem)] ${revealed ? "" : "cursor-pointer"} ${className}`}
    >
      {/* 카드 뒤 빛(빛살·리본 뒤쪽 반·불씨) */}
      <canvas ref={backRef} className="reveal-fx z-0" aria-hidden="true" />
      <div className="reveal-lift z-10">
        <div ref={cardRef} className="reveal-card">
          <CardBack />
          <div className="reveal-face reveal-front">{children}</div>
        </div>
      </div>
      {/* 카드 앞 빛(리본 앞쪽 반·불씨·뒤집힐 때 섬광) */}
      <canvas ref={frontRef} className="reveal-fx z-20" aria-hidden="true" />
    </div>
  );
}
