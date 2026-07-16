// 메일 발송기 경계 — 웹·워커 공유. 채널(하이웍스) 독립 인터페이스 + 구현 2종 + 템플릿.
// 첨부 확장형: MailMessage.attachments는 v1 미사용이지만 인터페이스에 포함(첨부 확정 시 교체 지점).
// 멱등성은 워커 CAS + DB가 책임지고, 여기선 "한 번 보내는 행위"와 실패 분류만 담당.
import { z } from "zod";
import { SUPPLIER } from "./company";

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

const SUPPLIER_NAME = SUPPLIER.name;

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
// 디자인: (주)재현테크 브랜드 견적서 안내 메일. 발신자가 재현테크임을 헤더·푸터로 명확히.
// 이메일 클라이언트(Gmail·네이버·하이웍스·Outlook)는 CSS가 제한적 → 테이블 기반 + 인라인 스타일,
// flex/grid·외부CSS·웹폰트 금지. 서명URL은 길어서 텍스트로 노출하지 않고 큰 버튼(href에만)으로.
const PINE = "#176455";
const PINE_SOFT = "#f0f7f4";
export function composeQuoteEmailHtml(p: {
  body: string;
  downloadUrl: string;
  quoteNo: string;
  catalogDownloadUrl?: string;
}): string {
  const bodyHtml = escapeHtml(p.body).replace(/\r?\n/g, "<br>");
  const url = escapeHtml(p.downloadUrl);
  const catalogUrl = p.catalogDownloadUrl ? escapeHtml(p.catalogDownloadUrl) : null;
  const quoteNo = escapeHtml(p.quoteNo);
  const font =
    "font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif";
  return [
    `<div style="margin:0;padding:24px 12px;background:#f4f6f5;${font}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5"><tr><td align="center">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e3e8e6;border-radius:12px;overflow:hidden">`,

    // 헤더 밴드 — 파인 그린 + 회사명 + 안내 부제
    `<tr><td style="background:${PINE};padding:22px 28px">`,
    `<div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:.3px">${escapeHtml(SUPPLIER.name)}</div>`,
    `<div style="color:#cde7dd;font-size:13px;margin-top:5px">견적서를 보내드립니다</div>`,
    `</td></tr>`,

    // 본문 — 사용자 편집 본문 + 견적 정보 카드 + 다운로드 버튼
    `<tr><td style="padding:26px 28px">`,
    `<div style="color:#1a1a1a;font-size:15px;line-height:1.7">${bodyHtml}</div>`,

    // 견적 정보 카드(좌측 파인 보더)
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;background:${PINE_SOFT};border-left:4px solid ${PINE};border-radius:6px"><tr><td style="padding:14px 16px">`,
    `<div style="color:#5b6f69;font-size:12px;margin-bottom:3px">견적서 번호</div>`,
    `<div style="color:${PINE};font-size:16px;font-weight:700;font-family:'Courier New',monospace">${quoteNo}</div>`,
    `</td></tr></table>`,

    // 다운로드 버튼(테이블 기반 — Outlook 호환). 크고 가운데, 눈에 잘 띄게.
    `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:6px auto 14px"><tr>`,
    `<td align="center" style="border-radius:8px;background:${PINE}">`,
    `<a href="${url}" style="display:inline-block;padding:15px 38px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;letter-spacing:.3px">📄&nbsp;&nbsp;견적서(PDF) 다운로드</a>`,
    `</td></tr></table>`,

    // 카탈로그 버튼(선택) — 장비에 카탈로그가 등록돼 있으면 견적서 아래 아웃라인 버튼으로.
    ...(catalogUrl
      ? [
          `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 14px"><tr>`,
          `<td align="center" style="border-radius:8px;border:1.5px solid ${PINE}">`,
          `<a href="${catalogUrl}" style="display:inline-block;padding:13px 30px;color:${PINE};font-size:15px;font-weight:700;text-decoration:none">📘&nbsp;&nbsp;제품 카탈로그(PDF) 다운로드</a>`,
          `</td></tr></table>`,
        ]
      : []),

    `<div style="text-align:center;color:#8a9b95;font-size:12px;line-height:1.6">버튼이 보이지 않으면 <a href="${url}" style="color:${PINE}">여기</a>를 눌러 주세요.<br>보안을 위해 다운로드 링크는 일정 기간 후 만료됩니다.</div>`,
    `</td></tr>`,

    // 푸터 — 회사 정보
    `<tr><td style="background:#f4f6f5;border-top:1px solid #e3e8e6;padding:18px 28px">`,
    `<div style="color:#3a4a45;font-size:13px;font-weight:700;margin-bottom:4px">${escapeHtml(SUPPLIER.name)}</div>`,
    `<div style="color:#5b6f69;font-size:12px;line-height:1.7">${escapeHtml(SUPPLIER.address)}<br>본사 ${escapeHtml(SUPPLIER.phoneHQ)} · 대구 ${escapeHtml(SUPPLIER.phoneDaegu)}</div>`,
    `<div style="color:#a8b5b0;font-size:11px;margin-top:10px">본 메일은 견적 담당자가 발송했습니다.</div>`,
    `</td></tr>`,

    `</table></td></tr></table></div>`,
  ].join("");
}

// 서비스 리포트 발송 메일 — 견적 메일과 동일 브랜드 셸(테이블 기반·인라인 스타일).
// 링크는 7일 서명URL(서명·개인정보 문서라 견적 30일보다 짧게 — autoplan 결정#4).
export function defaultServiceReportEmail(p: { customerName: string; seqNo: string }): {
  subject: string;
  body: string;
} {
  const name = p.customerName.trim() || "고객";
  return {
    subject: `[${SUPPLIER_NAME}] 서비스 리포트 - ${p.seqNo}`,
    body: `${name} 담당자님,\n\n금일 진행된 장비 점검·수리 결과 리포트를 보내드립니다.\n아래 링크에서 서비스 리포트(PDF)를 확인하실 수 있습니다.\n\n문의사항은 회신 부탁드립니다.\n감사합니다.`,
  };
}

export function composeServiceReportEmailHtml(p: {
  body: string;
  downloadUrl: string;
  seqNo: string;
  deviceName: string;
}): string {
  const bodyHtml = escapeHtml(p.body).replace(/\r?\n/g, "<br>");
  const url = escapeHtml(p.downloadUrl);
  const seqNo = escapeHtml(p.seqNo);
  const deviceName = escapeHtml(p.deviceName);
  const font = "font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif";
  return [
    `<div style="margin:0;padding:24px 12px;background:#f4f6f5;${font}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5"><tr><td align="center">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e3e8e6;border-radius:12px;overflow:hidden">`,
    `<tr><td style="background:${PINE};padding:22px 28px">`,
    `<div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:.3px">${escapeHtml(SUPPLIER.name)}</div>`,
    `<div style="color:#cde7dd;font-size:13px;margin-top:5px">서비스 리포트를 보내드립니다</div>`,
    `</td></tr>`,
    `<tr><td style="padding:26px 28px">`,
    `<div style="color:#1a1a1a;font-size:15px;line-height:1.7">${bodyHtml}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;background:${PINE_SOFT};border-left:4px solid ${PINE};border-radius:6px"><tr><td style="padding:14px 16px">`,
    `<div style="color:#5b6f69;font-size:12px;margin-bottom:3px">리포트 번호</div>`,
    `<div style="color:${PINE};font-size:16px;font-weight:700;font-family:'Courier New',monospace">${seqNo}</div>`,
    `<div style="color:#5b6f69;font-size:12px;margin-top:8px">대상 장비</div>`,
    `<div style="color:#1a2a25;font-size:14px;font-weight:600">${deviceName}</div>`,
    `</td></tr></table>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:6px auto 14px"><tr>`,
    `<td align="center" style="border-radius:8px;background:${PINE}">`,
    `<a href="${url}" style="display:inline-block;padding:15px 38px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;letter-spacing:.3px">🧾&nbsp;&nbsp;서비스 리포트(PDF) 확인</a>`,
    `</td></tr></table>`,
    `<div style="text-align:center;color:#8a9b95;font-size:12px;line-height:1.6">버튼이 보이지 않으면 <a href="${url}" style="color:${PINE}">여기</a>를 눌러 주세요.<br>보안을 위해 링크는 7일 후 만료됩니다.</div>`,
    `</td></tr>`,
    `<tr><td style="background:#f4f6f5;border-top:1px solid #e3e8e6;padding:18px 28px">`,
    `<div style="color:#3a4a45;font-size:13px;font-weight:700;margin-bottom:4px">${escapeHtml(SUPPLIER.name)}</div>`,
    `<div style="color:#5b6f69;font-size:12px;line-height:1.7">${escapeHtml(SUPPLIER.address)}<br>본사 ${escapeHtml(SUPPLIER.phoneHQ)} · 대구 ${escapeHtml(SUPPLIER.phoneDaegu)}</div>`,
    `<div style="color:#a8b5b0;font-size:11px;margin-top:10px">본 메일은 A/S 담당 엔지니어가 발송했습니다.</div>`,
    `</td></tr>`,
    `</table></td></tr></table></div>`,
  ].join("");
}
