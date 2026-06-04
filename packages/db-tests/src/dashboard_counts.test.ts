import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

// 대시보드 색바/액션큐 count가 RLS를 그대로 존중하는지 — 역할별 가시범위 단언.
describe("dashboard counts — applications status RLS 정합", () => {
  const POOL = "00000000-0000-0000-0000-0000000000d1"; // 미배정 new
  const MINE = "00000000-0000-0000-0000-0000000000d2"; // sales1 배정

  async function seed(): Promise<void> {
    await asPostgres(c);
    await seedAuthUser(c, UID.sales1, "d-sales1@jhtech.test");
    await seedAuthUser(c, UID.admin, "d-admin@jhtech.test");
    // sales1 = claim만, admin = applications.view_all
    await c.query("update public.profiles set permissions='{applications.claim}' where id=$1", [UID.sales1]);
    await c.query("update public.profiles set permissions='{applications.view_all}' where id=$1", [UID.admin]);
    await c.query("insert into public.applications (id,company,status) values ($1,'풀','new')", [POOL]);
    await c.query("insert into public.applications (id,company,status,assignee_id) values ($1,'내것','assigned',$2)", [MINE, UID.sales1]);
  }

  test("claim 영업: status='new' count = 공용 미배정 풀(본인것 아님)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const r = await c.query("select count(*)::int n from public.applications where status='new'");
      expect(r.rows[0].n).toBe(1); // 미배정 풀의 new 1건이 보인다(claim 가시)
    });
  });

  test("view_all 계정: 전체 status count 합 = 2", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      const r = await c.query("select count(*)::int n from public.applications");
      expect(r.rows[0].n).toBe(2);
    });
  });

  test("권한 없는 계정: applications count = 0(RLS 차단)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await seedAuthUser(c, UID.sales2, "d-sales2@jhtech.test");
      await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales2]);
      await asUser(c, UID.sales2);
      const r = await c.query("select count(*)::int n from public.applications");
      expect(r.rows[0].n).toBe(0);
    });
  });
});

// 담당자별 부하 이름 매핑 — profiles RLS는 users.manage만 타인 이름 허용(plan 핵심 제약).
describe("dashboard assigneeLoad — profiles 이름 RLS", () => {
  async function seedTwo(): Promise<void> {
    await asPostgres(c);
    await seedAuthUser(c, UID.admin, "d2-admin@jhtech.test");
    await seedAuthUser(c, UID.sales1, "d2-sales1@jhtech.test");
    await c.query("update public.profiles set name='관리자' where id=$1", [UID.admin]);
    await c.query("update public.profiles set name='영업1' where id=$1", [UID.sales1]);
  }

  test("users.manage 계정: 타인 profiles.name 읽힘", async () => {
    await inRollbackTx(c, async () => {
      await seedTwo();
      await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
      await asUser(c, UID.admin);
      const r = await c.query("select name from public.profiles where id=$1", [UID.sales1]);
      expect(r.rows[0]?.name).toBe("영업1");
    });
  });

  test("users.manage 없는 계정: 타인 profiles 행 안 보임(이름 null 방향)", async () => {
    await inRollbackTx(c, async () => {
      await seedTwo();
      await c.query("update public.profiles set permissions='{applications.view_all}' where id=$1", [UID.admin]);
      await asUser(c, UID.admin);
      const r = await c.query("select name from public.profiles where id=$1", [UID.sales1]);
      expect(r.rowCount).toBe(0); // 타인 행 자체가 안 보임 → 이름 매핑 null(fail-safe)
    });
  });
});
