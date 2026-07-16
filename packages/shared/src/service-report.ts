// 서비스 리포트(현장 A/S 결과 보고서) 공용 순수 로직 — 화면(field)·워커(PDF)·RPC 검증 미러 공용.
// 이슈 #228. 청구 계산은 견적 엔진(quote-calc.ts)과 동일한 round 규칙을 쓴다(문서 간 금액 일관).

export const WARRANTY_MONTHS = 12;

/** 무상 처리 사유 — RPC CHECK와 동기(코드 상수가 단일 출처). */
export const FREE_REASONS = [
  "보증기간 내",
  "재방문 (동일 증상)",
  "영업 판단",
  "계약 포함",
] as const;
export type FreeReason = (typeof FREE_REASONS)[number];

/** RPC·DDL 입력 캡과 동기 — 화면 검증도 같은 값 사용. */
export const SERVICE_REPORT_LIMITS = {
  maxFaults: 20,
  maxFaultLength: 60,
  maxParts: 30,
  maxPartNameLength: 100,
  maxPartQty: 999,
  maxPartPrice: 100_000_000,
  maxFee: 100_000_000,
  maxPhotosPerSlot: 6,
  maxTextLength: 4000,
} as const;

export type FaultScope = "printer" | "cutter" | "common";

export interface FaultGroup {
  group: string;
  scope: FaultScope;
  items: readonly string[];
}

/** 고장 분류 사전(목업 V4 이식) — v1은 코드 상수(관리자 편집 UI는 후속). */
export const FAULT_GROUPS: readonly FaultGroup[] = [
  {
    group: "헤드·잉크 공급",
    scope: "printer",
    items: [
      "헤드 노즐 막힘",
      "데드노즐·헤드 단선",
      "헤드 스트라이크(찍힘·긁힘)",
      "잉크라인 에어 유입",
      "댐퍼 불량",
      "서브탱크·잉크펌프 불량",
      "캡핑·와이퍼(메인터넌스) 불량",
      "화이트 잉크 침전·굳음",
      "부압(네거티브 프레셔) 이상",
    ],
  },
  {
    group: "UV 램프·경화",
    scope: "printer",
    items: [
      "UV LED 출력 저하",
      "램프 점등 불량",
      "경화 불량(끈적임·미경화)",
      "램프 냉각 계통(수냉·팬) 이상",
    ],
  },
  {
    group: "출력 품질",
    scope: "printer",
    items: [
      "Banding(밴딩)",
      "Dropout(잉크 빠짐)",
      "Sharpness(선명도 저하)",
      "칼라·프로파일 이상",
      "화이트-칼라 정합 불량",
      "번짐·새깅",
      "새털링(위성 잉크)",
    ],
  },
  {
    group: "커팅 툴·품질",
    scope: "cutter",
    items: [
      "칼날 마모·파손",
      "커팅 압력 이상",
      "커팅 깊이 불량",
      "오실레이팅 툴 불량",
      "크리징(누름선) 불량",
      "미절단·과절단",
      "툴 홀더 유격·교체 불량",
    ],
  },
  {
    group: "인식·정렬",
    scope: "cutter",
    items: [
      "카메라 마크 인식 불량",
      "원점·캘리브레이션 틀어짐",
      "재단 위치 밀림",
      "레이저 포인터 이상",
    ],
  },
  {
    group: "전기·제어",
    scope: "common",
    items: [
      "결선·배선",
      "보드·파워서플라이",
      "모터·드라이버 불량",
      "접촉불량",
      "SSR·퓨즈 불량",
      "센서(리미트·엔코더) 불량",
      "전원부·어댑터 이상",
      "비상정지 회로 이상",
    ],
  },
  {
    group: "구동·기구",
    scope: "common",
    items: [
      "벨트·풀리 마모",
      "리니어 레일·베어링 불량",
      "축(X·Y) 주행 이상",
      "캐리지 유격·소음",
      "미디어 이송·흡착 테이블 불량",
      "진공펌프 이상",
      "높이(갭)·두께 센서 불량",
      "장비 외관·마무리",
    ],
  },
  {
    group: "소프트웨어·통신",
    scope: "common",
    items: [
      "RIP 소프트웨어",
      "장비구동 Driver",
      "USB·통신 오류",
      "펌웨어 오류",
      "컴퓨터 자체 문제",
      "바이러스·OS 문제",
    ],
  },
] as const;

/** 장비 대분류(견적 로고 kind와 동일 어휘)에 맞게 관련 그룹 우선 정렬. 미상이면 원 순서. */
export function sortFaultGroupsForKind(
  kind: "printer" | "cutter" | null | undefined,
): readonly FaultGroup[] {
  if (!kind) return FAULT_GROUPS;
  const rank = (g: FaultGroup) => (g.scope === kind ? 0 : g.scope === "common" ? 1 : 2);
  return [...FAULT_GROUPS].sort((a, b) => rank(a) - rank(b));
}

export interface WarrantyVerdict {
  /** 구매(설치) 후 경과 개월(일 미도래 시 내림). */
  months: number;
  inWarranty: boolean;
}

/**
 * 구매(설치)일 기준 12개월 보증 판정 — 화면 배지·기본값 제안용(최종 유/무상은 기사 수동).
 * 구매일이 없으면 null(판정 불가 → 화면은 기본 유상).
 */
export function judgeWarranty(
  purchasedAt: string | null | undefined,
  now: Date,
): WarrantyVerdict | null {
  if (!purchasedAt) return null;
  const from = new Date(purchasedAt);
  if (Number.isNaN(from.getTime())) return null;
  let months =
    (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
  if (now.getDate() < from.getDate()) months -= 1;
  if (months < 0) months = 0;
  return { months, inWarranty: months < WARRANTY_MONTHS };
}

export interface ServicePart {
  name: string;
  qty: number;
  price: number;
}

export interface ServiceChargeInput {
  chargeType: "paid" | "free";
  visitFee: number;
  overtimeFee: number;
  parts: readonly ServicePart[];
}

export interface ServiceChargeResult {
  partsTotal: number;
  /** 공급가 = 출장비+시간외+부품 (VAT 별도). */
  supply: number;
  vat: number;
  total: number;
}

// 음수·NaN 방어 — 서버(RPC)도 동일 클램프를 미러한다.
function clampAmount(n: number, max: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), max);
}

/** 청구 계산 — 무상이면 전액 0, VAT는 견적 엔진과 동일하게 round(공급가*0.1). */
export function calculateServiceCharge(input: ServiceChargeInput): ServiceChargeResult {
  if (input.chargeType === "free") return { partsTotal: 0, supply: 0, vat: 0, total: 0 };
  const L = SERVICE_REPORT_LIMITS;
  const partsTotal = input.parts.reduce(
    (acc, p) => acc + clampAmount(p.qty, L.maxPartQty) * clampAmount(p.price, L.maxPartPrice),
    0,
  );
  const supply =
    clampAmount(input.visitFee, L.maxFee) + clampAmount(input.overtimeFee, L.maxFee) + partsTotal;
  const vat = Math.round(supply * 0.1);
  return { partsTotal, supply, vat, total: supply + vat };
}
