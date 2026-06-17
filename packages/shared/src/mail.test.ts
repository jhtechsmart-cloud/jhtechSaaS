import { describe, expect, test } from "vitest";
import {
  composeQuoteEmailHtml,
  defaultQuoteEmail,
  FakeMailSender,
  HiworksMailSender,
  parseHiworksResponse,
} from "./mail";

describe("FakeMailSender", () => {
  test("기본은 발송 성공 + 기록", async () => {
    const s = new FakeMailSender();
    const r = await s.send({ fromUserId: "hong", to: "a@b.com", subject: "s", html: "<p>h</p>" });
    expect(r.ok).toBe(true);
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0].to).toBe("a@b.com");
  });

  test("failNext로 일시 실패 모사(재시도 가능, 기록 안 함)", async () => {
    const s = new FakeMailSender();
    s.failNext = true;
    const r = await s.send({ fromUserId: "hong", to: "a@b.com", subject: "s", html: "h" });
    expect(r.ok).toBe(false);
    expect(r.permanent).toBe(false);
    expect(s.sent).toHaveLength(0);
  });
});

function mockFetch(status: number, json: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { status, json: async () => json } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("HiworksMailSender — 문서 계약(form-data·헤더·save_sent_mail)", () => {
  test("form-data 필드 + Bearer 헤더 + save_sent_mail=Y, SUC+successList면 성공", async () => {
    const { fn, calls } = mockFetch(200, { code: "SUC", message: "", result: { successList: ["cust@x.com"] } });
    const s = new HiworksMailSender("TOKEN123", { fetch: fn });
    const r = await s.send({ fromUserId: "hong", to: "cust@x.com", cc: "c@x.com", subject: "제목", html: "<p>본문</p>" });
    expect(r.ok).toBe(true);
    const { url, init } = calls[0];
    expect(url).toContain("/office/v2/webmail/sendMail");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN123");
    const form = init.body as FormData;
    expect(form.get("to")).toBe("cust@x.com");
    expect(form.get("user_id")).toBe("hong");
    expect(form.get("cc")).toBe("c@x.com");
    expect(form.get("subject")).toBe("제목");
    expect(form.get("content")).toBe("<p>본문</p>");
    expect(form.get("save_sent_mail")).toBe("Y");
  });

  test("SUC인데 successList에 수신처 없으면 실패(부분실패 오기록 방지)", async () => {
    const { fn } = mockFetch(200, { code: "SUC", result: { successList: ["other@x.com"] } });
    const r = await new HiworksMailSender("T", { fetch: fn }).send({
      fromUserId: "hong",
      to: "cust@x.com",
      subject: "s",
      html: "h",
    });
    expect(r.ok).toBe(false);
  });

  test("4xx = 영구 실패(재시도 안 함)", async () => {
    const { fn } = mockFetch(400, { code: "ERR", message: "bad" });
    const r = await new HiworksMailSender("T", { fetch: fn }).send({ fromUserId: "h", to: "a@b.com", subject: "s", html: "h" });
    expect(r.ok).toBe(false);
    expect(r.permanent).toBe(true);
  });

  test("5xx = 재시도 가능", async () => {
    const { fn } = mockFetch(503, { code: "ERR" });
    const r = await new HiworksMailSender("T", { fetch: fn }).send({ fromUserId: "h", to: "a@b.com", subject: "s", html: "h" });
    expect(r.ok).toBe(false);
    expect(r.permanent).toBe(false);
  });

  test("네트워크 throw = 재시도 가능", async () => {
    const fn = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const r = await new HiworksMailSender("T", { fetch: fn }).send({ fromUserId: "h", to: "a@b.com", subject: "s", html: "h" });
    expect(r.ok).toBe(false);
    expect(r.permanent).toBe(false);
  });
});

describe("parseHiworksResponse 분류", () => {
  test("2xx SUC + successList 포함 → ok", () => {
    expect(parseHiworksResponse(200, { code: "SUC", result: { successList: ["a@b.com"] } }, "a@b.com").ok).toBe(true);
  });
  test("2xx 비SUC → 영구 실패", () => {
    const r = parseHiworksResponse(200, { code: "ERR", message: "x" }, "a@b.com");
    expect(r.ok).toBe(false);
    expect(r.permanent).toBe(true);
  });
  test("파싱 불가 응답 → 영구 실패(안전)", () => {
    expect(parseHiworksResponse(200, null, "a@b.com").ok).toBe(false);
  });
});

describe("이메일 템플릿", () => {
  test("defaultQuoteEmail: 제목에 견적번호", () => {
    const { subject, body } = defaultQuoteEmail({ quoteNo: "JHQ-20260616-001-V1", companyName: "재현테크" });
    expect(subject).toContain("JHQ-20260616-001-V1");
    expect(body.length).toBeGreaterThan(0);
  });
  test("composeQuoteEmailHtml: 사용자 본문 + 다운로드 링크 포함", () => {
    const html = composeQuoteEmailHtml({ body: "안녕하세요 견적 보냅니다", downloadUrl: "https://x/y.pdf?sig=1", quoteNo: "JHQ-1" });
    expect(html).toContain("안녕하세요 견적 보냅니다");
    expect(html).toContain("https://x/y.pdf?sig=1");
  });
  test("composeQuoteEmailHtml: 사용자 본문 HTML 이스케이프(주입 방지)", () => {
    const html = composeQuoteEmailHtml({ body: "<script>alert(1)</script>", downloadUrl: "https://x", quoteNo: "Q" });
    expect(html).not.toContain("<script>");
  });
  test("composeQuoteEmailHtml: 긴 URL은 href에만, 보이는 건 깔끔한 다운로드 버튼", () => {
    const url = "https://x/y.pdf?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const html = composeQuoteEmailHtml({ body: "본문", downloadUrl: url, quoteNo: "JHQ-1" });
    // 친절한 버튼 텍스트가 보인다
    expect(html).toContain("견적서(PDF) 다운로드");
    // URL은 클릭 대상(href)으로만 — 긴 주소가 본문 텍스트로 노출되지 않는다
    expect(html).toContain(`href="${url}"`);
    expect(html).not.toContain(`>${url}<`);
  });
  test("composeQuoteEmailHtml: 카탈로그 URL 있으면 두 번째 버튼", () => {
    const html = composeQuoteEmailHtml({
      body: "본문",
      downloadUrl: "https://x/q.pdf",
      quoteNo: "Q1",
      catalogDownloadUrl: "https://x/c.pdf",
    });
    expect(html).toContain("제품 카탈로그(PDF) 다운로드");
    expect(html).toContain('href="https://x/c.pdf"');
  });
  test("composeQuoteEmailHtml: 카탈로그 URL 없으면 카탈로그 버튼 없음", () => {
    const html = composeQuoteEmailHtml({ body: "본문", downloadUrl: "https://x/q.pdf", quoteNo: "Q1" });
    expect(html).not.toContain("제품 카탈로그");
  });
  test("composeQuoteEmailHtml: 재현테크 브랜드 헤더 + 견적번호 + 테이블 레이아웃", () => {
    const html = composeQuoteEmailHtml({ body: "본문", downloadUrl: "https://x", quoteNo: "JHQ-20260617-009-V1" });
    // 발신자가 재현테크임을 본문에서 알 수 있다(헤더·푸터).
    expect(html).toContain("(주)재현테크");
    // 견적번호가 정보 카드에 노출된다.
    expect(html).toContain("JHQ-20260617-009-V1");
    // 이메일 클라이언트 호환을 위한 테이블 기반 레이아웃.
    expect(html).toContain("<table");
    // 푸터에 회사 연락처(본사 전화).
    expect(html).toContain("02-839-7723");
  });
});
