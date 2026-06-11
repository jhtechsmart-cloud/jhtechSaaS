// 거래처 엑셀(회계 프로그램 내보내기) → companies 행 변환 — 순수 로직(IO 없음).
// 스크립트(import-customers.ts)와 테스트가 공유한다.

export type RawRow = Record<string, string>;

export type ImportCompany = {
  ledgerNo: number;
  ledgerName: string;
  name: string;
  bizNo: string | null; // 10자리 정규화. 불량(자릿수 오류)은 null + bizNoRaw 보존.
  bizNoRaw: string | null;
  ceo: string | null;
  address: string | null;
  bizType: string | null;
  bizItem: string | null;
  addressActual1: string | null;
  addressActual2: string | null;
  phone1: string | null;
  phone2: string | null;
  fax: string | null;
  manager: string | null;
  mobile: string | null;
  email: string | null;
  note: string;
};

export type SkippedRow = { ledgerNo: number; name: string; reason: string };

// DB CHECK 길이 상한(companies 마이그레이션과 동기).
const LEN: Record<string, number> = {
  name: 200, ceo: 200, address: 500, bizType: 200, bizItem: 200, ledgerName: 200,
  addressActual1: 500, addressActual2: 500, phone1: 50, phone2: 50, fax: 50,
  manager: 200, mobile: 50, email: 200,
};

function clean(v: string | undefined, key: string): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const max = LEN[key] ?? 200;
  return t.length > max ? t.slice(0, max) : t;
}

export function cleanRow(raw: RawRow): ImportCompany {
  // 장부번호는 엑셀 숫자셀이라 "102.0" 형태로 들어온다.
  const ledgerNo = Math.trunc(Number(raw["장부번호"]) || 0);
  const bizDigits = (raw["사업번호"] ?? "").replace(/\D/g, "");
  const bizOk = bizDigits.length === 10;
  const emailRaw = clean(raw["이메일"], "email");
  return {
    ledgerNo,
    ledgerName: clean(raw["장부명"], "ledgerName") ?? "",
    name: clean(raw["거래처명"], "name") ?? "",
    bizNo: bizOk ? bizDigits : null,
    bizNoRaw: !bizOk && bizDigits ? bizDigits : null,
    ceo: clean(raw["대표자"], "ceo"),
    address: clean(raw["사업주소"], "address"),
    bizType: clean(raw["업태"], "bizType"),
    bizItem: clean(raw["종목"], "bizItem"),
    addressActual1: clean(raw["실제주소1"], "addressActual1"),
    addressActual2: clean(raw["실제주소2"], "addressActual2"),
    phone1: clean(raw["전화1"], "phone1"),
    phone2: clean(raw["전화2"], "phone2"),
    fax: clean(raw["팩스"], "fax"),
    manager: clean(raw["담당자"], "manager"),
    mobile: clean(raw["휴대폰"], "mobile"),
    email: emailRaw === "-" ? null : emailRaw,
    note: "",
  };
}

// 정보량 = 채워진 필드 수(병합 대표 행 선택 기준).
function richness(c: ImportCompany): number {
  return Object.values(c).filter((v) => v !== null && v !== "").length;
}

const IMPORT_TAG = (n: number): string => `엑셀 이관(장부 ${n})`;

// 같은 사업번호 그룹 병합 — 정보 많은 행이 대표(동률이면 장부번호 큰 쪽=최신),
// 대표의 빈 칸은 나머지 행 값으로 보충. 구 장부는 노트에 보존.
function mergeGroup(rows: ImportCompany[]): ImportCompany {
  const sorted = [...rows].sort((a, b) => richness(b) - richness(a) || b.ledgerNo - a.ledgerNo);
  const primary = { ...sorted[0] };
  const rest = sorted.slice(1);
  for (const r of rest) {
    for (const key of Object.keys(primary) as (keyof ImportCompany)[]) {
      if (key === "note" || key === "ledgerNo") continue;
      if ((primary[key] === null || primary[key] === "") && r[key]) {
        // 같은 형태(문자열|null) 필드끼리의 보충 — 타입 동일
        (primary as Record<string, unknown>)[key] = r[key];
      }
    }
  }
  const mergedDesc = rest.map((r) => `장부 ${r.ledgerNo} '${r.ledgerName}'`).join(", ");
  primary.note = `${IMPORT_TAG(primary.ledgerNo)} · 병합: ${mergedDesc}`;
  return primary;
}

export function transformRows(raws: RawRow[]): {
  companies: ImportCompany[];
  skipped: SkippedRow[];
  mergedGroups: number;
} {
  const cleaned = raws.map(cleanRow);
  const skipped: SkippedRow[] = [];
  const usable: ImportCompany[] = [];

  for (const c of cleaned) {
    if (!c.name) {
      skipped.push({ ledgerNo: c.ledgerNo, name: c.name, reason: "거래처명 없음" });
      continue;
    }
    if (c.name === "일반고객") {
      skipped.push({ ledgerNo: c.ledgerNo, name: c.name, reason: "자리표시 행(일반고객)" });
      continue;
    }
    usable.push(c);
  }

  // 사업번호 기준 그룹화(없는 행은 개별).
  const byBiz = new Map<string, ImportCompany[]>();
  const noBiz: ImportCompany[] = [];
  for (const c of usable) {
    if (c.bizNo) {
      const g = byBiz.get(c.bizNo) ?? [];
      g.push(c);
      byBiz.set(c.bizNo, g);
    } else {
      noBiz.push(c);
    }
  }

  const companies: ImportCompany[] = [];
  let mergedGroups = 0;
  for (const g of byBiz.values()) {
    if (g.length === 1) {
      const c = { ...g[0], note: IMPORT_TAG(g[0].ledgerNo) };
      companies.push(c);
    } else {
      mergedGroups += 1;
      companies.push(mergeGroup(g));
    }
  }
  for (const c of noBiz) {
    companies.push({ ...c, note: IMPORT_TAG(c.ledgerNo) });
  }

  // 불량 사업번호 원본을 노트에 보존.
  for (const c of companies) {
    if (c.bizNoRaw) c.note += ` · 사업번호 원본(형식오류): ${c.bizNoRaw}`;
  }

  // 장부번호 순으로 안정 정렬(리포트 가독성).
  companies.sort((a, b) => a.ledgerNo - b.ledgerNo);
  return { companies, skipped, mergedGroups };
}
