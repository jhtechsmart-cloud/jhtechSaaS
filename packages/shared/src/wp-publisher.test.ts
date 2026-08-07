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

  it("findByMeta: WP가 meta 쿼리를 무시하고 최신 글을 돌려줘도 meta 불일치면 null (무관 글 덮어쓰기 차단)", async () => {
    // WP 코어 REST는 meta_key/meta_value를 조용히 무시한다 — 응답 meta 대조가 유일한 방어선.
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          { id: 500, status: "publish", link: "https://x/latest-blog-post" }, // meta 없음(무관 글)
          { id: 501, status: "publish", meta: { jhtech_equipment_uuid: "다른-uuid" } },
        ]),
        { status: 200 },
      );
    const pub = new WpRestPublisher(env, { fetch: fakeFetch });
    const r = await pub.findByMeta(post.equipmentUuid);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value).toBeNull();
  });

  it("findByMeta: meta가 일치하는 글만 재연결 대상으로 반환한다", async () => {
    const fakeFetch: typeof fetch = async (input) => {
      expect(String(input)).toContain("context=edit");
      return new Response(
        JSON.stringify([
          { id: 500, status: "publish" },
          { id: 77, status: "draft", link: "https://x/?p=77", meta: { jhtech_equipment_uuid: post.equipmentUuid } },
        ]),
        { status: 200 },
      );
    };
    const pub = new WpRestPublisher(env, { fetch: fakeFetch });
    const r = await pub.findByMeta(post.equipmentUuid);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value).toEqual({ postId: 77, link: "https://x/?p=77", status: "draft" });
  });

  it("findByMeta: _fields로 응답을 축소한다 (전문 포함 3.8MB 응답이 30s 타임아웃을 유발한 라이브 스모크 실측)", async () => {
    let url = "";
    const fakeFetch: typeof fetch = async (input) => {
      url = String(input);
      return new Response(JSON.stringify([]), { status: 200 });
    };
    const pub = new WpRestPublisher(env, { fetch: fakeFetch });
    await pub.findByMeta(post.equipmentUuid);
    expect(url).toContain("_fields=id,status,link,meta");
  });

  it("본문이 JSON으로 안 읽히면 transient로 분류한다 (타임아웃 중단·프록시 HTML을 permanent 오분류 금지)", async () => {
    const fakeFetch: typeof fetch = async () => new Response("<html>gateway</html>", { status: 200 });
    const pub = new WpRestPublisher(env, { fetch: fakeFetch });
    const r = await pub.findByMeta(post.equipmentUuid);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.kind).toBe("transient");
  });

  it("deletePost·deleteMedia는 POST + X-HTTP-Method-Override를 쓴다 (가비아 Apache가 DELETE 메서드를 302로 차단 — 라이브 실측)", async () => {
    const calls: Array<{ method?: string; override: string | null }> = [];
    const fakeFetch: typeof fetch = async (_input, init) => {
      calls.push({
        method: init?.method,
        override: new Headers(init?.headers).get("X-HTTP-Method-Override"),
      });
      return new Response(JSON.stringify({ deleted: true }), { status: 200 });
    };
    const pub = new WpRestPublisher(env, { fetch: fakeFetch });
    expect((await pub.deletePost(4596)).ok).toBe(true);
    expect((await pub.deleteMedia(77)).ok).toBe(true);
    for (const c of calls) {
      expect(c.method).toBe("POST");
      expect(c.override).toBe("DELETE");
    }
  });

  it("uploadMedia는 multipart/form-data로 보내고 파일명은 안전 문자셋으로 강제된다 (가비아 ModSecurity가 원시 바이너리 POST를 302 차단 — 라이브 실측)", async () => {
    let body: unknown;
    let contentType: string | null = null;
    const fakeFetch: typeof fetch = async (_input, init) => {
      body = init?.body;
      contentType = new Headers(init?.headers).get("Content-Type");
      return new Response(JSON.stringify({ id: 1, source_url: "https://x/a" }), { status: 201 });
    };
    const pub = new WpRestPublisher(env, { fetch: fakeFetch });
    const r = await pub.uploadMedia({
      filename: 'evil"\nname\\x.png',
      content: new Uint8Array([1]),
      mimeType: "image/png",
    });
    expect(r.ok).toBe(true);
    // Content-Type을 직접 지정하면 multipart boundary가 빠져 깨진다 — fetch가 붙이게 비워둔다.
    expect(contentType).toBeNull();
    expect(body).toBeInstanceOf(FormData);
    const file = (body as FormData).get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("evil__name_x.png");
    expect((file as File).type).toBe("image/png");
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

  it("uploadMedia는 multipart 파일명·타입을 싣고 mediaId·sourceUrl을 돌려준다", async () => {
    let captured: { url: string; file: File | null } | null = null;
    const fakeFetch: typeof fetch = async (input, init) => {
      const form = init?.body instanceof FormData ? init.body : null;
      captured = { url: String(input), file: (form?.get("file") as File | null) ?? null };
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
    expect(captured!.file?.name).toBe("a.png");
    expect(captured!.file?.type).toBe("image/png");
  });
});
