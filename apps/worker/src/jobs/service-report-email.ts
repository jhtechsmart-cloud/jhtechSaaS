import type { SupabaseClient } from "@supabase/supabase-js";
import {
  composeServiceReportEmailHtml,
  defaultServiceReportEmail,
  type MailSender,
} from "@jhtechsaas/shared";
import { MAX_ATTEMPTS } from "./queue";

// 서비스 리포트 메일 발송 잡(#228 Part 2) — email.ts(견적)와 동일한 멱등 상태기계.
// 발송 트리거는 DB(pdf_url 기록 AFTER UPDATE)가 자동 enqueue — 발신자·수신처는 리포트 스냅샷.
// 링크는 7일 서명URL(서명·개인정보 문서 — 견적 30일보다 짧게, autoplan 결정#4).

const SIGNED_URL_TTL = 7 * 24 * 60 * 60;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export async function processServiceReportEmailJob(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  mailSender: MailSender,
  attempts = 1,
): Promise<void> {
  const logId = str(payload.email_log_id);
  const reportId = str(payload.service_report_id);
  if (!logId || !reportId) throw new Error("service_report_email 잡 payload 누락");

  // 멱등 락(CAS): pending → sending. 0행이면 이미 처리됨 — 재발송 금지.
  const lock = await supabase
    .from("email_log")
    .update({ status: "sending" })
    .eq("id", logId)
    .eq("status", "pending")
    .select("id");
  if (lock.error) throw new Error(`email_log 락 실패: ${lock.error.message}`);
  if (!lock.data || lock.data.length === 0) {
    console.warn(`[worker] service_report_email 스킵 — 이미 처리됨 log=${logId}`);
    return;
  }

  try {
    const { data: report, error } = await supabase
      .from("service_reports")
      .select("seq_no, pdf_url, recipient_email, sender_hiworks_user_id, customer_name, device_name, status")
      .eq("id", reportId)
      .single();
    if (error || !report) throw new Error(`리포트 조회 실패: ${error?.message ?? "없음"}`);
    const r = report as Record<string, unknown>;
    const pdfPath = str(r.pdf_url);
    const to = str(r.recipient_email);
    const fromUserId = str(r.sender_hiworks_user_id);
    if (!pdfPath) throw new Error("pdf_url 없음(PDF 미생성)");
    if (!to || !fromUserId) throw new Error("수신처/발신자 스냅샷 누락"); // 트리거 조건상 도달 불가(방어)

    const signed = await supabase.storage
      .from("service-reports")
      .createSignedUrl(pdfPath, SIGNED_URL_TTL);
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error(`서명URL 생성 실패: ${signed.error?.message ?? "없음"}`);
    }

    const seqNo = str(r.seq_no);
    const customerName = str(r.customer_name);
    const preset = defaultServiceReportEmail({ customerName, seqNo });
    const html = composeServiceReportEmailHtml({
      body: preset.body,
      downloadUrl: signed.data.signedUrl,
      seqNo,
      deviceName: str(r.device_name),
    });
    const result = await mailSender.send({
      fromUserId,
      to,
      cc: null,
      bcc: null,
      subject: preset.subject,
      html,
    });

    console.log(
      `[worker] hiworks 응답(service_report) log=${logId} ok=${result.ok} permanent=${result.permanent ?? "-"} raw=${JSON.stringify(result.raw)}`,
    );

    if (result.ok) {
      await supabase
        .from("email_log")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", logId);
      return;
    }

    if (result.permanent) {
      await supabase
        .from("email_log")
        .update({ status: "failed", error_msg: (result.error ?? "발송 실패").slice(0, 500) })
        .eq("id", logId);
      console.error(`[worker] service_report_email 영구 실패 log=${logId}: ${result.error ?? ""}`);
      return;
    }

    throw new Error(result.error ?? "메일 발송 일시 실패");
  } catch (e) {
    // 마지막 시도면 failed 종단(pending 고착 금지), 남았으면 pending 복귀 → 다음 시도가 재락.
    const msg = e instanceof Error ? e.message : String(e);
    const terminal = attempts >= MAX_ATTEMPTS;
    await supabase
      .from("email_log")
      .update(terminal ? { status: "failed", error_msg: msg.slice(0, 500) } : { status: "pending" })
      .eq("id", logId)
      .eq("status", "sending");
    throw e;
  }
}
