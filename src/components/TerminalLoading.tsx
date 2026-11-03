/**
 * 터미널형 로딩 화면 (TerminalLoading)
 *
 * 역할: 캐릭터를 생성하는 동안 실제 측정값을 터미널 로그처럼 한 줄씩 보여줘 대기 시간을 체험 요소로 만든다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 마녀 항아리 화면에 맞춰 크기와 색, 문구 변경
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
      "> 묘약 제조 시작",
      ...Object.entries(features).map(
        ([key, value]) => `> ${key} = ${value.toFixed(3)}`,
      ),
      "> 측정값과 재료를 파라미터로 변환 중",
      "> 항아리 속에서 존재가 깨어나는 중",
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
      className="h-44 w-full overflow-hidden rounded-xl border border-emerald-400/30 bg-black/70 p-3 font-mono text-xs whitespace-pre-wrap text-emerald-300"
    >
      {lines.slice(Math.max(0, visible - 9), visible).join("\n")}
      <span className="animate-pulse"> █</span>
    </pre>
  );
}
