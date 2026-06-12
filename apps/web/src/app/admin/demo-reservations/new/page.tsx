import Link from "next/link";
import { requireDemoReservationsWrite } from "@/lib/auth/guard";
import { signOut } from "@/app/login/actions";
import { todayKst } from "@/lib/format/kst";
import { listActiveEquipmentOptions } from "@/lib/demo-reservations/queries";
import { Toaster } from "@/components/ui/sonner";
import { NewReservationShell } from "../_components/NewReservationShell";

// 데모예약 등록 — 좌 폼(고객·장비·15분 슬롯 그리드) + 우 해당일 예약 요약.
// 충돌은 ①클라 슬롯 그리드(시각 경고) ②서버 zod ③DB EXCLUDE(최후 방어선) 3중.
export default async function NewDemoReservationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireDemoReservationsWrite();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">
          데모예약 등록 권한(demo_reservations.write)이 필요합니다. 관리자에게 문의하세요.
        </p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  const sp = await searchParams;
  const raw = typeof sp.date === "string" ? sp.date : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayKst();
  const equipmentOptions = await listActiveEquipmentOptions();

  return (
    <section className="flex flex-col gap-4">
      <div>
        <Link
          href={`/admin/demo-reservations?date=${date}`}
          className="text-small text-muted hover:text-text"
        >
          ← 데모예약
        </Link>
        <h1 className="mt-1 text-h1 font-semibold text-text">예약 등록</h1>
        <p className="mt-0.5 text-small text-muted">데모센터 1곳 · 동시간대 1건 · 15분 단위</p>
      </div>

      <NewReservationShell initialDate={date} equipmentOptions={equipmentOptions} />
      <Toaster position="bottom-center" />
    </section>
  );
}
