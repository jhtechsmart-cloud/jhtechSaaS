// 워드프레스 발행기 경계 — MailSender와 동형(#253). 실패는 종별 분류(kind)로 반환:
//   transient = 재시도 가치 있음(5xx·네트워크·429) / auth = 앱패스워드 문제(재시도 낭비, 즉시 실패)
//   not_found = 원격 글·미디어 소실(호출측이 재연결/재생성 분기) / permanent = 그 외 4xx·스키마 불일치
// 멱등성·재연결(post meta equipment_uuid)·CAS는 워커+DB RPC가 책임지고, 여기선 "한 번 호출"과 분류만.
import { z } from "zod";

export type WpFailKind = "transient" | "permanent" | "auth" | "not_found";

export type WpResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; kind: WpFailKind };

export interface WpPostInput {
  title: string;
  content: string;
  categories: number[];
  equipmentUuid: string; // post meta에 심는 결정적 재연결 키(slug/이름 검색 금지)
  slug?: string;
  featuredMediaId?: number;
}

export interface WpMediaInput {
  filename: string;
  // ArrayBuffer 기반으로 고정(TS 5.7+ BodyInit 호환 — SharedArrayBuffer 뷰 배제)
  content: Uint8Array<ArrayBuffer>;
  mimeType: string;
}

export interface WpPostRef {
  postId: number;
  link?: string;
  status?: "draft" | "publish";
}

export interface WpPublisher {
  findByMeta(equipmentUuid: string): Promise<WpResult<WpPostRef | null>>;
  createDraft(post: WpPostInput): Promise<WpResult<WpPostRef>>;
  updatePost(postId: number, post: WpPostInput): Promise<WpResult<WpPostRef>>;
  setStatus(postId: number, status: "draft" | "publish"): Promise<WpResult<WpPostRef>>;
  uploadMedia(media: WpMediaInput): Promise<WpResult<{ mediaId: number; sourceUrl: string }>>;
  deleteMedia(mediaId: number): Promise<WpResult<null>>;
  /** 최초 생성 레이스 패자의 자기 draft 정리용(완전 삭제). */
  deletePost(postId: number): Promise<WpResult<null>>;
}

// HTTP 상태 → 실패 종별. 429/408은 일시적(레이트리밋·타임아웃), 401/403은 인증(즉시 실패).
export function classifyWpHttpStatus(status: number): WpFailKind {
  if (status >= 500 || status === 429 || status === 408) return "transient";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  return "permanent";
}

// ── Fake — 계정·SSL 0개로 전 구간 검증. calls[]로 호출 단언, failNext(kind)로 실패 주입.
interface FakeCall {
  method: string;
  args: unknown[];
}

export class FakeWpPublisher implements WpPublisher {
  public readonly calls: FakeCall[] = [];
  private nextFail: WpFailKind | null = null;
  private nextPostId = 1;
  private nextMediaId = 1;
  private readonly postsByUuid = new Map<string, WpPostRef>();

  failNext(kind: WpFailKind): void {
    this.nextFail = kind;
  }

  private record(method: string, args: unknown[]): WpResult<never> | null {
    this.calls.push({ method, args });
    if (this.nextFail) {
      const kind = this.nextFail;
      this.nextFail = null;
      return { ok: false, error: `fake-${kind}`, kind };
    }
    return null;
  }

  async findByMeta(equipmentUuid: string): Promise<WpResult<WpPostRef | null>> {
    const fail = this.record("findByMeta", [equipmentUuid]);
    if (fail) return fail;
    return { ok: true, value: this.postsByUuid.get(equipmentUuid) ?? null };
  }

  async createDraft(post: WpPostInput): Promise<WpResult<WpPostRef>> {
    const fail = this.record("createDraft", [post]);
    if (fail) return fail;
    const ref: WpPostRef = {
      postId: this.nextPostId++,
      status: "draft",
      link: `https://fake.example/?p=${this.nextPostId - 1}`,
    };
    this.postsByUuid.set(post.equipmentUuid, ref);
    return { ok: true, value: ref };
  }

  async updatePost(postId: number, post: WpPostInput): Promise<WpResult<WpPostRef>> {
    const fail = this.record("updatePost", [postId, post]);
    if (fail) return fail;
    return { ok: true, value: { postId, link: `https://fake.example/?p=${postId}` } };
  }

  async setStatus(postId: number, status: "draft" | "publish"): Promise<WpResult<WpPostRef>> {
    const fail = this.record("setStatus", [postId, status]);
    if (fail) return fail;
    return { ok: true, value: { postId, status, link: `https://fake.example/?p=${postId}` } };
  }

  async uploadMedia(media: WpMediaInput): Promise<WpResult<{ mediaId: number; sourceUrl: string }>> {
    const fail = this.record("uploadMedia", [{ filename: media.filename, mimeType: media.mimeType }]);
    if (fail) return fail;
    return {
      ok: true,
      value: {
        mediaId: this.nextMediaId++,
        sourceUrl: `https://fake.example/uploads/${media.filename}`,
      },
    };
  }

  async deleteMedia(mediaId: number): Promise<WpResult<null>> {
    const fail = this.record("deleteMedia", [mediaId]);
    if (fail) return fail;
    return { ok: true, value: null };
  }

  async deletePost(postId: number): Promise<WpResult<null>> {
    const fail = this.record("deletePost", [postId]);
    if (fail) return fail;
    for (const [uuid, ref] of this.postsByUuid) {
      if (ref.postId === postId) this.postsByUuid.delete(uuid);
    }
    return { ok: true, value: null };
  }
}

// ── REST 구현 — WP Application Password Basic 인증. 외부 응답은 전부 Zod 검증.
const WpPostSchema = z.object({
  id: z.number(),
  status: z.enum(["draft", "publish", "pending", "private", "future", "trash"]).optional(),
  link: z.string().optional(),
  // 재연결 검증용 — register_post_meta 미등록이면 응답에 없을 수 있음(그 경우 재연결 불가 = 안전한 재생성)
  meta: z.record(z.string(), z.unknown()).optional(),
});
const WpMediaSchema = z.object({ id: z.number(), source_url: z.string() });
const WpPostListSchema = z.array(WpPostSchema);

export interface WpRestEnv {
  apiUrl: string; // 예: https://jhtech.co.kr/wp-json
  user: string;
  appPassword: string;
}

// 워커가 post meta에 equipment uuid를 심을 때 쓰는 meta key.
// (WP 쪽에 register_post_meta 없이도 REST meta로 쓰려면 플러그인이 필요할 수 있어,
//  v1은 meta 대신 slug 접미가 아닌 "숨은 커스텀 필드" 등록을 라이브 스모크에서 확정한다.)
export const WP_EQUIPMENT_META_KEY = "jhtech_equipment_uuid";

function toPostStatus(s: string | undefined): "draft" | "publish" | undefined {
  return s === "draft" || s === "publish" ? s : undefined;
}

export class WpRestPublisher implements WpPublisher {
  private readonly base: string;
  private readonly auth: string;
  private readonly doFetch: typeof fetch;

  constructor(env: WpRestEnv, opts: { fetch?: typeof fetch } = {}) {
    if (!env.apiUrl.startsWith("https://")) {
      throw new Error("WP_API_URL은 https만 허용합니다 (Application Password 평문 유출 방지)");
    }
    this.base = env.apiUrl.replace(/\/$/, "");
    this.auth = `Basic ${btoa(`${env.user}:${env.appPassword}`)}`;
    this.doFetch = opts.fetch ?? fetch;
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    schema: z.ZodType<T>,
  ): Promise<WpResult<T>> {
    let res: Response;
    try {
      res = await this.doFetch(`${this.base}${path}`, {
        ...init,
        headers: { Authorization: this.auth, ...(init.headers ?? {}) },
        // 무타임아웃이면 WP가 응답을 물고 있을 때 워커 폴링 루프 전체(PDF·메일 포함)가 정지한다
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      // 네트워크 오류·타임아웃 = 도달 불명 → 재시도(중복은 DB CAS가 방지)
      return { ok: false, error: e instanceof Error ? e.message : String(e), kind: "transient" };
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: `wp ${res.status}`, kind: classifyWpHttpStatus(res.status) };
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return { ok: false, error: "WP 응답 파싱 실패", kind: "permanent" };
    }
    return { ok: true, value: parsed.data };
  }

  private postBody(post: WpPostInput, status?: "draft" | "publish"): string {
    return JSON.stringify({
      title: post.title,
      content: post.content,
      categories: post.categories,
      ...(post.slug ? { slug: post.slug } : {}),
      ...(post.featuredMediaId ? { featured_media: post.featuredMediaId } : {}),
      ...(status ? { status } : {}),
      meta: { [WP_EQUIPMENT_META_KEY]: post.equipmentUuid },
    });
  }

  async findByMeta(equipmentUuid: string): Promise<WpResult<WpPostRef | null>> {
    // ⚠️ WP 코어 REST는 meta_key/meta_value 쿼리를 "에러 없이 무시"한다(/review 적대 리뷰 확인) —
    // 쿼리 파라미터만 믿으면 필터 안 된 최신 글이 돌아와 무관 글을 덮어쓴다.
    // 방어 = 응답의 meta[WP_EQUIPMENT_META_KEY]를 클라이언트에서 대조, 불일치·meta 부재는 전부 미발견(null).
    // (register_post_meta(show_in_rest) 미등록 환경이면 항상 null → 재생성 경로 = 오연결보다 안전)
    const r = await this.request(
      `/wp/v2/posts?status=draft,publish&per_page=100&meta_key=${WP_EQUIPMENT_META_KEY}&meta_value=${encodeURIComponent(equipmentUuid)}&context=edit`,
      { method: "GET" },
      WpPostListSchema,
    );
    if (!r.ok) return r;
    const match = r.value.find((p) => p.meta?.[WP_EQUIPMENT_META_KEY] === equipmentUuid);
    if (!match) return { ok: true, value: null };
    return {
      ok: true,
      value: { postId: match.id, link: match.link, status: toPostStatus(match.status) },
    };
  }

  async createDraft(post: WpPostInput): Promise<WpResult<WpPostRef>> {
    const r = await this.request(
      "/wp/v2/posts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: this.postBody(post, "draft"),
      },
      WpPostSchema,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: { postId: r.value.id, link: r.value.link, status: toPostStatus(r.value.status) },
    };
  }

  async updatePost(postId: number, post: WpPostInput): Promise<WpResult<WpPostRef>> {
    const r = await this.request(
      `/wp/v2/posts/${postId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: this.postBody(post),
      },
      WpPostSchema,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: { postId: r.value.id, link: r.value.link, status: toPostStatus(r.value.status) },
    };
  }

  async setStatus(postId: number, status: "draft" | "publish"): Promise<WpResult<WpPostRef>> {
    const r = await this.request(
      `/wp/v2/posts/${postId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
      WpPostSchema,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: { postId: r.value.id, link: r.value.link, status: toPostStatus(r.value.status) },
    };
  }

  async uploadMedia(
    media: WpMediaInput,
  ): Promise<WpResult<{ mediaId: number; sourceUrl: string }>> {
    const r = await this.request(
      "/wp/v2/media",
      {
        method: "POST",
        headers: {
          // 파일명은 안전 문자셋으로 강제 — CR/LF·백슬래시가 헤더를 깨거나(undici throw) 인용을 망가뜨린다
          "Content-Disposition": `attachment; filename="${media.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
          "Content-Type": media.mimeType,
        },
        body: media.content,
      },
      WpMediaSchema,
    );
    if (!r.ok) return r;
    return { ok: true, value: { mediaId: r.value.id, sourceUrl: r.value.source_url } };
  }

  async deleteMedia(mediaId: number): Promise<WpResult<null>> {
    const r = await this.request(
      `/wp/v2/media/${mediaId}?force=true`,
      { method: "DELETE" },
      z.unknown(),
    );
    if (!r.ok) return r;
    return { ok: true, value: null };
  }

  async deletePost(postId: number): Promise<WpResult<null>> {
    const r = await this.request(
      `/wp/v2/posts/${postId}?force=true`,
      { method: "DELETE" },
      z.unknown(),
    );
    if (!r.ok) return r;
    return { ok: true, value: null };
  }
}

// env 3종이 모두 있으면 실제 발행기, 아니면 Fake(실호출 0 — SSL·계정 준비 전 안전).
export function createWpPublisherFromEnv(env: {
  WP_API_URL?: string;
  WP_APP_USER?: string;
  WP_APP_PASSWORD?: string;
}): { publisher: WpPublisher; live: boolean } {
  if (env.WP_API_URL && env.WP_APP_USER && env.WP_APP_PASSWORD) {
    return {
      publisher: new WpRestPublisher({
        apiUrl: env.WP_API_URL,
        user: env.WP_APP_USER,
        appPassword: env.WP_APP_PASSWORD,
      }),
      live: true,
    };
  }
  return { publisher: new FakeWpPublisher(), live: false };
}
