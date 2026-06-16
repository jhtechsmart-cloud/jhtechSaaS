import type { SupabaseClient } from "@supabase/supabase-js";
import { composeQuoteEmailHtml, type MailSender } from "@jhtechsaas/shared";

// 견적 메일 발송 잡. 핵심은 멱등성: 메일은 PDF와 달리 재시도=중복 발송이므로
// email_log 상태기계(pending→sending→sent/failed)를 CAS로 잠가 "한 번만" 발송한다.
// 서명URL은 발송 시점에 생성해 본문에 주입(채널 독립 — Hiworks/Fake 무관).

const SIGNED_URL_TTL = 30 * 24 * 60 * 60; // 30일(견적 결재 지연 대비)

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function processEmailJob(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  mailSender: MailSender,
): Promise<void> {
  const logId = str(payload.email_log_id);
  const quoteId = str(payload.quote_id);
  const hiworksUserId = str(payload.hiworks_user_id);
  const to = str(payload.to);
  if (!logId || !quoteId || !hiworksUserId || !to) throw new Error("email 잡 payload 누락");
  const cc = strOrNull(payload.cc);
  const bcc = strOrNull(payload.bcc);
  const subject = str(payload.subject) || "견적서 송부";
  const body = str(payload.body);

  // 멱등 락(CAS): pending → sending. 0행이면 다른 워커/시도가 이미 처리 → 재발송 금지.
  // (버튼 2회·스테일 회수·완료된 잡 재처리로 인한 중복 메일을 여기서 차단)
  const lock = await supabase
    .from("email_log")
    .update({ status: "sending" })
    .eq("id", logId)
    .eq("status", "pending")
    .select("id");
  if (lock.error) throw new Error(`email_log 락 실패: ${lock.error.message}`);
  if (!lock.data || lock.data.length === 0) {
    console.warn(`[worker] email 잡 스킵 — 이미 처리됨(중복 방지) log=${logId}`);
    return;
  }

  try {
    // 견적 메타 + PDF 경로
    const { data: quote, error } = await supabase
      .from("quotes")
      .select("quote_no, pdf_url, application:application_id(company)")
      .eq("id", quoteId)
      .single();
    if (error || !quote) throw new Error(`견적 조회 실패: ${error?.message ?? "없음"}`);
    const q = quote as unknown as Record<string, unknown>;
    const pdfPath = typeof q.pdf_url === "string" ? q.pdf_url : null;
    if (!pdfPath) throw new Error("pdf_url 없음(PDF 미생성)");
    const quoteNo = typeof q.quote_no === "string" ? q.quote_no : "";

    // 30일 서명URL(고객 다운로드 링크) — quote-pdfs는 비공개 버킷.
    const signed = await supabase.storage.from("quote-pdfs").createSignedUrl(pdfPath, SIGNED_URL_TTL);
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error(`서명URL 생성 실패: ${signed.error?.message ?? "없음"}`);
    }

    const html = composeQuoteEmailHtml({ body, downloadUrl: signed.data.signedUrl, quoteNo });
    const result = await mailSender.send({ fromUserId: hiworksUserId, to, cc, bcc, subject, html });

    if (result.ok) {
      await supabase
        .from("email_log")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", logId);
      return;
    }

    if (result.permanent) {
      // 영구 실패(4xx·잘못된 to·토큰/IP 차단·한도 초과·부분 실패) → 재시도 무의미.
      // failed 확정하고 throw 안 함(잡 완료 처리 → 재큐 안 됨, 한도 낭비 방지).
      await supabase
        .from("email_log")
        .update({ status: "failed", error_msg: (result.error ?? "발송 실패").slice(0, 500) })
        .eq("id", logId);
      console.error(`[worker] email 영구 실패 log=${logId}: ${result.error ?? ""}`);
      return;
    }

    // 재시도 가능(5xx·네트워크) → throw → 아래 catch가 락 해제 후 재전파 → 잡 재큐.
    throw new Error(result.error ?? "메일 발송 일시 실패");
  } catch (e) {
    // sending에 영구 고착 방지: 다음 시도가 다시 락하도록 pending으로 되돌린다.
    // ⚠️ v1 한계: 재시도 3회 소진 시 잡은 failed지만 email_log는 pending 잔존(드묾). 라이브 검증 후 보강.
    await supabase.from("email_log").update({ status: "pending" }).eq("id", logId).eq("status", "sending");
    throw e;
  }
}
