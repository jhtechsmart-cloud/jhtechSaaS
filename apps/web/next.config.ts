import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E 테스트(Playwright, port 3100)에서 HMR WebSocket 블록 해제
  // → React 클라이언트 컴포넌트 이벤트 핸들러 정상 동작 보장
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "http", hostname: "127.0.0.1" },
    ],
  },
};

export default nextConfig;
