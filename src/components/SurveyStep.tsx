/**
 * 설문 단계 (SurveyStep)
 *
 * 역할: 캐릭터 생성에 쓰는 간단한 질문을 한 번에 하나씩 보여주고 응답을 모은다.
 * 비고: 질문과 선택지는 lib/characterApi.ts 의 QUESTIONS 에 있다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 */

"use client";

import { useState } from "react";
import { type Answers, QUESTIONS } from "@/lib/characterApi";

export default function SurveyStep({
  onComplete,
}: {
  onComplete: (answers: Answers) => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<Answers>>({});
  const question = QUESTIONS[index];

  const choose = (value: string) => {
    const next = { ...answers, [question.key]: value };
    setAnswers(next);
    if (index + 1 < QUESTIONS.length) setIndex(index + 1);
    else onComplete(next as Answers);
  };

  return (
    <section className="flex w-full flex-col items-center gap-5">
      <p className="text-sm text-zinc-400">
        질문 {index + 1} / {QUESTIONS.length}
      </p>
      <h2 className="text-center text-xl font-medium">{question.title}</h2>
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {question.options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => choose(option.value)}
            className="rounded-xl border border-zinc-600 px-4 py-4 hover:border-teal-300 hover:text-teal-200"
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
