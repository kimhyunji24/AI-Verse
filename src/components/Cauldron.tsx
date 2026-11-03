/**
 * 마녀 항아리 (Cauldron)
 *
 * 역할: 불 위의 항아리와 연기를 그린다. 들어온 재료가 위에서 떨어져 빠지고, 상태에 따라 끓는 정도가 달라진다.
 * 비고: 이미지 파일 없이 SVG와 CSS 애니메이션(globals.css)으로 만들었다.
 *       mood: idle 잔잔함, charging 버튼을 누르는 중, boiling 생성 중
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 */

import type { CSSProperties } from "react";
import type { Ingredient } from "@/lib/ingredients";

export type CauldronMood = "idle" | "charging" | "boiling";

const SMOKE = [
  { left: "42%", drift: "-40px", delay: "0s", color: "#34d399" },
  { left: "50%", drift: "30px", delay: "0.7s", color: "#a855f7" },
  { left: "57%", drift: "60px", delay: "1.4s", color: "#34d399" },
  { left: "46%", drift: "-70px", delay: "2.1s", color: "#c084fc" },
  { left: "53%", drift: "10px", delay: "2.8s", color: "#6ee7b7" },
  { left: "49%", drift: "-15px", delay: "3.4s", color: "#a855f7" },
];

const BUBBLES = [
  { cx: 150, cy: 168, r: 7, delay: "0s" },
  { cx: 190, cy: 172, r: 10, delay: "0.4s" },
  { cx: 235, cy: 166, r: 6, delay: "0.8s" },
  { cx: 260, cy: 172, r: 8, delay: "1.1s" },
  { cx: 120, cy: 172, r: 5, delay: "0.6s" },
];

export default function Cauldron({
  mood,
  ingredients,
}: {
  mood: CauldronMood;
  ingredients: Ingredient[];
}) {
  const active = mood !== "idle";
  const smokeSpeed = mood === "boiling" ? "2s" : mood === "charging" ? "2.8s" : "4.5s";

  return (
    <div className="relative mx-auto aspect-square w-full max-w-md" aria-hidden>
      {/* 연기 */}
      {SMOKE.slice(0, mood === "idle" ? 3 : SMOKE.length).map((smoke) => (
        <span
          key={smoke.delay}
          className="anim-smoke absolute top-[38%] h-24 w-24 rounded-full blur-2xl"
          style={
            {
              left: smoke.left,
              background: smoke.color,
              animationDelay: smoke.delay,
              "--drift": smoke.drift,
              "--smoke-speed": smokeSpeed,
            } as CSSProperties
          }
        />
      ))}

      {/* 재료: 새 재료가 추가될 때마다 그 재료만 애니메이션이 재생된다 */}
      {ingredients.map((ingredient, index) => (
        <span
          key={ingredient.key}
          className="anim-drop absolute top-[38%] left-1/2 text-5xl"
          style={{ animationDelay: `${(index % 3) * 0.05}s` }}
        >
          {ingredient.icon}
        </span>
      ))}

      <svg
        viewBox="0 0 400 400"
        className={`relative h-full w-full ${active ? "anim-shake" : ""}`}
      >
        <defs>
          <radialGradient id="pot" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#3f3f46" />
            <stop offset="55%" stopColor="#18181b" />
            <stop offset="100%" stopColor="#050505" />
          </radialGradient>
          <radialGradient id="brew" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor={mood === "boiling" ? "#d8b4fe" : "#a7f3d0"} />
            <stop offset="100%" stopColor={mood === "boiling" ? "#7e22ce" : "#059669"} />
          </radialGradient>
          <filter id="glow" x="-40%" y="-80%" width="180%" height="260%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>

        {/* 불 */}
        <g>
          <path className="anim-flame" d="M130 395 Q118 350 150 322 Q152 352 172 340 Q182 368 170 395Z" fill="#f97316" />
          <path className="anim-flame" style={{ animationDelay: "0.15s" }} d="M175 395 Q160 335 202 298 Q206 340 232 330 Q244 366 226 395Z" fill="#fb923c" />
          <path className="anim-flame" style={{ animationDelay: "0.3s" }} d="M232 395 Q224 352 256 326 Q260 354 276 346 Q282 372 270 395Z" fill="#f97316" />
          <path className="anim-flame" style={{ animationDelay: "0.08s" }} d="M185 395 Q178 356 204 334 Q212 362 222 395Z" fill="#fde047" />
          <rect x="105" y="384" width="190" height="14" rx="7" fill="#451a03" transform="rotate(-5 200 390)" />
          <rect x="105" y="384" width="190" height="14" rx="7" fill="#78350f" transform="rotate(5 200 390)" />
        </g>

        {/* 항아리 */}
        <path d="M58 200 q-30 -8 -30 22 q0 22 28 20" fill="none" stroke="#27272a" strokeWidth="11" />
        <path d="M342 200 q30 -8 30 22 q0 22 -28 20" fill="none" stroke="#27272a" strokeWidth="11" />
        <path d="M62 178 Q30 330 130 350 L270 350 Q370 330 338 178 Z" fill="url(#pot)" />

        {/* 물약 빛 */}
        <ellipse cx="200" cy="172" rx="140" ry="24" fill={mood === "boiling" ? "#a855f7" : "#34d399"} filter="url(#glow)" opacity={active ? 1 : 0.7} />
        <ellipse cx="200" cy="172" rx="146" ry="27" fill="#27272a" />
        <ellipse cx="200" cy="172" rx="130" ry="20" fill="url(#brew)" />
        {BUBBLES.map((bubble) => (
          <circle
            key={bubble.cx}
            className="anim-bubble"
            cx={bubble.cx}
            cy={bubble.cy}
            r={bubble.r}
            fill={mood === "boiling" ? "#e9d5ff" : "#d1fae5"}
            style={{
              animationDelay: bubble.delay,
              animationDuration: mood === "idle" ? "2.4s" : "0.9s",
            }}
          />
        ))}
      </svg>
    </div>
  );
}
