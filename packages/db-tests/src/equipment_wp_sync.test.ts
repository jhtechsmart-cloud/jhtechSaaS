// 장비 → WP 자동 등록(#253) — M1/M2 컬럼·서버통제 트리거·enqueue 트리거·RPC 2종 통합 테스트.
// 핵심 계약: wp_* 서버통제 컬럼은 record_wp_sync RPC로만 변경 / 공개 글 저장은 잡 미생성+dirty만 /
// 초안·미생성은 저장 시 sync 잡 / 활성 잡은 장비당 1건(부분 유니크 흡수).
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { asPostgres, asService, asUser, inRollbackTx, makeClient, seedAuthUser, UID } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

const CAT_ROOT = "00000000-0000-0000-0000-00000000c100";
const CAT_SUB = "00000000-0000-0000-0000-00000000c200";
const CAT_ORPHAN = "00000000-0000-0000-0000-00000000c300";

// 관리자(equipment.manage) + 무권한 사용자 + 분류(대분류 wp=9 / 소분류 미설정=상속 / 미매핑 대분류).
// 장비 1대(소분류 소속, 체크 off) 생성 후 id 반환.
async function seed(opts: { categoryId?: string | null } = {}): Promise<string> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "wp-admin@jhtech.test");
  await seedAuthUser(c, UID.sales2, "wp-noperm@jhtech.test");
  await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
  await c.query("update public.profiles set permissions='{}' where id=$1", [UID.sales2]);
  await c.query(
    "insert into public.equipment_category (id,name,parent_id,wp_category_id) values ($1,'프린터',null,9)",
    [CAT_ROOT],
  );
  await c.query(
    "insert into public.equipment_category (id,name,parent_id) values ($1,'UV평판',$2)",
    [CAT_SUB, CAT_ROOT],
  );
  await c.query(
    "insert into public.equipment_category (id,name,parent_id) values ($1,'미매핑',null)",
    [CAT_ORPHAN],
  );
  const categoryId = opts.categoryId === undefined ? CAT_SUB : opts.categoryId;
  const r = await c.query(
    "insert into public.equipment (name,model,base_price,status,category_id) values ('WP장비','WP-1',1000,'active',$1) returning id",
    [categoryId],
  );
  return r.rows[0].id as string;
}

async function wpJobs(equipmentId: string): Promise<Array<{ action: string; status: string }>> {
  await asPostgres(c);
  const r = await c.query(
    "select payload->>'action' as action, status from public.jobs where type='wp_publish' and payload->>'equipment_id' = $1 order by created_at",
    [equipmentId],
  );
  return r.rows;
}

// service_role로 record_wp_sync를 호출해 "초안/공개 글 존재" 상태를 만든다.
async function recordPost(equipmentId: string, postId: number, status: "draft" | "publish") {
  await asService(c);
  await c.query("select public.record_wp_sync($1, $2, $3, '{}'::jsonb, null, true, null)", [
    equipmentId,
    postId,
    status,
  ]);
}

describe("equipment wp_* — 서버통제", () => {
  test("클라(equipment.manage)가 wp_post_id를 UPDATE해도 옛값이 유지된다", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_post_id=999, wp_post_status='publish', wp_last_error='x', wp_synced_at=now() where id=$1", [id]);
      const r = await c.query("select wp_post_id, wp_post_status, wp_last_error, wp_synced_at from public.equipment where id=$1", [id]);
      expect(r.rows[0]).toEqual({ wp_post_id: null, wp_post_status: null, wp_last_error: null, wp_synced_at: null });
    });
  });

  test("INSERT에 wp_* 값을 실어도 강제 초기화된다", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      const r = await c.query(
        "insert into public.equipment (name,base_price,status,wp_post_id,wp_post_status,wp_dirty) values ('위조',0,'active',777,'publish',true) returning wp_post_id, wp_post_status, wp_dirty",
      );
      expect(r.rows[0]).toEqual({ wp_post_id: null, wp_post_status: null, wp_dirty: false });
    });
  });

  test("wp_publish_enabled는 equipment.manage로 수정 가능하다", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      const r = await c.query("select wp_publish_enabled from public.equipment where id=$1", [id]);
      expect(r.rows[0].wp_publish_enabled).toBe(true);
    });
  });
});

describe("equipment wp_dirty — 반영 필드 비교", () => {
  test("체크된 장비의 name 변경 → dirty=true + dirty_at 기록", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await c.query("update public.equipment set name='새이름' where id=$1", [id]);
      const r = await c.query("select wp_dirty, wp_dirty_at from public.equipment where id=$1", [id]);
      expect(r.rows[0].wp_dirty).toBe(true);
      expect(r.rows[0].wp_dirty_at).not.toBeNull();
    });
  });

  test("WP 미반영 필드(base_price)만 변경 → dirty는 false 유지", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await c.query("update public.equipment set base_price=99999 where id=$1", [id]);
      const r = await c.query("select wp_dirty from public.equipment where id=$1", [id]);
      expect(r.rows[0].wp_dirty).toBe(false);
    });
  });
});

describe("equipment AFTER 트리거 — enqueue 분기", () => {
  test("체크 켬(매핑 OK·미생성) → sync 잡 1건", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      expect(await wpJobs(id)).toEqual([{ action: "sync", status: "queued" }]);
    });
  });

  test("공개 글 + 반영 필드 변경 → 잡 미생성, dirty만 true (버튼으로만 갱신)", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await recordPost(id, 42, "publish");
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'"); // 켬 시점 잡 제거 후 관찰
      await asUser(c, UID.admin);
      await c.query("update public.equipment set name='수정' where id=$1", [id]);
      expect(await wpJobs(id)).toEqual([]);
      const r = await c.query("select wp_dirty from public.equipment where id=$1", [id]);
      expect(r.rows[0].wp_dirty).toBe(true);
    });
  });

  test("초안 글 + 반영 필드 변경 → sync 잡 (초안은 저장 시 자동)", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await recordPost(id, 42, "draft");
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'");
      await asUser(c, UID.admin);
      await c.query("update public.equipment set name='수정' where id=$1", [id]);
      expect(await wpJobs(id)).toEqual([{ action: "sync", status: "queued" }]);
    });
  });

  test("체크 해제(글 존재) → unpublish 잡, payload에 wp_post_id 포함", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await recordPost(id, 42, "publish");
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'");
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=false where id=$1", [id]);
      await asPostgres(c);
      const r = await c.query(
        "select payload from public.jobs where type='wp_publish' and payload->>'equipment_id'=$1",
        [id],
      );
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].payload.action).toBe("unpublish");
      expect(r.rows[0].payload.wp_post_id).toBe(42);
    });
  });

  test("장비 inactive 전환(공개 글) → unpublish 잡", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await recordPost(id, 42, "publish");
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'");
      await asUser(c, UID.admin);
      await c.query("update public.equipment set status='inactive' where id=$1", [id]);
      const jobs = await wpJobs(id);
      expect(jobs).toEqual([{ action: "unpublish", status: "queued" }]);
    });
  });

  test("매핑 미설정 분류 → 체크 켜도 잡 미생성", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed({ categoryId: CAT_ORPHAN });
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      expect(await wpJobs(id)).toEqual([]);
    });
  });

  test("활성 잡이 이미 있으면 재저장해도 잡은 1건 (부분 유니크 흡수)", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await c.query("update public.equipment set name='또저장' where id=$1", [id]);
      await c.query("update public.equipment set name='또또저장' where id=$1", [id]);
      expect(await wpJobs(id)).toHaveLength(1);
    });
  });
});

describe("enqueue_wp_publish RPC — 버튼 경로", () => {
  test("권한 없는 사용자는 거부된다", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.sales2);
      await expect(c.query("select public.enqueue_wp_publish($1,'publish')", [id])).rejects.toThrow();
    });
  });

  test("초안 상태에서 publish 요청 → 잡 생성", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await recordPost(id, 42, "draft");
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'");
      await asUser(c, UID.admin);
      await c.query("select public.enqueue_wp_publish($1,'publish')", [id]);
      expect(await wpJobs(id)).toEqual([{ action: "publish", status: "queued" }]);
    });
  });

  test("이미 공개된 글에 publish 요청 → 예외", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await recordPost(id, 42, "publish");
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'"); // 활성 잡 pre-check 회피
      await asUser(c, UID.admin);
      await expect(c.query("select public.enqueue_wp_publish($1,'publish')", [id])).rejects.toThrow(/공개/);
    });
  });

  test("공개 글 refresh 요청 → sync 잡 생성", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await recordPost(id, 42, "publish");
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'");
      await asUser(c, UID.admin);
      await c.query("select public.enqueue_wp_publish($1,'refresh')", [id]);
      expect(await wpJobs(id)).toEqual([{ action: "sync", status: "queued" }]);
    });
  });
});

describe("record_wp_sync RPC — 워커 기록", () => {
  test("authenticated는 실행 불가(service_role 전용) — EXECUTE 권한 부재", async () => {
    // ⚠️ 로컬 Supabase 이미지 버그: revoke된 함수를 authenticated가 실제 호출하면
    // ACL 거부 경로에서 backend segfault(기존 claim_next_job도 동일 재현) → 실행 대신 권한 카탈로그로 단언.
    await inRollbackTx(c, async () => {
      await asPostgres(c);
      const r = await c.query(
        "select has_function_privilege('authenticated','public.record_wp_sync(uuid,integer,text,jsonb,text,boolean,timestamptz,boolean,text)','execute') as auth_ok, has_function_privilege('service_role','public.record_wp_sync(uuid,integer,text,jsonb,text,boolean,timestamptz,boolean,text)','execute') as svc_ok",
      );
      expect(r.rows[0]).toEqual({ auth_ok: false, svc_ok: true });
    });
  });

  test("wp_post_id CAS: 최초 기록은 성공, 다른 id 재기록은 cas_won=false + 기존 id 유지", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asService(c);
      const r1 = await c.query(
        "select public.record_wp_sync($1, 42, 'draft', '{}'::jsonb, null, false, null) as r",
        [id],
      );
      expect(r1.rows[0].r.cas_won).toBe(true);
      const r2 = await c.query(
        "select public.record_wp_sync($1, 43, 'draft', '{}'::jsonb, null, false, null) as r",
        [id],
      );
      expect(r2.rows[0].r.cas_won).toBe(false);
      expect(r2.rows[0].r.wp_post_id).toBe(42);
      await asPostgres(c);
      const row = await c.query("select wp_post_id from public.equipment where id=$1", [id]);
      expect(row.rows[0].wp_post_id).toBe(42);
    });
  });

  test("dirty 해제 CAS: 스냅샷 일치 시 해제, sync 중 재수정(스냅샷 불일치)이면 dirty 유지", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await recordPost(id, 42, "publish");
      await asUser(c, UID.admin);
      await c.query("update public.equipment set name='수정1' where id=$1", [id]);
      await asPostgres(c);
      // ::text 왕복 — pg 드라이버의 Date(ms) 변환은 마이크로초를 잘라 CAS 비교가 어긋난다.
      // 워커도 동일: supabase-js가 준 ISO 문자열을 Date로 바꾸지 말고 그대로 되돌려줄 것.
      const snap1 = (await c.query("select wp_dirty_at::text as t from public.equipment where id=$1", [id])).rows[0].t;

      // 일치 → 해제
      await asService(c);
      await c.query("select public.record_wp_sync($1, 42, 'publish', '{}'::jsonb, null, true, $2)", [id, snap1]);
      await asPostgres(c);
      expect((await c.query("select wp_dirty from public.equipment where id=$1", [id])).rows[0].wp_dirty).toBe(false);

      // 다시 dirty → 낡은 스냅샷으로 해제 시도 → 유지
      await asUser(c, UID.admin);
      await c.query("update public.equipment set name='수정2' where id=$1", [id]);
      await asService(c);
      await c.query("select public.record_wp_sync($1, 42, 'publish', '{}'::jsonb, null, true, $2)", [id, snap1]);
      await asPostgres(c);
      expect((await c.query("select wp_dirty from public.equipment where id=$1", [id])).rows[0].wp_dirty).toBe(true);
    });
  });

  test("404 재연결: p_replace=true면 기존과 다른 post_id로 교체를 허용한다", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asService(c);
      await c.query("select public.record_wp_sync($1, 42, 'publish', '{}'::jsonb, null, false, null)", [id]);
      const r = await c.query(
        "select public.record_wp_sync($1, 77, 'draft', '{}'::jsonb, null, true, null, true) as r",
        [id],
      );
      expect(r.rows[0].r.cas_won).toBe(true);
      await asPostgres(c);
      const row = await c.query("select wp_post_id, wp_post_status from public.equipment where id=$1", [id]);
      expect(row.rows[0]).toEqual({ wp_post_id: 77, wp_post_status: "draft" });
    });
  });

  test("실패 기록: wp_last_error 저장 → 성공 기록에서 클리어", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asService(c);
      await c.query("select public.record_wp_sync($1, null, null, null, 'wp 500', false, null)", [id]);
      await asPostgres(c);
      expect((await c.query("select wp_last_error from public.equipment where id=$1", [id])).rows[0].wp_last_error).toBe("wp 500");
      await asService(c);
      await c.query("select public.record_wp_sync($1, 42, 'draft', '{}'::jsonb, null, true, null)", [id]);
      await asPostgres(c);
      expect((await c.query("select wp_last_error from public.equipment where id=$1", [id])).rows[0].wp_last_error).toBeNull();
    });
  });
});

describe("equipment wp — /review 보강", () => {
  test("체크 켠 채 신규 등록(INSERT) → 즉시 sync 잡 (다음 편집까지 방치 방지)", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asUser(c, UID.admin);
      const r = await c.query(
        "insert into public.equipment (name,base_price,status,category_id,wp_publish_enabled) values ('신규체크',0,'active',$1,true) returning id",
        [CAT_SUB],
      );
      expect(await wpJobs(r.rows[0].id as string)).toEqual([{ action: "sync", status: "queued" }]);
    });
  });

  test("장비 행 DELETE(공개 글 존재) → unpublish 잡 + payload wp_post_id 보존", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await recordPost(id, 42, "publish");
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'");
      await asUser(c, UID.admin);
      await c.query("delete from public.equipment where id=$1", [id]);
      await asPostgres(c);
      const r = await c.query(
        "select payload from public.jobs where type='wp_publish' and payload->>'equipment_id'=$1",
        [id],
      );
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].payload.action).toBe("unpublish");
      expect(r.rows[0].payload.wp_post_id).toBe(42);
    });
  });

  test("대기 중 sync 잡이 있어도 unpublish는 소실되지 않는다 (queued 대체)", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await recordPost(id, 42, "publish");
      await asUser(c, UID.admin);
      await c.query("update public.equipment set name='수정' where id=$1", [id]); // 공개 글 → 잡 없음(dirty만)
      // 대기 sync 잡을 인위로 만들어 흡수 시나리오 구성
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'");
      await c.query(
        "insert into public.jobs (type,payload) values ('wp_publish', jsonb_build_object('equipment_id',$1::text,'action','sync'))",
        [id],
      );
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=false where id=$1", [id]);
      const jobs = await wpJobs(id);
      expect(jobs).toEqual([{ action: "unpublish", status: "queued" }]); // sync가 대체됨
    });
  });

  test("inactive → active 재활성 → 초안 sync 잡 (재공개는 버튼으로만)", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await c.query("update public.equipment set status='inactive' where id=$1", [id]);
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'");
      await asUser(c, UID.admin);
      await c.query("update public.equipment set status='active' where id=$1", [id]);
      expect(await wpJobs(id)).toEqual([{ action: "sync", status: "queued" }]);
    });
  });

  test("enqueue_wp_publish 가드 전수: 비활성 발행·초안 없음·공개글 sync·글 없는 unpublish·미지 동작 전부 거부", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'");
      // 한 트랜잭션에서 연속 예외를 검증 — savepoint로 abort 상태 복구
      async function expectReject(action: string, pattern: RegExp): Promise<void> {
        await c.query("savepoint sp");
        await expect(c.query("select public.enqueue_wp_publish($1,$2)", [id, action])).rejects.toThrow(pattern);
        await c.query("rollback to savepoint sp");
      }

      await asUser(c, UID.admin);
      await expectReject("publish", /초안/);
      await expectReject("unpublish", /글이 없습니다/);
      await expectReject("nonsense", /알 수 없는/);

      await recordPost(id, 42, "publish");
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'");
      await asUser(c, UID.admin);
      await expectReject("sync", /갱신/);

      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'");
      await asUser(c, UID.admin);
      await c.query("update public.equipment set status='inactive' where id=$1", [id]); // unpublish 잡 생성됨
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'");
      await asUser(c, UID.admin);
      await expectReject("refresh", /비활성/);
    });
  });

  test("활성 잡 존재 시 버튼 RPC는 명시 거부 ('진행 중' 안내)", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]); // sync queued
      await expect(c.query("select public.enqueue_wp_publish($1,'sync')", [id])).rejects.toThrow(/진행 중/);
    });
  });

  test("get_wp_job_state: 활성 잡이면 상태 문자열, 없으면 null + anon 실행 불가(권한 카탈로그)", async () => {
    await inRollbackTx(c, async () => {
      const id = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [id]);
      const active = await c.query("select public.get_wp_job_state($1) as s", [id]);
      expect(active.rows[0].s).toBe("queued");
      await asPostgres(c);
      await c.query("delete from public.jobs where type='wp_publish'");
      await asUser(c, UID.admin);
      const idle = await c.query("select public.get_wp_job_state($1) as s", [id]);
      expect(idle.rows[0].s).toBeNull();
      await asPostgres(c);
      const priv = await c.query(
        "select has_function_privilege('anon','public.get_wp_job_state(uuid)','execute') as anon_ok, has_function_privilege('authenticated','public.get_wp_job_state(uuid)','execute') as auth_ok",
      );
      expect(priv.rows[0]).toEqual({ anon_ok: false, auth_ok: true });
    });
  });
});

describe("resolve_wp_category_id — SQL 조상 해석", () => {
  test("소분류 직접 설정 > 조상 폴백 > 전무 null", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asPostgres(c);
      const sub = await c.query("select public.resolve_wp_category_id($1) as v", [CAT_SUB]);
      expect(sub.rows[0].v).toBe(9); // 상속
      await c.query("update public.equipment_category set wp_category_id=11 where id=$1", [CAT_SUB]);
      const direct = await c.query("select public.resolve_wp_category_id($1) as v", [CAT_SUB]);
      expect(direct.rows[0].v).toBe(11);
      const orphan = await c.query("select public.resolve_wp_category_id($1) as v", [CAT_ORPHAN]);
      expect(orphan.rows[0].v).toBeNull();
    });
  });
});

// ── #262 템플릿 복제 v2 — 신규 컬럼·함수 계약 ──────────────────────────────
describe("wp 템플릿 복제 v2 (#262)", () => {
  test("wp_subtitle 수정 → dirty=true + sync 잡 (반영 필드 누락 회귀 방어)", async () => {
    await inRollbackTx(c, async () => {
      const eq = await seed();
      await asPostgres(c);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [eq]);
      await c.query("delete from public.jobs where type='wp_publish'");
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_subtitle='소량 다품종 최적' where id=$1", [eq]);
      await asPostgres(c);
      const r = await c.query("select wp_dirty from public.equipment where id=$1", [eq]);
      expect(r.rows[0].wp_dirty).toBe(true);
      const jobs = await wpJobs(eq);
      expect(jobs.map((j) => j.action)).toContain("sync"); // 초안·미생성은 저장 시 자동 sync
    });
  });

  test("wp_series_name 수정도 반영 필드다 (fields_changed 단일 출처)", async () => {
    await inRollbackTx(c, async () => {
      const eq = await seed();
      await asPostgres(c);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [eq]);
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_series_name='AUTO FEED SERIES' where id=$1", [eq]);
      await asPostgres(c);
      const r = await c.query("select wp_dirty from public.equipment where id=$1", [eq]);
      expect(r.rows[0].wp_dirty).toBe(true);
    });
  });

  test("wp_render_mode는 서버통제 — 클라 UPDATE·INSERT 위조 차단, RPC로만 기록", async () => {
    await inRollbackTx(c, async () => {
      const eq = await seed();
      await asUser(c, UID.admin);
      await c.query("update public.equipment set wp_render_mode='elementor' where id=$1", [eq]);
      await asPostgres(c);
      let r = await c.query("select wp_render_mode from public.equipment where id=$1", [eq]);
      expect(r.rows[0].wp_render_mode).toBeNull();
      const ins = await c.query(
        "insert into public.equipment (name,model,base_price,status,wp_render_mode) values ('위조','X',0,'active','elementor') returning wp_render_mode",
      );
      expect(ins.rows[0].wp_render_mode).toBeNull();
      await asService(c);
      await c.query(
        "select public.record_wp_sync($1, 100, 'draft', '{}'::jsonb, null, true, null, false, 'elementor')",
        [eq],
      );
      await asPostgres(c);
      r = await c.query("select wp_render_mode from public.equipment where id=$1", [eq]);
      expect(r.rows[0].wp_render_mode).toBe("elementor");
      // p_render_mode 생략 = 기존값 유지 (구 워커 8-인자 named 호출 호환)
      await asService(c);
      await c.query("select public.record_wp_sync($1, 100, 'draft', '{}'::jsonb, null, true, null)", [eq]);
      await asPostgres(c);
      r = await c.query("select wp_render_mode from public.equipment where id=$1", [eq]);
      expect(r.rows[0].wp_render_mode).toBe("elementor");
    });
  });

  test("resolve_wp_template_post_id — 소분류 직접 > 조상 폴백 > 전무 null", async () => {
    await inRollbackTx(c, async () => {
      await seed();
      await asPostgres(c);
      const none = await c.query("select public.resolve_wp_template_post_id($1) as v", [CAT_SUB]);
      expect(none.rows[0].v).toBeNull();
      await c.query("update public.equipment_category set wp_template_post_id=4605 where id=$1", [CAT_ROOT]);
      const inherited = await c.query("select public.resolve_wp_template_post_id($1) as v", [CAT_SUB]);
      expect(inherited.rows[0].v).toBe(4605);
      await c.query("update public.equipment_category set wp_template_post_id=7777 where id=$1", [CAT_SUB]);
      const direct = await c.query("select public.resolve_wp_template_post_id($1) as v", [CAT_SUB]);
      expect(direct.rows[0].v).toBe(7777);
    });
  });

  test("force_sync: equipment.manage만으로는 거부(users.manage 전용)", async () => {
    await inRollbackTx(c, async () => {
      const eq = await seed();
      await asPostgres(c);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [eq]);
      await c.query("update public.profiles set permissions='{equipment.manage}' where id=$1", [UID.sales2]);
      await asUser(c, UID.sales2);
      // 예외 후 tx가 abort되므로 이 단언이 이 테스트의 마지막 쿼리여야 한다.
      await expect(c.query("select public.enqueue_wp_publish($1,'force_sync')", [eq])).rejects.toThrow(
        /users\.manage/,
      );
    });
  });

  test("force_sync: 관리자는 허용 — 잡 payload에 action=sync + force=true", async () => {
    await inRollbackTx(c, async () => {
      const eq = await seed();
      await asPostgres(c);
      await c.query("update public.equipment set wp_publish_enabled=true where id=$1", [eq]);
      await c.query("delete from public.jobs where type='wp_publish'");
      await asUser(c, UID.admin); // users.manage 보유 = 전 권한 통과
      await c.query("select public.enqueue_wp_publish($1,'force_sync')", [eq]);
      await asPostgres(c);
      const jobs = await c.query(
        "select payload from public.jobs where type='wp_publish' and payload->>'equipment_id'=$1",
        [eq],
      );
      expect(jobs.rows).toHaveLength(1);
      expect(jobs.rows[0].payload.action).toBe("sync");
      expect(jobs.rows[0].payload.force).toBe(true);
    });
  });

  test("record_wp_sync 9-인자: 잘못된 render_mode는 예외", async () => {
    await inRollbackTx(c, async () => {
      const eq = await seed();
      await asService(c);
      await expect(
        c.query(
          "select public.record_wp_sync($1, 1, 'draft', '{}'::jsonb, null, true, null, false, 'wix')",
          [eq],
        ),
      ).rejects.toThrow(/render_mode/);
    });
  });
});
