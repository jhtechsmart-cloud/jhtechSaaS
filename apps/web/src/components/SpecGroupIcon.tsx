import type * as React from "react";
import type { SpecIcon } from "@jhtechsaas/shared";

// 그룹 사양 아이콘 — 고정 enum(9종)만. 임의 문자열 불가 → XSS 0.
// 단순 기하 SVG(스트로크 currentColor). 디자인 폴리시는 후속에서 교체 가능.
const PATHS: Record<SpecIcon, React.ReactNode> = {
  gauge: <><path d="M12 14l4-4" /><circle cx="12" cy="14" r="7" /></>,
  ruler: <><rect x="3" y="8" width="18" height="8" rx="1" /><path d="M7 8v3M11 8v4M15 8v3" /></>,
  droplet: <path d="M12 3c3 4 5 6.5 5 9a5 5 0 1 1-10 0c0-2.5 2-5 5-9z" />,
  power: <><path d="M12 3v8" /><path d="M6 7a8 8 0 1 0 12 0" /></>,
  wind: <><path d="M3 8h11a3 3 0 1 0-3-3" /><path d="M3 12h15a3 3 0 1 1-3 3" /></>,
  thermometer: <path d="M12 3a2 2 0 0 1 2 2v9a4 4 0 1 1-4 0V5a2 2 0 0 1 2-2z" />,
  weight: <><path d="M5 8h14l1 12H4L5 8z" /><circle cx="12" cy="5" r="2" /></>,
  box: <><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>,
};

export function SpecGroupIcon({ icon, className }: { icon: SpecIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      aria-hidden
    >
      {PATHS[icon]}
    </svg>
  );
}
