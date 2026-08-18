// #281 A/S 대행 접수(직원 전용) — RPC create_service_request_by_staff + 컬럼/CHECK/트리거 동결/RLS/스토리지/백필 검증.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asAnon, asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

const CO_MINE = "00000000-0000-0000-0000-00000000c001"; // sales1 담당
const CO_OTHER = "00000000-0000-0000-0000-00000000c002"; // sales2 담당
const CO_NOBIZ = "00000000-0000-0000-0000-00000000c003"; // sales1 담당, biz_no null
const SUB = "00000000-0000-0000-0000-0000000000f1";
let ceMine: string;
let ceOther: string;

async function seed(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "src-admin@jhtech.test");
  await seedAuthUser(c, UID.sales1, "src-sales1@jhtech.test");
  await seedAuthUser(c, UID.sales2, "src-sales2@jhtech.test");
  await c.query("update public.profiles set permissions='{users.manage}', is_active=true where id=$1", [UID.admin]);
  await c.query(
    "update public.profiles set permissions='{service_requests.create,service_requests.claim,service_requests.status,customers.edit}', is_active=true where id=$1",
    [UID.sales1],
  );
  await c.query("update public.profiles set permissions='{customers.edit}', is_active=true where id=$1", [UID.sales2]);
  await c.query(
    "insert into public.companies (id,name,biz_no,ceo,phone,email,address,assignee_id) values ($1,'내고객사','1234567891','대표A','02-111-2222','a@x.kr','서울',$2)",
    [CO_MINE, UID.sales1],
  );
  await c.query("insert into public.companies (id,name,biz_no,assignee_id) values ($1,'남고객사','2208162517',$2)", [
    CO_OTHER,
    UID.sales2,
  ]);
  await c.query("insert into public.companies (id,name,biz_no,assignee_id) values ($1,'번호없는고객',null,$2)", [
    CO_NOBIZ,
    UID.sales1,
  ]);
  ceMine = (await c.query("insert into public.company_equipment (company_id,label) values ($1,'내장비') returning id", [CO_MINE]))
    .rows[0].id;
  ceOther = (await c.query("insert into public.company_equipment (company_id,label) values ($1,'남장비') returning id", [CO_OTHER]))
    .rows[0].id;
}

function payload(over: Record<string, unknown> = {}, fields: Record<string, unknown> = {}) {
  return {
    company_id: CO_MINE,
    channel: "phone",
    privacy_consent: true,
    privacy_consent_version: "v1.1",
    submission_id: SUB,
    fields: { symptom: "전원이 안 켜짐", contact_name: "김담당", callback_phone: "010-1234-5678", photos: {}, ...fields },
    ...over,
  };
}

async function callRpc(p: unknown) {
  return c.query("select public.create_service_request_by_staff($1::jsonb) as r", [JSON.stringify(p)]);
}

describe("create_service_request_by_staff — 권한·스코프", () => {
  test("service_requests.create 없는 계정(sales2)은 예외 '권한이 없습니다'", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales2);
      await expect(callRpc(payload({ company_id: CO_OTHER }))).rejects.toThrow(/권한이 없습니다/);
    });
  });

  test("anon은 EXECUTE 권한 자체가 없다", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const r = await c.query(
        "select has_function_privilege('anon', 'public.create_service_request_by_staff(jsonb)', 'execute') as ok",
      );
      expect(r.rows[0].ok).toBe(false);
    });
  });

  test("타 담당 고객 uuid를 직접 넣으면 예외 '고객을 찾을 수 없습니다'(DEFINER RLS 우회 차단)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await expect(callRpc(payload({ company_id: CO_OTHER }))).rejects.toThrow(/고객을 찾을 수 없습니다/);
    });
  });

  test("customers.view_all 보유자는 타 담당 고객도 접수 가능", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asPostgres(c);
      await c.query(
        "update public.profiles set permissions='{service_requests.create,customers.view_all}' where id=$1",
        [UID.sales1],
      );
      await asUser(c, UID.sales1);
      const r = await callRpc(payload({ company_id: CO_OTHER, submission_id: null }));
      expect(r.rows[0].r.seq_no).toMatch(/^AS-/);
    });
  });
});

describe("create_service_request_by_staff — 저장 값", () => {
  test("성공: 배정=고객사 담당영업(트리거), created_by=접수자, channel, consent verbal, 스냅샷=companies 값, fields 화이트리스트", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const r = await callRpc(payload({ company_equipment_id: ceMine }, { junk: "x", preferred_date: "2026-09-01" }));
      const out = r.rows[0].r;
      expect(out.duplicate).toBe(false);
      await asPostgres(c);
      const row = (await c.query("select * from public.service_requests where id=$1", [out.id])).rows[0];
      expect(row.assignee_id).toBe(UID.sales1); // 고객사 담당영업 = sales1 (접수자와 동일 케이스)
      expect(row.created_by).toBe(UID.sales1);
      expect(row.channel).toBe("phone");
      expect(row.status).toBe("received");
      expect(row.privacy_consent).toBe(true);
      expect(row.privacy_consent_method).toBe("verbal");
      expect(row.privacy_consent_version).toBe("v1.1");
      expect(row.submission_id).toBe(SUB);
      expect(row.biz_no).toBe("1234567891");
      expect(row.contact_company).toBe("내고객사");
      expect(row.contact_ceo).toBe("대표A");
      expect(row.contact_phone).toBe("02-111-2222");
      expect(row.company_equipment_id).toBe(ceMine);
      expect(row.fields.symptom).toBe("전원이 안 켜짐");
      expect(row.fields.contact_name).toBe("김담당");
      expect(row.fields.callback_phone).toBe("010-1234-5678");
      expect(row.fields.preferred_date).toBe("2026-09-01");
      expect(row.fields.junk).toBeUndefined();
    });
  });

  test("view_all 접수자가 타 담당 고객을 접수하면 assignee=그 고객사 담당영업(sales2), created_by=접수자", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asPostgres(c);
      await c.query(
        "update public.profiles set permissions='{service_requests.create,customers.view_all}' where id=$1",
        [UID.sales1],
      );
      await asUser(c, UID.sales1);
      const r = await callRpc(payload({ company_id: CO_OTHER }));
      await asPostgres(c);
      const row = (await c.query("select assignee_id, created_by from public.service_requests where id=$1", [r.rows[0].r.id]))
        .rows[0];
      expect(row.assignee_id).toBe(UID.sales2);
      expect(row.created_by).toBe(UID.sales1);
    });
  });

  test("사업자번호 없는 고객도 접수 성공(biz_no null) — 웹 접수 CHECK엔 영향 없음", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const r = await callRpc(payload({ company_id: CO_NOBIZ }));
      await asPostgres(c);
      const row = (await c.query("select biz_no, channel from public.service_requests where id=$1", [r.rows[0].r.id])).rows[0];
      expect(row.biz_no).toBeNull();
      expect(row.channel).toBe("phone");
      // 웹 채널 + biz_no null 직접 INSERT는 CHECK 위반
      await expect(
        c.query(
          "insert into public.service_requests (biz_no, contact_company, privacy_consent, privacy_consent_at, privacy_consent_version) values (null,'x',true,now(),'v1.1')",
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });

  test("타사 장비 id → 예외 / 잘못된 channel·동의 → 예외", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await expect(callRpc(payload({ company_equipment_id: ceOther }))).rejects.toThrow(/유효하지 않은 장비/);
    });
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await expect(callRpc(payload({ channel: "web" }))).rejects.toThrow(/접수 경로/);
    });
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await expect(callRpc(payload({ privacy_consent: "true" }))).rejects.toThrow(/동의/);
    });
  });

  test("submission_id 멱등: 같은 키 2회 → 행 1개, 두 번째는 duplicate=true로 같은 seq_no", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const a = (await callRpc(payload())).rows[0].r;
      const b = (await callRpc(payload())).rows[0].r;
      expect(b.duplicate).toBe(true);
      expect(b.id).toBe(a.id);
      expect(b.seq_no).toBe(a.seq_no);
      await asPostgres(c);
      const n = await c.query("select count(*)::int as n from public.service_requests where submission_id=$1", [SUB]);
      expect(n.rows[0].n).toBe(1);
    });
  });
});

describe("트리거·RLS·스토리지·백필", () => {
  test("UPDATE로 channel·created_by·privacy_consent_method·submission_id 변경 시도 → 원값 유지(동결)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      const id = (await callRpc(payload())).rows[0].r.id;
      // 배정자(sales1) 본인 행이라 RLS UPDATE 허용 — 그래도 감사 컬럼은 트리거가 되돌린다.
      const r = await c.query(
        "update public.service_requests set channel='web', created_by=null, privacy_consent_method='web', submission_id=null where id=$1 returning channel, created_by, privacy_consent_method, submission_id",
        [id],
      );
      expect(r.rows[0]).toEqual({ channel: "phone", created_by: UID.sales1, privacy_consent_method: "verbal", submission_id: SUB });
    });
  });

  test("접수자(created_by)는 배정자가 아니어도 자기 접수 건을 SELECT 할 수 있다(편집은 불가)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asPostgres(c);
      await c.query(
        "update public.profiles set permissions='{service_requests.create,customers.view_all}' where id=$1",
        [UID.sales1],
      );
      await asUser(c, UID.sales1);
      const id = (await callRpc(payload({ company_id: CO_OTHER }))).rows[0].r.id; // assignee=sales2
      const sel = await c.query("select id from public.service_requests where id=$1", [id]);
      expect(sel.rowCount).toBe(1);
      const upd = await c.query("update public.service_requests set status='in_progress' where id=$1 returning id", [id]);
      expect(upd.rowCount).toBe(0);
    });
  });

  test("웹(anon) 접수 경로는 무변경 — 트리거가 assignee를 고객사 담당영업으로 채우고 channel=web·created_by=null", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asAnon(c);
      const r = await c.query("select public.submit_service_request($1::jsonb) as r", [
        JSON.stringify({
          biz_no: "1234567891",
          contact_company: "내고객사",
          privacy_consent: true,
          privacy_consent_version: "v1.1",
          fields: { symptom: "웹 접수", photos: {} },
        }),
      ]);
      await asPostgres(c);
      const row = (
        await c.query("select assignee_id, channel, created_by, privacy_consent_method from public.service_requests where seq_no=$1", [
          r.rows[0].r.seq_no,
        ])
      ).rows[0];
      expect(row).toEqual({ assignee_id: UID.sales1, channel: "web", created_by: null, privacy_consent_method: "web" });
    });
  });

  test("스토리지 INSERT: create 보유자는 as_photo 슬롯만 업로드, 타 슬롯·무권한자 거부", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales1);
      await c.query("insert into storage.objects (bucket_id, name) values ('customer-uploads', $1)", [`${SUB}/as_photo_1.jpg`]);
      await expect(
        c.query("insert into storage.objects (bucket_id, name) values ('customer-uploads', $1)", [`${SUB}/ext_entrance.jpg`]),
      ).rejects.toThrow();
    });
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.sales2);
      await expect(
        c.query("insert into storage.objects (bucket_id, name) values ('customer-uploads', $1)", [`${SUB}/as_photo_1.jpg`]),
      ).rejects.toThrow();
    });
  });

  test("스토리지 READ: 자기 접수/배정 건에 연결된 as_photo만 보이고, 타 건·ext_* 는 안 보임(view_all 없음)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      const other = "00000000-0000-0000-0000-0000000000f2";
      await asPostgres(c);
      await c.query("insert into storage.objects (bucket_id, name) values ('customer-uploads', $1),('customer-uploads', $2),('customer-uploads', $3)", [
        `${SUB}/as_photo_1.jpg`,
        `${other}/as_photo_1.jpg`,
        `${SUB}/ext_entrance.jpg`,
      ]);
      await asUser(c, UID.sales1);
      await callRpc(payload({}, { photos: { as_photo_1: `${SUB}/as_photo_1.jpg` } }));
      const r = await c.query("select name from storage.objects where bucket_id='customer-uploads' order by name");
      expect(r.rows.map((x) => x.name)).toEqual([`${SUB}/as_photo_1.jpg`]);
    });
  });

  test("백필: service_requests.claim 보유 계정에 service_requests.create 부여됨(마이그 결과 — 신규 계정 seed로 동형 확인)", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      await seedAuthUser(c, UID.sales2, "src-bf@jhtech.test");
      await c.query("update public.profiles set permissions='{service_requests.claim}' where id=$1", [UID.sales2]);
      await c.query(`
        update public.profiles set permissions = array_append(permissions, 'service_requests.create')
         where 'service_requests.claim' = any(permissions) and not ('service_requests.create' = any(permissions))`);
      const r = await c.query("select permissions from public.profiles where id=$1", [UID.sales2]);
      expect(r.rows[0].permissions).toEqual(["service_requests.claim", "service_requests.create"]);
      // 멱등: 재실행해도 중복 추가 없음
      await c.query(`
        update public.profiles set permissions = array_append(permissions, 'service_requests.create')
         where 'service_requests.claim' = any(permissions) and not ('service_requests.create' = any(permissions))`);
      const r2 = await c.query("select permissions from public.profiles where id=$1", [UID.sales2]);
      expect(r2.rows[0].permissions).toHaveLength(2);
    });
  });
});
