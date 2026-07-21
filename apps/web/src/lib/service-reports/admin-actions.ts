"use server";
// admin 서비스 리포트 조회·운영 액션(#228 Part 4) — 조회는 read(write·view·view_all),
// 무효화는 RPC가 users.manage를 최종 강제. 리포트 작성·수정은 admin에서 불가(현장 콘솔 전용).
import { revalidatePath } from "next/cache";
import { requireServiceReportsRead } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface AdminReportRow {
  id: string;
  seq_no: string;
  status: "draft" | "issued" | "voided";
  customer_name: string;
  device_name: string;
  engineer_name: string | null;
  charge_type: "paid" | "free";
  total: number;
  follow_needed: boolean;
  follow_memo: string | null;
  follow_date: string | null;
  follow_resolved_at: string | null;
  service_request_id: string | null;
  pdf_url: string | null;
  void_reason: string | null;
  issued_at: string | null;
  created_at: string;
}

async function guarded(): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await requireServiceReportsRead();
  if (g.status !== "ok") return { ok: false, error: "서비스 리포트 조회 권한이 없습니다" };
  return { ok: true };
}

// 목록 — RLS 스코프(본인 draft + 발행/무효[write·view] 또는 전체[view_all]) 안에서 최근순.
export async function adminListReportsAction(): Promise<Result<AdminReportRow[]>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_reports")
    .select(
      "id, seq_no, status, customer_name, device_name, engineer_name, charge_type, total, follow_needed, follow_memo, follow_date, follow_resolved_at, service_request_id, pdf_url, void_reason, issued_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as AdminReportRow[] };
}

// 후속조치 처리 완료 — RPC(발행본 동결 예외 필드만 갱신).
export async function adminResolveFollowAction(id: string): Promise<Result<null>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("resolve_service_report_follow", { p_id: id });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/service-reports");
  return { ok: true, data: null };
}

// 무효화 — 관리자 전용(RPC가 users.manage 강제). 내용 수정은 불가, 정정은 새 리포트.
export async function adminVoidReportAction(id: string, reason: string): Promise<Result<null>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_service_report", { p_id: id, p_reason: reason });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/service-reports");
  // #243: 장비 상세 AS 이력에도 무효 상태 즉시 반영(연결된 카탈로그 장비가 있을 때만)
  const { data: row } = await supabase
    .from("service_reports")
    .select("catalog_equipment_id")
    .eq("id", id)
    .maybeSingle();
  if (row?.catalog_equipment_id) {
    revalidatePath(`/admin/equipment/${row.catalog_equipment_id}`);
  }
  return { ok: true, data: null };
}

// PDF 서명URL(10분) — 조회 권한 기준(현장용 pdfSignedUrlAction은 write 전용이라 별도).
export async function adminPdfUrlAction(id: string): Promise<Result<string>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from("service_reports")
    .select("pdf_url")
    .eq("id", id)
    .single();
  if (error || !row?.pdf_url) return { ok: false, error: "PDF가 아직 없습니다" };
  const signed = await supabase.storage.from("service-reports").createSignedUrl(row.pdf_url, 600);
  if (signed.error || !signed.data?.signedUrl) {
    return { ok: false, error: signed.error?.message ?? "링크 생성 실패" };
  }
  return { ok: true, data: signed.data.signedUrl };
}
