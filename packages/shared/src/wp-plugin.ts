// #262 — WP 전용 플러그인(jhtech-saas-sync) 클라이언트 계약.
// 플러그인 = 템플릿 글의 _elementor_data를 복제·슬롯 치환해 글을 생성/갱신하는 커스텀 REST endpoint.
// 계약 수정 5건(autoplan 오버라이드) 반영:
//   ① 신규 생성만 draft — 갱신은 current_status 보존   ② 매 sync = 템플릿 재복제(플러그인 책임)
//   ③ DB가 post_id 1차 권위자 — known_post_id 동봉·응답 created 플래그
//   ④ 수동 편집(409)은 precheck로 미디어 업로드 전 조기 감지 + force 우회
//   ⑤ 플러그인 부재(rest_no_route)는 실패가 아니라 "가용성" 신호 — 폴백 판단은 워커(render_mode 가드)
import { z } from "zod";

/** 워커↔플러그인 프로토콜 버전 — 불일치 시 워커는 플러그인 미가용으로 취급(경고 로그). */
export const WP_PLUGIN_CONTRACT = 1;

export interface WpTemplateSyncInput {
  equipmentUuid: string;
  /** DB에 저장된 post_id — 플러그인은 meta 조회보다 이 값을 우선한다(1차 권위자). */
  knownPostId: number | null;
  templatePostId: number;
  title: string;
  subtitle: string | null;
  seriesName: string | null;
  /** 모델명 — 템플릿의 jh-slot-model 위치들(제목 아래·사양 이미지 아래)에 전부 치환. */
  model: string | null;
  /** 코어 REST로 선업로드된 media id(본문 순서). */
  photoMediaIds: number[];
  featuredMediaId: number | null;
  features: string[];
  specGroups: Array<{ name: string; items: Array<{ label: string; value: string }> }>;
  youtubeIds: string[];
  categories: number[];
  /**
   * 갱신 시 보존할 현재 상태. null = 신규 생성(draft).
   * ⚠️ 정보성 필드 — 플러그인은 이 값을 읽지 않는다. 상태 보존은 "갱신 시 post_status를
   * 아예 전달하지 않는" 방식으로 구현돼 있다(플러그인이 이 값을 쓰기 시작하면 계약 재검토).
   */
  currentStatus: "draft" | "publish" | null;
  /** 수동 편집 감지 무시 덮어쓰기(관리자 전용 경로에서만 true). */
  force: boolean;
}

export interface WpPluginPrecheck {
  /** false = rest_no_route(미설치/비활성) 또는 계약 불일치 — 사유는 reason. */
  pluginAvailable: boolean;
  reason?: "no_plugin" | "contract_mismatch";
  contract?: number;
  manualEdited?: boolean;
  /** 플러그인이 아는 글 id(meta 조회 결과, known_post_id 우선 반영). */
  postId?: number | null;
}

export interface WpPluginSyncOk {
  postId: number;
  link?: string;
  status: "draft" | "publish";
  /** true = 이번 호출이 글을 새로 생성 — CAS 패자 정리는 이 경우에만 deletePost 허용. */
  created: boolean;
}

const PrecheckResponseSchema = z.object({
  contract: z.number(),
  manual_edited: z.boolean(),
  post_id: z.number().nullable(),
});

const SyncResponseSchema = z.object({
  post_id: z.number(),
  link: z.string().optional(),
  status: z.enum(["draft", "publish"]),
  created: z.boolean(),
});

const WpErrorBodySchema = z.object({ code: z.string() }).passthrough();

/** 에러 body에서 WP 에러 코드를 안전 추출(비JSON·가비아 errdoc HTML이면 null). */
export function parseWpErrorCode(body: unknown): string | null {
  const parsed = WpErrorBodySchema.safeParse(body);
  return parsed.success ? parsed.data.code : null;
}

export function toPluginPayload(input: WpTemplateSyncInput): Record<string, unknown> {
  return {
    contract: WP_PLUGIN_CONTRACT,
    equipment_uuid: input.equipmentUuid,
    known_post_id: input.knownPostId,
    template_post_id: input.templatePostId,
    title: input.title,
    subtitle: input.subtitle,
    series_name: input.seriesName,
    model: input.model,
    photo_media_ids: input.photoMediaIds,
    featured_media_id: input.featuredMediaId,
    features: input.features,
    spec_groups: input.specGroups.map((g) => ({
      name: g.name,
      items: g.items.map((i) => ({ label: i.label, value: i.value })),
    })),
    youtube_ids: input.youtubeIds,
    category_ids: input.categories,
    current_status: input.currentStatus,
    force: input.force,
  };
}

export { PrecheckResponseSchema as WpPluginPrecheckResponseSchema };
export { SyncResponseSchema as WpPluginSyncResponseSchema };
