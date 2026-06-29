"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { fetchDayReservations } from "@/lib/demo-reservations/actions";
import type {
  DemoStaffRow,
  EquipmentOptionRow,
} from "@/lib/demo-reservations/queries";
import type { CategoryNode } from "@/lib/equipment/category-tree";
import {
  NewReservationForm,
  type ReservationFormInitial,
} from "./NewReservationForm";
import { DaySummaryPanel } from "./DaySummaryPanel";

// 등록·수정 공용 클라 셸 — 페이지 로컬 QueryClient(고객목록 패턴). 날짜 상태를 폼·우측 요약이 공유,
// 해당일 예약은 useQuery 1곳에서 조회해 슬롯 그리드(점유/충돌)와 요약 패널에 같이 공급한다.
// 수정 모드(editingId)면 자기 예약을 폼 점유 계산에서 제외한다(자기 시간이 충돌로 잡히지 않게).
export function NewReservationShell({
  initialDate,
  equipmentOptions,
  staff,
  categories,
  initial,
  editingId,
}: {
  initialDate: string;
  equipmentOptions: EquipmentOptionRow[];
  staff: DemoStaffRow[];
  categories: CategoryNode[];
  initial?: ReservationFormInitial;
  editingId?: string;
}) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <Inner
        initialDate={initialDate}
        equipmentOptions={equipmentOptions}
        staff={staff}
        categories={categories}
        initial={initial}
        editingId={editingId}
      />
    </QueryClientProvider>
  );
}

function Inner({
  initialDate,
  equipmentOptions,
  staff,
  categories,
  initial,
  editingId,
}: {
  initialDate: string;
  equipmentOptions: EquipmentOptionRow[];
  staff: DemoStaffRow[];
  categories: CategoryNode[];
  initial?: ReservationFormInitial;
  editingId?: string;
}) {
  const [date, setDate] = useState(initialDate);
  const dayQuery = useQuery({
    queryKey: ["demo-day", date],
    queryFn: () => fetchDayReservations(date),
    staleTime: 10_000,
  });
  const reservations = dayQuery.data ?? [];
  // 수정 모드: 점유 계산에서 자기 예약 제외(요약 패널은 전체 표시).
  const formReservations = editingId
    ? reservations.filter((r) => r.id !== editingId)
    : reservations;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_330px]">
      <NewReservationForm
        date={date}
        onDateChange={setDate}
        equipmentOptions={equipmentOptions}
        staff={staff}
        categories={categories}
        reservations={formReservations}
        loading={dayQuery.isLoading}
        onSaved={() => dayQuery.refetch()}
        initial={initial}
        editingId={editingId}
      />
      <DaySummaryPanel date={date} reservations={reservations} loading={dayQuery.isLoading} />
    </div>
  );
}
