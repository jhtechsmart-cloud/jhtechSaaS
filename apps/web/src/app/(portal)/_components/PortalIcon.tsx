import type { SVGProps } from "react";

// 의존성 없는 인라인 SVG(lucide 스타일, currentColor stroke). 공개 포털 전용 아이콘 세트.
// 견적=문서 · A/S=렌치 · 소모품=박스 글리프는 admin Icon과 시각 일관(같은 path 재사용).
const PATHS: Record<string, string> = {
  quote: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6M9 9h1",
  service: "M14.7 6.3a4 4 0 0 0-5.4 5.4l-6 6a2 2 0 1 0 3 3l6-6a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2z",
  supply: "M16.5 9.4 7.5 4.21M3 7l9 5 9-5-9-5zM3 7v10l9 5 9-5V7M12 12v10",
  home: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 5L2 7",
  pin: "M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  chevronRight: "M9 18l6-6-6-6",
  check: "M20 6L9 17l-5-5",
};

export type PortalIconName = keyof typeof PATHS;

export function PortalIcon({
  name,
  size = 20,
  ...props
}: { name: PortalIconName; size?: number } & SVGProps<SVGSVGElement>) {
  const d = PATHS[name] ?? "";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {d
        .split("M")
        .filter(Boolean)
        .map((seg, i) => (
          <path key={i} d={`M${seg}`} />
        ))}
    </svg>
  );
}
