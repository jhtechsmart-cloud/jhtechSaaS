import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { signOut } from "@/app/login/actions";
import { can } from "@jhtechsaas/shared";
import { todayKst } from "@/lib/format/kst";
import {
  listDotDaysForMonth,
  listReservationsForDate,
} from "@/lib/demo-reservations/queries";
import { DemoMonthCalendar } from "./_components/DemoMonthCalendar";
import { DayTimeline } from "./_components/DayTimeline";
import { DemoSavedToast } from "./_components/DemoSavedToast";

// 데모예약 관리 — 좌 월간 캘린더(데모=틸 dot·납품=파랑 dot) + 우 선택일 타임라인(09–18시).
// 선택일은 URL ?date= 단일 상태(딥링크·새로고침 보존). 데모센터는 1곳 — 겹침은 DB가 차단.
export default async function DemoReservationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">콘솔 접근 권한이 필요합니다. 관리자에게 문의하세요.</p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  const sp = await searchParams;
  const raw = typeof sp.date === "string" ? sp.date : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayKst();
  const [yearStr, monthStr] = date.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const [reservations, dots] = await Promise.all([
    listReservationsForDate(date),
    listDotDaysForMonth(year, month),
  ]);

  const canWrite = can(access.permissions, "demo_reservations.write");

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold text-text">데모예약</h1>
          <p className="mt-0.5 text-small text-muted">
            데모센터 1곳 · 동시간대 1건 — 15분 단위 예약
          </p>
        </div>
        {canWrite && (
          <Link
            href={`/admin/demo-reservations/new?date=${date}`}
            className={buttonVariants({ variant: "default" })}
          >
            + 예약 등록
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[330px_1fr]">
        <DemoMonthCalendar
          year={year}
          month={month}
          selected={date}
          demoDays={dots.demo}
          deliveryDays={dots.delivery}
        />
        <DayTimeline date={date} reservations={reservations} canWrite={canWrite} />
      </div>
      <DemoSavedToast />
      <Toaster position="bottom-center" />
    </section>
  );
}
