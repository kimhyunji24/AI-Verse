"use client";

/**
 * 카드 등장 연출 (CardReveal)
 *
 * 역할: 완성된 포토카드를 바로 띄우지 않고, 화면 전체에서 카드 뒷면이 떠올라 빛 리본에 감기는 연출을 실시간으로 보여 준다.
 *       누를 때까지 나선 리본과 빛살이 계속 돌며 기다리고, 누르면 빛이 터지며 카드가 뒤집혀 앞면(완성 카드)이 나온 뒤
 *       연출 화면이 걷히고 제자리에 카드가 남는다.
 * 비고: 빛 효과와 카드 뒤집기는 lib/revealFx.ts가 캔버스에 직접 그린다(영상 파일 없음).
 *       카드 뒷면 문양은 코드로 직접 그린 오리지널이다.
 *       움직임 줄이기 설정을 켠 사용자에게는 빛 없이 뒷면을 보여 주고, 누르면 바로 앞면을 보여 준다.
 *
 * 수정 이력:
 *   - 2026-11-24 최초 작성
 *   - 2026-11-24 카드를 눌러야 뒤집히도록 변경 (revealed / onReveal)
 *   - 2026-11-24 레퍼런스 영상처럼 나선 리본·불씨·빛살로 다시 만듦 (캔버스로 그림, 카드는 살짝 흔들리다 뒤집힘)
 *   - 2026-11-26 캔버스 연출 대신 카드 공개 영상을 그대로 틀고, 누르면 섬광과 함께 앞면으로 바뀌도록 변경
 *   - 2026-11-26 영상을 카드 자리 대신 화면 전체에 틀도록 변경
 *   - 2026-11-26 영상 대신 화면 전체 실시간 연출로 교체 (영상처럼 보이지 않게, 누르는 순간에 반응)
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { REVEAL_DONE_MS, runRevealFx, type RevealFx } from "@/lib/revealFx";

// 앞면이 나온 뒤 연출 화면이 걷히는 시간 (globals.css의 reveal-overlay-out과 맞춘다)
const OVERLAY_OUT_MS = 600;

function CardBack() {
  const gold = "#e0bb72";
  return (
    <div className="reveal-face reveal-back" aria-hidden="true">
      <svg viewBox="0 0 100 148" className="h-full w-full">
        <defs>
          <radialGradient id="reveal-back-bg" cx="50%" cy="48%" r="72%">
            <stop offset="0%" stopColor="#262447" />
            <stop offset="55%" stopColor="#12111f" />
            <stop offset="100%" stopColor="#07060c" />
          </radialGradient>
          <radialGradient id="reveal-back-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff3d6" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff3d6" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100" height="148" rx="6" fill="url(#reveal-back-bg)" />
        {/* 이중 테두리와 네 귀퉁이 장식 */}
        <rect x="3.5" y="3.5" width="93" height="141" rx="4" fill="none" stroke={gold} strokeWidth="0.9" />
        <rect x="6.5" y="6.5" width="87" height="135" rx="2.5" fill="none" stroke={gold} strokeOpacity="0.55" strokeWidth="0.4" />
        {[
          [6.5, 6.5, 1, 1],
          [93.5, 6.5, -1, 1],
          [6.5, 141.5, 1, -1],
          [93.5, 141.5, -1, -1],
        ].map(([x, y, sx, sy]) => (
          <path
            key={`${x}-${y}`}
            d={`M${x} ${y + sy * 12} q${sx * 2} ${-sy * 8} ${sx * 10} ${-sy * 10} M${x + sx * 3} ${y + sy * 3} l${sx * 4} ${sy * 4}`}
            fill="none"
            stroke={gold}
            strokeWidth="0.6"
          />
        ))}
        {/* 위아래 동그란 문장 */}
        {[16, 132].map((cy) => (
          <g key={cy}>
            <circle cx="50" cy={cy} r="5" fill="#0b0a14" stroke={gold} strokeWidth="0.7" />
            <path d={`M47.5 ${cy + 1.8} L50 ${cy - 2.2} L52.5 ${cy + 1.8}`} fill="none" stroke={gold} strokeWidth="0.6" />
          </g>
        ))}
        {/* 가운데 문양에서 퍼지는 가는 빛 */}
        <g stroke={gold} strokeOpacity="0.25" strokeWidth="0.25">
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            return <line key={i} x1={50 + Math.cos(a) * 14} y1={74 + Math.sin(a) * 14} x2={50 + Math.cos(a) * 34} y2={74 + Math.sin(a) * 34} />;
          })}
        </g>
        <circle cx="50" cy="74" r="26" fill="url(#reveal-back-glow)" opacity="0.35" />
        {/* 세로 축: 위 십자, 아래 원과 십자 */}
        <g fill="none" stroke={gold} strokeWidth="0.6">
          <line x1="50" y1="26" x2="50" y2="48" />
          <line x1="46" y1="31" x2="54" y2="31" />
          <line x1="50" y1="100" x2="50" y2="118" />
          <circle cx="50" cy="112" r="3.2" />
          <line x1="46" y1="112" x2="54" y2="112" />
        </g>
        {/* 가운데 문양: 팔각 별 + 기울인 사각형 + 동심원 */}
        <g transform="translate(50 74)" fill="none" stroke={gold}>
          <path d="M0 -24 L5.5 -5.5 L24 0 L5.5 5.5 L0 24 L-5.5 5.5 L-24 0 L-5.5 -5.5 Z" strokeWidth="0.8" />
          <path d="M0 -17 L4 -4 L17 0 L4 4 L0 17 L-4 4 L-17 0 L-4 -4 Z" strokeWidth="0.5" transform="rotate(45)" />
          <rect x="-9" y="-9" width="18" height="18" strokeWidth="0.6" />
          <rect x="-9" y="-9" width="18" height="18" strokeWidth="0.6" transform="rotate(45)" />
          <circle r="7" strokeWidth="0.5" />
          <circle r="3" strokeWidth="0.5" />
          <circle r="1.2" fill="#fff3d6" stroke="none" />
        </g>
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
  /** true가 되는 순간 빛이 터지며 카드가 뒤집혀 앞면이 나온다 */
  revealed: boolean;
  /** 연출 화면이 떠 있는 동안 누르면 부른다 */
  onReveal: () => void;
  className?: string;
}) {
  // 카드가 나온 뒤에야 그려지는 화면이라(서버 렌더링 없음) 처음부터 브라우저 설정을 읽는다
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  // closing: 앞면이 나온 뒤 연출 화면이 걷히는 중 / gone: 다 걷힘
  const [overlay, setOverlay] = useState<"open" | "closing" | "gone">("open");
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<RevealFx | null>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !backRef.current || !frontRef.current) return;
    if (reducedMotion) {
      fxRef.current = { reveal: () => (card.style.transform = "rotateY(180deg)"), stop: () => {} };
      return;
    }
    const fx = runRevealFx(backRef.current, frontRef.current, card, () => ({
      w: card.offsetWidth,
      h: card.offsetHeight,
    }));
    fxRef.current = fx;
    return () => fx.stop();
  }, [reducedMotion]);

  useEffect(() => {
    if (!revealed) return;
    fxRef.current?.reveal();
    const done = reducedMotion ? 0 : REVEAL_DONE_MS;
    const closing = setTimeout(() => setOverlay("closing"), done);
    const gone = setTimeout(() => setOverlay("gone"), done + (reducedMotion ? 0 : OVERLAY_OUT_MS));
    return () => {
      clearTimeout(closing);
      clearTimeout(gone);
    };
  }, [revealed, reducedMotion]);

  return (
    <>
      {/* 연출이 끝나면 이 자리에 카드 앞면이 남는다 */}
      <div className={`relative aspect-[100/148] w-[min(92vw,26rem)] ${className}`}>
        {overlay !== "open" && <div className="reveal-settled">{children}</div>}
      </div>
      {overlay !== "gone" &&
        createPortal(
          <div
            onClick={revealed ? undefined : onReveal}
            data-closing={overlay === "closing" || undefined}
            className={`reveal-overlay ${revealed ? "" : "cursor-pointer"}`}
            aria-hidden="true"
          >
            <canvas ref={backRef} className="reveal-fx" />
            <div className="reveal-overlay-card">
              <div ref={cardRef} className="reveal-card">
                <CardBack />
                <div className="reveal-face reveal-front">{children}</div>
              </div>
            </div>
            <canvas ref={frontRef} className="reveal-fx" />
            {!revealed && <p className="reveal-hint">카드를 눌러 공개하세요</p>}
          </div>,
          document.body,
        )}
    </>
  );
}
