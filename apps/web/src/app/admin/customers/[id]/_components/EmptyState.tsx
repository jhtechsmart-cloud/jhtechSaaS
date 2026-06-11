import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// 거래 활동 탭 빈 상태 — 아이콘 + 안내 + 생성 CTA(스펙: "+ 새 {항목} 작성").
export function EmptyState({
  icon: Icon,
  label,
  description,
  ctaHref,
  ctaLabel,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-surface-2 text-muted">
        <Icon className="size-6" aria-hidden />
      </div>
      <div>
        <p className="text-body font-semibold text-text">아직 {label} 내역이 없습니다</p>
        <p className="mt-1 text-small text-muted">{description}</p>
      </div>
      <Link href={ctaHref} className={buttonVariants({ size: "sm" })}>
        + {ctaLabel}
      </Link>
    </div>
  );
}
