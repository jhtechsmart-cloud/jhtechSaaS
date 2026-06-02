"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/guard";
import { SERVICE_REQUEST_STATUSES } from "./status";

export type ServiceRequestActionResult = { error: string } | null;

const statusSchema = z.enum(SERVICE_REQUEST_STATUSES);

// 상태 변경 — service_requests.manage 필요. terminal(done/canceled) 역행은 DB 트리거가 거부.
export async function updateServiceRequestStatus(
  id: string,
  status: string,
): Promise<ServiceRequestActionResult> {
  const access = await requirePermission("service_requests.manage");
  if (access.status === "forbidden") return { error: "권한이 없습니다" };
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { error: "유효하지 않은 상태입니다" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("service_requests").update({ status: parsed.data }).eq("id", id);
  if (error) {
    // 트리거 거부(종결 역행 등) 포함.
    return { error: "상태 변경에 실패했습니다(종결된 건은 변경할 수 없습니다)" };
  }
  revalidatePath(`/admin/service-requests/${id}`);
  revalidatePath("/admin/service-requests");
  return null;
}

// 열람 표시 — service_requests.view_all 필요. 미열람(NULL)일 때만 기록.
export async function markServiceRequestRead(id: string): Promise<void> {
  const access = await requirePermission("service_requests.view_all");
  if (access.status === "forbidden") return;
  const supabase = await createSupabaseServerClient();
  await supabase.from("service_requests").update({ admin_read_at: new Date().toISOString() }).eq("id", id).is("admin_read_at", null);
  revalidatePath("/admin/service-requests");
}
