import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import {
  asPostgres,
  asUser,
  inRollbackTx,
  makeClient,
  seedAuthUser,
  UID,
} from "./helpers";

// 데모예약 — 데모센터 1곳: EXCLUDE 제약이 취소 외 예약끼리 시간대 겹침을 DB 레벨에서 차단.
// UI/서버 검증과 무관하게 동시 INSERT 레이스에서도 한쪽은 반드시 23P01로 실패해야 한다.

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

const EQ = "00000000-0000-0000-0000-00000000e001";
const EQ2 = "00000000-0000-0000-0000-00000000e002";

// sales1=demo_reservations.write, sales2=권한 없음(콘솔 조회만), admin=users.manage(super).
async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.sales1, "s1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "s2@jhtech.test");
  await seedAuthUser(c, UID.admin, "admin@jhtech.test");
  await c.query(
    "update public.profiles set permissions='{demo_reservations.write}' where id=$1",
    [UID.sales1],
  );
  await c.query(
    "update public.profiles set permissions='{users.manage}' where id=$1",
    [UID.admin],
  );
  await c.query(
    "insert into public.equipment (id,name,base_price,status,is_demo) values ($1,'데모장비',1000,'active',true)",
    [EQ],
  );
  await c.query(
    "insert into public.equipment (id,name,base_price,status,is_demo) values ($1,'데모장비2',1000,'active',true)",
    [EQ2],
  );
}

// KST 시각 두 개로 tstzrange 리터럴 생성(반개구간 [start,end)).
function range(date: string, start: string, end: string): string {
  return `[${date}T${start}:00+09:00,${date}T${end}:00+09:00)`;
}

// 부모 1행 + 자식 1행(장비). 장비별 겹침은 자식 EXCLUDE가 판정한다.
// eq 기본=EQ. 다른 장비 시나리오는 eq=EQ2로 호출.
async function insertAs(
  client: Client,
  uid: string,
  tr: string,
  extra: { status?: string; createdBy?: string; eq?: string } = {},
): Promise<void> {
  await asUser(client, uid);
  const status = extra.status ?? "confirmed";
  const r = await client.query(
    `insert into public.demo_reservations
       (customer_name, time_range, status, created_by)
     values ('테스트고객', $1::tstzrange, $2, $3) returning id`,
    [tr, status, extra.createdBy ?? uid],
  );
  await client.query(
    `insert into public.demo_reservation_equipment
       (reservation_id, equipment_id, time_range, status)
     values ($1, $2, $3::tstzrange, $4)`,
    [r.rows[0].id, extra.eq ?? EQ, tr, status],
  );
}

describe("demo_reservations — RLS capability", () => {
  test("demo_reservations.write 보유자(영업)는 INSERT 가능", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await insertAs(c, UID.sales1, range("2026-07-01", "10:00", "11:00"));
      await asPostgres(c);
      const r = await c.query(
        "select count(*)::int n from public.demo_reservations",
      );
      expect(r.rows[0].n).toBe(1);
    });
  });

  test("users.manage(관리자)는 super 통과로 INSERT 가능", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await insertAs(c, UID.admin, range("2026-07-01", "10:00", "11:00"));
      await asPostgres(c);
      const r = await c.query(
        "select count(*)::int n from public.demo_reservations",
      );
      expect(r.rows[0].n).toBe(1);
    });
  });

  test("write 키 없는 직원은 INSERT 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await expect(
        insertAs(c, UID.sales2, range("2026-07-01", "10:00", "11:00")),
      ).rejects.toThrow();
    });
  });

  test("키 없는 직원도 SELECT는 가능(조회 전 직원)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await insertAs(c, UID.sales1, range("2026-07-01", "10:00", "11:00"));
      await asUser(c, UID.sales2);
      const r = await c.query(
        "select count(*)::int n from public.demo_reservations",
      );
      expect(r.rows[0].n).toBe(1);
    });
  });

  test("write 키 없는 직원은 UPDATE(취소) 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await insertAs(c, UID.sales1, range("2026-07-01", "10:00", "11:00"));
      await asUser(c, UID.sales2);
      const r = await c.query(
        "update public.demo_reservations set status='canceled'",
      );
      expect(r.rowCount).toBe(0); // RLS using 절이 행을 숨김 → 0행
    });
  });

  test("RPC create_demo_reservation — 부모+자식(복수 장비) 원자 생성", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query(
        `select public.create_demo_reservation(
           null, '고객', null, null, null, null, $1::tstzrange, array[$2,$3]::uuid[])`,
        [range("2026-07-01", "10:00", "11:00"), EQ, EQ2],
      );
      await asPostgres(c);
      const p = await c.query("select count(*)::int n from public.demo_reservations");
      const ch = await c.query("select count(*)::int n from public.demo_reservation_equipment");
      expect(p.rows[0].n).toBe(1);
      expect(ch.rows[0].n).toBe(2);
    });
  });

  test("RPC — 권한 없는 직원은 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales2);
      await expect(
        c.query(
          `select public.create_demo_reservation(
             null, '고객', null, null, null, null, $1::tstzrange, array[$2]::uuid[])`,
          [range("2026-07-01", "10:00", "11:00"), EQ],
        ),
      ).rejects.toThrow();
    });
  });
});

describe("demo_reservations — 겹침 차단(EXCLUDE)", () => {
  test("기존 14:00–15:30과 겹치는 13:00–14:30 INSERT → 23P01 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await insertAs(c, UID.sales1, range("2026-07-01", "14:00", "15:30"));
      await expect(
        insertAs(c, UID.sales1, range("2026-07-01", "13:00", "14:30")),
      ).rejects.toMatchObject({ code: "23P01" });
    });
  });

  test("다른 장비는 같은 시간대 허용(장비별 겹침)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await insertAs(c, UID.sales1, range("2026-07-01", "14:00", "15:30")); // 장비 EQ
      // 같은 시간이지만 다른 장비(EQ2) → 허용.
      await insertAs(c, UID.sales1, range("2026-07-01", "14:00", "15:30"), { eq: EQ2 });
      await asPostgres(c);
      const r = await c.query(
        "select count(*)::int n from public.demo_reservation_equipment where status='confirmed'",
      );
      expect(r.rows[0].n).toBe(2);
    });
  });

  test("경계 접촉(…–14:00 기존, 14:00–… 신규)은 겹침 아님(반개구간)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await insertAs(c, UID.sales1, range("2026-07-01", "13:00", "14:00"));
      await insertAs(c, UID.sales1, range("2026-07-01", "14:00", "15:00"));
      await asPostgres(c);
      const r = await c.query(
        "select count(*)::int n from public.demo_reservations",
      );
      expect(r.rows[0].n).toBe(2);
    });
  });

  test("canceled 예약과는 겹침 허용", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await insertAs(c, UID.sales1, range("2026-07-01", "14:00", "15:30"), {
        status: "canceled",
      });
      await insertAs(c, UID.sales1, range("2026-07-01", "14:00", "15:30"));
      await asPostgres(c);
      const r = await c.query(
        "select count(*)::int n from public.demo_reservations where status='confirmed'",
      );
      expect(r.rows[0].n).toBe(1);
    });
  });

  test("동시성: 같은 시간대 병렬 INSERT 2건 → 정확히 1건 성공·1건 23P01", async () => {
    // 레이스 검증은 커밋이 실제로 일어나야 해서 rollback 트랜잭션 밖에서 독립 커넥션 2개로
    // 진행한다. ⚠️ vitest가 테스트 파일을 병렬 실행하므로 다른 파일이 쓰는 공유 fixture
    // (UID.sales1·장비 id)를 만지면 교차 데드락(40P01) — 이 테스트 전용 id만 사용한다.
    const RACE_UID = "00000000-0000-0000-0000-0000000000c9";
    const RACE_EQ = "00000000-0000-0000-0000-00000000e0c9";
    const a = await makeClient();
    const b = await makeClient();
    const marker = "race-test-marker";
    try {
      await asPostgres(c);
      await c.query(
        "delete from public.demo_reservations where memo=$1",
        [marker],
      );
      await seedAuthUser(c, RACE_UID, "race-s1@jhtech.test").catch(() => {});
      await c.query(
        "update public.profiles set permissions='{demo_reservations.write}' where id=$1",
        [RACE_UID],
      );
      await c.query(
        "insert into public.equipment (id,name,base_price,status) values ($1,'레이스데모장비',1000,'active') on conflict (id) do nothing",
        [RACE_EQ],
      );

      const tr = range("2026-07-02", "10:00", "11:30");
      // set local은 트랜잭션 안에서만 유효 → 명시 BEGIN/COMMIT으로 RLS 역할 적용 상태로 경쟁시킨다.
      const run = async (client: Client) => {
        await client.query("begin");
        try {
          await asUser(client, RACE_UID);
          const ins = await client.query(
            `insert into public.demo_reservations
               (customer_name, time_range, created_by, memo)
             values ('레이스', $1::tstzrange, $2, $3) returning id`,
            [tr, RACE_UID, marker],
          );
          // 자식 EXCLUDE(같은 장비·겹침)가 레이스에서 한쪽을 23P01로 실패시킨다.
          await client.query(
            `insert into public.demo_reservation_equipment
               (reservation_id, equipment_id, time_range, status)
             values ($1, $2, $3::tstzrange, 'confirmed')`,
            [ins.rows[0].id, RACE_EQ, tr],
          );
          await client.query("commit");
        } catch (e) {
          await client.query("rollback");
          throw e;
        }
      };
      const results = await Promise.allSettled([run(a), run(b)]);
      const ok = results.filter((r) => r.status === "fulfilled");
      const fail = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      expect(ok.length).toBe(1);
      expect(fail.length).toBe(1);
      expect((fail[0].reason as { code?: string }).code).toBe("23P01");

      await asPostgres(c);
      const r = await c.query(
        "select count(*)::int n from public.demo_reservations where memo=$1",
        [marker],
      );
      expect(r.rows[0].n).toBe(1);
    } finally {
      await asPostgres(c);
      await c.query("delete from public.demo_reservations where memo=$1", [
        marker,
      ]);
      await c.query("delete from public.equipment where id=$1", [RACE_EQ]).catch(
        () => {},
      );
      await c
        .query("delete from auth.users where email='race-s1@jhtech.test'")
        .catch(() => {});
      await a.end();
      await b.end();
    }
  });
});

describe("demo_reservations — 값 제약", () => {
  test("15분 단위 아닌 시작(10:07) → check 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await expect(
        insertAs(c, UID.sales1, range("2026-07-01", "10:07", "11:07")),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  test("빈 범위(시작=종료) → check 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await expect(
        insertAs(c, UID.sales1, range("2026-07-01", "10:00", "10:00")),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  test("허용 외 status → check 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await expect(
        insertAs(c, UID.sales1, range("2026-07-01", "10:00", "11:00"), {
          status: "pending",
        }),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  test("created_by/created_at은 서버 강제(클라 지정 무시)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      // sales1이 created_by를 sales2로 위조 시도 → 트리거가 auth.uid()로 덮음.
      await insertAs(c, UID.sales1, range("2026-07-01", "10:00", "11:00"), {
        createdBy: UID.sales2,
      });
      await asPostgres(c);
      const r = await c.query(
        "select created_by from public.demo_reservations limit 1",
      );
      expect(r.rows[0].created_by).toBe(UID.sales1);
    });
  });
});
