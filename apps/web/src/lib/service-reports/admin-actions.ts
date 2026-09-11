"use server";
// admin 서비스 리포트 조회·운영 액션(#228 Part 4 → #285 #C 결재 흐름) — 조회는 read 5키,
// 승인/완료/메일/무효화는 각 RPC가 권한을 최종 강제. 리포트 작성·수정은 admin에서 불가(현장 콘솔 전용).
import { revalidatePath } from "next/cache";
import type { ServiceReportStatus, TaxInvoiceStatus } from "@jhtechsaas/shared";
import { SERVICE_REPORT_FINALIZED, SERVICE_REPORT_MAILABLE } from "@jhtechsaas/shared";
import { requireServiceReportsRead } from "@/lib/auth/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { completeReportSchema, type CompleteReportInput } from "./complete-schema";
import { canResolveFollow, mailBadgeKey, monthStartKstIso, type MailBadgeKey, type ReportTabKey } from "./report-tabs";
import type { PdfStatus } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface AdminReportRow {
  id: string;
  seq_no: string;
  status: ServiceReportStatus; // #285: 5상태(단일 출처 shared)
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
  approved_at: string | null;
  completed_at: string | null;
  created_at: string;
  mail: MailBadgeKey; // 고객 메일 배지(email_log kind=customer)
  mail_sent: boolean;
}

export interface AdminReportDetail extends AdminReportRow {
  company_id: string | null;
  catalog_equipment_id: string | null;
  parent_report_id: string | null;
  customer_biz_no: string | null;
  customer_tel: string | null;
  recipient_email: string | null;
  device_serial: string | null;
  faults: string[];
  diagnosis: string;
  action_text: string;
  visit_fee: number;
  overtime_fee: number;
  parts_total: number;
  vat: number;
  free_reason: string | null;
  engineer_title: string | null;
  approver_name: string | null;
  approver_title: string | null;
  completed_by_name: string | null;
  tax_invoice_status: TaxInvoiceStatus | null;
  tax_invoice_date: string | null;
  tax_invoice_memo: string | null;
  voided_at: string | null;
  pdf_revision: number;
  email_logs: { id: string; to_email: string; status: string; error_msg: string | null; created_at: string; sent_at: string | null }[];
  approval_notice: { sent_count: number; last_sent_at: string | null } | null;
  children: { id: string; seq_no: string; status: ServiceReportStatus }[]; // 이 리포트를 부모로 둔 후속 방문(#285 #D)
  viewer: {
    canApprove: boolean;
    canComplete: boolean;
    canSendMail: boolean;
    canVoid: boolean;
    canRetryPdf: boolean;
    canResolveFollow: boolean; // resolve RPC = service_reports.write | service_requests.status
    hasStamp: boolean; // 승인자 본인 직인 등록 여부(미등록이면 승인 버튼 비활성 + 안내)
    stampUrl: string | null; // 승인 확인 모달 미리보기(10분 서명 URL)
    hiworksReady: boolean; // 메일 발송자(호출자) 하이웍스 ID 유무
  };
}

export interface ServiceReportKpis {
  received: number;
  follow_open: number;
  awaiting_approval: number;
  awaiting_tax: number;
  completed_this_month: number;
}

type Guard = { ok: true; userId: string; permissions: string[] } | { ok: false; error: string };
async function guarded(): Promise<Guard> {
  const g = await requireServiceReportsRead();
  if (g.status !== "ok") return { ok: false, error: "서비스 리포트 조회 권한이 없습니다" };
  return { ok: true, userId: g.userId, permissions: g.permissions };
}
const has = (perms: readonly string[], key: string) => perms.includes("users.manage") || perms.includes(key);

const LIST_COLUMNS =
  "id, seq_no, status, customer_name, device_name, engineer_name, charge_type, total, follow_needed, follow_memo, follow_date, follow_resolved_at, service_request_id, pdf_url, void_reason, issued_at, approved_at, completed_at, created_at";

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// 리포트별 고객 메일 상태(email_log kind=customer) — RLS가 리포트 권한자에게 열려 있다.
// 조회 실패는 배지만 "미발송"으로 보이게 두되 서버 로그에 남긴다(중복 발송은 DB 부분 유니크가 최종 차단).
async function loadMailBadges(supabase: SupabaseServer, ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("email_log")
    .select("service_report_id, status")
    .eq("kind", "customer")
    .in("service_report_id", ids)
    .limit(2000);
  if (error) console.error("[serviceReports.list] 메일 배지 조회 실패(배지만 영향)", error);
  for (const row of data ?? []) {
    const r = row as { service_report_id: string; status: string };
    map.set(r.service_report_id, [...(map.get(r.service_report_id) ?? []), r.status]);
  }
  return map;
}

// '메일 미발송' 탭 = 승인본(approved|completed) 중 고객 메일 sent 이력이 없는 건.
// 승인본은 미처리 업무라 건수가 제한적 → id만 모아 sent 로그와 대조(최근 N건 창에 갇히지 않는다).
async function mailUnsentIds(supabase: SupabaseServer): Promise<string[]> {
  const { data, error } = await supabase
    .from("service_reports")
    .select("id")
    .in("status", [...SERVICE_REPORT_MAILABLE])
    .limit(2000);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) return [];
  const badges = await loadMailBadges(supabase, ids);
  return ids.filter((id) => !(badges.get(id) ?? []).includes("sent"));
}

// 탭별 서버 필터 — 미처리 업무 큐(승인 대기·세금계산서·후속·메일 미발송)는 절대 "최근 N건"으로 자르지 않는다.
// 이력 성격 탭(전체·완료·무효)만 최근 300건 창을 쓴다.
function applyTabFilter<T extends { eq: (c: string, v: unknown) => T; in: (c: string, v: unknown[]) => T; is: (c: string, v: null) => T; gte: (c: string, v: string) => T }>(
  q: T,
  tab: ReportTabKey,
  monthStartIso: string | null,
): T {
  switch (tab) {
    case "awaiting_approval":
      return q.eq("status", "issued");
    case "awaiting_tax":
      return q.eq("status", "approved");
    case "follow":
      return q.in("status", [...SERVICE_REPORT_FINALIZED]).eq("follow_needed", true).is("follow_resolved_at", null);
    case "completed":
      return monthStartIso ? q.eq("status", "completed").gte("completed_at", monthStartIso) : q.eq("status", "completed");
    case "voided":
      return q.eq("status", "voided");
    default:
      return q;
  }
}

const HISTORY_TABS: ReportTabKey[] = ["all", "completed", "voided"];

// 목록 — 활성 탭을 서버에서 필터(RLS 스코프 안). 미처리 큐는 전량, 이력 탭은 최근 300건.
export async function adminListReportsAction(
  tab: ReportTabKey = "all",
  period: "all" | "month" = "all",
): Promise<Result<AdminReportRow[]>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const monthStart = tab === "completed" && period === "month" ? monthStartKstIso() : null;
  let rows: Omit<AdminReportRow, "mail" | "mail_sent">[];
  if (tab === "mail_unsent") {
    let ids: string[];
    try {
      ids = await mailUnsentIds(supabase);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "메일 미발송 조회 실패" };
    }
    if (ids.length === 0) return { ok: true, data: [] };
    const { data, error } = await supabase
      .from("service_reports")
      .select(LIST_COLUMNS)
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: error.message };
    rows = (data ?? []) as typeof rows;
  } else {
    const base = supabase.from("service_reports").select(LIST_COLUMNS).order("created_at", { ascending: false });
    const q = applyTabFilter(base, tab, monthStart);
    const { data, error } = await (HISTORY_TABS.includes(tab) ? q.limit(300) : q.limit(2000));
    if (error) return { ok: false, error: error.message };
    rows = (data ?? []) as typeof rows;
  }
  const badges = await loadMailBadges(supabase, rows.map((r) => r.id));
  return {
    ok: true,
    data: rows.map((r) => {
      const statuses = badges.get(r.id) ?? [];
      return { ...r, mail: mailBadgeKey(statuses), mail_sent: statuses.includes("sent") };
    }),
  };
}

// 탭 배지 숫자 — DB 전체 기준 정확 카운트(로드된 페이지에서 세면 300건 창 밖이 누락되고 KPI와 어긋난다).
export async function adminTabCountsAction(period: "all" | "month" = "all"): Promise<Result<Record<ReportTabKey, number>>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const monthStart = period === "month" ? monthStartKstIso() : null;
  const countable: ReportTabKey[] = ["all", "awaiting_approval", "awaiting_tax", "follow", "completed", "voided"];
  try {
    const [pairs, unsent] = await Promise.all([
      Promise.all(
        countable.map(async (tab) => {
          const base = supabase.from("service_reports").select("id", { count: "exact", head: true });
          const { count, error } = await applyTabFilter(base, tab, tab === "completed" ? monthStart : null);
          if (error) throw new Error(error.message);
          return [tab, count ?? 0] as const;
        }),
      ),
      mailUnsentIds(supabase).then((ids) => ids.length),
    ]);
    const out = Object.fromEntries(pairs) as Record<ReportTabKey, number>;
    out.mail_unsent = unsent;
    return { ok: true, data: out };
  } catch (e) {
    console.error("[serviceReports.tabCounts]", e);
    return { ok: false, error: "탭 건수를 계산하지 못했습니다" };
  }
}

// KPI 5박스 — DEFINER RPC(권한 무관 동일 숫자, AC10). 실패는 null(화면 "—").
export async function adminKpisAction(): Promise<Result<ServiceReportKpis>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("service_report_kpis");
  if (error) return { ok: false, error: error.message };
  const k = (data ?? {}) as Partial<Record<keyof ServiceReportKpis, number>>;
  return {
    ok: true,
    data: {
      received: k.received ?? 0,
      follow_open: k.follow_open ?? 0,
      awaiting_approval: k.awaiting_approval ?? 0,
      awaiting_tax: k.awaiting_tax ?? 0,
      completed_this_month: k.completed_this_month ?? 0,
    },
  };
}

// 상세 — 행(RLS) + 고객 메일 이력 + 알림 요약(DEFINER) + 뷰어 권한·직인·하이웍스 상태.
export async function adminGetReportAction(id: string): Promise<Result<AdminReportDetail>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from("service_reports")
    .select(
      `${LIST_COLUMNS}, company_id, catalog_equipment_id, parent_report_id, customer_biz_no, customer_tel, recipient_email, device_serial, faults, diagnosis, action_text, visit_fee, overtime_fee, parts_total, vat, free_reason, engineer_title, approver_name, approver_title, completed_by, tax_invoice_status, tax_invoice_date, tax_invoice_memo, voided_at, pdf_revision`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "리포트를 찾을 수 없습니다" };
  const r = row as Record<string, unknown>;

  const [logsRes, noticeRes, profileRes, completerRes, childRes] = await Promise.all([
    supabase
      .from("email_log")
      .select("id, to_email, status, error_msg, created_at, sent_at")
      .eq("kind", "customer")
      .eq("service_report_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.rpc("get_service_report_approval_notice", { p_id: id }),
    supabase.from("profiles").select("approval_stamp_path, hiworks_user_id").eq("id", g.userId).maybeSingle(),
    r.completed_by
      ? createSupabaseAdminClient().from("profiles").select("name").eq("id", r.completed_by as string).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("service_reports").select("id, seq_no, status").eq("parent_report_id", id).order("created_at"),
  ]);
  // 메일 이력은 감사 기록 — 조회 실패를 "이력 없음"으로 위장하지 않는다.
  if (logsRes.error) return { ok: false, error: `메일 발송 이력 조회 실패: ${logsRes.error.message}` };
  if (profileRes.error) console.error("[serviceReports.detail] 내 프로필 조회 실패(직인·하이웍스 상태 미확정)", profileRes.error);
  if (noticeRes.error) console.error("[serviceReports.detail] 승인 알림 요약 조회 실패", noticeRes.error);
  const logs = (logsRes.data ?? []) as AdminReportDetail["email_logs"];
  const statuses = logs.map((l) => l.status);
  const stampPath = (profileRes.data as { approval_stamp_path?: string | null } | null)?.approval_stamp_path ?? null;
  const hiworks = (profileRes.data as { hiworks_user_id?: string | null } | null)?.hiworks_user_id ?? null;
  let stampUrl: string | null = null;
  if (stampPath && has(g.permissions, "service_reports.approve")) {
    // 직인 버킷 읽기는 users.manage 전용 정책 → 본인 직인 미리보기는 admin 클라로 서명 URL(10분).
    const signed = await createSupabaseAdminClient().storage.from("approval-stamps").createSignedUrl(stampPath, 600);
    stampUrl = signed.data?.signedUrl ?? null;
  }
  const notice = (noticeRes.data ?? null) as { sent_count?: number; last_sent_at?: string | null } | null;
  const status = r.status as ServiceReportStatus;
  const canVoid = g.permissions.includes("users.manage") && (status === "issued" || status === "approved");
  const { completed_by: _completedBy, ...publicRow } = r; // 직원 uuid는 클라 응답에서 제외(이름만 내려보낸다)
  void _completedBy;
  const detail: AdminReportDetail = {
    ...(publicRow as unknown as Omit<AdminReportRow, "mail" | "mail_sent">),
    mail: mailBadgeKey(statuses),
    mail_sent: statuses.includes("sent"),
    company_id: (r.company_id as string | null) ?? null,
    catalog_equipment_id: (r.catalog_equipment_id as string | null) ?? null,
    parent_report_id: (r.parent_report_id as string | null) ?? null,
    customer_biz_no: (r.customer_biz_no as string | null) ?? null,
    customer_tel: (r.customer_tel as string | null) ?? null,
    recipient_email: (r.recipient_email as string | null) ?? null,
    device_serial: (r.device_serial as string | null) ?? null,
    faults: (r.faults as string[] | null) ?? [],
    diagnosis: (r.diagnosis as string | null) ?? "",
    action_text: (r.action_text as string | null) ?? "",
    visit_fee: (r.visit_fee as number | null) ?? 0,
    overtime_fee: (r.overtime_fee as number | null) ?? 0,
    parts_total: (r.parts_total as number | null) ?? 0,
    vat: (r.vat as number | null) ?? 0,
    free_reason: (r.free_reason as string | null) ?? null,
    engineer_title: (r.engineer_title as string | null) ?? null,
    approver_name: (r.approver_name as string | null) ?? null,
    approver_title: (r.approver_title as string | null) ?? null,
    completed_by_name: (completerRes.data as { name?: string } | null)?.name ?? null,
    tax_invoice_status: (r.tax_invoice_status as TaxInvoiceStatus | null) ?? null,
    tax_invoice_date: (r.tax_invoice_date as string | null) ?? null,
    tax_invoice_memo: (r.tax_invoice_memo as string | null) ?? null,
    voided_at: (r.voided_at as string | null) ?? null,
    pdf_revision: (r.pdf_revision as number | null) ?? 0,
    email_logs: logs,
    approval_notice: notice ? { sent_count: notice.sent_count ?? 0, last_sent_at: notice.last_sent_at ?? null } : null,
    children: (childRes.data ?? []) as AdminReportDetail["children"],
    viewer: {
      canApprove: has(g.permissions, "service_reports.approve") && status === "issued",
      canComplete: has(g.permissions, "service_reports.complete") && status === "approved",
      canSendMail: has(g.permissions, "email.send") && (status === "approved" || status === "completed"),
      canVoid,
      canRetryPdf:
        has(g.permissions, "service_reports.approve") ||
        has(g.permissions, "service_reports.complete") ||
        g.permissions.includes("service_reports.write"),
      canResolveFollow: canResolveFollow(g.permissions),
      hasStamp: !!stampPath,
      stampUrl,
      hiworksReady: !!hiworks,
    },
  };
  return { ok: true, data: detail };
}

function revalidateReport(id: string): void {
  revalidatePath("/admin/service-reports");
  revalidatePath(`/admin/service-reports/${id}`);
}

// 승인 — RPC가 approve 권한·issued·pdf_url·직인 실존을 강제. 승인 전이 시 트리거가 PDF 재생성 잡을 enqueue.
export async function adminApproveAction(id: string): Promise<Result<null>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("approve_service_report", { p_id: id });
  if (error) return { ok: false, error: error.message };
  revalidateReport(id);
  return { ok: true, data: null };
}

// 완료 — 클라 zod로 인라인 오류를 먼저 보여주고, 서버에서 다시 파싱한 뒤 RPC(complete 권한·approved·pdf_url 강제).
export async function adminCompleteAction(id: string, input: CompleteReportInput): Promise<Result<null>> {
  const g = await guarded();
  if (!g.ok) return g;
  const parsed = completeReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인하세요" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("complete_service_report", {
    p_id: id,
    p_tax_status: parsed.data.tax_invoice_status,
    p_tax_date: parsed.data.tax_invoice_date,
    p_memo: parsed.data.memo || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidateReport(id);
  return { ok: true, data: null };
}

// 고객 메일 발송 요청(수동) — RPC가 email.send|users.manage·승인본·pdf_url·수신처·호출자 하이웍스 ID·중복을 강제.
export async function adminSendMailAction(id: string): Promise<Result<null>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("enqueue_service_report_email", { p_id: id });
  if (error) return { ok: false, error: error.message };
  revalidateReport(id);
  return { ok: true, data: null };
}

// 후속조치 처리 완료 — RPC(발행본 동결 예외 필드만 갱신).
export async function adminResolveFollowAction(id: string): Promise<Result<null>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("resolve_service_report_follow", { p_id: id });
  if (error) return { ok: false, error: error.message };
  revalidateReport(id);
  return { ok: true, data: null };
}

// 무효화 — 관리자 전용(RPC가 users.manage·issued|approved 강제). 내용 수정은 불가, 정정은 새 리포트.
export async function adminVoidReportAction(id: string, reason: string): Promise<Result<null>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_service_report", { p_id: id, p_reason: reason });
  if (error) return { ok: false, error: error.message };
  revalidateReport(id);
  // #243: 장비 상세 AS 이력에도 무효 상태 즉시 반영(연결된 카탈로그 장비가 있을 때만)
  const { data: row } = await supabase.from("service_reports").select("catalog_equipment_id").eq("id", id).maybeSingle();
  if (row?.catalog_equipment_id) revalidatePath(`/admin/equipment/${row.catalog_equipment_id}`);
  return { ok: true, data: null };
}

// PDF 생성 상태(상세 폴링) — jobs는 RLS 무정책이라 DEFINER RPC 경유.
export async function adminPdfStatusAction(id: string): Promise<Result<PdfStatus>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_service_report_pdf_status", { p_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as PdfStatus };
}

export async function adminRetryPdfAction(id: string): Promise<Result<PdfStatus>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("retry_service_report_pdf", { p_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as PdfStatus };
}

// PDF 서명URL(10분) — 조회 권한 기준(현장용 pdfSignedUrlAction은 write 전용이라 별도).
export async function adminPdfUrlAction(id: string): Promise<Result<string>> {
  const g = await guarded();
  if (!g.ok) return g;
  const supabase = await createSupabaseServerClient();
  const { data: row, error } = await supabase.from("service_reports").select("pdf_url").eq("id", id).single();
  if (error || !row?.pdf_url) return { ok: false, error: "PDF가 아직 없습니다" };
  const signed = await supabase.storage.from("service-reports").createSignedUrl(row.pdf_url, 600);
  if (signed.error || !signed.data?.signedUrl) {
    return { ok: false, error: signed.error?.message ?? "링크 생성 실패" };
  }
  return { ok: true, data: signed.data.signedUrl };
}
