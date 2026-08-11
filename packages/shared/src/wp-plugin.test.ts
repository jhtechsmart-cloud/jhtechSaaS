import { describe, expect, it } from "vitest";
import { FakeWpPublisher, WpRestPublisher } from "./wp-publisher";
import { WP_PLUGIN_CONTRACT, parseWpErrorCode, toPluginPayload, type WpTemplateSyncInput } from "./wp-plugin";

const env = { apiUrl: "https://jhtech.co.kr/wp-json", user: "saas-bot", appPassword: "x" };

function input(overrides: Partial<WpTemplateSyncInput> = {}): WpTemplateSyncInput {
  return {
    equipmentUuid: "11111111-1111-4111-8111-111111111111",
    knownPostId: null,
    templatePostId: 4605,
    title: "멀티컷 A3 Max 5",
    subtitle: "소량 다품종 최적",
    seriesName: null,
    model: "JC350Max",
    photoMediaIds: [10, 11],
    featuredMediaId: 10,
    features: ["듀얼 툴 헤드"],
    specGroups: [{ name: "시스템", items: [{ label: "커팅 크기", value: '350mm 19" 대응' }] }],
    youtubeIds: ["rUuA3wRLuvE"],
    categories: [12, 9],
    currentStatus: null,
    force: false,
    ...overrides,
  };
}

describe("toPluginPayload", () => {
  it("snake_case 계약 키로 직렬화하고 contract를 동봉한다", () => {
    const p = toPluginPayload(input());
    expect(p.contract).toBe(WP_PLUGIN_CONTRACT);
    expect(p.equipment_uuid).toBe("11111111-1111-4111-8111-111111111111");
    expect(p.template_post_id).toBe(4605);
    expect(p.spec_groups).toEqual([
      { name: "시스템", items: [{ label: "커팅 크기", value: '350mm 19" 대응' }] },
    ]);
    expect(p.current_status).toBeNull();
  });
});

describe("parseWpErrorCode", () => {
  it("WP 에러 body에서 code를 뽑고, 비JSON(null)·비객체는 null", () => {
    expect(parseWpErrorCode({ code: "rest_no_route", message: "x" })).toBe("rest_no_route");
    expect(parseWpErrorCode(null)).toBeNull();
    expect(parseWpErrorCode("<html>errdoc</html>")).toBeNull();
  });
});

describe("FakeWpPublisher — 플러그인 모사", () => {
  it("신규 sync = created:true + draft, 재sync = created:false + currentStatus 보존", async () => {
    const fake = new FakeWpPublisher();
    const first = await fake.pluginSync(input());
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    expect(first.value.created).toBe(true);
    expect(first.value.status).toBe("draft");
    const again = await fake.pluginSync(
      input({ knownPostId: first.value.postId, currentStatus: "publish" }),
    );
    if (!again.ok) throw new Error("unreachable");
    expect(again.value.created).toBe(false);
    expect(again.value.postId).toBe(first.value.postId);
    expect(again.value.status).toBe("publish"); // 갱신은 상태 보존(강등 금지 계약)
  });

  it("수동 편집 상태면 manual_edit 실패, force면 통과·해제", async () => {
    const fake = new FakeWpPublisher();
    fake.manualEditedUuids.add(input().equipmentUuid);
    const blocked = await fake.pluginSync(input());
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("unreachable");
    expect(blocked.kind).toBe("manual_edit");
    const forced = await fake.pluginSync(input({ force: true }));
    expect(forced.ok).toBe(true);
    expect(fake.manualEditedUuids.size).toBe(0);
  });

  it("미설치면 precheck가 no_plugin, 계약 불일치면 contract_mismatch", async () => {
    const fake = new FakeWpPublisher();
    fake.pluginInstalled = false;
    const off = await fake.pluginPrecheck("u", null);
    if (!off.ok) throw new Error("unreachable");
    expect(off.value).toEqual({ pluginAvailable: false, reason: "no_plugin" });
    fake.pluginInstalled = true;
    fake.pluginContract = 99;
    const mismatch = await fake.pluginPrecheck("u", null);
    if (!mismatch.ok) throw new Error("unreachable");
    expect(mismatch.value.pluginAvailable).toBe(false);
    expect(mismatch.value.reason).toBe("contract_mismatch");
  });
});

describe("WpRestPublisher — 플러그인 endpoint 분류", () => {
  function pub(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    return new WpRestPublisher(env, { fetch: (async (u: unknown, i?: RequestInit) => handler(String(u), i)) as typeof fetch });
  }

  it("precheck: rest_no_route 404는 실패가 아니라 pluginAvailable:false", async () => {
    const p = pub(() => new Response(JSON.stringify({ code: "rest_no_route" }), { status: 404 }));
    const r = await p.pluginPrecheck("u", null);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value).toEqual({ pluginAvailable: false, reason: "no_plugin" });
  });

  it("precheck: 응답 contract 불일치는 contract_mismatch (가용 false)", async () => {
    const p = pub(
      () => new Response(JSON.stringify({ contract: 99, manual_edited: false, post_id: null }), { status: 200 }),
    );
    const r = await p.pluginPrecheck("u", null);
    if (!r.ok) throw new Error("unreachable");
    expect(r.value.pluginAvailable).toBe(false);
    expect(r.value.reason).toBe("contract_mismatch");
  });

  it("sync: 409 manually_edited → kind manual_edit", async () => {
    const p = pub(() => new Response(JSON.stringify({ code: "manually_edited" }), { status: 409 }));
    const r = await p.pluginSync(input());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.kind).toBe("manual_edit");
  });

  it("sync: template_invalid → permanent", async () => {
    const p = pub(() => new Response(JSON.stringify({ code: "template_invalid" }), { status: 400 }));
    const r = await p.pluginSync(input());
    if (r.ok) throw new Error("unreachable");
    expect(r.kind).toBe("permanent");
    expect(r.error).toContain("template_invalid");
  });

  it("sync: 정상 응답은 created·status를 그대로 전달하고 payload는 snake_case", async () => {
    let sent: Record<string, unknown> = {};
    const p = pub((_, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ post_id: 77, link: "https://x/?p=77", status: "publish", created: false }),
        { status: 200 },
      );
    });
    const r = await p.pluginSync(input({ knownPostId: 77, currentStatus: "publish" }));
    if (!r.ok) throw new Error("unreachable");
    expect(r.value).toEqual({ postId: 77, link: "https://x/?p=77", status: "publish", created: false });
    expect(sent.known_post_id).toBe(77);
    expect(sent.current_status).toBe("publish");
  });

  it("에러 body가 가비아 errdoc HTML(비JSON)이어도 상태 코드 분류로 안전 처리", async () => {
    const p = pub(() => new Response("<html>modsecurity</html>", { status: 500 }));
    const r = await p.pluginSync(input());
    if (r.ok) throw new Error("unreachable");
    expect(r.kind).toBe("transient");
  });
});
