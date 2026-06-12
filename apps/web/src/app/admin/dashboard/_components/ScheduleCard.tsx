import Link from "next/link";
import { formatHmRange, formatMonthDayWeekday } from "@/lib/format/schedule";

// 일정 행 공용 포맷 — 좌측 컬럼 = 날짜 위("6/12 (금)") / 시간 아래("14:00" 또는 "14:00–15:30") 2줄.
// 데모·납품 일정 레일, 이번 달 신청, 최근 활동이 동일 형식을 공유한다.
export function ScheduleRow({
  date,
  start,
  end,
  title,
  subtitle,
  href,
  accentColor,
}: {
  date: string; // KST "YYYY-MM-DD"
  start: string | null; // "HH:mm"
  end?: string | null;
  title: string;
  subtitle?: string | null;
  href: string;
  accentColor?: string; // 이벤트 유형 색(좌측 보더)
}) {
  const dateLabel = formatMonthDayWeekday(date) ?? date;
  const timeLabel = formatHmRange(start, end ?? null);
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-mint-hover"
      style={accentColor ? { boxShadow: `inset 3px 0 0 ${accentColor}` } : undefined}
    >
      <span className="flex w-20 shrink-0 flex-col">
        <span className="text-small font-semibold text-text tabular-nums">{dateLabel}</span>
        <span className="text-micro text-muted tabular-nums">{timeLabel ?? "시간 미정"}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-small font-medium text-text">{title}</span>
        {subtitle && <span className="block truncate text-micro text-muted">{subtitle}</span>}
      </span>
    </Link>
  );
}
