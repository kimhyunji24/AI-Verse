"use client";

/**
 * 카드 등장 연출 (CardReveal)
 *
 * 역할: 완성된 포토카드를 바로 띄우지 않고, 카드 공개 영상(카드 뒷면을 빛 리본이 감아 돌다 빛살이 터짐)을 튼다.
 *       영상은 마지막 장면(빛살 속 카드 뒷면)에서 멈춰 기다리고, 카드를 누르면 빛이 번쩍하며 앞면(완성 카드)으로 바뀐다.
 *       영상이 끝나기 전에 눌러도 바로 앞면으로 넘어간다.
 * 비고: 영상은 public/reveal/card-reveal.mp4 (696×1032, 6초, 소리 없음). 카드 비율(100:148)과 거의 같아 꽉 채운다.
 *       움직임 줄이기 설정을 켠 사용자에게는 영상 대신 마지막 장면 사진(card-reveal-end.jpg)을 보여준다.
 *
 * 수정 이력:
 *   - 2026-11-24 최초 작성
 *   - 2026-11-24 카드를 눌러야 뒤집히도록 변경 (revealed / onReveal)
 *   - 2026-11-24 레퍼런스 영상처럼 나선 리본·불씨·빛살로 다시 만듦 (캔버스로 그림, 카드는 살짝 흔들리다 뒤집힘)
 *   - 2026-11-26 캔버스 연출 대신 카드 공개 영상을 그대로 틀고, 누르면 섬광과 함께 앞면으로 바뀌도록 변경
 */

import { useState, type ReactNode } from "react";

const VIDEO = "/reveal/card-reveal.mp4";
const END_FRAME = "/reveal/card-reveal-end.jpg";

export default function CardReveal({
  children,
  revealed,
  onReveal,
  className = "",
}: {
  children: ReactNode;
  /** true가 되는 순간 빛이 번쩍하며 앞면으로 바뀐다 */
  revealed: boolean;
  /** 뒷면 상태에서 카드를 누르면 부른다 */
  onReveal: () => void;
  className?: string;
}) {
  // 카드가 나온 뒤에야 그려지는 화면이라(서버 렌더링 없음) 처음부터 브라우저 설정을 읽는다
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  return (
    <div
      onClick={revealed ? undefined : onReveal}
      data-revealed={revealed || undefined}
      className={`reveal-stage relative aspect-[100/148] w-[min(92vw,26rem)] ${revealed ? "" : "cursor-pointer"} ${className}`}
    >
      <div className="reveal-back" aria-hidden="true">
        {reducedMotion ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={END_FRAME} alt="" />
        ) : (
          // 끝나면 마지막 장면에서 멈춰 있다
          <video src={VIDEO} autoPlay muted playsInline preload="auto" />
        )}
      </div>
      {revealed && (
        <>
          <div className="reveal-front">{children}</div>
          <div className="reveal-flash" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
