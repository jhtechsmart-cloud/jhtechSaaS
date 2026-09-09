import type { SupabaseClient } from "@supabase/supabase-js";
import { composeApprovalNoticeEmail, type MailSender } from "@jhtechsaas/shared";

// 승인 요청 알림 잡(#285 A-1) — issued 전이 시 DB 트리거가 initial(즉시)·reminder(+3일) 2건을 예약.
// 수신자 = 활성 + `service_reports.approve` 보유자(관리자만인 계정·비활성 제외), 이메일은 auth.users(admin API).
// 발신자 = 리포트 기사 하이웍스 ID 스냅샷 → 없으면 env 폴백(HIWORKS_NOTICE_FALLBACK_USER) → 그것도 없으면 throw.
// 멱등성 = at-least-once(D-C25): 사내 알림이라 재시도로 2통이 가도 허용. 발송 직전 status 재확인(issued 아니면 스킵).
// 실패 규칙 = 공용 runner(3회 후 failed, D-C26). 결재 진행 자체엔 영향 없는 best-effort.

export type ApprovalNoticeOpts = {
  adminBaseUrl: string; // 상세 링크 호스트(예: https://admin.jhtech.co.kr)
  fallbackSenderId?: string;
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function fmtKstMinute(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const kst = new Date(t + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`;
}

// 승인 권한자 이메일 목록 — profiles(권한·활성) → auth.admin(이메일). 이메일 없는 계정은 제외.
async function listApproverEmails(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .contains("permissions", ["service_reports.approve"]);
  if (error) throw new Error(`승인자 조회 실패: ${error.message}`);
  const emails: string[] = [];
  for (const row of data ?? []) {
    const id = str((row as Record<string, unknown>).id);
    const { data: u, error: uErr } = await supabase.auth.admin.getUserById(id);
    if (uErr) throw new Error(`승인자 이메일 조회 실패(${id}): ${uErr.message}`);
    const email = u.user?.email?.trim();
    if (email) emails.push(email);
  }
  return emails.sort();
}

export async function processApprovalNoticeJob(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  mailSender: MailSender,
  opts: ApprovalNoticeOpts,
): Promise<void> {
  const id = str(payload.service_report_id);
  if (!id) throw new Error("payload.service_report_id 누락");
  const reminder = str(payload.kind) === "reminder";

  const { data: report, error } = await supabase
    .from("service_reports")
    .select("seq_no, status, customer_name, device_name, total, charge_type, engineer_name, issued_at, sender_hiworks_user_id")
    .eq("id", id)
    .single();
  if (error || !report) throw new Error(`리포트 조회 실패: ${error?.message ?? "없음"}`);
  const r = report as Record<string, unknown>;
  if (str(r.status) !== "issued") {
    // 이미 승인·무효화됨(reminder 도래 전 결재 완료가 정상 경로) — 부르지 않고 성공 종료.
    console.log(`[worker] approval_notice 스킵 — 상태 ${str(r.status)} report=${id} kind=${reminder ? "reminder" : "initial"}`);
    return;
  }

  const recipients = await listApproverEmails(supabase);
  if (recipients.length === 0) {
    console.warn(`[worker] approval_notice 수신자 0명 — 승인 권한자(활성·이메일)가 없습니다 report=${id}`);
    return;
  }

  const fromUserId = str(r.sender_hiworks_user_id) || opts.fallbackSenderId || "";
  if (!fromUserId) {
    throw new Error("발신자 하이웍스 ID 없음 — 기사 프로필 hiworks_user_id 또는 HIWORKS_NOTICE_FALLBACK_USER 설정 필요");
  }

  const seqNo = str(r.seq_no);
  const { subject, html } = composeApprovalNoticeEmail({
    seqNo,
    customerName: str(r.customer_name),
    deviceName: str(r.device_name),
    engineerName: str(r.engineer_name),
    total: num(r.total),
    isFree: r.charge_type === "free",
    issuedAtLabel: fmtKstMinute(str(r.issued_at)),
    detailUrl: `${opts.adminBaseUrl.replace(/\/+$/, "")}/admin/service-reports/${id}`,
    reminder,
  });

  const transient: string[] = [];
  for (const to of recipients) {
    const result = await mailSender.send({ fromUserId, to, cc: null, bcc: null, subject, html });
    console.log(
      `[worker] hiworks 응답(approval_notice) report=${id} to=${to} ok=${result.ok} permanent=${result.permanent ?? "-"} raw=${JSON.stringify(result.raw)}`,
    );
    const { error: logErr } = await supabase.from("email_log").insert({
      service_report_id: id,
      to_email: to,
      kind: "approval_notice",
      subject,
      status: result.ok ? "sent" : "failed",
      sent_at: result.ok ? new Date().toISOString() : null,
      error_msg: result.ok ? null : (result.error ?? "발송 실패").slice(0, 500),
    });
    if (logErr) throw new Error(`email_log 기록 실패: ${logErr.message}`);
    if (!result.ok && !result.permanent) transient.push(`${to}: ${result.error ?? "?"}`);
  }
  if (transient.length > 0) {
    // 일시 실패는 공용 재시도(at-least-once — 이미 받은 수신자는 재시도 시 다시 받을 수 있음, 사내 메일이라 허용).
    throw new Error(`승인 알림 일시 실패 ${transient.length}건: ${transient.join("; ")}`);
  }
  console.log(`[worker] approval_notice 발송 완료 report=${id} ${seqNo} kind=${reminder ? "reminder" : "initial"} n=${recipients.length}`);
}
