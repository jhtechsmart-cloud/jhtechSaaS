import Link from "next/link";
import type { UpcomingScheduleRow } from "@/lib/demo-reservations/queries";
import type { RecentRequest } from "@/lib/dashboard/recent";
import { kstDateOf, kstHmOf } from "@/lib/format/kst";
import { EVENT_META, REQUEST_DOMAIN_EVENT } from "@/lib/dashboard/v2-meta";
import { SectionHeader } from "@/app/admin/_components/SectionHeader";
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
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <SectionHeader
          title="데모 및 납품 일정"
          action={
            <Link href="/admin/demo-reservations" className="shrink-0 text-small font-medium text-accent hover:underline">
              예약 관리 →
            </Link>
          }
        />
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
                wide
                tint={{
                  bg: EVENT_META[u.kind === "demo" ? "demo" : "delivery"].bg,
                  fg: EVENT_META[u.kind === "demo" ? "demo" : "delivery"].fg,
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
        <SectionHeader title="이번 달 신청" />
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
                tint={{
                  bg: EVENT_META[REQUEST_DOMAIN_EVENT[r.domain]].bg,
                  fg: EVENT_META[REQUEST_DOMAIN_EVENT[r.domain]].fg,
                }}
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
