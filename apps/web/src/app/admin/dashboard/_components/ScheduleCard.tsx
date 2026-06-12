import Link from "next/link";
import { formatHmRange, formatMonthDayWeekday } from "@/lib/format/schedule";

// 일정 행 공용 포맷 — 좌측 = 날짜 위("6/12 (금)") / 시간 아래("14:00–15:30") 2줄 **음영 배지**
// (내용과 시각적으로 구분 — 좌측 라인선 대신 배경 음영, 이벤트 유형 색은 배지 틴트로).
// 데모·납품 일정 레일, 이번 달 신청, 최근 활동이 동일 형식을 공유한다.
export function ScheduleRow({
  date,
  start,
  end,
  title,
  subtitle,
  href,
  tint,
}: {
  date: string; // KST "YYYY-MM-DD"
  start: string | null; // "HH:mm"
  end?: string | null;
  title: string;
  subtitle?: string | null;
  href: string;
  /** 이벤트 유형 색 틴트(데모·납품 등) — 없으면 중립 음영(surface-2). */
  tint?: { bg: string; fg: string };
}) {
  const dateLabel = formatMonthDayWeekday(date) ?? date;
  const timeLabel = formatHmRange(start, end ?? null);
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-mint-hover"
    >
      <span
        className={`flex w-[88px] shrink-0 flex-col rounded-lg px-2.5 py-1.5 ${tint ? "" : "bg-surface-2"}`}
        style={tint ? { backgroundColor: tint.bg } : undefined}
      >
        <span
          className={`text-small font-semibold tabular-nums ${tint ? "" : "text-text"}`}
          style={tint ? { color: tint.fg } : undefined}
        >
          {dateLabel}
        </span>
        <span
          className={`text-micro tabular-nums ${tint ? "opacity-80" : "text-muted"}`}
          style={tint ? { color: tint.fg } : undefined}
        >
          {timeLabel ?? "시간 미정"}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-small font-medium text-text">{title}</span>
        {subtitle && <span className="block truncate text-micro text-muted">{subtitle}</span>}
      </span>
    </Link>
  );
}
