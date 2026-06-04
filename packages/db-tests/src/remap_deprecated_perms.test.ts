// E5a #38 step6 — deprecated *.manage 키 remap 헬퍼 + 마이그레이션 효과 검증.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { makeClient } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

async function remap(perms: string[]): Promise<string[]> {
  const r = await c.query("select public.remap_deprecated_perms($1::text[]) as p", [perms]);
  return r.rows[0].p as string[];
}

describe("remap_deprecated_perms — *.manage → 신규 키", () => {
  test("customers.manage → edit+view_all (manage 제거, 타 키 보존)", async () => {
    expect(new Set(await remap(["customers.manage", "quotes.write"]))).toEqual(
      new Set(["customers.edit", "customers.view_all", "quotes.write"]),
    );
  });

  test("service_requests.manage → status+view_all", async () => {
    expect(new Set(await remap(["service_requests.manage"]))).toEqual(
      new Set(["service_requests.status", "service_requests.view_all"]),
    );
  });

  test("supply_requests.manage → status+view_all", async () => {
    expect(new Set(await remap(["supply_requests.manage"]))).toEqual(
      new Set(["supply_requests.status", "supply_requests.view_all"]),
    );
  });

  test("dead 키 없으면 동일 집합 유지", async () => {
    expect(new Set(await remap(["applications.claim", "quotes.write"]))).toEqual(
      new Set(["applications.claim", "quotes.write"]),
    );
  });

  test("기존에 edit가 이미 있어도 중복 없이 합쳐짐", async () => {
    expect(new Set(await remap(["customers.manage", "customers.edit"]))).toEqual(
      new Set(["customers.edit", "customers.view_all"]),
    );
  });

  test("세 dead 키 동시 보유도 모두 remap", async () => {
    expect(
      new Set(
        await remap([
          "customers.manage",
          "service_requests.manage",
          "supply_requests.manage",
        ]),
      ),
    ).toEqual(
      new Set([
        "customers.edit",
        "customers.view_all",
        "service_requests.status",
        "service_requests.view_all",
        "supply_requests.status",
        "supply_requests.view_all",
      ]),
    );
  });
});

describe("마이그레이션 효과 — profiles 잔여 deprecated 키 0", () => {
  test("어떤 profile도 deprecated *.manage 키를 갖지 않는다", async () => {
    const r = await c.query(
      "select count(*)::int n from public.profiles where permissions && array['customers.manage','service_requests.manage','supply_requests.manage']",
    );
    expect(r.rows[0].n).toBe(0);
  });
});
