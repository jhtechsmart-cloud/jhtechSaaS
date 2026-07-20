import type { SupabaseClient } from "@supabase/supabase-js";
import { formatBizNo, judgeWarranty, type ServicePart } from "@jhtechsaas/shared";
import { getFontDataUri } from "./assets";
import { buildServiceReportPdf } from "./render-service-report-pdf";
import type { ServiceReportHtmlData } from "./service-report-html";

// 발행된 서비스 리포트 → 서명 다운로드(base64 인라인) → PDF → service-reports 버킷 업로드 →
// pdf_url 기록(AFTER UPDATE 트리거가 메일 잡을 enqueue). 이슈 #228 Part 2.
// 사진은 PDF 미포함(현장 요청 — A4 1장 유지). 스토리지·화면에는 그대로 남는다.

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

// 스토리지 객체 → data URI. 사진·서명은 발행 전 실존 검증을 통과했지만 방어적으로 실패 시 throw
// (재시도 → 그래도 없으면 failed 표면화 — 조용한 빈 이미지 PDF 금지).
async function toDataUri(supabase: SupabaseClient, path: string): Promise<string> {
  const dl = await supabase.storage.from("service-reports").download(path);
  if (dl.error || !dl.data) throw new Error(`스토리지 다운로드 실패(${path}): ${dl.error?.message ?? "없음"}`);
  const buf = Buffer.from(await dl.data.arrayBuffer());
  const ext = path.split(".").pop()?.toLowerCase() ?? "png";
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
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
  const id = str(payload.service_report_id);
  if (!id) throw new Error("payload.service_report_id 누락");

  const { data: report, error } = await supabase
    .from("service_reports")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !report) throw new Error(`서비스 리포트 조회 실패: ${error?.message ?? "없음"}`);
  const r = report as Record<string, unknown>;
  if (r.status !== "issued") throw new Error(`발행 상태가 아닙니다: ${str(r.status) || "?"}`);

  // 같은 장비의 과거 issued 리포트(본 건 제외, 최근 3건) — PDF 이력 표.
  let history: ServiceReportHtmlData["history"] = [];
  const equipmentId = str(r.company_equipment_id);
  if (equipmentId) {
    const { data: prev } = await supabase
      .from("service_reports")
      .select("issued_at, faults, action_text")
      .eq("company_equipment_id", equipmentId)
      .eq("status", "issued")
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

  // 서명 인라인(필수 — 발행 검증 통과분).
  const signaturePath = str(r.signature_path);
  if (!signaturePath) throw new Error("signature_path 없음(발행 검증 우회 의심)");
  const signatureDataUri = await toDataUri(supabase, signaturePath);

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
  };

  const pdf = await buildServiceReportPdf(data);
  const path = `${id}/report.pdf`;
  const up = await supabase.storage
    .from("service-reports")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`PDF 업로드 실패: ${up.error.message}`);

  // pdf_url 기록 — AFTER UPDATE 트리거가 수신처·발신자 스냅샷이 있으면 메일 잡을 enqueue(멱등).
  const { error: uErr } = await supabase.from("service_reports").update({ pdf_url: path }).eq("id", id);
  if (uErr) throw new Error(`pdf_url 기록 실패: ${uErr.message}`);
}
