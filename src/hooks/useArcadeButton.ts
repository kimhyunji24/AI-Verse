/**
 * 아케이드 버튼 입력 훅 (useArcadeButton)
 *
 * 역할: 부스 버튼 입력을 받는다. 실제 장비는 블루투스 키보드이며 Space, Enter 를 버튼으로 쓴다.
 * 비고: 항상 최신 콜백을 호출하도록 ref에 담아, 화면이 바뀌는 순간의 입력도 놓치지 않는다.
 *       키를 누르고 있을 때 반복 입력은 무시하므로 "꾹 누르기"에도 쓸 수 있다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 */

"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const isArcadeKey = (event: KeyboardEvent) =>
  event.code === "Space" || event.code === "Enter";

export function useArcadeButton(handlers: {
  onPress: () => void;
  onRelease?: () => void;
}) {
  const handlersRef = useRef(handlers);

  // 화면에 "준비 완료"가 보이는 시점에 이미 최신 콜백이 되도록 그리기 전에 갱신한다
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isArcadeKey(event)) return;
      event.preventDefault();
      if (!event.repeat) handlersRef.current.onPress();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (isArcadeKey(event)) handlersRef.current.onRelease?.();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}
