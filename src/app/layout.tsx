/**
 * 루트 레이아웃
 *
 * 역할: 전체 페이지 공통 레이아웃(폰트, 메타데이터, 글로벌 스타일) 정의
 *
 * 수정 이력:
 *   - 2026-11-03 헤더 주석 추가 (create-next-app 기본 코드)
 *   - 2026-11-03 front/ 폴더를 브랜치 루트로 이동
 *   - 2026-11-03 제목용 글꼴(Gowun Batang) 추가, 페이지 제목과 언어 설정
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono, Gowun_Batang } from "next/font/google";
import "./globals.css";

const gowunBatang = Gowun_Batang({
  variable: "--font-gowun-batang",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "심연의 관측소",
  description: "AI 캐릭터 생성 체험",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${gowunBatang.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
