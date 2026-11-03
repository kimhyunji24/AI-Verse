/**
 * 캐릭터 결과 화면 (CharacterResult)
 *
 * 역할: 생성된 캐릭터의 이름, 종족, 속성, 성향, 능력치, 설정, 럭키 아이템, 2027년 메시지를 보여준다.
 * 비고: 일러스트와 포토카드 출력은 별도 브랜치에서 추가한다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 */

import type { Character, Stats } from "@/lib/characterApi";

const STAT_LABELS: Record<keyof Stats, string> = {
  insight: "통찰",
  vitality: "생명력",
  resonance: "공명",
  agility: "민첩",
  willpower: "의지",
  luck: "행운",
};

export default function CharacterResult({
  character,
  onRestart,
}: {
  character: Character;
  onRestart: () => void;
}) {
  return (
    <article
      data-testid="character"
      className="flex w-full flex-col gap-5 rounded-xl border border-zinc-700 p-6"
    >
      <header>
        <p className="text-sm text-teal-300">
          {character.race} · {character.element}
        </p>
        <h2 className="text-3xl font-semibold">{character.name}</h2>
        <p className="mt-1 text-zinc-300">{character.disposition}</p>
      </header>

      <p>{character.appearance}</p>

      <dl className="flex flex-col gap-2">
        {(Object.keys(STAT_LABELS) as (keyof Stats)[]).map((stat) => (
          <div key={stat} className="flex items-center gap-3">
            <dt className="w-14 shrink-0 text-sm text-zinc-400">
              {STAT_LABELS[stat]}
            </dt>
            <div className="h-2 flex-1 rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-teal-300"
                style={{ width: `${character.stats[stat]}%` }}
              />
            </div>
            <dd className="w-8 text-right font-mono text-sm">
              {character.stats[stat]}
            </dd>
          </div>
        ))}
      </dl>

      <p className="leading-relaxed">{character.backstory}</p>
      <p>
        <span className="text-zinc-400">럭키 아이템</span> {character.lucky_item}
      </p>
      <blockquote className="border-l-2 border-teal-300 pl-3">
        <p className="text-sm text-zinc-400">2027년 메시지</p>
        {character.message_2027}
      </blockquote>

      <button
        type="button"
        onClick={onRestart}
        className="self-center rounded-full bg-white px-6 py-2 font-medium text-black"
      >
        처음으로
      </button>
    </article>
  );
}
