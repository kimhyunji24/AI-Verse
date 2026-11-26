/**
 * 설문 단계 (SurveyStep)
 *
 * 역할: 질문을 한 번에 하나씩 보여주고, 고른 선택지를 재료로 항아리에 넣는다.
 * 비고: 질문과 선택지는 lib/characterApi.ts, 재료는 lib/ingredients.ts 에 있다.
 *       부스 입력 장치는 숫자·화살표 키보드다. 숫자 키(1~4, 숫자 패드 포함)로 바로 고르거나,
 *       화살표로 선택지를 옮기고 Enter로 고른다. 마우스로 눌러도 된다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 재료 아이콘 표시, 숫자 키 선택, 선택 시 콜백 추가
 *   - 2026-11-03 재료를 이모지 대신 아이콘으로 표시
 *   - 2026-11-24 질문을 크게(멀리서도 읽히게), 진행을 8칸 막대로, 선택지를 큰 버튼과 '재료: ~' 표기로 변경
 *   - 2026-11-26 질문·선택지 글씨를 한 단계씩 줄임
 *   - 2026-11-26 화살표로 선택지 옮기기 + Enter로 고르기, 숫자 패드 숫자 키 지원, 키 안내 문구
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { isArcadeKey } from "@/hooks/useArcadeButton";
import { type Answers, QUESTIONS } from "@/lib/characterApi";
import { ANSWER_INGREDIENTS } from "@/lib/ingredients";

export default function SurveyStep({
  onChoose,
  onComplete,
}: {
  onChoose: (value: string) => void;
  onComplete: (answers: Answers) => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<Answers>>({});
  // 화살표로 옮겨 다니는 선택지 (질문이 바뀌면 첫 번째로)
  const [focus, setFocus] = useState(0);
  const question = QUESTIONS[index];

  const choose = (value: string) => {
    onChoose(value);
    const next = { ...answers, [question.key]: value };
    setAnswers(next);
    setFocus(0);
    if (index + 1 < QUESTIONS.length) setIndex(index + 1);
    else onComplete(next as Answers);
  };

  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });

  const options = question.options;
  const focusRef = useRef(focus);
  useEffect(() => {
    focusRef.current = focus;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      // 숫자 키: 키보드 윗줄(Digit1)과 숫자 패드(Numpad1) 모두. Num Lock과 상관없이 같은 자리 키로 고른다.
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1] ?? /^[1-9]$/.exec(event.key)?.[0];
      if (digit) {
        const option = options[Number(digit) - 1];
        if (option) {
          event.preventDefault();
          chooseRef.current(option.value);
        }
        return;
      }
      // 화살표: 2열 격자 기준으로 옮긴다 (좁은 화면에서도 위아래로 한 칸씩 움직이면 충분하다)
      const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[event.key];
      if (move !== undefined) {
        event.preventDefault();
        setFocus((current) => Math.min(options.length - 1, Math.max(0, current + move)));
        return;
      }
      if (isArcadeKey(event)) {
        event.preventDefault();
        const option = options[focusRef.current];
        if (option) chooseRef.current(option.value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [options]);

  return (
    <section className="flex w-full flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5" aria-hidden>
          {QUESTIONS.map((item, step) => (
            <span
              key={item.key}
              className={`h-1.5 w-7 rounded-full ${step <= index ? "bg-amber-200" : "bg-white/20"}`}
            />
          ))}
        </div>
        <p className="text-base text-white/70">
          재료 {index + 1} / {QUESTIONS.length}
        </p>
      </div>
      <h2 className="font-display text-3xl leading-tight text-amber-50 md:text-4xl">{question.title}</h2>
      <div className="grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2">
        {options.map((option, optionIndex) => {
          const { Icon, label, color } = ANSWER_INGREDIENTS[option.value];
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => choose(option.value)}
              onMouseEnter={() => setFocus(optionIndex)}
              className={`flex items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-left transition ${
                optionIndex === focus
                  ? "border-amber-200 bg-amber-200/15 shadow-[0_0_18px_rgba(253,230,138,0.35)]"
                  : "border-white/20 bg-white/5"
              }`}
            >
              <Icon className="shrink-0 text-3xl" style={{ color }} aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="text-xl font-bold">
                  {optionIndex + 1}. {option.label}
                </span>
                <span className="text-sm text-emerald-200">재료: {label}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-center text-sm text-white/60">숫자 키로 바로 고르거나, 화살표로 옮긴 뒤 Enter</p>
    </section>
  );
}
