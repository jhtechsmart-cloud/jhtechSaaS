import type { SupabaseClient } from "@supabase/supabase-js";
import {
  composeServiceReportEmailHtml,
  defaultServiceReportEmail,
  type MailSender,
} from "@jhtechsaas/shared";
import { MAX_ATTEMPTS } from "./queue";

// 서비스 리포트 메일 발송 잡(#228 Part 2) — email.ts(견적)와 동일한 멱등 상태기계.
// #285: 자동 발송 제거 — 상세 화면 [메일 발송] 버튼 → enqueue_service_report_email RPC가 enqueue.
// 발신자 = RPC가 payload에 실은 호출자 하이웍스 ID(타인 명의 금지). 승인본(approved/completed)만 발송.
// 링크는 7일 서명URL(서명·개인정보 문서 — 견적 30일보다 짧게, autoplan 결정#4).

const SIGNED_URL_TTL = 7 * 24 * 60 * 60;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

// 고객에게 보낼 수 있는 상태 — 승인 전(issued)은 결재 미완료 문서라 발송 금지.
export const SERVICE_REPORT_MAILABLE = ["approved", "completed"] as const;

// 발신자 하이웍스 ID = payload(enqueue RPC가 실은 발송 버튼 누른 사람)만. ⚠️ 리포트 기사 스냅샷으로 폴백하지 않는다 —
// RPC 불변식("호출자 명의만")을 워커가 다시 열면 컷오버 전 구 트리거가 만든 잡이 버튼 없이 기사 명의로 자동 발송된다.
export function resolveSenderHiworksId(payload: Record<string, unknown>): string {
  return str(payload.hiworks_user_id);
}

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
      .select("seq_no, pdf_url, recipient_email, customer_name, device_name, status")
      .eq("id", reportId)
      .single();
    if (error || !report) throw new Error(`리포트 조회 실패: ${error?.message ?? "없음"}`);
    const r = report as Record<string, unknown>;
    const pdfPath = str(r.pdf_url);
    const to = str(r.recipient_email);
    const fromUserId = resolveSenderHiworksId(payload);
    if (!pdfPath) throw new Error("pdf_url 없음(PDF 미생성)");
    if (!to) throw new Error("수신처 없음"); // RPC 조건상 도달 불가(방어)
    if (!fromUserId) throw new Error("발신자 하이웍스 ID 없음(payload.hiworks_user_id) — 구 잡이거나 RPC 우회"); // 구 자동발송 잡 차단
    if (!(SERVICE_REPORT_MAILABLE as readonly string[]).includes(str(r.status))) {
      // enqueue~발송 사이 무효화(voided) 등 — 승인본이 아닌 문서를 고객에게 보내지 않고 종단.
      await supabase
        .from("email_log")
        .update({ status: "failed", error_msg: `발송 전 리포트 상태가 바뀜(${str(r.status)})` })
        .eq("id", logId);
      console.warn(`[worker] service_report_email 중단 — 리포트 상태 ${str(r.status)} log=${logId}`);
      return;
    }

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
