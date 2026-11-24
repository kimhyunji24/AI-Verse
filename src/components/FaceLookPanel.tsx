/**
 * AI 얼굴 분석 패널 (FaceLookPanel)
 *
 * 역할: 얼굴 세부 수치(눈매·눈 크기·코·광대·턱선·입술)와 닮은 동물상 상위 4개를 막대로 보여 준다.
 *       막대는 처음에 0에서 차오르며 "분석 중" 느낌을 낸다.
 * 비고: 값 계산은 lib/faceLook.ts. 이 컴포넌트는 보여 주기만 한다.
 *
 * 수정 이력:
 *   - 2026-11-24 최초 작성
 */

"use client";

import { useEffect, useState } from "react";
import { describeDetails, type FaceLook } from "@/lib/faceLook";

export default function FaceLookPanel({ look }: { look: FaceLook }) {
  // 처음 그릴 때는 0으로 두었다가 다음 프레임에 실제 값으로 바꿔 막대가 차오르게 한다
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const details = describeDetails(look);
  const top = look.animals.slice(0, 4);

  return (
    <section
      aria-label="AI 얼굴 분석"
      className="mt-4 rounded-2xl border border-amber-200/25 bg-black/45 p-4 text-sm shadow-[0_0_30px_rgba(168,85,247,0.25)] backdrop-blur"
    >
      <h3 className="mb-3 flex items-center justify-between text-amber-100">
        <span className="font-display text-lg">AI 얼굴 분석</span>
        <span className="text-xs text-purple-200/70">얼굴 점 468개 · 세부 수치 14개</span>
      </h3>

      <ul className="flex flex-col gap-2">
        {top.map(({ animal, percent }, index) => (
          <li key={animal.key} className="flex items-center gap-2">
            <animal.Icon className="shrink-0 text-xl" style={{ color: animal.color }} aria-hidden />
            <span className={`w-16 shrink-0 ${index === 0 ? "font-semibold text-amber-100" : "text-zinc-200"}`}>
              {animal.label}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full transition-[width] duration-1000 ease-out"
                style={{
                  width: shown ? `${percent}%` : "0%",
                  background: animal.color,
                  transitionDelay: `${index * 150}ms`,
                }}
              />
            </div>
            <span className="w-10 shrink-0 text-right tabular-nums text-amber-100">{percent}%</span>
          </li>
        ))}
      </ul>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-white/10 pt-3 text-xs">
        {details.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-2">
            <dt className="text-purple-200/80">{item.label}</dt>
            <dd className="text-right text-zinc-100">
              {item.value} <span className="text-amber-200/80">{item.note}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
