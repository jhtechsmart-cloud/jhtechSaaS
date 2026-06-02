import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E 테스트(Playwright, port 3100)에서 HMR WebSocket 블록 해제
  // → React 클라이언트 컴포넌트 이벤트 핸들러 정상 동작 보장
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    // Next 16은 private IP로 가는 이미지 최적화를 SSRF 가드로 기본 차단한다.
    // 로컬 Supabase Storage(127.0.0.1)는 private IP라 dev에서 차단 → dev에서만 허용.
    // 프로덕션 이미지는 *.supabase.co(공개 호스트)라 가드 유지(영향 없음).
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "http", hostname: "127.0.0.1" },
    ],
  },
};

export default nextConfig;
