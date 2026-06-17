// 메일 발송기 경계 — 웹·워커 공유. 채널(하이웍스) 독립 인터페이스 + 구현 2종 + 템플릿.
// 첨부 확장형: MailMessage.attachments는 v1 미사용이지만 인터페이스에 포함(첨부 확정 시 교체 지점).
// 멱등성은 워커 CAS + DB가 책임지고, 여기선 "한 번 보내는 행위"와 실패 분류만 담당.
import { z } from "zod";

export interface MailAttachment {
  filename: string;
  content: Uint8Array;
}

export interface MailMessage {
  fromUserId: string; // 하이웍스 발송자 계정 ID(user_id) — 담당자 개인 명의
  to: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  html: string; // 메일 본문(content)
  attachments?: MailAttachment[]; // v1 미사용(하이웍스 첨부 확정 시 사용)
}

export interface MailSendResult {
  ok: boolean;
  raw: unknown;
  error?: string;
  permanent?: boolean; // true=영구 실패(재시도 금지), false=재시도 가능
}

export interface MailSender {
  send(msg: MailMessage): Promise<MailSendResult>;
}

// 로컬·테스트용 가짜 발송기 — 계정/토큰 0개로 전 구간 검증. 호출 기록으로 멱등성 단언.
export class FakeMailSender implements MailSender {
  public readonly sent: MailMessage[] = [];
  public failNext = false; // 다음 send를 1회 실패로 모사(재시도 경로 테스트)
  public failPermanent = false; // 위 실패를 영구 실패로 분류할지

  async send(msg: MailMessage): Promise<MailSendResult> {
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, raw: null, error: "fake-fail", permanent: this.failPermanent };
    }
    this.sent.push(msg);
    return { ok: true, raw: { code: "SUC" } };
  }
}

export const HIWORKS_SEND_URL = "https://api.hiworks.com/office/v2/webmail/sendMail";

// 외부 API 응답은 항상 Zod 검증(타입 직접 신뢰 금지).
const HiworksResponseSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  result: z
    .object({ successList: z.array(z.string()).optional() })
    .partial()
    .optional(),
});

// 하이웍스 응답 → 성공/실패(영구·재시도) 분류.
// 5xx·네트워크=재시도, 4xx·비SUC·부분실패=영구(재시도해도 같은 결과 + 한도 소모).
export function parseHiworksResponse(httpStatus: number, json: unknown, to: string): MailSendResult {
  if (httpStatus >= 500) return { ok: false, raw: json, error: `hiworks ${httpStatus}`, permanent: false };
  // 429(rate limit)·408(timeout)은 일시적 → 재시도(영구 아님). 한도는 잠시 후 회복.
  if (httpStatus === 429 || httpStatus === 408) return { ok: false, raw: json, error: `hiworks ${httpStatus}`, permanent: false };
  if (httpStatus >= 400) return { ok: false, raw: json, error: `hiworks ${httpStatus}`, permanent: true };
  const parsed = HiworksResponseSchema.safeParse(json);
  if (!parsed.success) return { ok: false, raw: json, error: "하이웍스 응답 파싱 실패", permanent: true };
  const { code, result } = parsed.data;
  if (code !== "SUC") return { ok: false, raw: json, error: `code=${code}`, permanent: true };
  const list = result?.successList ?? [];
  if (!list.includes(to)) {
    return { ok: false, raw: json, error: "수신처가 successList에 없음(부분 실패)", permanent: true };
  }
  return { ok: true, raw: json };
}

// 하이웍스 메일 발송 REST 구현. POST /office/v2/webmail/sendMail, body=form-data, Bearer office_token.
export class HiworksMailSender implements MailSender {
  constructor(
    private readonly officeToken: string,
    private readonly opts: { fetch?: typeof fetch; url?: string } = {},
  ) {}

  async send(msg: MailMessage): Promise<MailSendResult> {
    const form = new FormData();
    form.set("to", msg.to);
    form.set("user_id", msg.fromUserId); // 발송자 = 담당자 하이웍스 계정 ID
    if (msg.cc) form.set("cc", msg.cc);
    if (msg.bcc) form.set("bcc", msg.bcc);
    form.set("subject", msg.subject);
    form.set("content", msg.html);
    form.set("save_sent_mail", "Y"); // 담당자 보낸편지함 적재(핵심 요구)

    const doFetch = this.opts.fetch ?? fetch;
    try {
      const res = await doFetch(this.opts.url ?? HIWORKS_SEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.officeToken}` },
        body: form,
      });
      const json = await res.json().catch(() => null);
      return parseHiworksResponse(res.status, json, msg.to);
    } catch (e) {
      // 네트워크 오류 = 메일이 갔는지 불명 → 재시도 가능(중복은 워커 CAS가 방지)
      return { ok: false, raw: null, error: e instanceof Error ? e.message : String(e), permanent: false };
    }
  }
}

const SUPPLIER_NAME = "(주)재현테크";

// 모달 프리필용 기본 제목·본문(영업이 편집 가능).
export function defaultQuoteEmail(p: { quoteNo: string; companyName?: string | null }): {
  subject: string;
  body: string;
} {
  const company = p.companyName?.trim() || "고객";
  return {
    subject: `[${SUPPLIER_NAME}] 견적서 송부 - ${p.quoteNo}`,
    body: `${company} 담당자님,\n\n요청하신 견적서를 송부드립니다.\n아래 링크에서 견적서(PDF)를 확인하실 수 있습니다.\n\n문의사항은 회신 부탁드립니다.\n감사합니다.`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 워커가 발송 시점에 서명URL을 본문에 주입해 최종 HTML 생성. 사용자 본문은 이스케이프(주입 방지).
// 서명URL은 보안 토큰이 붙어 매우 길다 → 본문 텍스트로 노출하지 않고 깔끔한 버튼(href에만)으로 보낸다.
// 버튼은 인라인 스타일(메일 클라이언트는 CSS 제한적). 스타일이 제거되는 클라용 텍스트 폴백 링크도 둔다.
export function composeQuoteEmailHtml(p: { body: string; downloadUrl: string; quoteNo: string }): string {
  const bodyHtml = escapeHtml(p.body).replace(/\r?\n/g, "<br>");
  const url = escapeHtml(p.downloadUrl);
  const quoteNo = escapeHtml(p.quoteNo);
  return [
    `<div style="font-family:sans-serif;line-height:1.6;color:#1a1a1a">`,
    `<p>${bodyHtml}</p>`,
    `<hr style="border:none;border-top:1px solid #ddd;margin:16px 0">`,
    `<p style="margin:0 0 12px"><strong>견적서</strong> (${quoteNo})</p>`,
    `<p style="margin:0 0 16px">`,
    `<a href="${url}" style="display:inline-block;background:#176455;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">견적서 PDF 다운로드</a>`,
    `</p>`,
    `<p style="color:#888;font-size:12px">버튼이 보이지 않으면 <a href="${url}" style="color:#176455">이 링크</a>를 눌러 주세요. 보안을 위해 링크는 일정 기간 후 만료됩니다.</p>`,
    `</div>`,
  ].join("");
}
