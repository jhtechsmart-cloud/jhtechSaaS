import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDemoReservationsWrite } from "@/lib/auth/guard";
import { signOut } from "@/app/login/actions";
import {
  getDemoReservation,
  listActiveEquipmentOptions,
  listDemoStaff,
} from "@/lib/demo-reservations/queries";
import { DURATION_OPTIONS, type DurationOption } from "@/lib/demo-reservations/constants";
import { listCategoryTree } from "@/lib/equipment/queries";
import { Toaster } from "@/components/ui/sonner";
import { NewReservationShell } from "../../_components/NewReservationShell";
import type { ReservationFormInitial } from "../../_components/NewReservationForm";

// 데모예약 수정 — 등록과 같은 폼(셸)을 예약 값으로 프리필 + editingId 주입.
// 취소된/없는 예약은 404. 점유 슬롯에서 자기 예약 제외는 셸이 담당.
export default async function EditDemoReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await requireDemoReservationsWrite();
  if (access.status === "forbidden") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6">
        <p className="text-h2 font-semibold text-text">접근 권한이 없습니다</p>
        <p className="text-small text-muted">
          데모예약 수정 권한(demo_reservations.write)이 필요합니다. 관리자에게 문의하세요.
        </p>
        <form action={signOut}>
          <button className="text-small text-accent underline">로그아웃</button>
        </form>
      </main>
    );
  }

  const { id } = await params;
  const reservation = await getDemoReservation(id);
  if (!reservation) notFound();

  const [equipmentOptions, staff, categories] = await Promise.all([
    listActiveEquipmentOptions(),
    listDemoStaff(),
    listCategoryTree(),
  ]);

  // 저장된 소요시간이 옵션 목록에 없으면(데이터 이상) 60분으로 폴백.
  const durationMin: DurationOption = (DURATION_OPTIONS as readonly number[]).includes(
    reservation.durationMin,
  )
    ? (reservation.durationMin as DurationOption)
    : 60;

  const initial: ReservationFormInitial = {
    companyId: reservation.companyId,
    customerName: reservation.customerName,
    equipmentIds: reservation.equipmentIds,
    assigneeId: reservation.assigneeId,
    visitorName: reservation.visitorName ?? "",
    visitorPhone: reservation.visitorPhone ?? "",
    startTime: reservation.start,
    durationMin,
    memo: reservation.memo ?? "",
  };

  return (
    <section className="flex flex-col gap-4">
      <div>
        <Link
          href={`/admin/demo-reservations?date=${reservation.date}`}
          className="text-small text-muted hover:text-text"
        >
          ← 데모예약
        </Link>
        <h1 className="mt-1 text-h1 font-semibold text-text">예약 수정</h1>
        <p className="mt-0.5 text-small text-muted">
          {reservation.customerName} · {reservation.date} 예약 수정 · 15분 단위
        </p>
      </div>

      <NewReservationShell
        initialDate={reservation.date}
        equipmentOptions={equipmentOptions}
        staff={staff}
        categories={categories}
        initial={initial}
        editingId={reservation.id}
      />
      <Toaster position="bottom-center" />
    </section>
  );
}
