// 워드프레스 발행기 경계 — MailSender와 동형(#253). 실패는 종별 분류(kind)로 반환:
//   transient = 재시도 가치 있음(5xx·네트워크·429) / auth = 앱패스워드 문제(재시도 낭비, 즉시 실패)
//   not_found = 원격 글·미디어 소실(호출측이 재연결/재생성 분기) / permanent = 그 외 4xx·스키마 불일치
// 멱등성·재연결(post meta equipment_uuid)·CAS는 워커+DB RPC가 책임지고, 여기선 "한 번 호출"과 분류만.
import { z } from "zod";
import {
  WP_PLUGIN_CONTRACT,
  WpPluginPrecheckResponseSchema,
  WpPluginSyncResponseSchema,
  parseWpErrorCode,
  toPluginPayload,
  type WpPluginPrecheck,
  type WpPluginSyncOk,
  type WpTemplateSyncInput,
} from "./wp-plugin";

// manual_edit(#262) = 플러그인 해시 감지가 수동 편집을 확인 — 재시도 무의미, force_sync만 해제.
export type WpFailKind = "transient" | "permanent" | "auth" | "not_found" | "manual_edit";

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
  /** #262 플러그인 가용성·수동편집 사전 체크 — 미디어 업로드 전에 호출(고아 미디어 방지). */
  pluginPrecheck(equipmentUuid: string, knownPostId: number | null): Promise<WpResult<WpPluginPrecheck>>;
  /** #262 템플릿 재복제 sync — 신규만 draft, 갱신은 currentStatus 보존, 응답 created로 CAS 정리 판단. */
  pluginSync(input: WpTemplateSyncInput): Promise<WpResult<WpPluginSyncOk>>;
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

  // ── #262 플러그인 모사 — 설치 여부·수동 편집·계약 버전을 시나리오별로 주입.
  public pluginInstalled = true;
  public pluginContract = WP_PLUGIN_CONTRACT;
  public readonly manualEditedUuids = new Set<string>();

  async pluginPrecheck(
    equipmentUuid: string,
    knownPostId: number | null,
  ): Promise<WpResult<WpPluginPrecheck>> {
    const fail = this.record("pluginPrecheck", [equipmentUuid, knownPostId]);
    if (fail) return fail;
    if (!this.pluginInstalled) {
      return { ok: true, value: { pluginAvailable: false, reason: "no_plugin" } };
    }
    if (this.pluginContract !== WP_PLUGIN_CONTRACT) {
      return {
        ok: true,
        value: { pluginAvailable: false, reason: "contract_mismatch", contract: this.pluginContract },
      };
    }
    return {
      ok: true,
      value: {
        pluginAvailable: true,
        contract: this.pluginContract,
        manualEdited: this.manualEditedUuids.has(equipmentUuid),
        postId: knownPostId ?? this.postsByUuid.get(equipmentUuid)?.postId ?? null,
      },
    };
  }

  async pluginSync(input: WpTemplateSyncInput): Promise<WpResult<WpPluginSyncOk>> {
    const fail = this.record("pluginSync", [input]);
    if (fail) return fail;
    if (!this.pluginInstalled) {
      return { ok: false, error: "rest_no_route", kind: "not_found" };
    }
    if (this.manualEditedUuids.has(input.equipmentUuid) && !input.force) {
      return { ok: false, error: "manually_edited", kind: "manual_edit" };
    }
    const existing = input.knownPostId ?? this.postsByUuid.get(input.equipmentUuid)?.postId ?? null;
    const created = existing == null;
    const postId = existing ?? this.nextPostId++;
    const status: "draft" | "publish" = created ? "draft" : (input.currentStatus ?? "draft");
    this.postsByUuid.set(input.equipmentUuid, {
      postId,
      status,
      link: `https://fake.example/?p=${postId}`,
    });
    if (input.force) this.manualEditedUuids.delete(input.equipmentUuid);
    return { ok: true, value: { postId, status, created, link: `https://fake.example/?p=${postId}` } };
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
    if (!res.ok) {
      return { ok: false, error: `wp ${res.status}`, kind: classifyWpHttpStatus(res.status) };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      // 본문 읽기 실패 = 타임아웃 중단·프록시 HTML 등 도달/전송 문제 → 재시도 대상.
      // 스키마 불일치(permanent)와 섞으면 일시 장애가 영구 실패로 고착된다(라이브 스모크 실측).
      return { ok: false, error: "WP 응답 본문 읽기 실패", kind: "transient" };
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
      // _fields 필수 — 없으면 Elementor 본문 전문까지 실려 3.8MB(실측)가 되고 30s 타임아웃을 유발한다.
      `/wp/v2/posts?status=draft,publish&per_page=100&meta_key=${WP_EQUIPMENT_META_KEY}&meta_value=${encodeURIComponent(equipmentUuid)}&context=edit&_fields=id,status,link,meta`,
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
    // ⚠️ 원시 바이너리 body 금지 — 가비아 ModSecurity가 302(errdoc)로 차단한다(라이브 실측).
    // WP 관리자와 같은 multipart/form-data만 통과. Content-Type은 fetch가 boundary와 함께 붙인다.
    // 파일명은 안전 문자셋으로 강제 — CR/LF·백슬래시가 multipart 파트 헤더 인용을 망가뜨린다.
    const form = new FormData();
    form.append(
      "file",
      new File([media.content as BlobPart], media.filename.replace(/[^A-Za-z0-9._-]/g, "_"), {
        type: media.mimeType,
      }),
    );
    const r = await this.request("/wp/v2/media", { method: "POST", body: form }, WpMediaSchema);
    if (!r.ok) return r;
    return { ok: true, value: { mediaId: r.value.id, sourceUrl: r.value.source_url } };
  }

  // ⚠️ HTTP DELETE 금지 — 가비아 Apache가 DELETE 메서드 자체를 302로 차단한다(라이브 스모크 실측).
  // WP REST 공식 지원인 POST + X-HTTP-Method-Override로 우회.
  private readonly deleteInit: RequestInit = {
    method: "POST",
    headers: { "X-HTTP-Method-Override": "DELETE" },
  };

  async deleteMedia(mediaId: number): Promise<WpResult<null>> {
    const r = await this.request(`/wp/v2/media/${mediaId}?force=true`, this.deleteInit, z.unknown());
    if (!r.ok) return r;
    return { ok: true, value: null };
  }

  async deletePost(postId: number): Promise<WpResult<null>> {
    const r = await this.request(`/wp/v2/posts/${postId}?force=true`, this.deleteInit, z.unknown());
    if (!r.ok) return r;
    return { ok: true, value: null };
  }

  // ── #262 플러그인 endpoint — 에러 body의 WP 코드(rest_no_route·manually_edited 등)까지 분류해야
  //    해서 request()와 별도 경로. 비JSON body(가비아 errdoc HTML)는 코드 null로 안전 처리.
  private async pluginRaw(
    body: Record<string, unknown>,
  ): Promise<
    | { res: "ok"; json: unknown }
    | { res: "http"; status: number; code: string | null }
    | { res: "network"; error: string }
  > {
    let r: Response;
    try {
      r = await this.doFetch(`${this.base}/jhtech/v1/equipment-post`, {
        method: "POST",
        headers: { Authorization: this.auth, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      return { res: "network", error: e instanceof Error ? e.message : String(e) };
    }
    const json: unknown = await r.json().catch(() => null);
    if (!r.ok) return { res: "http", status: r.status, code: parseWpErrorCode(json) };
    return { res: "ok", json };
  }

  async pluginPrecheck(
    equipmentUuid: string,
    knownPostId: number | null,
  ): Promise<WpResult<WpPluginPrecheck>> {
    const r = await this.pluginRaw({
      precheck: true,
      contract: WP_PLUGIN_CONTRACT,
      equipment_uuid: equipmentUuid,
      known_post_id: knownPostId,
    });
    if (r.res === "network") return { ok: false, error: r.error, kind: "transient" };
    if (r.res === "http") {
      if (r.status === 404 && r.code === "rest_no_route") {
        return { ok: true, value: { pluginAvailable: false, reason: "no_plugin" } };
      }
      return { ok: false, error: `wp-plugin ${r.status}`, kind: classifyWpHttpStatus(r.status) };
    }
    const parsed = WpPluginPrecheckResponseSchema.safeParse(r.json);
    if (!parsed.success) return { ok: false, error: "플러그인 precheck 응답 파싱 실패", kind: "permanent" };
    if (parsed.data.contract !== WP_PLUGIN_CONTRACT) {
      return {
        ok: true,
        value: { pluginAvailable: false, reason: "contract_mismatch", contract: parsed.data.contract },
      };
    }
    return {
      ok: true,
      value: {
        pluginAvailable: true,
        contract: parsed.data.contract,
        manualEdited: parsed.data.manual_edited,
        postId: parsed.data.post_id,
      },
    };
  }

  async pluginSync(input: WpTemplateSyncInput): Promise<WpResult<WpPluginSyncOk>> {
    const r = await this.pluginRaw(toPluginPayload(input));
    if (r.res === "network") return { ok: false, error: r.error, kind: "transient" };
    if (r.res === "http") {
      if (r.status === 409 && r.code === "manually_edited") {
        return { ok: false, error: "manually_edited", kind: "manual_edit" };
      }
      if (r.code === "template_invalid") {
        return { ok: false, error: "template_invalid: 템플릿 글·필수 슬롯 확인 필요", kind: "permanent" };
      }
      if (r.status === 404 && r.code === "rest_no_route") {
        // precheck 이후 비활성화된 레이스 — 폴백 판단은 워커(render_mode 가드) 몫.
        return { ok: false, error: "rest_no_route", kind: "not_found" };
      }
      return { ok: false, error: `wp-plugin ${r.status}`, kind: classifyWpHttpStatus(r.status) };
    }
    const parsed = WpPluginSyncResponseSchema.safeParse(r.json);
    if (!parsed.success) return { ok: false, error: "플러그인 sync 응답 파싱 실패", kind: "permanent" };
    return {
      ok: true,
      value: {
        postId: parsed.data.post_id,
        link: parsed.data.link,
        status: parsed.data.status,
        created: parsed.data.created,
      },
    };
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
