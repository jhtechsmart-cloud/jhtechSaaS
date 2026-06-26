"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyConsoleCapability } from "@/lib/auth/guard";
import { listSalesLogsForCompany, type SalesLogItem } from "./queries";

export type SalesLogActionResult = { error: string } | null;

// 견적 작성 화면 등에서 회사 선택이 바뀔 때 영업일지를 다시 불러온다(RLS가 행 스코프 통제).
export async function fetchSalesLogsForCompanyAction(companyId: string): Promise<SalesLogItem[]> {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") return [];
  if (!z.guid().safeParse(companyId).success) return [];
  return listSalesLogsForCompany(companyId);
}

// 영업일지 작성 — 업체에 종속. author_id·created_at은 DB 트리거가 서버 강제,
// 행 스코프(부모 company 접근권)는 RLS sales_logs_insert가 통제. 여기선 인증·입력만 1차 방어.
export async function createSalesLogAction(
  companyId: string,
  content: string,
): Promise<SalesLogActionResult> {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.guid().safeParse(companyId).success) return { error: "잘못된 요청입니다." };
  const parsed = z.string().trim().min(1, "내용을 입력하세요.").max(4000, "4000자 이내로 입력하세요.").safeParse(content);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "내용을 확인하세요." };

  const supabase = await createSupabaseServerClient();
  // author_id는 보내지 않는다 — DB 트리거가 auth.uid()로 강제(클라 미신뢰).
  const { error } = await supabase.from("sales_logs").insert({ company_id: companyId, content: parsed.data });
  if (error) {
    console.error("[salesLogs.create]", error);
    // RLS 거부(42501)는 권한 안내, 그 외는 일반 문구.
    return { error: error.code === "42501" ? "이 업체에 영업일지를 작성할 권한이 없습니다." : "영업일지 저장에 실패했습니다." };
  }
  revalidatePath(`/admin/customers/${companyId}`);
  revalidatePath("/admin/sales-logs");
  return null;
}

// 영업일지 삭제 — 작성자 본인 또는 관리자(users.manage). RLS sales_logs_delete가 최종 통제.
export async function deleteSalesLogAction(
  id: string,
  companyId: string,
): Promise<SalesLogActionResult> {
  const access = await requireAnyConsoleCapability();
  if (access.status === "forbidden") return { error: "권한이 없습니다." };
  if (!z.guid().safeParse(id).success) return { error: "잘못된 요청입니다." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("sales_logs").delete().eq("id", id);
  if (error) {
    console.error("[salesLogs.delete]", error);
    return { error: "영업일지 삭제에 실패했습니다." };
  }
  revalidatePath(`/admin/customers/${companyId}`);
  revalidatePath("/admin/sales-logs");
  return null;
}
