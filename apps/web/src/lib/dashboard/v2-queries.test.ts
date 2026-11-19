import { beforeEach, describe, expect, test, vi } from "vitest";

// 대시보드 캘린더 데모 회귀 — demo_reservations.equipment_id는 복수장비 마이그레이션(20260629130000)에서
// 자식 테이블 demo_reservation_equipment로 이동·삭제됨. 옛 임베드를 쓰면 PostgREST가 PGRST200 에러를
// 내고 데모가 캘린더에서 조용히 사라진다(데모 페이지·우측 레일은 정상이라 눈치채기 어려움).

vi.mock("server-only", () => ({}));

// 테이블별 select 문자열과 응답을 기록하는 체이너블 목
const selects: Record<string, string> = {};
const responses: Record<string, { data: unknown; error: unknown }> = {};

function chain(table: string) {
  const res = () => responses[table] ?? { data: [], error: null };
  const q: Record<string, unknown> = {};
  for (const m of ["gte", "lt", "overlaps", "neq", "order", "limit", "eq", "in"]) {
    q[m] = () => q;
  }
  q.select = (cols: string) => {
    selects[table] = cols;
    return q;
  };
  q.then = (ok: (v: unknown) => unknown, ng?: (e: unknown) => unknown) =>
    Promise.resolve(res()).then(ok, ng);
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: (t: string) => chain(t) }),
}));
vi.mock("@/lib/release-orders/deliveries", () => ({
  loadLatestDeliveries: async () => [],
}));

import { listCalendarEvents } from "./v2-queries";

describe("listCalendarEvents — 데모", () => {
  beforeEach(() => {
    for (const k of Object.keys(selects)) delete selects[k];
    for (const k of Object.keys(responses)) delete responses[k];
  });

  test("삭제된 단수 equipment_id가 아니라 자식 테이블로 장비명을 임베드한다", async () => {
    await listCalendarEvents("2026-11-01", "2026-12-01");
    const cols = selects["demo_reservations"];
    expect(cols).toContain("demo_reservation_equipment(");
    expect(cols).not.toMatch(/(^|,)\s*equipment:equipment_id/);
  });

  test("복수 장비 데모 → 캘린더 이벤트 1건, 장비명 쉼표 연결", async () => {
    responses["demo_reservations"] = {
      data: [
        {
          id: "d1",
          customer_name: "가나전자",
          time_range: '["2026-11-20 01:00:00+00","2026-11-20 03:00:00+00")',
          demo_reservation_equipment: [
            { equipment: { name: "XTRA 3300S" } },
            { equipment: { name: "JU-1361H" } },
          ],
        },
      ],
      error: null,
    };
    const events = await listCalendarEvents("2026-11-01", "2026-12-01");
    const demos = events.filter((e) => e.type === "demo");
    expect(demos).toHaveLength(1);
    expect(demos[0].date).toBe("2026-11-20");
    expect(demos[0].hm).toBe("10:00");
    expect(demos[0].title).toBe("가나전자 XTRA 3300S, JU-1361H 데모");
  });
});
