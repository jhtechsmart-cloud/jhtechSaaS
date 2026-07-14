"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ReleaseOrderDetailsSchema } from "@jhtechsaas/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireReleaseOrdersWrite } from "@/lib/auth/guard";

export type ReleaseOrderSaveResult = { error: string } | { id: string; notice?: string };
export type ReleaseOrderActionResult = { error: string } | null;

// 출고의뢰서에서 편집한 입력값 — 고객정보(회사·연락처·설치주소) + 장비명·설치일시.
// 장비명·설치일시는 과거 견적에서 서버가 강제했으나 이제 담당자가 직접 수정한다.
export type ReleaseOrderFields = {
  company: string;
  contactPhone: string;
  hqAddress: string;
  installAddress: string;
  deviceName: string;
  installDate: string | null; // 'YYYY-MM-DD' (없으면 미정)
  installTime: string | null; // 'HH:mm' (없으면 자정 처리)
};

// 출고의뢰서 PDF 준비 여부(폴링용) — 발행 직후 워커가 비동기로 PDF를 만들므로
// pdf_url이 생길 때까지 폼이 폴링해 다운로드 버튼을 활성화한다. 의뢰 1:1이라 application id로 조회.
export async function isReleaseOrderPdfReady(applicationId: string): Promise<boolean> {
  const access = await requireReleaseOrdersWrite();
  if (access.status === "forbidden") return false;
  if (!z.guid().safeParse(applicationId).success) return false;
  const supabase = await createSupabaseServerClient();
  // 최신 버전 기준(버전관리 — 한 의뢰에 여러 버전 존재 가능).
  const { data } = await supabase
    .from("release_orders")
    .select("pdf_url, status")
    .eq("application_id", applicationId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ro = data as { pdf_url?: string | null; status?: string } | null;
  return !!ro && ro.status === "issued" && !!ro.pdf_url;
}

// 특정 버전 출고의뢰서 PDF 서명URL — 버전 이력에서 각 발행본 다운로드용.
export async function getReleaseOrderVersionPdfUrl(releaseOrderId: string): Promise<string | null> {
  const access = await requireReleaseOrdersWrite();
  if (access.status === "forbidden") return null;
  if (!z.guid().safeParse(releaseOrderId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("release_orders")
    .select("pdf_url, status")
    .eq("id", releaseOrderId)
    .maybeSingle();
  const ro = data as { pdf_url?: string | null; status?: string } | null;
  if (!ro || ro.status !== "issued" || !ro.pdf_url) return null;
  const { data: signed } = await supabase.storage.from("release-orders").createSignedUrl(ro.pdf_url, 600);
  return signed?.signedUrl ?? null;
}

// RPC가 raise한 안내(P0001)·권한거부(42501)만 사용자에게 노출, 그 외 Postgres 원문은 일반 문구로 마스킹.
function raisedMessage(error: { code?: string; message?: string }, fallback: string): string {
  const raised = error.code === "P0001" || error.code === "42501";
  return raised ? (error.message || fallback).slice(0, 200) : fallback;
}

// 출고의뢰서 임시저장(작성/갱신) — release_orders.write 필요. 회사·장비명·설치일시 등
// 모든 항목을 담당자가 직접 편집하며, 빈 값은 RPC가 의뢰/견적에서 폴백한다(클라 미신뢰).
// ⚠️ Server Action은 직접 POST로도 도달 가능 → 가드를 액션에서도 재호출.
export async function saveReleaseOrderAction(
  applicationId: string,
  deviceKind: "printer" | "cutter",
  details: unknown,
  fields: ReleaseOrderFields,
  reflectToCustomer = false,
): Promise<ReleaseOrderSaveResult> {
  const access = await requireReleaseOrdersWrite();
  if (access.status === "forbidden") return { error: "출고의뢰서 작성 권한이 없습니다." };
  if (!z.guid().safeParse(applicationId).success) return { error: "잘못된 요청입니다." };
  if (deviceKind !== "printer" && deviceKind !== "cutter") return { error: "장비 구분을 선택하세요." };
  const parsed = ReleaseOrderDetailsSchema.safeParse(details);
  if (!parsed.success) return { error: "입력값을 확인하세요." };
  // 입력값 경계 검증(회사명 필수·길이 상한·날짜시각 형식 — RPC가 한 번 더 폴백·left()로 강제).
  const fieldsParsed = z
    .object({
      company: z.string().trim().min(1, "회사/고객명을 입력하세요.").max(200, "회사명은 200자 이내"),
      contactPhone: z.string().trim().max(50, "연락처는 50자 이내").default(""),
      hqAddress: z.string().trim().max(1000, "본사주소는 1000자 이내").default(""),
      installAddress: z.string().trim().max(1000, "설치주소는 1000자 이내").default(""),
      deviceName: z.string().trim().max(200, "장비명은 200자 이내").default(""),
      installDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "설치일 형식을 확인하세요.").nullable().default(null),
      installTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "설치 시각 형식을 확인하세요.").nullable().default(null),
    })
    .safeParse(fields);
  if (!fieldsParsed.success) return { error: fieldsParsed.error.issues[0]?.message ?? "입력값을 확인하세요." };
  const f = fieldsParsed.data;
  // 날짜 없이 시각만 있는 입력은 무의미 → 시각 무시.
  const installTime = f.installDate ? f.installTime : null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_release_order", {
    p_application_id: applicationId,
    p_device_kind: deviceKind,
    p_details: parsed.data,
    p_company: f.company,
    p_contact_phone: f.contactPhone,
    p_hq_address: f.hqAddress,
    p_install_address: f.installAddress,
    p_device_name: f.deviceName,
    p_install_date: f.installDate,
    p_install_time: installTime,
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
      // 본사주소 → address, 설치주소 → address_actual1 (본사/설치 분리 매핑).
      .update({
        name: f.company,
        phone: f.contactPhone || null,
        address: f.hqAddress || null,
        address_actual1: f.installAddress || null,
      })
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
