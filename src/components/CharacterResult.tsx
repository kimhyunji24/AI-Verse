/**
 * 캐릭터 포토카드 (CharacterResult)
 *
 * 역할: 생성된 캐릭터를 세로 포토카드(100×148mm 비율) 모양으로 보여준다.
 * 비고: 백엔드가 포토카드(일러스트 포함 PNG)를 다 만들면 그 이미지를 그대로 보여준다.
 *       만드는 동안에는 글만 담긴 미리보기 카드를 보여주고 일러스트 자리에 진행 문구를 띄운다.
 *
 * 수정 이력:
 *   - 2026-11-03 최초 작성
 *   - 2026-11-03 포토카드 디자인으로 변경, 등장·출력 애니메이션 추가
 *   - 2026-11-03 고유 능력 표시 추가
 *   - 2026-11-03 GPT의 선택 이유(묘약 기록) 표시 추가
 *   - 2026-11-22 완성된 포토카드 이미지 표시와 일러스트 생성 중 문구 추가
 *   - 2026-11-24 그림을 기다리는 동안 카드는 이름·종족·고유 능력·성향만 크게 보여주도록 단순화 (나머지는 완성 카드에)
 *   - 2026-11-24 카드를 눌러야 앞면이 보이도록 revealed / onReveal 추가
 *   - 2026-11-24 완성 카드가 뒷면 → 빛 리본 → 뒤집기 연출(CardReveal)로 나오도록 변경
 */

import CardReveal from "@/components/CardReveal";
import {
  assetUrl,
  type Character,
  type Photocard,
} from "@/lib/characterApi";

export default function CharacterResult({
  character,
  photocard,
  drawing,
  printing,
  revealed,
  onReveal,
}: {
  character: Character;
  photocard: Photocard | null;
  drawing: boolean;
  printing: boolean;
  revealed: boolean;
  onReveal: () => void;
}) {
  const animation = printing ? "anim-card-print" : "anim-card-appear";

  if (photocard) {
    return (
      // 완성 카드는 카드 공개 영상으로 나오고, 누르면 섬광과 함께 앞면이 보인다(CardReveal). 출력할 때는 카드째 아래로 내려간다.
      <CardReveal revealed={revealed} onReveal={onReveal} className={printing ? "anim-card-print" : ""}>
        {/* 백엔드가 만든 파일을 그대로 보여준다. 크기가 고정이라 next/image 최적화가 필요 없다. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-testid="photocard"
          src={assetUrl(photocard.card_url)}
          alt={`${character.name} 포토카드`}
          className="rounded-2xl shadow-[0_0_60px_rgba(168,85,247,0.45)]"
        />
      </CardReveal>
    );
  }

  return (
    <article
      data-testid="character"
      className={`flex aspect-[100/148] w-[min(92vw,26rem)] flex-col gap-2.5 rounded-2xl border-2 border-amber-300/70 bg-gradient-to-b from-indigo-950 via-purple-950 to-black p-4 text-sm shadow-[0_0_60px_rgba(168,85,247,0.45)] ${animation}`}
    >
      <header className="text-center">
        <p className="text-base text-amber-200/90">
          {character.race} · {character.element}
        </p>
        <h2 className="font-display text-4xl text-amber-100">{character.name}</h2>
      </header>

      {/* 포토카드가 완성되면 이 카드 전체가 완성 이미지로 바뀐다 */}
      <div className="flex min-h-28 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-amber-300/30 bg-black/40 p-3 text-center text-xs leading-relaxed text-purple-100/80">
        {drawing && (
          <p role="status" className="animate-pulse text-lg text-amber-200">
            그림을 그리는 중…
          </p>
        )}
      </div>

      <div className="text-center">
        <p className="text-sm text-amber-200/90">고유 능력</p>
        <p className="font-display text-xl text-amber-100">{character.ability}</p>
        <p className="mt-2 text-base text-emerald-200">{character.disposition}</p>
      </div>
    </article>
  );
}
