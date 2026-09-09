import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBizNo, judgeWarranty, type ServicePart } from "@jhtechsaas/shared";
import { getFontDataUri } from "./assets";
import { buildServiceReportPdf } from "./render-service-report-pdf";
import type { ServiceReportHtmlData } from "./service-report-html";

// 발행·승인된 서비스 리포트 → 서명·직인 다운로드(base64 인라인) → PDF → service-reports 버킷 업로드 →
// pdf_url 기록. 이슈 #228 Part 2 + #285(결재 박스·세대 관리 D-C8).
// 세대(pdf_revision): 확정·승인 전이마다 +1. 잡 payload의 세대와 렌더 직전 재조회한 행의 세대가 다르면
// 이미 다음 전이가 일어난 것이므로 폐기(성공 종료). 업로드 경로는 세대별 불변 `<id>/report-r{n}.pdf`,
// pdf_url 기록은 CAS(status·pdf_revision·pdf_url null 조건) — 0행이면 폐기. 구 `report.pdf`는 남겨둔다(무해).
// 사진은 PDF 미포함(현장 요청 — A4 1장 유지). 스토리지·화면에는 그대로 남는다.

// PDF를 만들 수 있는 상태 — 승인·완료도 허용(F-E1: 승인 후 잡이 매번 throw → failed 고착 방지).
export const SERVICE_REPORT_RENDERABLE = ["issued", "approved", "completed"] as const;
// 결재 박스에 직인이 들어가는 상태.
const STAMPED = ["approved", "completed"] as const;

// issued_at(ISO) → KST 'YYYY-MM-DD HH:mm'.
function fmtKstMinute(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const kst = new Date(t + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export type PdfJobPayload = {
  id: string;
  revision: number | null; // null = 세대 정보 없는 구 잡(마이그 전 큐 잔여) → 행 값 사용
  expectedStatus: string | null;
};

export function parsePdfJobPayload(payload: Record<string, unknown>): PdfJobPayload {
  const id = str(payload.service_report_id);
  if (!id) throw new Error("payload.service_report_id 누락");
  const rev = payload.revision;
  return {
    id,
    revision: typeof rev === "number" && Number.isInteger(rev) ? rev : null,
    expectedStatus: str(payload.expected_status) || null,
  };
}

export type PdfJobDecision = { kind: "render" } | { kind: "discard"; reason: string };

// 렌더 직전 재조회한 행과 잡 세대 대조 — stale 렌더가 최신본을 덮어쓰는 경쟁 차단(D-C8).
export function decidePdfJob(
  job: PdfJobPayload,
  row: { status: string; pdf_revision: number; pdf_url: string | null },
): PdfJobDecision {
  if (row.status === "voided") return { kind: "discard", reason: "무효화된 리포트" };
  if (!(SERVICE_REPORT_RENDERABLE as readonly string[]).includes(row.status)) {
    throw new Error(`발행 상태가 아닙니다: ${row.status || "?"}`);
  }
  const revision = job.revision ?? row.pdf_revision;
  const expected = job.expectedStatus ?? row.status;
  if (row.pdf_revision !== revision) {
    return { kind: "discard", reason: `세대 불일치(잡 r${revision} ≠ 행 r${row.pdf_revision})` };
  }
  if (row.status !== expected) return { kind: "discard", reason: `상태 불일치(잡 ${expected} ≠ 행 ${row.status})` };
  if (row.pdf_url) return { kind: "discard", reason: `이미 생성됨(${row.pdf_url})` };
  return { kind: "render" };
}

// 직인 원본(`approval-stamps/<uid>/stamp-<n>.<ext>`) → 리포트 폴더 복사본 경로(확장자 보존).
export function stampCopyPath(reportId: string, stampPath: string): string {
  const ext = stampPath.split(".").pop()?.toLowerCase() ?? "png";
  return `${reportId}/approval-stamp.${ext}`;
}

function mimeOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "png";
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
}

// 스토리지 객체 → data URI. 사진·서명은 발행 전 실존 검증을 통과했지만 방어적으로 실패 시 throw
// (재시도 → 그래도 없으면 failed 표면화 — 조용한 빈 이미지 PDF 금지).
async function download(supabase: SupabaseClient, bucket: string, path: string): Promise<Buffer> {
  const dl = await supabase.storage.from(bucket).download(path);
  if (dl.error || !dl.data) throw new Error(`스토리지 다운로드 실패(${bucket}/${path}): ${dl.error?.message ?? "없음"}`);
  return Buffer.from(await dl.data.arrayBuffer());
}
const toDataUri = (buf: Buffer, path: string): string => `data:${mimeOf(path)};base64,${buf.toString("base64")}`;

// 승인 직인: 행에 스냅샷된 원본 경로(approver_stamp_path, 이후 직인 교체와 무관)를 리포트 폴더로 1회 복사.
// 복사본이 이미 있으면 재사용(재시도·재승인 없음 — 승인은 1회 전이). 복사·다운로드 실패 = 잡 실패(throw).
async function loadApprovalStamp(supabase: SupabaseClient, reportId: string, stampPath: string): Promise<string> {
  const copyPath = stampCopyPath(reportId, stampPath);
  const existing = await supabase.storage.from("service-reports").download(copyPath);
  if (!existing.error && existing.data) {
    return toDataUri(Buffer.from(await existing.data.arrayBuffer()), copyPath);
  }
  const buf = await download(supabase, "approval-stamps", stampPath);
  const up = await supabase.storage
    .from("service-reports")
    .upload(copyPath, buf, { contentType: mimeOf(copyPath), upsert: true });
  if (up.error) throw new Error(`직인 복사 실패(${copyPath}): ${up.error.message}`);
  console.log(`[worker] service_report_pdf 직인 복사 report=${reportId} ${stampPath} → ${copyPath}`);
  return toDataUri(buf, copyPath);
}

// 부품 jsonb → 표시용 배열(RPC가 정규화 저장하므로 형태 신뢰하되 방어 파싱).
function parseParts(v: unknown): ServicePart[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .map((p) => ({ name: str(p.name), qty: num(p.qty), price: num(p.price) }));
}

export async function processServiceReportPdfJob(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  const job = parsePdfJobPayload(payload);
  const id = job.id;

  const { data: report, error } = await supabase
    .from("service_reports")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !report) throw new Error(`서비스 리포트 조회 실패: ${error?.message ?? "없음"}`);
  const r = report as Record<string, unknown>;
  const status = str(r.status);
  const revision = num(r.pdf_revision);
  const decision = decidePdfJob(job, { status, pdf_revision: revision, pdf_url: str(r.pdf_url) || null });
  if (decision.kind === "discard") {
    console.warn(`[worker] service_report_pdf 폐기 report=${id} status=${status} — ${decision.reason}`);
    return;
  }

  // 같은 장비의 과거 발행 리포트(본 건 제외, 최근 3건) — PDF 이력 표. 무효본 제외.
  let history: ServiceReportHtmlData["history"] = [];
  const equipmentId = str(r.company_equipment_id);
  if (equipmentId) {
    const { data: prev } = await supabase
      .from("service_reports")
      .select("issued_at, faults, action_text")
      .eq("company_equipment_id", equipmentId)
      .in("status", [...SERVICE_REPORT_RENDERABLE])
      .neq("id", id)
      .order("issued_at", { ascending: false })
      .limit(3);
    history = (prev ?? []).map((h) => {
      const row = h as Record<string, unknown>;
      const faults = arr(row.faults);
      const action = str(row.action_text);
      return {
        dateLabel: fmtKstMinute(str(row.issued_at)).slice(0, 10),
        summary: `${faults.length ? `[${faults[0]}${faults.length > 1 ? ` 외 ${faults.length - 1}` : ""}] ` : ""}${action.slice(0, 60)}`,
      };
    });
  }

  // 고객 서명 인라인(필수 — 발행 검증 통과분). 기사 서명은 #285 이후 확정본만 있음(기존 발행본은 이름 폴백).
  const signaturePath = str(r.signature_path);
  if (!signaturePath) throw new Error("signature_path 없음(발행 검증 우회 의심)");
  const signatureDataUri = toDataUri(await download(supabase, "service-reports", signaturePath), signaturePath);
  const engineerSignaturePath = str(r.engineer_signature_path);
  const engineerSignatureDataUri = engineerSignaturePath
    ? toDataUri(await download(supabase, "service-reports", engineerSignaturePath), engineerSignaturePath)
    : undefined;

  // 승인 직인(approved 이상) — 행 스냅샷 경로 원본을 리포트 폴더로 복사 후 인라인.
  let approval: ServiceReportHtmlData["approval"];
  if ((STAMPED as readonly string[]).includes(status)) {
    const stampPath = str(r.approver_stamp_path);
    if (!stampPath) throw new Error("approver_stamp_path 없음(승인 검증 우회 의심)");
    const approvedAt = fmtKstMinute(str(r.approved_at));
    approval = {
      name: str(r.approver_name),
      title: str(r.approver_title),
      dateLabel: approvedAt.slice(0, 10),
      approvedAtLabel: approvedAt,
      stampDataUri: await loadApprovalStamp(supabase, id, stampPath),
    };
  }

  const purchasedAt = str(r.purchased_at);
  const issuedAtIso = str(r.issued_at);
  const warranty = judgeWarranty(purchasedAt || null, issuedAtIso ? new Date(issuedAtIso) : new Date());
  const warrantyLabel = warranty
    ? warranty.inWarranty
      ? `보증기간 내 (구매 후 ${warranty.months}개월)`
      : `보증 만료 (구매 후 ${warranty.months}개월)`
    : "";

  const followNeeded = r.follow_needed === true;
  const followMemo = str(r.follow_memo);
  const followDate = str(r.follow_date);
  const followLabel = followNeeded
    ? `후속 조치 필요 — ${followMemo}${followDate ? ` (예정일 ${followDate})` : ""}`
    : "조치 완료 · 후속 일정 없음";

  const bizNoDigits = str(r.customer_biz_no);
  const data: ServiceReportHtmlData = {
    seqNo: str(r.seq_no),
    issuedAtLabel: fmtKstMinute(issuedAtIso),
    engineerName: str(r.engineer_name),
    engineerTitle: str(r.engineer_title),
    customerName: str(r.customer_name),
    customerBizNo: bizNoDigits ? formatBizNo(bizNoDigits) : "",
    customerTel: str(r.customer_tel),
    customerAddr: str(r.customer_addr),
    deviceName: str(r.device_name),
    deviceSerial: str(r.device_serial),
    purchasedAtLabel: purchasedAt,
    warrantyLabel,
    history,
    faults: arr(r.faults),
    diagnosis: str(r.diagnosis),
    actionText: str(r.action_text),
    followLabel,
    parts: parseParts(r.parts),
    visitFee: num(r.visit_fee),
    overtimeFee: num(r.overtime_fee),
    partsTotal: num(r.parts_total),
    vat: num(r.vat),
    total: num(r.total),
    isFree: r.charge_type === "free",
    freeReason: str(r.free_reason),
    signatureDataUri,
    fontDataUri: await getFontDataUri(),
    ...(engineerSignatureDataUri ? { engineerSignatureDataUri } : {}),
    ...(approval ? { approval } : {}),
  };

  const pdf = await buildServiceReportPdf(data);
  const path = `${id}/report-r${revision}.pdf`;
  const up = await supabase.storage
    .from("service-reports")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`PDF 업로드 실패: ${up.error.message}`);

  // pdf_url 기록 = CAS — 렌더 중 전이(승인·무효화)가 있었으면 0행 → 폐기(새 세대 잡이 따로 돈다).
  const { data: updated, error: uErr } = await supabase
    .from("service_reports")
    .update({ pdf_url: path })
    .eq("id", id)
    .eq("status", status)
    .eq("pdf_revision", revision)
    .is("pdf_url", null)
    .select("id");
  if (uErr) throw new Error(`pdf_url 기록 실패: ${uErr.message}`);
  if (!updated || updated.length === 0) {
    console.warn(`[worker] service_report_pdf 기록 0행 — 렌더 중 전이됨(폐기) report=${id} r${revision} ${status}`);
    return;
  }
  console.log(`[worker] service_report_pdf 완료 report=${id} status=${status} r${revision} → ${path}`);
}
