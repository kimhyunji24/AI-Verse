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
 */

import ObservatoryFlow from "@/components/ObservatoryFlow";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-[radial-gradient(ellipse_at_50%_75%,#14342b_0%,#1a0f2e_45%,#07050d_100%)] p-6 text-zinc-100">
      <h1 className="font-display text-3xl text-amber-100">심연의 관측소</h1>
      <ObservatoryFlow />
    </main>
  );
}
