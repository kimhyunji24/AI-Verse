/**
 * 끓는 중 진행 표시 (BrewingProgress)
 *
 * 역할: 캐릭터를 만드는 동안 솥이 끓는 과정을 단계(재료 넣기 → 휘휘 젓기 → 이름 짓는 중 → 모습 그리기)로 보여준다.
 * 비고: 얼굴 측정값은 화면에 보여주지 않는다 (사진·수치를 저장하지 않는다는 안내와 맞추고, 디버그 화면처럼 보이지 않게).
 *       실제 진행률을 알 수 없으므로 일정 시간마다 다음 단계로 넘기고, 마지막 단계에서 멈춰 기다린다.
 *       예전 터미널형 로딩(TerminalLoading)을 대신한다.
 *
 * 수정 이력:
 *   - 2026-11-24 최초 작성
 */

"use client";

import { useEffect, useState } from "react";
import type { Ingredient } from "@/lib/ingredients";

const STEPS = ["재료 넣기", "휘휘 젓기", "이름 짓는 중", "모습 그리기"];
const STEP_INTERVAL_MS = 2600;

export default function BrewingProgress({ ingredients }: { ingredients: Ingredient[] }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setCurrent((step) => Math.min(step + 1, STEPS.length - 1)),
      STEP_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, []);

  // 설문에서 고른 재료 이름 몇 개만 보여준다 (얼굴 재료는 빼고)
  const picked = ingredients
    .filter((item) => item.key.startsWith("answer:"))
    .slice(-3)
    .map((item) => item.label);

  return (
    <div className="flex w-full flex-col items-center gap-5 text-center" role="status">
      <h2 className="font-display text-4xl text-amber-100 md:text-5xl">
        솥 안에서 무언가 깨어나는 중…
      </h2>
      <ol className="flex flex-wrap justify-center gap-2.5">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === current ? "step" : undefined}
            className={
              index < current
                ? "flex items-center gap-2 rounded-full bg-emerald-400/15 px-4 py-2 text-lg font-medium text-emerald-200"
                : index === current
                  ? "rounded-full bg-amber-200 px-4 py-2 text-lg font-bold text-purple-950"
                  : "rounded-full border border-white/25 px-4 py-2 text-lg text-white/60"
            }
          >
            {index < current && (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {label}
          </li>
        ))}
      </ol>
      {picked.length > 0 && (
        <p className="text-base text-white/65">
          {picked.join(", ")}… 고른 재료가 모두 들어갔어요
        </p>
      )}
    </div>
  );
}
