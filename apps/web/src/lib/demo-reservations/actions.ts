"use server";
// 데모예약 서버 액션 — zod(1차) 검증 후 INSERT, 최후 방어선은 DB EXCLUDE 제약.
// 동시 등록 레이스에서 DB가 한쪽을 23P01로 실패시키면 충돌 메시지로 변환해 내려준다.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  requireAnyConsoleCapability,
  requireDemoReservationsWrite,
} from "@/lib/auth/guard";
import { kstRangeIso } from "./slots";
import { createReservationSchema } from "./schema";
import { listReservationsForDate, type DemoReservationRow } from "./queries";

export type ReservationActionResult =
  | { status: "ok"; date: string }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string };

const CONFLICT_MESSAGE =
  "방금 다른 예약이 등록되었습니다. 다른 시간을 선택해주세요.";

export async function createDemoReservation(
  values: unknown,
): Promise<ReservationActionResult> {
  const access = await requireDemoReservationsWrite();
  if (access.status === "forbidden") {
    return { status: "error", message: "데모예약 등록 권한이 없습니다." };
  }

  const parsed = createReservationSchema.safeParse(values);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { status: "error", message: first?.message ?? "입력값을 확인하세요." };
  }
  const v = parsed.data;
  const { startIso, endIso } = kstRangeIso(v.date, v.startTime, v.durationMin);

  const supabase = await createSupabaseServerClient();
  // 부모+자식(복수 장비) 원자 저장. 권한·is_demo·담당자 검증과 created_by 강제는 RPC가 담당.
  const { error } = await supabase.rpc("create_demo_reservation", {
    p_company_id: v.companyId,
    p_customer_name: v.customerName,
    p_visitor_name: v.visitorName || null,
    p_visitor_phone: v.visitorPhone || null,
    p_assignee_id: v.assigneeId,
    p_memo: v.memo || null,
    p_time_range: `[${startIso},${endIso})`,
    p_equipment_ids: v.equipmentIds,
  });

  if (error) {
    // 23P01 = exclusion_violation — 같은 장비가 저장 직전 다른 예약에 먼저 들어온 레이스.
    if (error.code === "23P01") {
      return { status: "conflict", message: CONFLICT_MESSAGE };
    }
    console.error("[demo_reservations.create]", error);
    return { status: "error", message: "저장에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }

  revalidatePath("/admin/demo-reservations");
  return { status: "ok", date: v.date };
}

/** 등록 폼의 날짜 변경 시 해당일 예약 재조회(useQuery용 fetch 래퍼 — 조회는 콘솔 전 직원). */
export async function fetchDayReservations(
  date: unknown,
): Promise<DemoReservationRow[]> {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") return [];
  const parsed = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(date);
  if (!parsed.success) return [];
  return listReservationsForDate(parsed.data);
}

export async function cancelDemoReservation(
  id: string,
): Promise<ReservationActionResult> {
  const access = await requireDemoReservationsWrite();
  if (access.status === "forbidden") {
    return { status: "error", message: "데모예약 취소 권한이 없습니다." };
  }
  if (!z.guid().safeParse(id).success) {
    return { status: "error", message: "잘못된 요청입니다." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("demo_reservations")
    .update({ status: "canceled" })
    .eq("id", id);
  if (error) {
    console.error("[demo_reservations.cancel]", error);
    return { status: "error", message: "취소에 실패했습니다." };
  }
  revalidatePath("/admin/demo-reservations");
  return { status: "ok", date: "" };
}
