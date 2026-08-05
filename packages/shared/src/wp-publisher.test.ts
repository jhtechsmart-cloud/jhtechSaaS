import { describe, expect, it } from "vitest";
import {
  FakeWpPublisher,
  WpRestPublisher,
  classifyWpHttpStatus,
  type WpPostInput,
} from "./wp-publisher";

const post: WpPostInput = {
  title: "자동 급지 커팅기",
  content: "<p>본문</p>",
  categories: [9, 12],
  equipmentUuid: "11111111-1111-4111-8111-111111111111",
};

describe("FakeWpPublisher", () => {
  it("호출을 순서대로 기록하고 결정적 id를 반환한다", async () => {
    const fake = new FakeWpPublisher();
    const created = await fake.createDraft(post);
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    expect(created.value.postId).toBe(1);

    const media = await fake.uploadMedia({
      filename: "a.png",
      content: new Uint8Array([1]),
      mimeType: "image/png",
    });
    expect(media.ok).toBe(true);
    if (!media.ok) throw new Error("unreachable");
    expect(media.value.mediaId).toBe(1);
    expect(media.value.sourceUrl).toContain("a.png");

    expect(fake.calls.map((c) => c.method)).toEqual(["createDraft", "uploadMedia"]);
  });

  it("failNext(kind)는 다음 호출 1회만 해당 종별로 실패시킨다", async () => {
    const fake = new FakeWpPublisher();
    fake.failNext("transient");
    const r1 = await fake.setStatus(1, "publish");
    expect(r1.ok).toBe(false);
    if (r1.ok) throw new Error("unreachable");
    expect(r1.kind).toBe("transient");
    const r2 = await fake.setStatus(1, "publish");
    expect(r2.ok).toBe(true);
  });

  it("failNext('not_found')로 원격 글 삭제(404)를 모사한다", async () => {
    const fake = new FakeWpPublisher();
    fake.failNext("not_found");
    const r = await fake.updatePost(99, post);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.kind).toBe("not_found");
  });

  it("deletePost는 호출 기록을 남기고 findByMeta 대상에서 제거한다 (CAS 패자 정리)", async () => {
    const fake = new FakeWpPublisher();
    await fake.createDraft(post);
    const del = await fake.deletePost(1);
    expect(del.ok).toBe(true);
    const found = await fake.findByMeta(post.equipmentUuid);
    if (!found.ok) throw new Error("unreachable");
    expect(found.value).toBeNull();
    expect(fake.calls.at(-2)?.method).toBe("deletePost");
  });

  it("findByMeta는 createDraft로 만든 글을 equipmentUuid로 찾는다 (재연결 모사)", async () => {
    const fake = new FakeWpPublisher();
    await fake.createDraft(post);
    const found = await fake.findByMeta(post.equipmentUuid);
    expect(found.ok).toBe(true);
    if (!found.ok) throw new Error("unreachable");
    expect(found.value?.postId).toBe(1);
    const missing = await fake.findByMeta("22222222-2222-4222-8222-222222222222");
    if (!missing.ok) throw new Error("unreachable");
    expect(missing.value).toBeNull();
  });
});

describe("classifyWpHttpStatus", () => {
  it("5xx·429·408 = transient(재시도), 401·403 = auth, 404 = not_found, 그 외 4xx = permanent", () => {
    expect(classifyWpHttpStatus(500)).toBe("transient");
    expect(classifyWpHttpStatus(503)).toBe("transient");
    expect(classifyWpHttpStatus(429)).toBe("transient");
    expect(classifyWpHttpStatus(408)).toBe("transient");
    expect(classifyWpHttpStatus(401)).toBe("auth");
    expect(classifyWpHttpStatus(403)).toBe("auth");
    expect(classifyWpHttpStatus(404)).toBe("not_found");
    expect(classifyWpHttpStatus(400)).toBe("permanent");
  });
});

describe("WpRestPublisher", () => {
  const env = {
    apiUrl: "https://jhtech.co.kr/wp-json",
    user: "saas-bot",
    appPassword: "abcd efgh",
  };

  it("https가 아닌 apiUrl은 생성 시점에 거부한다 (앱패스워드 평문 유출 방지)", () => {
    expect(() => new WpRestPublisher({ ...env, apiUrl: "http://jhtech.co.kr/wp-json" })).toThrow(
      /https/i,
    );
  });

  it("Basic 인증 헤더로 호출하고, 정상 응답은 Zod 검증 후 postId를 돌려준다", async () => {
    let captured: { url: string; auth: string | null } | null = null;
    const fakeFetch: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      captured = { url: String(input), auth: headers.get("Authorization") };
      return new Response(JSON.stringify({ id: 42, status: "draft", link: "https://jhtech.co.kr/?p=42" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };
    const pub = new WpRestPublisher(env, { fetch: fakeFetch });
    const r = await pub.createDraft(post);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.postId).toBe(42);
    expect(captured!.url).toContain("/wp/v2/posts");
    expect(captured!.auth).toBe(`Basic ${btoa("saas-bot:abcd efgh")}`);
  });

  it("응답 스키마가 어긋나면 permanent 실패로 분류한다 (외부 응답 직접 신뢰 금지)", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ unexpected: true }), { status: 200 });
    const pub = new WpRestPublisher(env, { fetch: fakeFetch });
    const r = await pub.createDraft(post);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.kind).toBe("permanent");
  });

  it("HTTP 상태별 실패 종별을 반환한다 (404=not_found, 401=auth, 500=transient)", async () => {
    for (const [status, kind] of [
      [404, "not_found"],
      [401, "auth"],
      [500, "transient"],
    ] as const) {
      const fakeFetch: typeof fetch = async () =>
        new Response(JSON.stringify({ message: "err" }), { status });
      const pub = new WpRestPublisher(env, { fetch: fakeFetch });
      const r = await pub.setStatus(1, "publish");
      expect(r.ok).toBe(false);
      if (r.ok) throw new Error("unreachable");
      expect(r.kind).toBe(kind);
    }
  });

  it("네트워크 예외는 transient로 분류한다", async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error("ECONNRESET");
    };
    const pub = new WpRestPublisher(env, { fetch: fakeFetch });
    const r = await pub.setStatus(1, "publish");
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.kind).toBe("transient");
  });

  it("uploadMedia는 파일명·타입 헤더를 싣고 mediaId·sourceUrl을 돌려준다", async () => {
    let captured: { url: string; disposition: string | null; type: string | null } | null = null;
    const fakeFetch: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      captured = {
        url: String(input),
        disposition: headers.get("Content-Disposition"),
        type: headers.get("Content-Type"),
      };
      return new Response(
        JSON.stringify({ id: 7, source_url: "https://jhtech.co.kr/wp-content/uploads/a.png" }),
        { status: 201 },
      );
    };
    const pub = new WpRestPublisher(env, { fetch: fakeFetch });
    const r = await pub.uploadMedia({
      filename: "a.png",
      content: new Uint8Array([1, 2]),
      mimeType: "image/png",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value).toEqual({
      mediaId: 7,
      sourceUrl: "https://jhtech.co.kr/wp-content/uploads/a.png",
    });
    expect(captured!.url).toContain("/wp/v2/media");
    expect(captured!.disposition).toContain('filename="a.png"');
    expect(captured!.type).toBe("image/png");
  });
});
