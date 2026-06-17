# 장비출고의뢰서 Phase 2 — shared 스키마·프리필 Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** `details` jsonb의 Zod 스키마 + 의뢰/견적/설치설문 → 출고의뢰서 프리필 순수함수.

**Files:** `packages/shared/src/release-order.ts`(+`.test.ts`), `packages/shared/src/index.ts`.

## Task 1: ReleaseOrderDetails Zod 스키마 (TDD)
- printer/cutter(nullable) + common + prep + site 블록. 모든 필드 default(빈문자열·빈배열·false) → 부분저장 허용.
- 테스트: 빈 객체 `{}` 파싱 시 기본 구조 생성, printer 값 보존, 알 수 없는 키 strip.

## Task 2: buildReleaseOrderPrefill 순수함수 (TDD)
- 입력: `{ application:{company,phone,address,fields}, quote:{items,delivery_date,delivery_time}|null, deviceKind:'printer'|'cutter'|null }`
- 출력: `{ device_kind, company, contact_phone, install_address, install_at, device_name, details }`
- 매핑: company/phone/address=application, device_name=quote.items[0].name, install_at=date+time(+09:00)|null,
  site.power=power(단상220/삼상380), site.parking=building_type, site.inboundPlan=location+elevator, prep.electrical=["케이블"]+power.
- 테스트: 매핑 정확성, quote null·survey 없음 안전(빈 기본값).

## Task 3: index export + 커밋 + PR + 배포(웹전용 아님 — shared만, db push 불요).
