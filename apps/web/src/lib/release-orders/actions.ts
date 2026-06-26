"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ReleaseOrderDetailsSchema } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireReleaseOrdersWrite } from "@/lib/auth/guard";

export type ReleaseOrderSaveResult = { error: string } | { id: string; notice?: string };
export type ReleaseOrderActionResult = { error: string } | null;

// 출고의뢰서에서 편집한 고객정보(회사·연락처·설치주소).
export type ReleaseOrderCustomer = { company: string; contactPhone: string; installAddress: string };

// 출고의뢰서 PDF 준비 여부(폴링용) — 발행 직후 워커가 비동기로 PDF를 만들므로
// pdf_url이 생길 때까지 폼이 폴링해 다운로드 버튼을 활성화한다. 의뢰 1:1이라 application id로 조회.
export async function isReleaseOrderPdfReady(applicationId: string): Promise<boolean> {
  const access = await requireReleaseOrdersWrite();
  if (access.status === "forbidden") return false;
  if (!z.guid().safeParse(applicationId).success) return false;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("release_orders")
    .select("pdf_url, status")
    .eq("application_id", applicationId)
    .maybeSingle();
  const ro = data as { pdf_url?: string | null; status?: string } | null;
  return !!ro && ro.status === "issued" && !!ro.pdf_url;
}

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
  customer: ReleaseOrderCustomer,
  reflectToCustomer = false,
): Promise<ReleaseOrderSaveResult> {
  const access = await requireReleaseOrdersWrite();
  if (access.status === "forbidden") return { error: "출고의뢰서 작성 권한이 없습니다." };
  if (!z.guid().safeParse(applicationId).success) return { error: "잘못된 요청입니다." };
  if (deviceKind !== "printer" && deviceKind !== "cutter") return { error: "장비 구분을 선택하세요." };
  const parsed = ReleaseOrderDetailsSchema.safeParse(details);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  // 고객정보 경계 검증(회사명 필수, 길이 상한 — RPC가 한 번 더 폴백·left()로 강제).
  const custParsed = z
    .object({
      company: z.string().trim().min(1, "회사/고객명을 입력하세요.").max(200, "회사명은 200자 이내"),
      contactPhone: z.string().trim().max(50, "연락처는 50자 이내").default(""),
      installAddress: z.string().trim().max(1000, "주소는 1000자 이내").default(""),
    })
    .safeParse(customer);
  if (!custParsed.success) return { error: custParsed.error.issues[0]?.message ?? "고객정보를 확인하세요." };
  const cust = custParsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_release_order", {
    p_application_id: applicationId,
    p_device_kind: deviceKind,
    p_details: parsed.data,
    p_company: cust.company,
    p_contact_phone: cust.contactPhone,
    p_install_address: cust.installAddress,
  });
  if (error) {
    console.error("[release-orders.save] RPC 실패", error);
    return { error: raisedMessage(error, "출고의뢰서를 저장하지 못했습니다.") };
  }
  revalidatePath(`/admin/applications/${applicationId}`);
  const id = (data as { id?: string } | null)?.id;
  if (!id) return { error: "출고의뢰서를 저장하지 못했습니다." };

  // 고객관리 반영(체크 시에만) — 연결 고객(application.company_id)이 있으면 companies 갱신.
  // companies_update RLS(customers.edit + 스코프)가 최종 통제. 실패해도 출고의뢰서 저장은 유지.
  if (reflectToCustomer) {
    const { data: appRow } = await supabase
      .from("applications")
      .select("company_id")
      .eq("id", applicationId)
      .single();
    const companyId = (appRow as { company_id?: string | null } | null)?.company_id ?? null;
    if (!companyId) {
      return { id, notice: "저장됨. 연결된 고객이 없어 고객관리 반영은 생략됐습니다." };
    }
    const { error: upErr } = await supabase
      .from("companies")
      .update({ name: cust.company, phone: cust.contactPhone || null, address: cust.installAddress || null })
      .eq("id", companyId);
    if (upErr) {
      console.error("[release-orders.reflectCustomer] 고객 반영 실패", upErr);
      return { id, notice: "저장됨. 고객관리 반영은 권한·연결 문제로 생략됐습니다." };
    }
    return { id, notice: "저장됨 + 고객관리에 반영 완료." };
  }
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
