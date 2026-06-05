import Link from "next/link";
import { kstDateKey, type RecentRequest, type RequestDomain } from "@/lib/dashboard/recent";
import { APPLICATION_STATUS_META } from "@/lib/application-status";
import { STATUS_META } from "@/lib/request-status";
import { Icon } from "../../_components/Icon";

// 도메인별 색 — 네이비 베이스로 통일(견적=딥네이비, A/S=밝은네이비, 소모품=틸).
const DOMAIN_COLOR: Record<RequestDomain, string> = {
  application: "#6360c4", // 견적 — 소프트 인디고
  service: "#8f8ce0", // A/S — 밝은 인디고
  supply: "#38a3c0", // 소모품 — 연한 틸
};
const DOMAIN_HREF: Record<RequestDomain, string> = {
  application: "/admin/applications",
  service: "/admin/service-requests",
  supply: "/admin/supply-requests",
};
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function statusMeta(r: RecentRequest): { label: string; color: string } {
  const meta = r.domain === "application" ? APPLICATION_STATUS_META : STATUS_META;
  return (meta as Record<string, { label: string; color: string }>)[r.status] ?? { label: r.status, color: "#686d8a" };
}

// 우측 레일: 이번 달 캘린더(신청 제출일에 점) + 이번 달 신청 리스트. "이벤트"가 없으므로 신청을 표시.
export function RightRail({ requests }: { requests: RecentRequest[] }) {
  const tz = "Asia/Seoul";
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const [y, m, dToday] = todayKey.split("-").map(Number);
  const monthPrefix = `${y}-${String(m).padStart(2, "0")}`;

  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const daysWithReq = new Set<number>();
  for (const r of requests) {
    const k = kstDateKey(r.created_at);
    if (k.startsWith(monthPrefix)) daysWithReq.add(Number(k.slice(8, 10)));
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthRequests = requests.filter((r) => kstDateKey(r.created_at).startsWith(monthPrefix)).slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      {/* 캘린더 */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-md">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-h2 font-semibold text-text">{y}년 {m}월</p>
          <div className="flex gap-1.5 text-muted">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border hover:bg-surface-2"><Icon name="chevronLeft" size={14} /></span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border hover:bg-surface-2"><Icon name="chevronRight" size={14} /></span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAYS.map((w, i) => (
            <span key={w} className={`pb-2 text-micro font-semibold ${i === 0 ? "text-danger/70" : "text-muted"}`}>{w}</span>
          ))}
          {cells.map((d, i) => {
            if (d == null) return <span key={`e${i}`} />;
            const isToday = d === dToday;
            const hasReq = daysWithReq.has(d);
            return (
              <span key={d} className="flex flex-col items-center py-0.5">
                <span className={`flex h-8 w-8 items-center justify-center rounded-full text-small font-mono tabular-nums ${isToday ? "bg-accent font-bold text-white shadow-sm" : "text-text"}`}>
                  {d}
                </span>
                <span className={`mt-1 h-1.5 w-1.5 rounded-full ${hasReq && !isToday ? "bg-accent" : "bg-transparent"}`} />
              </span>
            );
          })}
        </div>
      </section>

      {/* 이번 달 신청 */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-md">
        <p className="mb-4 text-h2 font-semibold text-text">이번 달 신청</p>
        {monthRequests.length === 0 ? (
          <p className="text-small text-muted">이번 달 신청이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {monthRequests.map((r) => {
              const k = kstDateKey(r.created_at);
              const day = k.slice(8, 10);
              const wd = WEEKDAYS[new Date(`${k}T00:00:00+09:00`).getUTCDay()];
              const color = DOMAIN_COLOR[r.domain];
              const st = statusMeta(r);
              return (
                <Link
                  key={`${r.domain}-${r.id}`}
                  href={DOMAIN_HREF[r.domain]}
                  className="flex items-center gap-3 rounded-xl border border-border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm"
                  style={{ backgroundColor: `${color}0a` }}
                >
                  <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl font-mono leading-none text-white shadow-sm" style={{ backgroundColor: color }}>
                    <span className="text-h2 font-bold tabular-nums">{day}</span>
                    <span className="mt-0.5 text-[10px] opacity-85">{wd}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-1.5">
                      <span className="rounded px-1.5 py-0.5 text-micro font-semibold text-white" style={{ backgroundColor: color }}>{r.typeLabel}</span>
                      <span className="truncate text-small font-semibold text-text">{r.company}</span>
                    </span>
                    <span className="flex items-center gap-2 text-micro text-muted">
                      <span className="font-mono tabular-nums">{r.seq_no}</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.color }} />
                        {st.label}
                      </span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
