# 설계 스펙 — 영업자용 재고 조회 (읽기 전용)

- **작성일:** 2026-06-19
- **한 문장:** 대시보드에 "재고현황 보기" 링크를 추가하고, 모든 콘솔 사용자(영업 포함)가 현재 장비 재고를 읽기 전용으로 보는 페이지(`/admin/inventory/view`)를 만든다.
- **왜:** 기존 `/admin/inventory`는 관리자(equipment.manage) 전용 편집 화면. 영업자는 상담 중 "이 장비 지금 재고 있나?"를 바로 확인할 곳이 없다.

## 접근·라우트
- 신규 `/admin/inventory/view` — 가드 `requireAnyConsoleCapability`(영업 포함 전원). 편집 페이지 `/admin/inventory`(equipment.manage)는 불변.
- 재고 SELECT RLS = `authenticated using(true)` 이미 존재 → **DB·권한 변경 없음.**

## 데이터
- 기존 `listInventory()`(apps/web/src/lib/inventory/queries.ts) 재사용. 반환 필드 중 `note`(메모)는 렌더하지 않음(내부 운영용 — 영업 노출 제외).

## 화면 — 신규 `InventoryView`(읽기 전용, 입력/저장 없음)
- **PC(lg+):** 평면 게시판 표(고객목록과 동일 톤 — 부유 카드 없이 헤더 밑줄+행 구분선). 분류별 그룹 헤더 + 행: `장비명·모델 / 상태배지(재고있음·품절) / 재고 수량(mono tabular) / 입고예정일(품절 시) / 최종수정`.
- **모바일(<lg):** 분류 그룹 헤더 + 장비별 카드 세로 스택(장비명·모델, 상태배지, 수량, 입고예정일). 가로 스크롤 없음.
- 분기 = Tailwind `lg:` prefix(모바일 카드 `lg:hidden`, PC 표 `hidden lg:block`). 상태/라벨 = 기존 `stockStatus`·`STOCK_STATUS_LABEL`.

## 대시보드 진입
- `apps/web/src/app/admin/dashboard/page.tsx` 헤더(h1 옆 우측)에 "재고현황 보기" 링크 버튼(inventory 아이콘) → `/admin/inventory/view`. 전원 노출.

## 테스트
- e2e(`apps/web/e2e/inventory-view.spec.ts`): 장비+재고 시드 → 대시보드 "재고현황 보기" → 읽기 전용 목록 확인(편집 input 0개) + **sales 계정 접근 가능** + 모바일 뷰포트 카드 렌더.
- 신규 순수 로직 없음(status 함수 기존 테스트로 커버).

## 범위 밖
사이드바 메뉴 추가, 메모 노출, 편집 기능, DB 변경.
