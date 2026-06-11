// 거래처 엑셀 → companies 1회성 임포트 스크립트 (Seonje 승인 후 실행).
//
// 입력 = scripts/xls-to-json.py가 만든 JSON(원본 .xls은 파이썬으로 1회 변환 — 헤더 17컬럼).
// 기본 = dry-run(등록 없이 리포트만). --execute 를 줘야 실제 등록한다.
// 멱등: 기존 companies의 biz_no·ledger_no와 대조해 이미 있는 행은 건너뜀(재실행 안전).
//
// 사용법(로컬 리허설):
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<로컬키> \
//     pnpm --filter worker exec tsx src/import-customers.ts --file /tmp/customers.json [--execute]
// 프로덕션은 URL·키만 교체(tsx는 .env 자동로드 안 함 — 명시 주입).
import { readFileSync } from "node:fs";
import { createServiceClient } from "@jhtechsaas/shared";
import { loadEnv } from "./env";
import { transformRows, type ImportCompany, type RawRow } from "./import/customers-transform";

const BATCH = 200;

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const file = arg("--file");
  const execute = process.argv.includes("--execute");
  if (!file) {
    console.error("사용법: tsx src/import-customers.ts --file <customers.json> [--execute]");
    process.exit(1);
  }

  const raws = JSON.parse(readFileSync(file, "utf-8")) as RawRow[];
  const { companies, skipped, mergedGroups } = transformRows(raws);

  const env = loadEnv();
  const supabase = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // 기존 행 대조(멱등) — biz_no·ledger_no 둘 다 키로 본다.
  // ⚠️ PostgREST는 한 번에 최대 1000행만 반환 → 전량 대조를 위해 페이지 순회.
  const existing: { biz_no: string | null; ledger_no: number | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: exErr } = await supabase
      .from("companies")
      .select("biz_no, ledger_no")
      // 배치 INSERT 행들은 created_at이 동일(한 트랜잭션) → 페이지 경계 누락/중복 방지를 위해 유일키 정렬
      .order("id")
      .range(from, from + 999);
    if (exErr) throw new Error(`기존 고객 조회 실패: ${exErr.message}`);
    existing.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const existingBiz = new Set(existing.map((r) => r.biz_no).filter((v): v is string => Boolean(v)));
  const existingLedger = new Set(existing.map((r) => r.ledger_no).filter((v): v is number => v != null));

  const toInsert: ImportCompany[] = [];
  const already: ImportCompany[] = [];
  for (const c of companies) {
    if ((c.bizNo && existingBiz.has(c.bizNo)) || existingLedger.has(c.ledgerNo)) already.push(c);
    else toInsert.push(c);
  }

  // ── 리포트 ─────────────────────────────────────────────
  console.log(`\n== 거래처 임포트 ${execute ? "실행" : "dry-run"} ==`);
  console.log(`엑셀 행:           ${raws.length}`);
  console.log(`스킵(자리표시 등): ${skipped.length}  ${skipped.map((s) => `#${s.ledgerNo} ${s.name || "(이름없음)"}[${s.reason}]`).join(", ")}`);
  console.log(`병합 그룹:         ${mergedGroups} (중복 사업번호 → 1행)`);
  console.log(`등록 대상 고객:    ${companies.length}`);
  console.log(`이미 존재(건너뜀): ${already.length}`);
  console.log(`신규 등록:         ${toInsert.length}`);
  const noBiz = toInsert.filter((c) => !c.bizNo).length;
  console.log(`  ├ 사업번호 없음: ${noBiz}`);
  console.log(`  └ 사업번호 있음: ${toInsert.length - noBiz}`);
  const badBiz = companies.filter((c) => c.bizNoRaw);
  if (badBiz.length) {
    console.log(`형식오류 사업번호(원본은 노트 보존): ${badBiz.map((c) => `#${c.ledgerNo} ${c.name}`).join(", ")}`);
  }
  const mergedList = companies.filter((c) => c.note.includes("병합"));
  if (mergedList.length) {
    console.log(`\n-- 병합 상세 (${mergedList.length}건) --`);
    for (const m of mergedList) console.log(`  #${m.ledgerNo} ${m.name} ← ${m.note.split("병합: ")[1]}`);
  }

  if (!execute) {
    console.log("\n(dry-run — 등록하지 않았습니다. 실제 등록은 --execute)");
    return;
  }

  // ── 실행: 배치 INSERT (service_role, 미배정·노트에 이관 표식) ──
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH).map((c) => ({
      name: c.name,
      biz_no: c.bizNo,
      ceo: c.ceo,
      address: c.address,
      email: c.email,
      // phone(대표전화)는 비움 — 전화1/2 컬럼이 원본 충실. 화면은 phone1을 대표로 쓴다.
      manager: c.manager,
      biz_type: c.bizType,
      biz_item: c.bizItem,
      ledger_name: c.ledgerName,
      ledger_no: c.ledgerNo,
      phone1: c.phone1,
      phone2: c.phone2,
      fax: c.fax,
      mobile: c.mobile,
      address_actual1: c.addressActual1,
      address_actual2: c.addressActual2,
      note: c.note,
    }));
    const { error } = await supabase.from("companies").insert(batch);
    if (error) throw new Error(`배치 ${i / BATCH + 1} INSERT 실패: ${error.message} (이미 ${inserted}건 등록됨 — 재실행하면 기존분은 건너뜀)`);
    inserted += batch.length;
    console.log(`  배치 ${i / BATCH + 1}: 누적 ${inserted}/${toInsert.length}`);
  }
  console.log(`\n✅ 등록 완료: ${inserted}건 (미배정 상태 — 담당영업 배정은 콘솔에서)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
