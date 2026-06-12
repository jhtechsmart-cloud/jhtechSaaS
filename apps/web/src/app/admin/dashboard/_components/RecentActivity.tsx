import type { RecentRequest } from "@/lib/dashboard/recent";
import { kstDateOf, kstHmOf } from "@/lib/format/kst";
import { ScheduleRow } from "./ScheduleCard";

// 최근 활동 — 신청 3종 최신순. 일정 레일과 동일한 날짜/시간 2줄 형식(ScheduleRow 공용).
export function RecentActivity({ requests }: { requests: RecentRequest[] }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <p className="text-h2 font-semibold text-text">최근 활동</p>
      {requests.length === 0 ? (
        <p className="py-3 text-small text-empty">최근 활동이 없습니다</p>
      ) : (
        <div className="flex flex-col">
          {requests.map((r) => (
            <ScheduleRow
              key={`${r.domain}-${r.id}`}
              date={kstDateOf(r.created_at) ?? r.created_at.slice(0, 10)}
              start={kstHmOf(r.created_at)}
              title={`${r.company} ${r.typeLabel} 접수`}
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
  );
}
