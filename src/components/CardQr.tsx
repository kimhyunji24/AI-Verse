"use client";

/**
 * 카드 저장 QR (CardQr)
 *
 * 역할: 완성된 카드를 공유 저장소에 올리고(/api/share) 그 주소를 QR로 보여 준다.
 *       참가자가 폰 카메라로 찍으면 카드 이미지가 열리고, 길게 눌러 사진에 저장한다.
 * 비고: 올리는 데 실패하면 이유를 짧게 보여 준다(부스 운영자가 볼 수 있게).
 *
 * 수정 이력:
 *   - 2026-11-27 최초 작성
 */

import QRCode from "qrcode";
import { useEffect, useState } from "react";

type State = { status: "loading" } | { status: "ready"; qr: string } | { status: "failed"; message: string };

export default function CardQr({ cardUrl }: { cardUrl: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_url: cardUrl }),
      });
      const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error ?? `HTTP ${response.status}`);
      // 어두운 부스 화면에서도 잘 찍히게 흰 바탕에 검은 점, 가장자리 여백을 둔다
      const qr = await QRCode.toDataURL(body.url, { width: 480, margin: 2, errorCorrectionLevel: "M" });
      if (!cancelled) setState({ status: "ready", qr });
    })().catch((error: Error) => {
      console.warn("카드 QR 만들기 실패", error);
      if (!cancelled) setState({ status: "failed", message: error.message });
    });
    return () => {
      cancelled = true;
    };
  }, [cardUrl]);

  return (
    <div className="flex flex-col items-center gap-3" role="status">
      <div className="flex size-48 items-center justify-center rounded-2xl bg-white p-2 shadow-[0_0_40px_rgba(251,191,36,0.35)]">
        {state.status === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.qr} alt="카드 저장 QR 코드" className="size-full" />
        ) : (
          <p className="text-center text-sm text-zinc-600">
            {state.status === "loading" ? "QR을 만들고 있어요…" : "QR을 만들지 못했어요"}
          </p>
        )}
      </div>
      <p className="text-center text-lg text-amber-100">
        {state.status === "failed"
          ? state.message
          : "폰 카메라로 QR을 찍고, 열린 카드를 길게 눌러 저장하세요"}
      </p>
    </div>
  );
}
