import type { SupabaseClient } from "@supabase/supabase-js";
import { formatKstKoreanDate, ReleaseOrderDetailsSchema } from "@jhtechsaas/shared";
import { buildReleasePdf } from "./render-release-pdf";
import { getFontDataUri } from "./assets";
import type { ReleaseHtmlData } from "./release-html";

// install_at(timestamptz ISO) → KST 'YYYY-MM-DD HH:mm'. 빈 값은 빈 문자열.
function fmtInstallAt(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const kst = new Date(t + 9 * 3600 * 1000); // 절대시각 → KST 벽시계
  const p = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`;
}

// 발행된 출고의뢰서 → PDF 생성 → release-orders 버킷 업로드 → pdf_url 기록.
export async function processReleasePdfJob(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  const id = typeof payload.release_order_id === "string" ? payload.release_order_id : null;
  if (!id) throw new Error("payload.release_order_id 누락");

  const { data: ro, error } = await supabase
    .from("release_orders")
    .select(
      "seq_no, version, company, device_name, contact_phone, install_address, install_at, issued_at, device_kind, details, applications:application_id(profiles:assignee_id(name))",
    )
    .eq("id", id)
    .single();
  if (error || !ro) throw new Error(`출고의뢰서 조회 실패: ${error?.message ?? "없음"}`);
  const r = ro as Record<string, unknown>;

  // 영업담당자 = 의뢰 배정자(applications.assignee → profiles.name). 미배정이면 빈 문자열.
  const app = r.applications as { profiles?: { name?: string | null } | null } | null;
  const assigneeName = app?.profiles?.name ?? "";

  const data: ReleaseHtmlData = {
    seqNo: (r.seq_no as string) ?? "",
    version: typeof r.version === "number" ? r.version : 1,
    company: (r.company as string | null) ?? "",
    deviceName: (r.device_name as string | null) ?? "",
    contactPhone: (r.contact_phone as string | null) ?? "",
    installAddress: (r.install_address as string | null) ?? "",
    installAtLabel: fmtInstallAt(r.install_at as string | null),
    assigneeName,
    issuedDateLabel: (typeof r.issued_at === "string" ? formatKstKoreanDate(r.issued_at) : "") ?? "",
    deviceKind: r.device_kind === "cutter" ? "cutter" : "printer",
    details: ReleaseOrderDetailsSchema.parse(r.details),
    fontDataUri: await getFontDataUri(),
  };

  const pdf = await buildReleasePdf(data);
  const path = `${id}.pdf`;
  const up = await supabase.storage
    .from("release-orders")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`PDF 업로드 실패: ${up.error.message}`);
  const { error: uErr } = await supabase.from("release_orders").update({ pdf_url: path }).eq("id", id);
  if (uErr) throw new Error(`pdf_url 기록 실패: ${uErr.message}`);
}
