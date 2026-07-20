"use server";
// 현장 서비스 리포트 서버 액션(#228 Part 3). 모든 액션이 requireServiceReportsWrite를 재검증
// (Server Action은 직접 POST 가능 — 가드 규약). 쓰기·검증은 전부 SECURITY DEFINER RPC가 수행.
import { requireServiceReportsWrite } from "@/lib/auth/guard";
import { groupByCategory } from "@/lib/equipment/group";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CatalogGroup,
  CompanyHit,
  DraftCard,
  EmailStatus,
  EquipmentItem,
  OpenRequest,
  PdfStatus,
  ReportPayload,
  ServiceReportRow,
} from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail<T>(e: unknown, fallback: string): Result<T> {
  const msg = e instanceof Error ? e.message : String(e);
  return { ok: false, error: msg || fallback };
}

async function guarded(): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await requireServiceReportsWrite();
  if (g.status !== "ok") return { ok: false, error: "서비스 리포트 작성 권한이 없습니다" };
  return { ok: true };
}

// 고객 검색 — 상호 부분일치 또는 사업자번호(숫자) 부분일치. RLS: companies SELECT는 전 직원.
export async function searchCompaniesAction(query: string): Promise<Result<CompanyHit[]>> {
  const g = await guarded();
  if (!g.ok) return g;
  const q = query.trim();
  if (q.length < 2) return { ok: true, data: [] };
  const supabase = await createSupabaseServerClient();
  const digits = q.replace(/\D/g, "");
  let req = supabase
    .from("companies")
    .select("id, name, biz_no, phone, email, address")
    .limit(8);
  req = digits.length >= 3 ? req.or(`name.ilike.%${q}%,biz_no.like.%${digits}%`) : req.ilike("name", `%${q}%`);
  const { data, error } = await req;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as CompanyHit[] };
}

// 고객 컨텍스트 — 보유장비(+장비별 과거 issued 리포트 이력) + 미종결 A/S 신청(DEFINER RPC).
export async function loadCompanyContextAction(
  companyId: string,
): Promise<Result<{ equipment: EquipmentItem[]; openRequests: OpenRequest[] }>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  try {
    const [eq, reqs] = await Promise.all([
      supabase
        .from("company_equipment")
        .select("id, label, serial_no, purchased_at, equipment:equipment_id(name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true }),
      supabase.rpc("list_open_service_requests", { p_company_id: companyId }),
    ]);
    if (eq.error) throw new Error(eq.error.message);
    if (reqs.error) throw new Error(reqs.error.message);

    // supabase-js는 FK 단건 join도 배열로 추론 — 실제 응답은 객체(단건 관계)라 unknown 경유 좁힘.
    const rows = (eq.data ?? []) as unknown as {
      id: string;
      label: string | null;
      serial_no: string | null;
      purchased_at: string | null;
      equipment: { name: string | null } | null;
    }[];
    const ids = rows.map((r) => r.id);
    const historyByEquip = new Map<string, EquipmentItem["history"]>();
    if (ids.length > 0) {
      const { data: hist } = await supabase
        .from("service_reports")
        .select("company_equipment_id, issued_at, faults, action_text")
        .in("company_equipment_id", ids)
        .eq("status", "issued")
        .order("issued_at", { ascending: false })
        .limit(30);
      for (const h of (hist ?? []) as {
        company_equipment_id: string;
        issued_at: string | null;
        faults: string[] | null;
        action_text: string | null;
      }[]) {
        const list = historyByEquip.get(h.company_equipment_id) ?? [];
        if (list.length >= 3) continue;
        const fault = h.faults?.[0] ? `[${h.faults[0]}] ` : "";
        list.push({
          issuedAt: (h.issued_at ?? "").slice(0, 10),
          summary: `${fault}${(h.action_text ?? "").slice(0, 40)}`,
        });
        historyByEquip.set(h.company_equipment_id, list);
      }
    }
    const equipment: EquipmentItem[] = rows.map((r) => ({
      id: r.id,
      label: r.equipment?.name ?? r.label ?? "",
      serial_no: r.serial_no,
      purchased_at: r.purchased_at,
      history: historyByEquip.get(r.id) ?? [],
    }));
    return { ok: true, data: { equipment, openRequests: (reqs.data ?? []) as OpenRequest[] } };
  } catch (e) {
    return fail(e, "고객 정보를 불러오지 못했습니다");
  }
}

// 작성 중(draft) 리포트 삭제 — 본인 것만. 첨부(사진·서명)는 사용자 세션(본인 draft 폴더 정책)으로
// 삭제하고, 행 삭제는 RLS DELETE가 관리자 전용이라 admin 클라이언트로 수행하되
// 본인·draft 조건을 쿼리에 이중 강제한다(코드 검증 + 조건절).
export async function deleteDraftAction(id: string): Promise<Result<null>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes?.user?.id;
  if (!uid) return { ok: false, error: "로그인이 필요합니다" };

  const { data: row, error } = await supabase
    .from("service_reports")
    .select("id, status, created_by, photos_before, photos_after, signature_path")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "리포트를 찾을 수 없습니다" };
  const r = row as {
    status: string;
    created_by: string;
    photos_before: string[] | null;
    photos_after: string[] | null;
    signature_path: string | null;
  };
  if (r.created_by !== uid) return { ok: false, error: "본인 리포트만 삭제할 수 있습니다" };
  if (r.status !== "draft") return { ok: false, error: "작성 중 리포트만 삭제할 수 있습니다" };

  const paths = [...(r.photos_before ?? []), ...(r.photos_after ?? [])];
  if (r.signature_path) paths.push(r.signature_path);
  if (paths.length > 0) {
    const { error: stErr } = await supabase.storage.from("service-reports").remove(paths);
    if (stErr) console.error("[serviceReports.deleteDraft] 첨부 삭제 실패(행은 계속 삭제)", stErr);
  }

  const admin = createSupabaseAdminClient();
  const { error: delErr } = await admin
    .from("service_reports")
    .delete()
    .eq("id", id)
    .eq("created_by", uid)
    .eq("status", "draft");
  if (delErr) {
    console.error("[serviceReports.deleteDraft] 행 삭제 실패", delErr);
    return { ok: false, error: "삭제하지 못했습니다 — 다시 시도해 주세요" };
  }
  return { ok: true, data: null };
}

// 장비 카탈로그(분류별 그룹) — 미등록 장비 입력 시 자유 타이핑 대신 등록 장비에서 선택.
export async function equipmentCatalogAction(): Promise<Result<CatalogGroup[]>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("equipment")
    .select("id, name, equipment_category:category_id(name)")
    .eq("status", "active")
    .order("name");
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as unknown as {
    id: string;
    name: string;
    equipment_category: { name: string | null } | null;
  }[];
  const grouped = groupByCategory(
    rows.map((r) => ({ id: r.id, name: r.name, category: r.equipment_category?.name ?? null })),
  );
  return {
    ok: true,
    data: grouped.map((grp) => ({
      category: grp.category,
      items: grp.items.map(({ id, name }) => ({ id, name })),
    })),
  };
}

// draft 저장(생성/수정) — RPC가 금액 재계산·검증. 반환 = 저장된 행(신규면 id 포함).
export async function upsertReportAction(
  id: string | null,
  payload: ReportPayload,
): Promise<Result<ServiceReportRow>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_service_report", { p_id: id, p: payload });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as ServiceReportRow };
}

// 확정 — 서명 실존 등 서버 검증 후 issued 전이. 실패 메시지는 그대로 사용자에게.
export async function issueReportAction(id: string): Promise<Result<ServiceReportRow>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("issue_service_report", { p_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as ServiceReportRow };
}

// 리포트 단건 조회(본인 draft 또는 발행본 — RLS가 스코프 강제).
export async function getReportAction(id: string): Promise<Result<ServiceReportRow>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("service_reports").select("*").eq("id", id).single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as ServiceReportRow };
}

// 내 draft 목록(이어쓰기 카드) — 최근 20건.
export async function myDraftsAction(): Promise<Result<DraftCard[]>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_reports")
    .select("id, customer_name, device_name, created_at")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as DraftCard[] };
}

// PDF 생성 상태(완료 화면 폴링) — jobs는 RLS 무정책이라 DEFINER RPC 경유.
export async function pdfStatusAction(id: string): Promise<Result<PdfStatus>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_service_report_pdf_status", { p_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as PdfStatus };
}

export async function retryPdfAction(id: string): Promise<Result<PdfStatus>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("retry_service_report_pdf", { p_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as PdfStatus };
}

// PDF 서명URL(보기 버튼) — 10분 단기(현장 확인용).
export async function pdfSignedUrlAction(id: string): Promise<Result<string>> {
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

// 메일 발송 상태 — 로그 없음 = 발송 생략(수신처/발신자 스냅샷 없음).
export async function emailStatusAction(id: string): Promise<Result<EmailStatus>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("email_log")
    .select("status")
    .eq("service_report_id", id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return { ok: false, error: error.message };
  const status = (data?.[0] as { status?: string } | undefined)?.status;
  if (!status) return { ok: true, data: "skipped" };
  return { ok: true, data: status as EmailStatus };
}
