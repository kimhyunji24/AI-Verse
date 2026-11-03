/**
 * 설문 단계 (SurveyStep)
 *
 * 역할: 질문을 한 번에 하나씩 보여주고, 고른 선택지를 재료로 항아리에 넣는다.
 * 비고: 질문과 선택지는 lib/characterApi.ts, 재료는 lib/ingredients.ts 에 있다.
 *       부스 입력 장치가 키보드이므로 숫자 키(1~4)로도 고를 수 있다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 재료 아이콘 표시, 숫자 키 선택, 선택 시 콜백 추가
 */

"use client";

import { useEffect, useRef, useState } from "react";
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
  const question = QUESTIONS[index];

  const choose = (value: string) => {
    onChoose(value);
    const next = { ...answers, [question.key]: value };
    setAnswers(next);
    if (index + 1 < QUESTIONS.length) setIndex(index + 1);
    else onComplete(next as Answers);
  };

  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });

  const options = question.options;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const option = options[Number(event.key) - 1];
      if (option && !event.repeat) chooseRef.current(option.value);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [options]);

  return (
    <section className="flex w-full flex-col items-center gap-5">
      <p className="text-sm text-emerald-300/80">
        재료 {index + 1} / {QUESTIONS.length}
      </p>
      <h2 className="font-display text-center text-2xl">{question.title}</h2>
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((option, optionIndex) => {
          const [icon, ingredient] = ANSWER_INGREDIENTS[option.value];
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => choose(option.value)}
              className="flex flex-col items-center gap-1 rounded-2xl border border-purple-400/40 bg-purple-950/50 px-4 py-4 transition hover:border-emerald-300 hover:bg-purple-900/60"
            >
              <span className="text-3xl">{icon}</span>
              <span className="font-medium">
                {optionIndex + 1}. {option.label}
              </span>
              <span className="text-xs text-purple-200/70">{ingredient}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
