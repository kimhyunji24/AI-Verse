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
 *   - 2026-11-03 재료를 이모지 대신 아이콘으로 표시
 *   - 2026-11-24 질문을 크게(멀리서도 읽히게), 진행을 8칸 막대로, 선택지를 큰 버튼과 '재료: ~' 표기로 변경
 *   - 2026-11-26 질문·선택지 글씨를 한 단계씩 줄임
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
              className="flex items-center gap-3 rounded-2xl border-[1.5px] border-white/20 bg-white/5 px-4 py-3 text-left transition hover:border-amber-200 hover:bg-amber-200/10"
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
    </section>
  );
}
