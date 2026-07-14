import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

describe("privacy_policies RLS", () => {
  test("anon은 SELECT 가능(동의 문구 표시)", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const r = await c.query("select version from public.privacy_policies where version='v1.0'");
      expect(r.rowCount).toBeGreaterThan(0);
    });
  });

  test("anon은 v1.1(실문안)도 SELECT 가능 + 필수 4요소 포함", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      const r = await c.query("select body from public.privacy_policies where version='v1.1'");
      expect(r.rowCount).toBe(1);
      const body = r.rows[0].body as string;
      // 개인정보 보호법 제15조 필수 요소 — 수집 항목·목적·보유 기간·거부 권리.
      expect(body).toContain("수집·이용 항목");
      expect(body).toContain("수집·이용 목적");
      expect(body).toContain("보유·이용 기간");
      expect(body).toContain("거부할 권리");
      expect(body).toContain("(주)재현테크");
    });
  });

  test("anon은 INSERT 불가", async () => {
    await inRollbackTx(c, async () => {
      await asAnon(c);
      await expect(
        c.query("insert into public.privacy_policies (version, body) values ('vX','x')"),
      ).rejects.toThrow();
    });
  });

  test("users.manage 없는 로그인 사용자는 INSERT 불가", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales1, "s1@x.com");
      await asUser(c, UID.sales1);
      await expect(
        c.query("insert into public.privacy_policies (version, body) values ('vX','x')"),
      ).rejects.toThrow();
    });
  });
});
