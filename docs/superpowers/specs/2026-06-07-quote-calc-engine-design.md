# 견적 계산 엔진 (E5 첫 슬라이스) — 설계

> **한 문장 요약**: 견적 입력(장비 줄들 + 옵션 줄들)을 받아 **공급가·세액·합계를 산출하는 순수 함수**.
> **왜 필요한가**: E5(견적서 발급)의 심장. PDF·UI·채번이 전부 이 계산 위에 얹힌다. 실제 가격표·견적양식·장비이미지는 의뢰사 제공 대기지만, **계산 규칙 자체는 자료 없이 지금 100% 만들 수 있다**(가격표를 내장하지 않고 숫자만 받아 산술).

## 배경 — 의뢰사 요구 (2026-06-05 미팅)

- UV프린터 **헤드 1/2/3개**에 따라 단가가 달라짐 → 단, 헤드는 특별 취급이 아니라 **"수량을 가진 옵션 한 줄"**로 일반화된다(예: `Ricoh Gen5i 프린트헤드 × 2`).
- 계산 형태: `기본장비 1대 가격 + 포함옵션(0원) + 추가옵션(단가×수량) + 직접입력 옵션 + 할인/제외(음수)` → 전체합계.
- 실제 예: `UV3300S 1대(50,000,000) + Ricoh Gen5i 프린트헤드(2,500,000 × 2 = 5,000,000) = 공급가 55,000,000`.

## 데이터 모델

```ts
// 한 줄 = 장비든 옵션이든 동일하게 "단가 × 수량"
type QuoteLine = {
  name: string;        // 표시명 (예: "UV3300S", "Ricoh Gen5i 프린트헤드")
  unitPrice: number;   // 정수 원, 음수 허용(할인/제외)
  quantity: number;    // 정수 ≥ 1
};

type QuoteInput = {
  items: QuoteLine[];    // 기본장비 N대 (배열 — 한 견적에 여러 대 가능)
  options: QuoteLine[];  // 추가옵션·직접입력·할인
  taxRate?: number;      // 기본 0.1 (10%)
};

type QuoteResult = {
  supplyPrice: number;   // 공급가 = 모든 줄 합
  taxPrice: number;      // 세액 = round(공급가 × taxRate)
  total: number;         // 합계 = 공급가 + 세액
};
```

## 계산 규칙

- `lineTotal = unitPrice × quantity` (정수 × 정수 = 정수, 반올림 없음)
- `supplyPrice = Σ items + Σ options` (음수 줄 그대로 반영 → 할인/제외)
- `taxPrice = round(supplyPrice × taxRate)` — **원단위 반올림(0.5 올림)**, 부동소수점 안전하게
- `total = supplyPrice + taxPrice`
- 모든 금액 정수 원. DB `numeric(14,2)`엔 정수로 저장.

## 두 개의 유닛 (각각 독립 테스트)

1. **`calculateQuote(input): QuoteResult`** — 순수 산술. 입력은 이미 검증됐다고 가정.
2. **`QuoteInputSchema` (Zod)** — 경계 검증: name 비어있지 않음, unitPrice 정수·유한, quantity 정수 ≥ 1, taxRate 0~1. (CLAUDE.md "외부 입력 Zod 검증" 준수)

## TDD 동작 목록 (= 실패 테스트 순서)

1. 옵션 없는 장비 1대 → 공급가=단가, 세액=round(10%), 합계
2. 추가옵션 `단가×수량` 합산 (50,000,000 + 2,500,000×2 = 55,000,000 → 세액 5,500,000 → 합계 60,500,000)
3. 음수 옵션(할인/제외) 차감
4. 장비 여러 대(배열) 합산
5. 세액 반올림 경계 (.5 올림) + 큰 금액 부동소수점 안전
6. 빈 견적(장비0·옵션0) → 0/0/0
7. `taxRate` 미지정 시 기본 0.1 / 명시 시 그 값 사용
8. Zod: quantity 0·음수·소수 거부, unitPrice NaN·소수 거부, name 빈문자열 거부, taxRate 범위 밖 거부

## 위치

`packages/shared/src/quote-calc.ts` + `quote-calc.test.ts`, `index.ts`에 export.
→ 웹(apps/web)·워커(apps/worker) 양쪽에서 import (PDF 워커가 같은 엔진 사용).

## 범위 밖 (YAGNI · 다음 슬라이스)

견적번호 채번·불변버전·DB 저장·견적 작성 UI·통합 PDF·가격표 조회·통화 포맷팅. **이 슬라이스는 순수 계산만.**
