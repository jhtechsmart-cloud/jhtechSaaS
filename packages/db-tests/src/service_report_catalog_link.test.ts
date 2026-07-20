// #242 Part 1a — 카탈로그 링크 · 보유장비 재사용(중복 방지) · 소급 연결.
// 핵심: 확정 RPC가 매번 company_equipment를 INSERT 하던 것을 재사용으로 바꾼다(이력 분할 차단).
// 재사용 판별은 시리얼 → 카탈로그 → 정규화 이름 순이고, 시리얼이 모순되면 재사용하지 않는다
// (같은 모델 2대를 한 행으로 병합하면 안 됨).
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { EQUIPMENT_KEY_VECTORS, normalizeEquipmentKey } from "@jhtechsaas/shared";
import { asPostgres, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => { c = await makeClient(); });
afterAll(async () => { await c.end(); });

const ENG = "00000000-0000-0000-0000-0000000000c1";

interface Seeded { companyId: string; catA: string; catB: string; dupA: string; dupB: string }

// 카탈로그: 고유 모델 2종 + 이름이 같고 모델만 다른 2종(프로덕션 실존 패턴 — 다중매칭 검증용).
async function seed(): Promise<Seeded> {
  await asPostgres(c);
  await seedAuthUser(c, ENG, "cat-eng@jhtech.test");
  await c.query(
    "update public.profiles set permissions='{service_reports.write}', name='링크기사' where id=$1",
    [ENG],
  );
  const co = await c.query(
    "insert into public.companies (name, biz_no) values ('링크상사','5556667771') returning id",
  );
  const mk = async (name: string, model: string) =>
    (await c.query(
      "insert into public.equipment (name, model, status) values ($1,$2,'active') returning id",
      [name, model],
    )).rows[0].id as string;
  return {
    companyId: co.rows[0].id as string,
    catA: await mk("XTRA 3300H", "XTRA-3300H"),
    catB: await mk("멀티컷 SG1625", "SG1625"),
    dupA: await mk("대형 롤투롤 UV 프린터", "XTRA 5000"),
    dupB: await mk("대형 롤투롤 UV 프린터", "XTRA 3300S"),
  };
}

// draft 생성 → 서명 첨부 → 확정. 직접입력 경로(company_equipment_id 없음)를 탄다.
async function issueDirect(
  s: Seeded,
  device: { name: string; serial?: string; catalogId?: string | null; purchasedAt?: string },
): Promise<Record<string, unknown>> {
  await asUser(c, ENG);
  const base = {
    company_id: s.companyId,
    device_name: device.name,
    device_serial: device.serial ?? "",
    purchased_at: device.purchasedAt ?? null,
    catalog_equipment_id: device.catalogId ?? null,
    faults: ["접촉불량"],
    diagnosis: "진단",
    action_text: "조치",
    charge_type: "paid",
    visit_fee: 50000,
  };
  const created = await c.query("select public.upsert_service_report(null, $1::jsonb) as row", [
    JSON.stringify(base),
  ]);
  const id = (created.rows[0].row as Record<string, unknown>).id as string;

  await asPostgres(c);
  await c.query(
    `insert into storage.objects (bucket_id, name, metadata) values ('service-reports', $1, '{"size": 1024}'::jsonb)`,
    [`${id}/signature.png`],
  );
  await asUser(c, ENG);
  await c.query("select public.upsert_service_report($1, $2::jsonb)", [
    id,
    JSON.stringify({ ...base, signature_path: `${id}/signature.png` }),
  ]);
  const issued = await c.query("select public.issue_service_report($1) as row", [id]);
  return issued.rows[0].row as Record<string, unknown>;
}

// ⚠️ postgres 롤로 센다. company_equipment_select는 "그 고객의 담당자 또는 customers.view_all"만
// 허용하므로, service_reports.write만 가진 기사 롤로는 0행이 보인다(제품 이슈는 별도 추적).
async function equipCount(companyId: string): Promise<number> {
  await asPostgres(c);
  const r = await c.query("select count(*)::int as n from public.company_equipment where company_id=$1", [
    companyId,
  ]);
  return r.rows[0].n as number;
}

describe("match_catalog_equipment — 이름/모델 매칭(정규식 단일 출처)", () => {
  test("이름 완전일치·공백/대소문자/하이픈 차이 무시", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      for (const q of ["XTRA 3300H", "xtra3300h", "  XTRA-3300H  ", "xtra 3300 h"]) {
        const r = await c.query("select public.match_catalog_equipment($1) as id", [q]);
        expect(r.rows[0].id).toBe(s.catA);
      }
    });
  });

  test("model 필드로도 매칭(이름은 설명형인 카탈로그 대응)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const r = await c.query("select public.match_catalog_equipment('SG1625') as id");
      expect(r.rows[0].id).toBe(s.catB);
    });
  });

  test("다중 매칭이면 null — 추측 연결 금지", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      const r = await c.query("select public.match_catalog_equipment('대형 롤투롤 UV 프린터') as id");
      expect(r.rows[0].id).toBeNull();
    });
  });

  test("빈 문자열·미매칭·inactive는 null", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      for (const q of ["", "   ", "존재하지 않는 장비"]) {
        const r = await c.query("select public.match_catalog_equipment($1) as id", [q]);
        expect(r.rows[0].id).toBeNull();
      }
      await asPostgres(c);
      await c.query("update public.equipment set status='inactive' where id=$1", [s.catA]);
      const r2 = await c.query("select public.match_catalog_equipment('XTRA 3300H') as id");
      expect(r2.rows[0].id).toBeNull();
    });
  });
});

describe("확정 시 보유장비 재사용 — 중복 행 차단(F1)", () => {
  test("같은 고객·같은 장비를 2회 확정해도 company_equipment 행은 1개", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const r1 = await issueDirect(s, { name: "XTRA 3300H", catalogId: s.catA });
      expect(await equipCount(s.companyId)).toBe(1);
      const r2 = await issueDirect(s, { name: "XTRA 3300H", catalogId: s.catA });
      expect(await equipCount(s.companyId)).toBe(1);
      // 두 리포트가 같은 보유장비를 가리켜야 이력이 이어진다
      expect(r2.company_equipment_id).toBe(r1.company_equipment_id);
    });
  });

  test("카탈로그 id 없이 이름만으로도 재사용(정규화 일치)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await issueDirect(s, { name: "미등록 특수장비" });
      expect(await equipCount(s.companyId)).toBe(1);
      await issueDirect(s, { name: "미등록  특수장비" });
      expect(await equipCount(s.companyId)).toBe(1);
    });
  });

  test("시리얼 완전일치면 이름이 달라도 같은 장비로 재사용", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await issueDirect(s, { name: "XTRA 3300H", serial: "SN-100", catalogId: s.catA });
      await issueDirect(s, { name: "XTRA3300H 프린터", serial: "SN-100" });
      expect(await equipCount(s.companyId)).toBe(1);
    });
  });

  test("시리얼 빈 장비 2대는 서로 재사용되지 않는다(C2 — 빈 문자열 오매칭)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await issueDirect(s, { name: "XTRA 3300H", serial: "", catalogId: s.catA });
      await issueDirect(s, { name: "멀티컷 SG1625", serial: "", catalogId: s.catB });
      expect(await equipCount(s.companyId)).toBe(2);
    });
  });

  test("같은 모델 2대(시리얼 상이)는 분리 유지(C3 — 병합 금지)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await issueDirect(s, { name: "XTRA 3300H", serial: "SN-A", catalogId: s.catA });
      await issueDirect(s, { name: "XTRA 3300H", serial: "SN-B", catalogId: s.catA });
      expect(await equipCount(s.companyId)).toBe(2);
    });
  });

  test("재사용 시 비어 있던 시리얼·구매일만 보강(사람 입력값 미덮어씀)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const r1 = await issueDirect(s, { name: "XTRA 3300H", catalogId: s.catA });
      const ceId = r1.company_equipment_id as string;
      await issueDirect(s, { name: "XTRA 3300H", serial: "SN-LATER", purchasedAt: "2025-03-01", catalogId: s.catA });
      await asPostgres(c);
      const row = await c.query("select serial_no, purchased_at from public.company_equipment where id=$1", [ceId]);
      expect(row.rows[0].serial_no).toBe("SN-LATER");
      expect(row.rows[0].purchased_at).not.toBeNull();
    });
  });
});

describe("카탈로그 링크 해석 — 통계 원본(F3·H1)", () => {
  test("피커가 보낸 카탈로그 id가 확정본에 기록된다", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const r = await issueDirect(s, { name: "XTRA 3300H", catalogId: s.catA });
      expect(r.catalog_equipment_id).toBe(s.catA);
    });
  });

  test("id 없이 이름만이면 매칭으로 해석해 기록", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const r = await issueDirect(s, { name: "멀티컷 SG1625" });
      expect(r.catalog_equipment_id).toBe(s.catB);
    });
  });

  test("다중매칭 이름은 미연결로 남는다(오연결보다 안전)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const r = await issueDirect(s, { name: "대형 롤투롤 UV 프린터" });
      expect(r.catalog_equipment_id).toBeNull();
    });
  });

  test("draft 이후 카탈로그가 inactive로 바뀌어도 기사의 선택은 유지(H1)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, ENG);
      const base = {
        company_id: s.companyId,
        device_name: "XTRA 3300H",
        catalog_equipment_id: s.catA,
        faults: ["접촉불량"],
        diagnosis: "진단",
        action_text: "조치",
        charge_type: "paid",
      };
      const created = await c.query("select public.upsert_service_report(null, $1::jsonb) as row", [
        JSON.stringify(base),
      ]);
      const id = (created.rows[0].row as Record<string, unknown>).id as string;
      await asPostgres(c);
      await c.query(
        `insert into storage.objects (bucket_id, name, metadata) values ('service-reports',$1,'{"size":1024}'::jsonb)`,
        [`${id}/signature.png`],
      );
      // 확정 직전에 카탈로그를 비활성화 — 이름 재매칭이면 null이 되지만 선택값은 살아야 한다
      await c.query("update public.equipment set status='inactive' where id=$1", [s.catA]);
      await asUser(c, ENG);
      await c.query("select public.upsert_service_report($1, $2::jsonb)", [
        id,
        JSON.stringify({ ...base, signature_path: `${id}/signature.png` }),
      ]);
      const issued = await c.query("select public.issue_service_report($1) as row", [id]);
      expect((issued.rows[0].row as Record<string, unknown>).catalog_equipment_id).toBe(s.catA);
    });
  });

  test("보유장비를 고르면 카탈로그 링크는 서버가 그 행에서 파생(클라 값 무시 — F8)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asPostgres(c);
      const ce = await c.query(
        "insert into public.company_equipment (company_id, equipment_id) values ($1,$2) returning id",
        [s.companyId, s.catB],
      );
      await asUser(c, ENG);
      const r = await c.query("select public.upsert_service_report(null, $1::jsonb) as row", [
        JSON.stringify({
          company_id: s.companyId,
          company_equipment_id: ce.rows[0].id,
          catalog_equipment_id: s.catA, // 클라가 모순된 값을 보내도
          faults: ["접촉불량"],
          diagnosis: "진단",
          action_text: "조치",
          charge_type: "paid",
        }),
      ]);
      expect((r.rows[0].row as Record<string, unknown>).catalog_equipment_id).toBe(s.catB);
    });
  });

  test("발행 후 catalog_equipment_id 수정은 동결 트리거가 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      const r = await issueDirect(s, { name: "XTRA 3300H", catalogId: s.catA });
      await asPostgres(c);
      await c.query("savepoint sp");
      await expect(
        c.query("update public.service_reports set catalog_equipment_id=$1 where id=$2", [s.catB, r.id]),
      ).rejects.toThrow(/발행|수정/);
      await c.query("rollback to savepoint sp");
    });
  });

  test("존재하지 않는 카탈로그 id는 draft 저장 단계에서 거부", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asUser(c, ENG);
      await c.query("savepoint sp");
      await expect(
        c.query("select public.upsert_service_report(null, $1::jsonb)", [
          JSON.stringify({
            company_id: s.companyId,
            device_name: "X",
            catalog_equipment_id: "00000000-0000-0000-0000-0000000000ff",
            faults: ["접촉불량"],
            diagnosis: "d",
            action_text: "a",
            charge_type: "paid",
          }),
        ]),
      ).rejects.toThrow(/카탈로그/);
      await c.query("rollback to savepoint sp");
    });
  });
});

describe("정규화 규칙 — JS(shared) ↔ SQL 일치(M4)", () => {
  test("동일 벡터셋에서 SQL regexp_replace가 normalizeEquipmentKey와 같은 키를 만든다", async () => {
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      for (const v of EQUIPMENT_KEY_VECTORS) {
        const r = await c.query(
          "select regexp_replace(lower(btrim($1::text)), '[^0-9a-z가-힣]', '', 'g') as key",
          [v.input],
        );
        expect({ input: v.input, key: r.rows[0].key }).toEqual({ input: v.input, key: v.key });
        expect(normalizeEquipmentKey(v.input)).toBe(v.key);
      }
    });
  });
});

describe("소급 연결 마이그레이션 규칙", () => {
  test("이름만 있는 보유장비가 유일 매칭이면 연결되고 label은 비워진다(XOR 충족)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asPostgres(c);
      const ce = await c.query(
        "insert into public.company_equipment (company_id, label) values ($1,'XTRA 3300H') returning id",
        [s.companyId],
      );
      const id = ce.rows[0].id as string;
      // 마이그레이션과 동일한 규칙(같은 함수)을 재현
      await c.query(
        `update public.company_equipment ce
            set equipment_id = public.match_catalog_equipment(ce.label), label = null
          where ce.id = $1 and public.match_catalog_equipment(ce.label) is not null`,
        [id],
      );
      const row = await c.query("select equipment_id, label from public.company_equipment where id=$1", [id]);
      expect(row.rows[0].equipment_id).toBe(s.catA);
      expect(row.rows[0].label).toBeNull();
    });
  });

  test("다중매칭 label은 손대지 않는다(미연결 유지)", async () => {
    await inRollbackTx(c, async () => {
      const s = await seed();
      await asPostgres(c);
      const ce = await c.query(
        "insert into public.company_equipment (company_id, label) values ($1,'대형 롤투롤 UV 프린터') returning id",
        [s.companyId],
      );
      const id = ce.rows[0].id as string;
      const hit = await c.query("select public.match_catalog_equipment(label) as id from public.company_equipment where id=$1", [id]);
      expect(hit.rows[0].id).toBeNull();
      const row = await c.query("select equipment_id, label from public.company_equipment where id=$1", [id]);
      expect(row.rows[0].equipment_id).toBeNull();
      expect(row.rows[0].label).toBe("대형 롤투롤 UV 프린터");
    });
  });

  test("백업 테이블은 앱 롤에서 접근 불가(운영 전용)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, ENG);
      await c.query("savepoint sp");
      const r = await c.query("select count(*)::int as n from public.company_equipment_link_backup");
      // RLS 활성 + 정책 없음 = 0행(권한 오류 대신 빈 결과)
      expect(r.rows[0].n).toBe(0);
      await c.query("rollback to savepoint sp");
    });
  });
});
