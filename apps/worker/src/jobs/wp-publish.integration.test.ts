import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { createServiceClient, FakeWpPublisher } from "@jhtechsaas/shared";
import { runOnce } from "./runner";

// 통합 테스트 — 로컬 Supabase + FakeWpPublisher. wp_publish 잡:
// sync(생성·미디어 diff·404 재연결)·publish·unpublish·dirty 해제 CAS·실패 기록.
// 로컬 데모 service_role 키(비밀 아님). 로컬 Supabase가 떠 있어야 한다.
const URL = "http://127.0.0.1:54321";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const supabase = createServiceClient(URL, KEY);

const NAME = "WP_WORKER_통합_장비";
const CAT = "00000000-0000-0000-0000-00000000dc01";
const PHOTO_A = "equipment/00000000-0000-0000-0000-00000000dcee/wp-a.png";
const PHOTO_B = "equipment/00000000-0000-0000-0000-00000000dcee/wp-b.png";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function cleanup(): Promise<void> {
  const { data } = await supabase.from("equipment").select("id").like("name", `${NAME}%`);
  for (const row of data ?? []) {
    await supabase.from("jobs").delete().eq("payload->>equipment_id", row.id as string);
  }
  await supabase.from("equipment").delete().like("name", `${NAME}%`);
  await supabase.from("equipment_category").delete().eq("id", CAT);
  await supabase.storage.from("equipment-images").remove([PHOTO_A, PHOTO_B]);
}

async function seedEquipment(over: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await supabase
    .from("equipment")
    .insert({
      name: NAME,
      model: "WPX-100",
      base_price: 0,
      status: "active",
      wp_publish_enabled: true,
      category_id: CAT,
      highlights: ["하이라이트1"],
      youtube_urls: [],
      photos: [],
      ...over,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function insertJob(
  equipmentId: string,
  action: string,
  wpPostId?: number,
  extra: Record<string, unknown> = {},
): Promise<void> {
  // INSERT 트리거의 자동 sync 잡과 부분 유니크가 충돌하지 않게 해당 장비 활성 잡 선정리
  await supabase
    .from("jobs")
    .delete()
    .eq("type", "wp_publish")
    .eq("payload->>equipment_id", equipmentId);
  const { error } = await supabase.from("jobs").insert({
    type: "wp_publish",
    payload: {
      equipment_id: equipmentId,
      action,
      ...(wpPostId !== undefined ? { wp_post_id: wpPostId } : {}),
      ...extra,
    },
  });
  if (error) throw error;
}

async function drainJobs(fake: FakeWpPublisher): Promise<void> {
  // eslint-disable-next-line no-empty
  while (await runOnce(supabase, { wpPublisher: fake })) {}
}

async function getEq(id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("equipment")
    .select("wp_post_id, wp_post_status, wp_media, wp_dirty, wp_dirty_at, wp_last_error, wp_render_mode")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

beforeAll(async () => {
  await cleanup();
  await supabase
    .from("equipment_category")
    .insert({ id: CAT, name: "WP통합분류", wp_category_id: 12 });
  await supabase.storage.from("equipment-images").upload(PHOTO_A, PNG, {
    contentType: "image/png",
    upsert: true,
  });
  await supabase.storage.from("equipment-images").upload(PHOTO_B, PNG, {
    contentType: "image/png",
    upsert: true,
  });
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await supabase.from("jobs").delete().eq("type", "wp_publish");
});

describe("wp_publish 잡 — sync", () => {
  test("미생성 장비 sync → findByMeta 후 draft 생성, wp_post_id·status 기록", async () => {
    const id = await seedEquipment();
    const fake = new FakeWpPublisher();
    await insertJob(id, "sync");
    await drainJobs(fake);

    const methods = fake.calls.map((c) => c.method);
    expect(methods).toContain("findByMeta");
    expect(methods).toContain("createDraft");
    const eq = await getEq(id);
    expect(eq.wp_post_id).toBe(1);
    expect(eq.wp_post_status).toBe("draft");
    expect(eq.wp_last_error).toBeNull();
    // 카테고리 = 판매 제품(9) + 매핑(12)
    const created = fake.calls.find((c) => c.method === "createDraft");
    const post = (created?.args[0] ?? {}) as { categories?: number[] };
    expect(post.categories).toEqual([9, 12]);
  });

  test("사진 미디어: 첫 sync는 업로드, 같은 사진 재sync는 재업로드 없음, 교체 시 이전 미디어 삭제", async () => {
    const id = await seedEquipment({ photos: [PHOTO_A] });
    const fake = new FakeWpPublisher();
    await insertJob(id, "sync");
    await drainJobs(fake);
    expect(fake.calls.filter((c) => c.method === "uploadMedia")).toHaveLength(1);

    // 같은 사진으로 재sync → 업로드 없음
    await insertJob(id, "sync");
    await drainJobs(fake);
    expect(fake.calls.filter((c) => c.method === "uploadMedia")).toHaveLength(1);

    // 사진 교체 → 새 업로드 + 이전 미디어 삭제
    await supabase.from("equipment").update({ photos: [PHOTO_B] }).eq("id", id);
    await supabase.from("jobs").delete().eq("type", "wp_publish"); // 트리거 잡 정리 후 명시 주입
    await insertJob(id, "sync");
    await drainJobs(fake);
    expect(fake.calls.filter((c) => c.method === "uploadMedia")).toHaveLength(2);
    expect(fake.calls.filter((c) => c.method === "deleteMedia")).toHaveLength(1);
  });

  test("매핑이 사라진 장비 sync → 실패 기록(재시도 아닌 종료)", async () => {
    const id = await seedEquipment({ category_id: null });
    const fake = new FakeWpPublisher();
    await insertJob(id, "sync");
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(String(eq.wp_last_error)).toContain("카테고리");
    const { data: job } = await supabase
      .from("jobs")
      .select("status")
      .eq("payload->>equipment_id", id)
      .single();
    expect(job?.status).toBe("done");
  });

  test("404(원격 글 소실) → meta 재연결/재생성으로 wp_post_id 교체", async () => {
    const id = await seedEquipment();
    const fake = new FakeWpPublisher();
    await insertJob(id, "sync");
    await drainJobs(fake); // wp_post_id=1 연결

    // 원격 글이 사라진 상황 모사: 다음 updatePost가 404
    fake.failNext("not_found");
    await insertJob(id, "sync");
    await drainJobs(fake);
    const eq = await getEq(id);
    // Fake의 findByMeta 저장소에는 글이 남아있으므로 재연결(1) 또는 재생성(2) 중 하나로 복구
    expect(eq.wp_post_id).not.toBeNull();
    expect(eq.wp_last_error).toBeNull();
  });

  test("auth 실패(앱패스워드 만료) → 재시도 없이 실패 기록", async () => {
    const id = await seedEquipment();
    const fake = new FakeWpPublisher();
    fake.failNext("auth");
    await insertJob(id, "sync");
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(String(eq.wp_last_error)).toContain("auth");
    const { data: job } = await supabase
      .from("jobs")
      .select("status, attempts")
      .eq("payload->>equipment_id", id)
      .single();
    expect(job?.status).toBe("done"); // 재시도 낭비 금지 — 잡은 종료, 실패는 장비에 기록
    expect(job?.attempts).toBe(1);
  });
});

describe("wp_publish 잡 — publish/unpublish/dirty", () => {
  test("publish → setStatus('publish') + 상태 기록", async () => {
    const id = await seedEquipment();
    const fake = new FakeWpPublisher();
    await insertJob(id, "sync");
    await drainJobs(fake);
    await insertJob(id, "publish");
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(eq.wp_post_status).toBe("publish");
    expect(fake.calls.at(-1)?.method).toBe("setStatus");
    expect(fake.calls.at(-1)?.args).toEqual([1, "publish"]);
  });

  test("unpublish → setStatus('draft'), payload의 wp_post_id 사용", async () => {
    const id = await seedEquipment();
    const fake = new FakeWpPublisher();
    await insertJob(id, "sync");
    await drainJobs(fake);
    await insertJob(id, "publish");
    await drainJobs(fake);
    await insertJob(id, "unpublish", 1);
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(eq.wp_post_status).toBe("draft");
  });

  test("storage에 없는 사진은 건너뛰고 잡은 성공한다 (한 장 누락이 저장을 막지 않음)", async () => {
    const missing = "equipment/00000000-0000-0000-0000-00000000dcee/wp-missing.png";
    const id = await seedEquipment({ photos: [PHOTO_A, missing] });
    const fake = new FakeWpPublisher();
    await supabase.from("jobs").delete().eq("type", "wp_publish"); // seed INSERT가 만든 자동 잡 정리
    await insertJob(id, "sync");
    await drainJobs(fake);
    expect(fake.calls.filter((c) => c.method === "uploadMedia")).toHaveLength(1);
    const eq = await getEq(id);
    expect(eq.wp_post_id).toBe(1);
    expect(Object.keys(eq.wp_media as Record<string, unknown>)).toEqual([PHOTO_A]);
  });

  test("publish 잡 처리 시점에 체크가 해제됐으면 발행하지 않는다 (내리기 의도 우선)", async () => {
    const id = await seedEquipment();
    const fake = new FakeWpPublisher();
    await drainJobs(fake); // seed 자동 sync → draft 생성
    // 체크 해제(트리거가 unpublish 잡 생성) 후 그 잡까지 소화 → draft 유지 상태
    await supabase.from("equipment").update({ wp_publish_enabled: false }).eq("id", id);
    await drainJobs(fake);
    // 유실·레이스로 남았던 publish 잡을 모사(직접 주입 — RPC 가드 우회 경로)
    await insertJob(id, "publish");
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(eq.wp_post_status).toBe("draft"); // 발행 안 됨
    expect(fake.calls.filter((c) => c.method === "setStatus" && c.args[1] === "publish")).toHaveLength(0);
  });

  test("자가 치유: unpublish가 유실돼도 sync 잡이 상태를 재확인해 스스로 내린다", async () => {
    const id = await seedEquipment();
    const fake = new FakeWpPublisher();
    await drainJobs(fake); // draft 생성
    await insertJob(id, "publish");
    await drainJobs(fake); // 공개
    await supabase.from("equipment").update({ wp_publish_enabled: false }).eq("id", id);
    // 트리거가 만든 unpublish 잡을 지워 "processing sync에 흡수돼 소실"된 상황 모사
    await supabase.from("jobs").delete().eq("type", "wp_publish");
    await insertJob(id, "sync");
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(eq.wp_post_status).toBe("draft"); // 워커가 스스로 내림
  });

  test("공개 후 수정(dirty) → refresh sync가 dirty를 해제한다", async () => {
    const id = await seedEquipment();
    const fake = new FakeWpPublisher();
    await insertJob(id, "sync");
    await drainJobs(fake);
    await insertJob(id, "publish");
    await drainJobs(fake);

    await supabase.from("equipment").update({ name: `${NAME}_수정` }).eq("id", id);
    expect((await getEq(id)).wp_dirty).toBe(true);

    await insertJob(id, "sync"); // [홈페이지 갱신] 버튼 경로
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(eq.wp_dirty).toBe(false);
    expect(eq.wp_post_status).toBe("publish"); // 갱신은 공개 상태 유지
  });
});

// ── #262 플러그인 템플릿 경로 — 분류에 wp_template_post_id가 설정되면 활성화 ──
describe("wp_publish 잡 — 플러그인 템플릿 경로(#262)", () => {
  beforeAll(async () => {
    await supabase.from("equipment_category").update({ wp_template_post_id: 4605 }).eq("id", CAT);
  });
  afterAll(async () => {
    await supabase.from("equipment_category").update({ wp_template_post_id: null }).eq("id", CAT);
  });

  test("신규 생성: precheck→미디어→pluginSync 순서, draft + render_mode=elementor 기록", async () => {
    const fake = new FakeWpPublisher();
    const id = await seedEquipment({
      photos: [PHOTO_A],
      specs: [{ group: "시스템", icon: "settings", items: [{ id: "", label: "속도", value: "1600mm/s" }] }],
    });
    await insertJob(id, "sync");
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(eq.wp_post_id).not.toBeNull();
    expect(eq.wp_post_status).toBe("draft");
    expect(eq.wp_render_mode).toBe("elementor");
    const methods = fake.calls.map((c) => c.method);
    expect(methods.indexOf("pluginPrecheck")).toBeLessThan(methods.indexOf("uploadMedia"));
    expect(methods).toContain("pluginSync");
    expect(methods).not.toContain("createDraft"); // 레거시 경로 미사용
    // payload 내용 계약 — 그룹명(SpecGroup.group→name 매핑)·특징이 실제로 실려 간다
    const syncCall = fake.calls.find((c) => c.method === "pluginSync");
    const input = syncCall?.args[0] as {
      specGroups: Array<{ name: string }>;
      features: string[];
      photoMediaIds: number[];
    };
    expect(input.specGroups.map((g) => g.name)).toEqual(["시스템"]);
    expect(input.features).toEqual(["하이라이트1"]);
    // 사진 1장 = image-01·image-02 둘 다 같은 사진(사양 옆 제품 이미지 유지)
    expect(input.photoMediaIds).toHaveLength(2);
    expect(input.photoMediaIds[0]).toBe(input.photoMediaIds[1]);
  });

  test("공개 글 갱신: pluginSync가 currentStatus를 보존한다 (강등 금지 계약)", async () => {
    const fake = new FakeWpPublisher();
    const id = await seedEquipment();
    await insertJob(id, "sync");
    await drainJobs(fake);
    const first = await getEq(id);
    // 발행 전환 후 재sync([홈페이지 갱신] 경로와 동일)
    await insertJob(id, "publish", undefined);
    await drainJobs(fake);
    await insertJob(id, "sync");
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(eq.wp_post_id).toBe(first.wp_post_id);
    expect(eq.wp_post_status).toBe("publish"); // 갱신이 draft로 강등시키지 않음
    expect(eq.wp_render_mode).toBe("elementor");
  });

  test("수동 편집 감지: 미디어 업로드 전에 종단(manual_edit) — 고아 미디어 0", async () => {
    const fake = new FakeWpPublisher();
    const id = await seedEquipment({ photos: [PHOTO_A] });
    fake.manualEditedUuids.add(id);
    await insertJob(id, "sync");
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(String(eq.wp_last_error)).toMatch(/^manual_edit:/);
    const methods = fake.calls.map((c) => c.method);
    expect(methods).toContain("pluginPrecheck");
    expect(methods).not.toContain("uploadMedia"); // 409 조기 감지 — 업로드 자체가 없다
    expect(methods).not.toContain("pluginSync");
  });

  test("force 잡(관리자 덮어쓰기)은 수동 편집을 무시하고 동기화·에러 해제", async () => {
    const fake = new FakeWpPublisher();
    const id = await seedEquipment();
    fake.manualEditedUuids.add(id);
    await insertJob(id, "sync", undefined, { force: true });
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(eq.wp_last_error).toBeNull();
    expect(eq.wp_post_id).not.toBeNull();
    expect(eq.wp_render_mode).toBe("elementor");
  });

  test("플러그인 미설치 + Elementor 관리 글 = 레거시 폴백 금지(명시 실패)", async () => {
    const fake = new FakeWpPublisher();
    const id = await seedEquipment();
    await insertJob(id, "sync");
    await drainJobs(fake); // 정상 생성 → render_mode=elementor
    fake.pluginInstalled = false;
    await insertJob(id, "sync");
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(String(eq.wp_last_error)).toContain("레거시 폴백 금지");
    expect(fake.calls.map((c) => c.method)).not.toContain("updatePost"); // 조용한 HTML 덮어쓰기 없음
  });

  test("플러그인 반환 id ≠ DB 저장 id → replace 기록(재연결) + 기존 글 deletePost 금지", async () => {
    const fake = new FakeWpPublisher();
    const id = await seedEquipment();
    // 첫 sync로 DB에 post_id 기록
    await insertJob(id, "sync");
    await drainJobs(fake);
    const first = await getEq(id);
    const dbPostId = first.wp_post_id as number;
    // 플러그인이 meta 재연결로 "다른 글"을 돌려주는 상황 주입
    fake.pluginSyncPostIdOverride = dbPostId + 1000;
    await insertJob(id, "sync");
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(eq.wp_post_id).toBe(dbPostId + 1000); // replace=true로 교체 기록
    expect(eq.wp_last_error).toBeNull();
    // created=false(기존 글 재연결) — CAS 정리든 뭐든 deletePost가 호출되면 실글 삭제 사고
    expect(fake.calls.map((c) => c.method)).not.toContain("deletePost");
  });

  test("계약 버전 불일치(contract_mismatch) + 미생성 장비 = 레거시 폴백", async () => {
    const fake = new FakeWpPublisher();
    fake.pluginContract = 99;
    const id = await seedEquipment();
    await insertJob(id, "sync");
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(eq.wp_post_id).not.toBeNull();
    expect(eq.wp_render_mode).toBe("html"); // no_plugin과 동일 분기 — 레거시로
    expect(eq.wp_last_error).toBeNull();
  });

  test("플러그인 미설치 + 미생성 장비 = 레거시 HTML 경로로 정상 폴백(render_mode=html)", async () => {
    const fake = new FakeWpPublisher();
    fake.pluginInstalled = false;
    const id = await seedEquipment();
    await insertJob(id, "sync");
    await drainJobs(fake);
    const eq = await getEq(id);
    expect(eq.wp_post_id).not.toBeNull();
    expect(eq.wp_post_status).toBe("draft");
    expect(eq.wp_render_mode).toBe("html");
    expect(eq.wp_last_error).toBeNull();
  });
});
