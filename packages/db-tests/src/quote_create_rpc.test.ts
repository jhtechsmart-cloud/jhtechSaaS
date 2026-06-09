import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { calculateQuote } from "@jhtechsaas/shared";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

const APP = "00000000-0000-0000-0000-00000000d001";

// sales1=quotes.write 보유(배정), sales2=권한없음. APP은 sales1 배정.
async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
  await c.query("update public.profiles set permissions='{quotes.write}' where id=$1", [UID.sales1]);
  await c.query(
    "insert into public.applications (id, company, assignee_id) values ($1,'견적대상',$2)",
    [APP, UID.sales1],
  );
}

const ITEM = (unitPrice: number, quantity = 1, name = "장비") => ({ name, unitPrice, quantity });

async function createQuote(items: object[], options: object[], status?: string) {
  const r = await c.query("select public.create_quote($1,$2,$3,$4) as q", [
    APP,
    JSON.stringify(items),
    JSON.stringify(options),
    status ?? "draft",
  ]);
  return r.rows[0].q as Record<string, unknown>;
}

describe("create_quote — 금액 SQL 계산 + 채번", () => {
  test("quotes.write 없는 사용자는 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales2);
      await expect(createQuote([ITEM(50_000_000)], [])).rejects.toThrow();
    });
  });

  test("금액을 RPC가 직접 계산: 50M + 2.5M×2 → 55M/5.5M/60.5M", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const q = await createQuote(
        [ITEM(50_000_000, 1, "UV3300S")],
        [ITEM(2_500_000, 2, "프린트헤드")],
      );
      expect(Number(q.supply_price)).toBe(55_000_000);
      expect(Number(q.tax_price)).toBe(5_500_000);
      expect(Number(q.total)).toBe(60_500_000);
    });
  });

  test("줄의 unitPrice·quantity만 사용(unknown 필드 무시)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const q = await createQuote(
        [{ name: "장비", unitPrice: 10_000_000, quantity: 1, total: 999, junk: "x" }],
        [],
      );
      expect(Number(q.supply_price)).toBe(10_000_000); // total:999 무시
    });
  });

  test("채번 트리거 작동: quote_no=JHQ-…-V1, version 1", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const q = await createQuote([ITEM(10_000_000)], []);
      expect(q.version).toBe(1);
      expect(String(q.quote_no)).toMatch(/^JHQ-\d{8}-\d{3,}-V1$/);
    });
  });

  test("포함옵션(kind=included, 단가0) 저장·보존 + 금액 영향 없음", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const q = await createQuote(
        [ITEM(50_000_000, 1, "UV3300S")],
        [
          { name: "자동 급지", unitPrice: 0, quantity: 1, kind: "included" },
          { name: "연장 보증", unitPrice: 1_500_000, quantity: 1, kind: "extra" },
        ],
        "issued",
      );
      // 포함옵션(0원)은 금액 무영향: 50M + 1.5M = 51.5M, 세 5.15M, 합 56.65M
      expect(Number(q.total)).toBe(56_650_000);
      // kind가 저장된 options jsonb에 그대로 보존(스냅샷)
      expect(q.options).toEqual([
        { name: "자동 급지", unitPrice: 0, quantity: 1, kind: "included" },
        { name: "연장 보증", unitPrice: 1_500_000, quantity: 1, kind: "extra" },
      ]);
    });
  });

  test("음수 옵션(할인/제외) 차감", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const q = await createQuote([ITEM(50_000_000)], [ITEM(-1_000_000, 1, "할인")]);
      expect(Number(q.supply_price)).toBe(49_000_000);
    });
  });

  test("줄 검증: quantity 0·음수·소수 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      for (const quantity of [0, -1, 1.5]) {
        await expect(createQuote([ITEM(10_000_000, quantity)], [])).rejects.toThrow();
      }
    });
  });

  test("교차검증: TS calculateQuote == RPC 결과", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const cases = [
        { items: [ITEM(50_000_000)], options: [ITEM(2_500_000, 2)] },
        { items: [ITEM(30_000_000, 2), ITEM(12_345_675)], options: [ITEM(-1_000_000)] },
        { items: [ITEM(999_999_999)], options: [] },
      ];
      for (const tc of cases) {
        const ts = calculateQuote(tc);
        const q = await createQuote(tc.items, tc.options);
        expect(Number(q.supply_price)).toBe(ts.supplyPrice);
        expect(Number(q.tax_price)).toBe(ts.taxPrice);
        expect(Number(q.total)).toBe(ts.total);
      }
    });
  });
});

async function createManualQuote(
  company: string | null,
  items: object[],
  options: object[],
  extra?: { ceo?: string; phone?: string; email?: string },
) {
  const r = await c.query("select public.create_manual_quote($1,$2,$3,$4,$5,$6,$7) as q", [
    company,
    extra?.ceo ?? null,
    extra?.phone ?? null,
    extra?.email ?? null,
    JSON.stringify(items),
    JSON.stringify(options),
    "draft",
  ]);
  return r.rows[0].q as { application_id: string; quote: Record<string, unknown> };
}

describe("create_manual_quote — 수기 경로(application+quote 원자 생성)", () => {
  test("quotes.write 없는 사용자는 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales2);
      await expect(createManualQuote("수기업체", [ITEM(10_000_000)], [])).rejects.toThrow();
    });
  });

  test("application(source=manual)+quote 원자 생성, 담당자=생성자", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const res = await createManualQuote(
        "수기업체",
        [ITEM(50_000_000, 1, "UV3300S")],
        [ITEM(2_500_000, 2, "프린트헤드")],
        { ceo: "홍길동", phone: "010-1234-5678" },
      );
      expect(res.application_id).toBeTruthy();
      expect(Number(res.quote.supply_price)).toBe(55_000_000);
      expect(res.quote.version).toBe(1);
      expect(String(res.quote.quote_no)).toMatch(/^JHQ-\d{8}-\d{3,}-V1$/);

      await asPostgres(c);
      const app = await c.query(
        "select source, company, assignee_id from public.applications where id=$1",
        [res.application_id],
      );
      expect(app.rows[0].source).toBe("manual");
      expect(app.rows[0].company).toBe("수기업체");
      expect(app.rows[0].assignee_id).toBe(UID.sales1);
      const q = await c.query("select application_id from public.quotes where id=$1", [res.quote.id]);
      expect(q.rows[0].application_id).toBe(res.application_id);
    });
  });

  test("company 누락(null/빈문자열) 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await expect(createManualQuote(null, [ITEM(10_000_000)], [])).rejects.toThrow();
      await expect(createManualQuote("   ", [ITEM(10_000_000)], [])).rejects.toThrow();
    });
  });
});

describe("applications.source 컬럼", () => {
  test("기본값 'public'", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const r = await c.query(
        "insert into public.applications (company) values ('공개건') returning source",
      );
      expect(r.rows[0].source).toBe("public");
    });
  });

  test("UPDATE로 source 변경 시도해도 OLD 보존(불변)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const ins = await c.query(
        "insert into public.applications (company) values ('공개건') returning id, source",
      );
      await c.query("update public.applications set source='manual' where id=$1", [ins.rows[0].id]);
      const r = await c.query("select source from public.applications where id=$1", [ins.rows[0].id]);
      expect(r.rows[0].source).toBe("public");
    });
  });
});
