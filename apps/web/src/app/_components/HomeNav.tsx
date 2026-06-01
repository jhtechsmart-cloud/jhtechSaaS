import Link from "next/link";

const ITEMS = [
  { href: "/equipment", title: "견적 요청", desc: "장비를 둘러보고 온라인으로 견적을 요청하세요.", active: true },
  { href: "#", title: "A/S 신청", desc: "보유 장비의 수리·점검을 신청하세요.", active: false },
  { href: "#", title: "소모품 신청", desc: "장비별 소모품을 신청하세요.", active: false },
] as const;

// 홈 3분기 — 견적요청만 활성. A/S·소모품은 준비중(P-D/P-E).
export function HomeNav() {
  return (
    <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
      {ITEMS.map((it) =>
        it.active ? (
          <Link
            key={it.title}
            href={it.href}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-6 text-left transition-shadow hover:border-accent hover:shadow-md"
          >
            <span className="text-h2 font-semibold text-text">{it.title}</span>
            <span className="text-small text-muted">{it.desc}</span>
          </Link>
        ) : (
          <div
            key={it.title}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-6 text-left opacity-60"
            aria-disabled
          >
            <span className="text-h2 font-semibold text-muted">
              {it.title}
              <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-micro text-muted">준비중</span>
            </span>
            <span className="text-small text-muted">{it.desc}</span>
          </div>
        ),
      )}
    </div>
  );
}
