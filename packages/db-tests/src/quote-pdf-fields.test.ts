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

// 견적서 PDF 신규 컬럼 권한/제약 단언:
//  - equipment.quote_banner_top/bottom: 경로 형식 CHECK(임의경로 차단) + equipment.manage 보유자만 UPDATE.
//  - profiles.phone: 담당자 전화 컬럼(users.manage 관리자만 profiles UPDATE — 기존 profiles_update RLS 그대로).
let c: Client;
beforeAll(async () => {
  c = await makeClient();
});
afterAll(async () => {
  await c.end();
});

// 테스트용 고정 장비 UUID(가독성). CHECK 정규식이 요구하는 36자 uuid 형식.
const EQ = "00000000-0000-0000-0000-0000000000f1";

/** equipment.manage 보유 관리자 + 장비 1행 시드. */
async function seedEquipmentManager(): Promise<void> {
  await asPostgres(c);
  await seedAuthUser(c, UID.admin, "banner-admin@jhtech.test");
  await c.query("update public.profiles set permissions='{equipment.manage}' where id=$1", [UID.admin]);
  await c.query(
    "insert into public.equipment (id,name,base_price,status) values ($1,'배너장비',5000,'active')",
    [EQ],
  );
}

describe("equipment 견적서 배너 컬럼", () => {
  test("equipment.manage → 유효 경로로 quote_banner_top UPDATE 성공", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipmentManager();
      await asUser(c, UID.admin);
      // 버킷-상대 경로 = equipment/{장비id}/banner-top.png (CHECK 정규식 통과).
      const path = `equipment/${EQ}/banner-top.png`;
      await c.query("update public.equipment set quote_banner_top=$1 where id=$2", [path, EQ]);
      await asPostgres(c);
      const row = (await c.query("select quote_banner_top from public.equipment where id=$1", [EQ])).rows[0];
      expect(row.quote_banner_top).toBe(path);
    });
  });

  test("잘못된 경로(../evil.png)는 CHECK 위반으로 거부", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipmentManager();
      await asUser(c, UID.admin);
      await expect(
        c.query("update public.equipment set quote_banner_top=$1 where id=$2", ["../evil.png", EQ]),
      ).rejects.toThrow(/equipment_quote_banner_top_path/);
    });
  });

  test("banner_bottom도 유효/무효 경로를 동일하게 가드", async () => {
    await inRollbackTx(c, async () => {
      await seedEquipmentManager();
      await asUser(c, UID.admin);
      // 유효 경로 성공.
      const path = `equipment/${EQ}/banner-bottom.webp`;
      await c.query("update public.equipment set quote_banner_bottom=$1 where id=$2", [path, EQ]);
      // 무효 경로(top 파일명을 bottom 컬럼에) 거부.
      await expect(
        c.query("update public.equipment set quote_banner_bottom=$1 where id=$2", [`equipment/${EQ}/banner-top.png`, EQ]),
      ).rejects.toThrow(/equipment_quote_banner_bottom_path/);
    });
  });
});

describe("profiles.phone 컬럼", () => {
  test("users.manage 관리자는 profiles.phone UPDATE 가능", async () => {
    await inRollbackTx(c, async () => {
      // profiles_update RLS = users.manage 보유자만(본인 포함). 담당자 전화를 관리자가 쓴다.
      await asPostgres(c);
      await seedAuthUser(c, UID.admin, "phone-admin@jhtech.test");
      await c.query("update public.profiles set permissions='{users.manage}' where id=$1", [UID.admin]);
      await asUser(c, UID.admin);
      await c.query("update public.profiles set phone=$1 where id=$2", ["010-1234-5678", UID.admin]);
      await asPostgres(c);
      const row = (await c.query("select phone from public.profiles where id=$1", [UID.admin])).rows[0];
      expect(row.phone).toBe("010-1234-5678");
    });
  });
});
