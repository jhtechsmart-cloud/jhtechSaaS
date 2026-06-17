"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ReleaseOrderDetailsSchema } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireReleaseOrdersWrite } from "@/lib/auth/guard";

export type ReleaseOrderSaveResult = { error: string } | { id: string };
export type ReleaseOrderActionResult = { error: string } | null;

// RPC가 raise한 안내(P0001)·권한거부(42501)만 사용자에게 노출, 그 외 Postgres 원문은 일반 문구로 마스킹.
function raisedMessage(error: { code?: string; message?: string }, fallback: string): string {
  const raised = error.code === "P0001" || error.code === "42501";
  return raised ? (error.message || fallback).slice(0, 200) : fallback;
}

// 출고의뢰서 임시저장(작성/갱신) — release_orders.write 필요. 스냅샷(회사·장비명·설치일 등)은
// 서버 RPC가 application/발행견적에서 채운다(클라 미신뢰). 여기선 device_kind·details만 전달.
// ⚠️ Server Action은 직접 POST로도 도달 가능 → 가드를 액션에서도 재호출.
export async function saveReleaseOrderAction(
  applicationId: string,
  deviceKind: "printer" | "cutter",
  details: unknown,
): Promise<ReleaseOrderSaveResult> {
  const access = await requireReleaseOrdersWrite();
  if (access.status === "forbidden") return { error: "출고의뢰서 작성 권한이 없습니다." };
  if (!z.guid().safeParse(applicationId).success) return { error: "잘못된 요청입니다." };
  if (deviceKind !== "printer" && deviceKind !== "cutter") return { error: "장비 구분을 선택하세요." };
  const parsed = ReleaseOrderDetailsSchema.safeParse(details);
  if (!parsed.success) return { error: "입력값을 확인하세요." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_release_order", {
    p_application_id: applicationId,
    p_device_kind: deviceKind,
    p_details: parsed.data,
  });
  if (error) {
    console.error("[release-orders.save] RPC 실패", error);
    return { error: raisedMessage(error, "출고의뢰서를 저장하지 못했습니다.") };
  }
  revalidatePath(`/admin/applications/${applicationId}`);
  const id = (data as { id?: string } | null)?.id;
  if (!id) return { error: "출고의뢰서를 저장하지 못했습니다." };
  return { id };
}

// 출고의뢰서 발행 — draft→issued. RPC가 견적·설치일 존재(I1 가드)·권한·행스코프를 검증하고
// release_pdf 잡을 enqueue(워커가 PDF 생성). 성공 시 의뢰 상세로 복귀.
export async function issueReleaseOrderAction(
  releaseOrderId: string,
  applicationId: string,
): Promise<ReleaseOrderActionResult> {
  const access = await requireReleaseOrdersWrite();
  if (access.status === "forbidden") return { error: "출고의뢰서 발행 권한이 없습니다." };
  if (!z.guid().safeParse(releaseOrderId).success) return { error: "잘못된 요청입니다." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("issue_release_order", { p_id: releaseOrderId });
  if (error) {
    console.error("[release-orders.issue] RPC 실패", error);
    return { error: raisedMessage(error, "출고의뢰서를 발행하지 못했습니다.") };
  }
  revalidatePath("/admin/applications", "layout");
  redirect(`/admin/applications/${applicationId}`);
}
