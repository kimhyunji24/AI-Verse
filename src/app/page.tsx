/**
 * 메인 페이지 (/)
 *
 * 역할: 부스 체험 시작 화면. 이후 웹캠/랜드마크/결과 화면 흐름의 진입점이 된다
 *
 * 수정 이력:
 *   - 2026-11-03 헤더 주석 추가 (create-next-app 기본 코드)
 *   - 2026-11-03 front/ 폴더를 브랜치 루트로 이동
 *   - 2026-11-03 기본 템플릿을 제거하고 웹캠 화면(WebcamView) 표시로 교체
 */

import WebcamView from "@/components/WebcamView";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-black p-6 text-zinc-100">
      <h1 className="text-2xl font-semibold">심연의 관측소</h1>
      <WebcamView />
    </main>
  );
}
