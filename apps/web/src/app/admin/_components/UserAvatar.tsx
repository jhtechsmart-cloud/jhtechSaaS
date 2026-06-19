import { avatarInitial } from "@/lib/avatar/avatar";

// 공용 아바타 — imageUrl 있으면 사진, 없으면 이니셜 원형. 헤더/사이드바/팝오버 공용.
// variant: solid(헤더, 강조) / soft(사이드바·팝오버).
export function UserAvatar({
  imageUrl,
  name,
  fallback,
  size = 36,
  variant = "soft",
  className = "",
}: {
  imageUrl: string | null;
  name: string | null;
  fallback?: string; // 이름 없을 때 이니셜(예: 관/영)
  size?: number;
  variant?: "solid" | "soft";
  className?: string;
}) {
  const dim = { width: size, height: size };
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 동적 사용자 업로드 소형 아바타(next/image 불필요)
      <img
        src={imageUrl}
        alt={name ?? "프로필"}
        style={dim}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  const tone = variant === "solid" ? "bg-accent text-white" : "bg-accent-soft text-accent";
  return (
    <span
      style={dim}
      className={`flex shrink-0 items-center justify-center rounded-full text-small font-bold ${tone} ${className}`}
      aria-hidden
    >
      {avatarInitial(name, fallback)}
    </span>
  );
}
