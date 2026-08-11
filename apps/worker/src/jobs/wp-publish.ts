import type { SupabaseClient } from "@supabase/supabase-js";
import { composeCardPng, type WpCardInput } from "./wp-card-image";
import { getFontDataUri, getModelFontDataUri } from "./assets";
import {
  parseSpecs,
  parseYoutubeId,
  renderWpPostHtml,
  resolveWpCategoryId,
  type WpCategoryNode,
  type WpFailKind,
  type WpPublisher,
  type WpResult,
  type WpTemplateSyncInput,
} from "@jhtechsaas/shared";

// 장비 → 워드프레스 발행 잡(#253). 액션 3종:
//   sync      = 본문·미디어 반영(미생성이면 draft 생성, 공개 글이면 공개 유지 갱신 — [홈페이지 갱신] 버튼 경로 포함)
//   publish   = draft → publish 전환
//   unpublish = publish → draft 전환(payload wp_post_id 사용 — 장비 행 삭제 후에도 처리 가능)
// 멱등성·동시성: 활성 잡 장비당 1건(부분 유니크) + record_wp_sync의 post_id CAS(레이스 패자는 자기 draft 삭제)
//   + WP post meta equipment_uuid로 결정적 재연결(slug/이름 검색 금지 — 동명 장비 오연결 방지).
// 실패 분류: transient만 throw(잡 재시도), auth/permanent/not_found는 wp_last_error 기록 후 종료(재시도 낭비 금지).

// '판매 제품' 루트 카테고리 — 모든 장비 글에 항상 부착.
// ⚠️ 실제 WP 사이트(jhtech.co.kr)의 카테고리 id 실측값 — WP 쪽에서 카테고리를 재생성하면 갱신 필요.
const WP_PRODUCT_CATEGORY_ID = 9;
const IMAGE_BUCKET = "equipment-images";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

interface WpMediaEntry {
  id: number;
  url: string;
}

interface EquipmentRow {
  id: string;
  name: string;
  model: string | null;
  status: string;
  category_id: string | null;
  photos: string[];
  specs: unknown;
  highlights: string[];
  youtube_urls: string[];
  quote_device_image: string | null; // 견적서 우하단 장비 이미지 — WP 사양 옆 이미지(슬롯 2)로 재사용
  wp_publish_enabled: boolean;
  wp_post_id: number | null;
  wp_post_status: "draft" | "publish" | null;
  wp_media: Record<string, WpMediaEntry>;
  wp_dirty: boolean;
  wp_dirty_at: string | null; // ISO 문자열 그대로 왕복(Date 변환 시 마이크로초 소실 → CAS 어긋남)
  // #262 템플릿 복제 v2
  quote_device_name: string | null; // 견적서 모델명 로고 — 카드 대표 이미지 우하단 로고 재사용
  wp_subtitle: string | null;
  wp_series_name: string | null;
  wp_render_mode: "html" | "elementor" | null; // 마지막으로 본문을 쓴 주체 — elementor면 레거시 폴백 금지
}

export interface WpPublishOpts {
  /** 미디어 1장 업로드마다 호출 — jobs.updated_at 하트비트(5분 스테일 회수의 이중 실행 방지). */
  touch?: () => Promise<void>;
  /** 카드 대표 이미지 합성 오버라이드(테스트용) — 기본 composeCardPng(Puppeteer). */
  composeCard?: (input: WpCardInput) => Promise<Uint8Array>;
}

async function recordSync(
  supabase: SupabaseClient,
  params: {
    equipmentId: string;
    postId?: number | null;
    postStatus?: "draft" | "publish" | null;
    media?: Record<string, WpMediaEntry> | null;
    lastError?: string | null;
    clearError?: boolean;
    dirtySnapshot?: string | null;
    replace?: boolean;
    renderMode?: "html" | "elementor" | null;
  },
): Promise<{ casWon: boolean; wpPostId: number | null }> {
  const { data, error } = await supabase.rpc("record_wp_sync", {
    p_equipment_id: params.equipmentId,
    p_post_id: params.postId ?? null,
    p_post_status: params.postStatus ?? null,
    p_media: params.media ?? null,
    p_last_error: params.lastError ?? null,
    p_clear_error: params.clearError ?? false,
    p_dirty_snapshot: params.dirtySnapshot ?? null,
    p_replace: params.replace ?? false,
    p_render_mode: params.renderMode ?? null,
  });
  if (error) throw new Error(`record_wp_sync 실패: ${error.message}`);
  const r = data as { cas_won?: boolean; wp_post_id?: number | null } | null;
  return { casWon: r?.cas_won === true, wpPostId: r?.wp_post_id ?? null };
}

// 실패 처리 공통: transient만 재시도(throw). 그 외는 장비에 기록하고 잡 종료.
async function handleFail(
  supabase: SupabaseClient,
  equipmentId: string,
  kind: WpFailKind,
  message: string,
): Promise<void> {
  await recordSync(supabase, { equipmentId, lastError: `${kind}: ${message}`.slice(0, 500) });
  if (kind === "transient") throw new Error(message);
  console.warn(`[worker] wp_publish ${kind} — 재시도 없이 종료: ${message}`);
}

function unwrap<T>(r: WpResult<T>): { value: T | null; fail: { kind: WpFailKind; error: string } | null } {
  if (r.ok) return { value: r.value, fail: null };
  return { value: null, fail: { kind: r.kind, error: r.error } };
}

async function fetchEquipment(supabase: SupabaseClient, id: string): Promise<EquipmentRow | null> {
  const { data, error } = await supabase
    .from("equipment")
    .select(
      "id,name,model,status,category_id,photos,specs,highlights,youtube_urls,quote_device_image,quote_device_name,wp_publish_enabled,wp_post_id,wp_post_status,wp_media,wp_dirty,wp_dirty_at,wp_subtitle,wp_series_name,wp_render_mode",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`장비 조회 실패: ${error.message}`);
  return (data as unknown as EquipmentRow) ?? null;
}

async function resolveCategory(
  supabase: SupabaseClient,
  categoryId: string | null,
): Promise<number | null> {
  if (!categoryId) return null;
  const { data, error } = await supabase
    .from("equipment_category")
    .select("id,parent_id,wp_category_id");
  if (error) throw new Error(`분류 조회 실패: ${error.message}`);
  return resolveWpCategoryId(categoryId, (data ?? []) as WpCategoryNode[]);
}

// #262 분류별 템플릿 글 해석 — 소분류 직접 설정 > 조상 폴백(resolve_wp_template_post_id와 동일 규칙).
// null = 템플릿 미설정(레거시 HTML 경로 유지 — 기능 도입 전 prod 무변화 보장).
async function resolveTemplate(
  supabase: SupabaseClient,
  categoryId: string | null,
): Promise<number | null> {
  if (!categoryId) return null;
  const { data, error } = await supabase
    .from("equipment_category")
    .select("id,parent_id,wp_template_post_id");
  if (error) throw new Error(`분류 조회 실패: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; parent_id: string | null; wp_template_post_id: number | null }>;
  const byId = new Map(rows.map((r) => [r.id, r]));
  let cur = byId.get(categoryId);
  for (let depth = 0; cur && depth < 10; depth++) {
    if (cur.wp_template_post_id != null) return cur.wp_template_post_id;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return null;
}

// #262 후속 — 분류별 카드 영문 라벨 해석(소분류 직접 설정 > 조상 폴백, resolveTemplate 동일 규칙).
async function resolveCardLabel(
  supabase: SupabaseClient,
  categoryId: string | null,
): Promise<string | null> {
  if (!categoryId) return null;
  const { data, error } = await supabase
    .from("equipment_category")
    .select("id,parent_id,card_label_en");
  if (error) throw new Error(`분류 조회 실패: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; parent_id: string | null; card_label_en: string | null }>;
  const byId = new Map(rows.map((r) => [r.id, r]));
  let cur = byId.get(categoryId);
  for (let depth = 0; cur && depth < 10; depth++) {
    if (cur.card_label_en != null && cur.card_label_en.trim() !== "") return cur.card_label_en;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return null;
}

// storage 이미지 → data URI(카드 합성용). 누락이면 null(카드 생략·원본 폴백).
async function storageImageDataUri(
  supabase: SupabaseClient,
  path: string,
): Promise<string | null> {
  const dl = await supabase.storage.from(IMAGE_BUCKET).download(path);
  if (dl.error || !dl.data) return null;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_BY_EXT[ext] ?? "image/png";
  return `data:${mime};base64,${Buffer.from(await dl.data.arrayBuffer()).toString("base64")}`;
}

// 사진 diff 업로드: wp_media 맵에 있는 경로는 재사용, 없는 경로만 storage에서 받아 업로드.
// 반환 = 새 맵 + 제거 대상 미디어 id들(글 갱신 성공 후 삭제 — 고아 방지).
// freshPaths: 캐시를 무시하고 매번 재업로드할 경로 — 견적서 장비 이미지처럼 "고정 경로에
// 내용만 교체"되는 자산은 경로 diff로 변경을 감지할 수 없다(옛 첨부는 removed로 정리).
async function syncMedia(
  supabase: SupabaseClient,
  publisher: WpPublisher,
  photos: string[],
  current: Record<string, WpMediaEntry>,
  touch?: () => Promise<void>,
  freshPaths: string[] = [],
): Promise<
  | { map: Record<string, WpMediaEntry>; removed: number[]; fail: null }
  | { map: null; removed: []; fail: { kind: WpFailKind; error: string } }
> {
  const map: Record<string, WpMediaEntry> = {};
  const staleFresh: number[] = [];
  for (const path of photos) {
    const existing = current[path];
    if (existing && !freshPaths.includes(path)) {
      map[path] = existing;
      continue;
    }
    if (existing) staleFresh.push(existing.id);
    const dl = await supabase.storage.from(IMAGE_BUCKET).download(path);
    if (dl.error || !dl.data) {
      // storage에 없는 사진은 본문에서 제외(장비 저장 자체를 막지 않는다)
      console.warn(`[worker] wp_publish 사진 누락 — 건너뜀: ${path}`);
      continue;
    }
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const filename = path.split("/").pop() ?? "photo";
    const up = await publisher.uploadMedia({
      filename,
      content: new Uint8Array(await dl.data.arrayBuffer()),
      mimeType: MIME_BY_EXT[ext] ?? "application/octet-stream",
    });
    if (!up.ok) return { map: null, removed: [], fail: { kind: up.kind, error: up.error } };
    map[path] = { id: up.value.mediaId, url: up.value.sourceUrl };
    await touch?.();
  }
  const removed = Object.entries(current)
    .filter(([path]) => !photos.includes(path))
    .map(([, entry]) => entry.id)
    .concat(staleFresh);
  return { map, removed, fail: null };
}

// 재연결 정책 단일화: meta로 기존 글을 찾으면 갱신, 없으면 draft 재생성.
// 404 복구 분기와 미생성 분기가 공유(중복 2벌 방지 — /review).
async function reconnectOrCreate(
  supabase: SupabaseClient,
  publisher: WpPublisher,
  equipmentId: string,
  post: Parameters<WpPublisher["createDraft"]>[0],
): Promise<{ postId: number; postStatus: "draft" | "publish"; created: boolean } | null> {
  const found = await publisher.findByMeta(equipmentId);
  const { value: ref, fail } = unwrap(found);
  if (fail) {
    await handleFail(supabase, equipmentId, fail.kind, `재연결 조회 실패: ${fail.error}`);
    return null;
  }
  if (ref) {
    const updated = await publisher.updatePost(ref.postId, post);
    if (!updated.ok) {
      await handleFail(supabase, equipmentId, updated.kind, `재연결 갱신 실패: ${updated.error}`);
      return null;
    }
    return { postId: ref.postId, postStatus: ref.status ?? "draft", created: false };
  }
  const created = await publisher.createDraft(post);
  if (!created.ok) {
    await handleFail(supabase, equipmentId, created.kind, `초안 생성 실패: ${created.error}`);
    return null;
  }
  return { postId: created.value.postId, postStatus: "draft", created: true };
}

async function processSync(
  supabase: SupabaseClient,
  publisher: WpPublisher,
  eq: EquipmentRow,
  opts: WpPublishOpts,
  force = false,
): Promise<void> {
  // 상태가 그 사이 바뀌었으면: 공개 글이 남아 있으면 스스로 내린다(자가 치유).
  // 근거: 체크 해제·비활성의 unpublish 잡은 활성 sync 잡(processing)에 흡수돼 소실될 수 있다 —
  // 그 마지막 방어선이 이 분기다(/review 3모델 교차 확인).
  if (!eq.wp_publish_enabled || eq.status !== "active") {
    if (eq.wp_post_id != null && eq.wp_post_status === "publish") {
      console.warn(`[worker] wp_publish sync → 자가 unpublish (상태 변경 감지) equipment=${eq.id}`);
      await processStatusChange(supabase, publisher, eq.id, eq.wp_post_id, "draft");
    } else {
      console.warn(`[worker] wp_publish sync 스킵 — 상태 변경됨 equipment=${eq.id}`);
    }
    return;
  }
  const categoryId = await resolveCategory(supabase, eq.category_id);
  if (categoryId == null) {
    await recordSync(supabase, {
      equipmentId: eq.id,
      lastError: "분류의 WP 카테고리 설정이 필요합니다",
    });
    return;
  }

  // #262 플러그인 경로 판정 + 사전 체크 — 미디어 업로드 전에 수행(409 시 고아 미디어 방지).
  // 템플릿 미설정 && 레거시 관리 글 = 기존 경로 그대로(기능 도입 전 prod 무변화).
  const templatePostId = await resolveTemplate(supabase, eq.category_id);
  let usePlugin = false;
  if (templatePostId != null || eq.wp_render_mode === "elementor") {
    const pre = await publisher.pluginPrecheck(eq.id, eq.wp_post_id);
    if (!pre.ok) {
      await handleFail(supabase, eq.id, pre.kind, `플러그인 사전 체크 실패: ${pre.error}`);
      return;
    }
    if (!pre.value.pluginAvailable) {
      if (eq.wp_render_mode === "elementor") {
        // 침묵 품질 회귀 금지: Elementor 관리 글을 레거시 HTML로 "성공한 척" 덮으면
        // 화면은 그대로인데 상태만 GREEN이 된다 — 명시 실패로 표기(autoplan Eng 지적 5).
        await handleFail(
          supabase,
          eq.id,
          "permanent",
          `플러그인 미가용(${pre.value.reason ?? "unknown"}) — Elementor 관리 글은 레거시 폴백 금지`,
        );
        return;
      }
      console.warn(
        `[worker] wp_publish 플러그인 미가용(${pre.value.reason ?? "unknown"}) — 레거시 HTML 경로로 진행 equipment=${eq.id}`,
      );
    } else if (templatePostId == null) {
      // 플러그인은 있는데 분류 템플릿 미설정 + 이미 Elementor 관리 글 — 갱신 불능을 명시.
      await handleFail(supabase, eq.id, "permanent", "분류에 템플릿 글(wp_template_post_id) 설정이 필요합니다");
      return;
    } else {
      if (pre.value.manualEdited && !force) {
        await handleFail(
          supabase,
          eq.id,
          "manual_edit",
          "WP에서 수동 편집된 글 — 갱신이 차단됩니다. 관리자의 [그래도 덮어쓰기]로만 해제됩니다",
        );
        return;
      }
      usePlugin = true;
    }
  }

  // 견적서 장비 이미지도 같은 버킷(equipment-images) — 플러그인(템플릿) 경로에서만 쓰이므로
  // 그때만 업로드 목록에 포함(레거시 HTML 경로의 불필요 업로드 방지 — /review P2).
  // 고정 경로(device-image.ext)에 내용만 바뀌는 자산이라 항상 재업로드(freshPaths).
  const quoteImgPath =
    usePlugin && eq.quote_device_image && !eq.photos.includes(eq.quote_device_image)
      ? eq.quote_device_image
      : null;
  // '__card__'는 생성 카드 전용 의사 키 — 사진 경로에 섞여 들어오면 수명주기가 꼬이므로 방어 필터.
  const photoPaths = eq.photos.filter((p) => p !== "__card__");
  const mediaPaths = [...photoPaths, ...(quoteImgPath ? [quoteImgPath] : [])];
  const media = await syncMedia(
    supabase,
    publisher,
    mediaPaths,
    eq.wp_media ?? {},
    opts.touch,
    quoteImgPath ? [quoteImgPath] : [],
  );
  if (media.fail) {
    await handleFail(supabase, eq.id, media.fail.kind, `미디어 업로드 실패: ${media.fail.error}`);
    return;
  }
  // 업로드 성공분을 즉시 기록 — 이후 글 upsert가 실패해도 재시도가 재업로드 없이 재개(WP 고아 미디어 방지).
  // (기존+신규 합산 맵이라 삭제 대상 항목도 이 시점엔 보존 — 최종 기록에서 정리)
  if (Object.keys(media.map).length > 0 || media.removed.length > 0) {
    await recordSync(supabase, {
      equipmentId: eq.id,
      media: { ...(eq.wp_media ?? {}), ...media.map },
    });
  }

  // 대표 이미지 카드 합성(#전체제품 카드 통일) — 플러그인 경로에서만. 사진(또는 견적 이미지)
  // 위에 수제 카드 프레임(좌측 영문 밴드·상단 제목 밴드·우하단 모델 로고)을 씌워 업로드.
  // 카드도 견적 이미지처럼 "내용 기반" 자산이라 매 sync 재업로드(옛 카드는 removed로 정리 —
  // '__card__' 의사 키가 mediaPaths에 없어 syncMedia가 자동으로 삭제 목록에 올린다).
  let cardMedia: WpMediaEntry | null = null;
  if (usePlugin && templatePostId != null) {
    const cardPhotoPath = eq.photos[0] ?? quoteImgPath;
    const photoUri = cardPhotoPath ? await storageImageDataUri(supabase, cardPhotoPath) : null;
    // 방금 미디어 diff에서 살아있다고 본 사진이 카드용 다운로드에서만 실패하면 일시 오류로
    // 보고 재시도(throw) — 조용히 카드 없이 성공해 대표 이미지가 회귀하는 것 방지(/review P1).
    // 맵에도 없는 사진(진짜 소실)은 기존 관행대로 카드만 생략.
    if (cardPhotoPath && !photoUri && media.map[cardPhotoPath]) {
      throw new Error(`카드 사진 다운로드 실패(일시) — 재시도: ${cardPhotoPath}`);
    }
    if (photoUri) {
      const logoUri = eq.quote_device_name
        ? await storageImageDataUri(supabase, eq.quote_device_name)
        : null;
      const model = eq.model?.trim() ?? "";
      const compose = opts.composeCard ?? composeCardPng;
      const png = await compose({
        title: model !== "" ? model : eq.name,
        subtitle: model !== "" ? eq.name : null,
        sideText: await resolveCardLabel(supabase, eq.category_id),
        photoDataUri: photoUri,
        logoDataUri: logoUri,
        fontDataUri: await getFontDataUri(),
        latinFontDataUri: await getModelFontDataUri(),
      });
      const up = await publisher.uploadMedia({
        filename: `card-${eq.id}.png`,
        content: new Uint8Array(png), // ArrayBufferLike → ArrayBuffer 사본(업로더 타입 계약)
        mimeType: "image/png",
      });
      if (!up.ok) {
        await handleFail(supabase, eq.id, up.kind, `카드 이미지 업로드 실패: ${up.error}`);
        return;
      }
      cardMedia = { id: up.value.mediaId, url: up.value.sourceUrl };
      // 업로드 즉시 체크포인트 — 이후 pluginSync 실패/크래시 시에도 다음 sync의 removed가
      // 이 카드를 정리(미기록 고아 방지, /review P2).
      await recordSync(supabase, {
        equipmentId: eq.id,
        media: { ...(eq.wp_media ?? {}), ...media.map, __card__: cardMedia },
      });
      await opts.touch?.();
    }
  }

  const categories = [...new Set([WP_PRODUCT_CATEGORY_ID, categoryId])];
  const featuredMediaId =
    cardMedia?.id ??
    (eq.photos[0] && media.map[eq.photos[0]] ? media.map[eq.photos[0]].id : null);
  // 레거시 HTML 본문은 레거시 경로에서만 조립(플러그인 경로에선 categories만 쓰인다 — 낭비 렌더 방지).
  const buildLegacyPost = () => {
    const imageUrls = Object.fromEntries(
      Object.entries(media.map).map(([path, entry]) => [path, entry.url]),
    );
    return {
      title: eq.name,
      content: renderWpPostHtml(
        {
          name: eq.name,
          model: eq.model,
          photos: eq.photos,
          highlights: eq.highlights ?? [],
          specs: Array.isArray(eq.specs) ? (eq.specs as never) : [],
          youtubeUrls: eq.youtube_urls ?? [],
        },
        { imageUrls },
      ),
      categories,
      equipmentUuid: eq.id,
      ...(eq.model && /^[\x20-\x7e]+$/.test(eq.model) ? { slug: eq.model.toLowerCase() } : {}),
      ...(featuredMediaId != null ? { featuredMediaId } : {}),
    };
  };

  let postId = eq.wp_post_id;
  let postStatus: "draft" | "publish" = eq.wp_post_status ?? "draft";
  let replace = false;
  let createdByMe = false;
  let renderMode: "html" | "elementor" = "html";

  if (usePlugin && templatePostId != null) {
    // 플러그인 경로 — 매 sync = 템플릿 재복제(플러그인 책임). 신규만 draft, 갱신은 상태 보존.
    renderMode = "elementor";
    const input: WpTemplateSyncInput = {
      equipmentUuid: eq.id,
      knownPostId: eq.wp_post_id,
      templatePostId,
      title: eq.name,
      subtitle: eq.wp_subtitle?.trim() || null,
      seriesName: eq.wp_series_name?.trim() || null,
      model: eq.model?.trim() || null,
      // 슬롯 매핑: image-01 = 대표 사진, image-02 = 사양 옆 제품 이미지.
      // image-02는 견적서 장비 이미지(quote_device_image) 우선 — 없으면 2번째 사진,
      // 그것도 없으면 대표 사진 재사용(비면 컬럼 제거로 사양 레이아웃이 무너진다).
      photoMediaIds: (() => {
        const ids = eq.photos
          .map((p) => media.map[p]?.id)
          .filter((v): v is number => v != null);
        const quoteImgId = quoteImgPath ? (media.map[quoteImgPath]?.id ?? null) : null;
        // 사진 0장 + 견적 이미지만 있으면 견적 이미지가 히어로·사양 슬롯 둘 다 담당
        // (업로드만 하고 아무 데도 안 그리는 거짓 성공 방지 — /review P1).
        if (ids.length === 0) return quoteImgId != null ? [quoteImgId, quoteImgId] : [];
        const slot2 = quoteImgId ?? ids[1] ?? ids[0];
        return [ids[0], slot2, ...ids.slice(2)];
      })(),
      featuredMediaId,
      features: (eq.highlights ?? []).filter(Boolean),
      specGroups: parseSpecs(eq.specs).map((g) => ({
        name: g.group,
        items: g.items.map((i) => ({ label: i.label, value: i.value })),
      })),
      youtubeIds: (eq.youtube_urls ?? [])
        .map((u) => parseYoutubeId(u))
        .filter((v): v is string => v != null),
      categories,
      currentStatus: eq.wp_post_id != null ? (eq.wp_post_status ?? "draft") : null,
      force,
    };
    const r = await publisher.pluginSync(input);
    if (!r.ok) {
      await handleFail(supabase, eq.id, r.kind, `플러그인 sync 실패: ${r.error}`);
      return;
    }
    postId = r.value.postId;
    postStatus = r.value.status;
    createdByMe = r.value.created;
    // DB가 1차 권위자: 저장 id와 다른 글이 반환되면 재연결로 기록(404 재연결과 동일 취급).
    replace =
      (eq.wp_post_id != null && postId !== eq.wp_post_id) ||
      (eq.wp_post_id == null && !r.value.created);
  } else if (postId != null) {
    const post = buildLegacyPost();
    const updated = await publisher.updatePost(postId, post);
    if (!updated.ok && updated.kind === "not_found") {
      // 원격 글 소실 — meta로 재연결, 없으면 재생성
      const recovered = await reconnectOrCreate(supabase, publisher, eq.id, post);
      if (!recovered) return; // 실패는 reconnectOrCreate가 기록
      postId = recovered.postId;
      postStatus = recovered.postStatus;
      createdByMe = recovered.created;
      replace = true;
    } else if (!updated.ok) {
      await handleFail(supabase, eq.id, updated.kind, `글 갱신 실패: ${updated.error}`);
      return;
    }
  } else {
    // 미생성: 부분 실패 재시도 대비 meta 재연결 먼저
    const recovered = await reconnectOrCreate(supabase, publisher, eq.id, buildLegacyPost());
    if (!recovered) return;
    postId = recovered.postId;
    postStatus = recovered.postStatus;
    createdByMe = recovered.created;
  }

  const recorded = await recordSync(supabase, {
    equipmentId: eq.id,
    postId,
    postStatus,
    media: { ...media.map, ...(cardMedia ? { __card__: cardMedia } : {}) },
    clearError: true,
    dirtySnapshot: eq.wp_dirty_at,
    replace,
    renderMode,
  });
  if (!recorded.casWon) {
    // 최초 생성 레이스 패배 — "내가 이번에 새로 만든 draft"만 정리.
    // 기존 글(재연결·플러그인 meta 조회 결과)을 지우면 실글 삭제 사고(autoplan Eng 지적 3).
    console.warn(`[worker] wp_publish CAS 패배 equipment=${eq.id} post=${postId} created=${createdByMe}`);
    if (createdByMe && postId != null) await publisher.deletePost(postId);
    return;
  }

  // 글 갱신 성공 후 제거된 사진의 이전 미디어 정리(best-effort — 실패해도 잡은 성공)
  for (const mediaId of media.removed) {
    const del = await publisher.deleteMedia(mediaId);
    if (!del.ok) console.warn(`[worker] wp_publish 이전 미디어 삭제 실패(무시): ${del.error}`);
  }
}

async function processStatusChange(
  supabase: SupabaseClient,
  publisher: WpPublisher,
  equipmentId: string,
  postId: number,
  to: "draft" | "publish",
): Promise<void> {
  const r = await publisher.setStatus(postId, to);
  if (!r.ok) {
    if (r.kind === "not_found" && to === "draft") {
      // 내리려던 글이 이미 사라짐 = 목적 달성
      await recordSync(supabase, { equipmentId, postStatus: "draft", clearError: true });
      return;
    }
    await handleFail(supabase, equipmentId, r.kind, `상태 전환 실패(${to}): ${r.error}`);
    return;
  }
  await recordSync(supabase, { equipmentId, postStatus: to, clearError: true });
}

export async function processWpPublishJob(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  publisher: WpPublisher,
  opts: WpPublishOpts = {},
): Promise<void> {
  const action = str(payload.action);
  const equipmentId = str(payload.equipment_id);
  if (!equipmentId || !action) throw new Error("wp_publish 잡 payload 누락");

  if (action === "unpublish") {
    const payloadPostId = typeof payload.wp_post_id === "number" ? payload.wp_post_id : null;
    if (payloadPostId == null) throw new Error("unpublish 잡에 wp_post_id 누락");
    await processStatusChange(supabase, publisher, equipmentId, payloadPostId, "draft");
    return;
  }

  const eq = await fetchEquipment(supabase, equipmentId);
  if (!eq) {
    console.warn(`[worker] wp_publish 스킵 — 장비 없음 ${equipmentId}`);
    return;
  }

  if (action === "sync") {
    // force = force_sync RPC(관리자 전용)가 실은 플래그 — 수동 편집 감지 무시 덮어쓰기.
    await processSync(supabase, publisher, eq, opts, payload.force === true);
    return;
  }
  if (action === "publish") {
    if (eq.wp_post_id == null) {
      await recordSync(supabase, { equipmentId, lastError: "발행할 초안이 없습니다" });
      return;
    }
    // enqueue 후 체크 해제·비활성 전환됐으면 발행 금지 — 내리기 의도가 항상 우선(/review 보안 지적).
    if (!eq.wp_publish_enabled || eq.status !== "active") {
      console.warn(`[worker] wp_publish publish 스킵 — 상태 변경됨(발행 취소) equipment=${eq.id}`);
      return;
    }
    await processStatusChange(supabase, publisher, equipmentId, eq.wp_post_id, "publish");
    return;
  }
  throw new Error(`알 수 없는 wp_publish 액션: ${action}`);
}
