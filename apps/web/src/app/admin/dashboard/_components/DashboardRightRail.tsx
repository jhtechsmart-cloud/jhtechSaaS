import Link from "next/link";
import type { UpcomingScheduleRow } from "@/lib/demo-reservations/queries";
import type { RecentRequest } from "@/lib/dashboard/recent";
import { kstDateOf, kstHmOf } from "@/lib/format/kst";
import { EVENT_META } from "@/lib/dashboard/v2-meta";
import { ScheduleRow } from "./ScheduleCard";

// 우측 레일 — "데모 및 납품 일정"(최대 5건) + "이번 달 신청". 날짜/시간 2줄 공용 포맷(ScheduleRow).
export function DashboardRightRail({
  upcoming,
  monthRequests,
}: {
  upcoming: UpcomingScheduleRow[];
  monthRequests: RecentRequest[];
}) {
  return (
    <aside className="flex flex-col gap-5">
      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between">
          <p className="text-body font-semibold text-text">데모 및 납품 일정</p>
          <Link href="/admin/demo-reservations" className="text-small font-medium text-accent hover:underline">
            예약 관리 →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="py-3 text-small text-empty">다가오는 데모·납품 일정이 없습니다</p>
        ) : (
          <div className="flex flex-col">
            {upcoming.map((u) => (
              <ScheduleRow
                key={`${u.kind}-${u.id}`}
                date={u.date}
                start={u.start}
                end={u.end}
                title={u.title}
                href={u.href}
                accentColor={EVENT_META[u.kind === "demo" ? "demo" : "delivery"].color}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5 shadow-card">
        <p className="text-body font-semibold text-text">이번 달 신청</p>
        {monthRequests.length === 0 ? (
          <p className="py-3 text-small text-empty">이번 달 신청이 없습니다</p>
        ) : (
          <div className="flex flex-col">
            {monthRequests.map((r) => (
              <ScheduleRow
                key={`${r.domain}-${r.id}`}
                date={kstDateOf(r.created_at) ?? r.created_at.slice(0, 10)}
                start={kstHmOf(r.created_at)}
                title={`${r.company} ${r.typeLabel}`}
                subtitle={r.seq_no}
                href={
                  r.domain === "application"
                    ? `/admin/applications/${r.id}`
                    : r.domain === "service"
                      ? `/admin/service-requests/${r.id}`
                      : `/admin/supply-requests/${r.id}`
                }
              />
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
