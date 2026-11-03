/**
 * 메인 페이지 (/)
 *
 * 역할: 부스 체험 시작 화면. 이후 웹캠/랜드마크/결과 화면 흐름의 진입점이 된다
 *
 * 수정 이력:
 *   - 2026-11-03 헤더 주석 추가 (create-next-app 기본 코드)
 *   - 2026-11-03 front/ 폴더를 브랜치 루트로 이동
 *   - 2026-11-03 기본 템플릿을 제거하고 웹캠 화면(WebcamView) 표시로 교체
 *   - 2026-11-03 웹캠 화면을 체험 흐름(ObservatoryFlow)으로 교체
 *   - 2026-11-03 마녀 항아리 콘셉트 배경과 제목으로 변경
 *   - 2026-11-03 부스 이름을 "이게 나라고?"로 변경, 부제 추가
 */

import ObservatoryFlow from "@/components/ObservatoryFlow";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-[radial-gradient(ellipse_at_50%_75%,#14342b_0%,#1a0f2e_45%,#07050d_100%)] p-6 text-zinc-100">
      <header className="text-center">
        <h1 className="font-display text-4xl text-amber-100">이게 나라고?</h1>
        <p className="mt-1 text-sm text-purple-200/80">
          AI 마녀가 끓여 주는 내 부캐 포토카드
        </p>
      </header>
      <ObservatoryFlow />
    </main>
  );
}
