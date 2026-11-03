/**
 * 터미널형 로딩 화면 (TerminalLoading)
 *
 * 역할: 캐릭터를 생성하는 동안 실제 측정값을 터미널 로그처럼 한 줄씩 보여줘 대기 시간을 체험 요소로 만든다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import type { FaceFeatures } from "@/lib/faceFeatures";

const LINE_INTERVAL_MS = 700;

export default function TerminalLoading({
  features,
}: {
  features: FaceFeatures;
}) {
  const lines = useMemo(
    () => [
      "> 심연의 관측소 시스템 접속",
      ...Object.entries(features).map(
        ([key, value]) => `> ${key} = ${value.toFixed(3)}`,
      ),
      "> 관측 데이터를 파라미터로 변환 중",
      "> 심연에서 존재의 기록을 찾는 중",
    ],
    [features],
  );
  const [visible, setVisible] = useState(1);

  useEffect(() => {
    const timer = setInterval(
      () => setVisible((count) => Math.min(count + 1, lines.length)),
      LINE_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [lines.length]);

  return (
    <pre
      role="status"
      className="min-h-64 w-full overflow-hidden rounded-xl bg-zinc-950 p-4 font-mono text-sm whitespace-pre-wrap text-teal-300"
    >
      {lines.slice(0, visible).join("\n")}
      <span className="animate-pulse"> █</span>
    </pre>
  );
}
