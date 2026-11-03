/**
 * 캐릭터 포토카드 (CharacterResult)
 *
 * 역할: 생성된 캐릭터를 세로 포토카드(100×148mm 비율) 모양으로 보여준다.
 * 비고: 일러스트 자리는 아직 비어 있다. 실제 출력용 이미지는 백엔드에서 합성할 예정이며 이 화면은 미리보기다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 포토카드 디자인으로 변경, 등장·출력 애니메이션 추가
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
  printing,
}: {
  character: Character;
  printing: boolean;
}) {
  return (
    <article
      data-testid="character"
      className={`flex aspect-[100/148] w-[min(92vw,26rem)] flex-col gap-2.5 rounded-2xl border-2 border-amber-300/70 bg-gradient-to-b from-indigo-950 via-purple-950 to-black p-4 text-sm shadow-[0_0_60px_rgba(168,85,247,0.45)] ${
        printing ? "anim-card-print" : "anim-card-appear"
      }`}
    >
      <header className="text-center">
        <p className="text-xs text-amber-200/90">
          {character.race} · {character.element}
        </p>
        <h2 className="font-display text-2xl text-amber-100">{character.name}</h2>
      </header>

      {/* 일러스트 생성 기능이 붙으면 이미지로 교체한다 */}
      <div className="flex min-h-28 flex-1 items-center justify-center rounded-lg border border-amber-300/30 bg-black/40 p-3 text-center text-xs leading-relaxed text-purple-100/80">
        {character.appearance}
      </div>

      <p className="text-center text-xs text-emerald-200">{character.disposition}</p>

      <dl className="grid grid-cols-3 gap-x-3 gap-y-1">
        {(Object.keys(STAT_LABELS) as (keyof Stats)[]).map((stat) => (
          <div key={stat} className="flex justify-between text-xs">
            <dt className="text-purple-200/70">{STAT_LABELS[stat]}</dt>
            <dd className="font-mono text-amber-100">{character.stats[stat]}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs leading-relaxed">{character.backstory}</p>
      <p className="text-xs">
        <span className="text-amber-200/90">럭키 아이템</span> {character.lucky_item}
      </p>
      <p className="border-l-2 border-amber-300/70 pl-2 text-xs leading-relaxed">
        <span className="text-amber-200/90">2027년 메시지</span> {character.message_2027}
      </p>
    </article>
  );
}
