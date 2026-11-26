import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 부스 화면에 개발용 Next.js 로고(왼쪽 아래)가 보이지 않게 한다. 오류 표시는 그대로 뜬다.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
