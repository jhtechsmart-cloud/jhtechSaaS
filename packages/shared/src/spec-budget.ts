// 견적서 한 페이지 예산 — 사양에 쓸 수 있는 최대 줄 수를 추정한다.
// ⚠️ 픽셀 정확 불가(PDF는 워커 puppeteer가 나중 렌더). 보수적 추정 + 워커 truncate 안전망.
// 상수는 실제 PDF(_render-sample.ts) 대조로 튜닝. 줄 = 사양 2열 한 행 또는 그룹 제목 한 행.
import type { SpecGroup } from "./specs";

// A4 본문에서 사양 영역에 배정 가능한 총 줄 수(고정 헤더·공급자·합계·하단 장비사진 제외 후).
const TOTAL_SPEC_LINES = 16;
// 품목/옵션 한 줄이 사양 영역을 잠식하는 환산 계수(보수적).
const PER_ITEM = 1;
const PER_INCLUDED = 0.5; // 포함옵션은 한 박스에 묶여 덜 잠식
const PER_EXTRA = 1;

export function specBudget(input: {
  itemCount: number;
  includedCount: number;
  extraCount: number;
}): number {
  const used =
    input.itemCount * PER_ITEM +
    input.includedCount * PER_INCLUDED +
    input.extraCount * PER_EXTRA;
  return Math.max(0, Math.floor(TOTAL_SPEC_LINES - used));
}

// 선택된 그룹들이 차지하는 줄 수 = Σ(그룹 제목 1줄 + ceil(항목수/2)).
export function countSpecLines(groups: SpecGroup[]): number {
  return groups.reduce((acc, g) => {
    if (g.items.length === 0) return acc;
    return acc + 1 + Math.ceil(g.items.length / 2);
  }, 0);
}
