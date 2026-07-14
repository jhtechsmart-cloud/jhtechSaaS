# 본사주소 / 설치주소 분리 설계

- 작성일: 2026-07-13
- 상태: 설계 확정(구현 계획 대기)
- 관련: 고객 폼, 출고의뢰서(release order) 폼·RPC·테이블, 출고의뢰서 PDF 워커

## 한 문장 요약
고객·출고의뢰서에서 **본사주소(HQ)와 설치주소(운영장소)를 분리**하고, "설치주소=본사주소 동일" 체크로 자동 채우며, 출고의뢰서 PDF에는 **설치주소만** 표시한다.

## 왜 필요한가
고객사가 본사에 장비를 설치하기도 하지만, 본사와 별개의 운영 사업장에 설치하는 경우도 많다. 지금은 주소가 뒤섞여 있어(고객: 실제주소1/2, 출고의뢰서: 설치주소 1개) 어디에 설치하는지가 명확치 않다. 본사/설치를 나누고 출고 서류엔 설치주소만 찍어 배송·설치 혼선을 없앤다.

## 현재 구조(조사 결과)
- **companies**: `address`(주소/사업장) · `address_actual1`(실제주소1) · `address_actual2`(실제주소2). 전부 nullable text 500자. 마이그레이션 불필요(라벨 재해석).
- **release_orders**: 주소 컬럼이 `install_address`(설치주소) **하나뿐**. 발행 시 동결 트리거로 스냅샷 동결. 워커 PDF는 `release_orders.install_address`만 SELECT(회사/의뢰 join 안 함).
- **upsert_release_order**: 최종 9-arg(`p_install_address` 포함). 클라 입력 우선, 비면 `applications.address` 폴백.
- **reflectToCustomer**: 출고의뢰서 설치주소를 `companies.address`(본사 자리)에 역기록 → 새 모델과 충돌(수정 대상).

## 설계

### 1) 고객 등록/수정 폼 (DB 변경 없음)
- 라벨 변경: `주소(사업장)` → **본사주소**(`address`), `실제주소1` → **설치주소**(`address_actual1`), `실제주소2` → **주소2**(`address_actual2`).
- **"설치주소가 본사주소와 동일" 체크박스**: 체크 시 설치주소 = 본사주소 **라이브 동기화** + 설치주소 입력칸 비활성(본사주소 변경 시 설치주소도 따라 변경). 해제 시 직접 입력.
  - 동기화는 폼 UI 상태(순수 로직). 별도 DB 플래그 저장 없음 — 저장 시 설치주소(address_actual1)에 동일 값이 이미 채워져 저장됨.
  - 수정 진입 시 초기 체크 상태: `address_actual1`이 비었거나 `address`와 같으면 체크, 다르면 해제(파생).
- 라벨은 고객 상세 화면 등 이 필드가 표시되는 다른 곳도 함께 통일.

### 2) 출고의뢰서(release order) (DB 변경 있음)
- **마이그레이션**: `release_orders`에 `hq_address text`(본사주소) 컬럼 추가(+ 롤백). **발행 동결 트리거의 불변 컬럼 목록에 포함**(발행본 동결 유지). 길이 CHECK 등 기존 주소 컬럼 관례 따름.
- **RPC**: `upsert_release_order`에 `p_hq_address text` 인자 추가(현 9-arg → 10-arg). 기존 오버로드 정리 방식(이전 시그니처 drop 후 재정의)을 따른다. 저장: `hq_address = left(coalesce(nullif(btrim(p_hq_address,''),''), <company/app 폴백>), 1000)`. 설치주소 저장 로직은 기존 유지.
- **폼**: 본사주소 + 설치주소 **두 필드** + 고객 폼과 동일한 "동일" 체크박스(라이브 동기화·설치주소 비활성).
- **프리필(자동 가져오기)**: 의뢰에 연결된 고객에서 —
  - 본사주소 ← `company.address`
  - 설치주소 ← `company.address_actual1`
  - 고객 연결이 없으면 기존처럼 `applications.address`로 폴백(본사·설치 공통), 그래도 없으면 빈칸.
  - 기존 출고의뢰서(재편집·버전이력)가 있으면 그 스냅샷 값(hq_address·install_address) 우선.
- **저장 액션**: 두 주소 모두 RPC로 전달. installAddress 검증(1000자)과 동일하게 hqAddress도 검증.

### 3) 출고의뢰서 PDF (거의 그대로)
- 워커는 계속 `release_orders.install_address`(설치주소)만 읽어 "설치 주소"에 렌더. **본사주소는 PDF 미표시** → 워커 SELECT·HTML 사실상 무변경(hq_address 미조회).

### 4) 고객정보 역반영(reflectToCustomer) 매핑 수정
- 현재: 설치주소 → `companies.address`(오류).
- 변경: **본사주소 → `companies.address`, 설치주소 → `companies.address_actual1`**. (name·phone 역반영은 기존 유지.)

## 컴포넌트/모듈 경계 · 변경 지점
- 고객: `schema.ts`(라벨 무관, 스키마 그대로) · `CompanyForm.tsx`(라벨 3개 + 동일 체크박스 동기화 로직) · `FIELD_LABELS` · 고객 상세 화면 라벨.
- 순수 로직: "동일" 초기 체크 파생 + 동기화, 프리필 선택 우선순위 → 순수 함수 + 단위테스트(`packages/shared` 또는 `apps/web/src/lib`).
- 출고의뢰서: 마이그(`release_orders.hq_address`) + 롤백 + 동결 트리거 갱신 · RPC(`upsert_release_order` 10-arg) + 롤백 · `ReleaseOrderForm.tsx`(필드 추가+체크박스) · `actions.ts`(hqAddress 전달·검증·reflect 매핑) · `queries.ts`(loadReleaseOrderForForm에 hq/설치 프리필, company.address_actual1 조회) · `shared/release-order.ts`(buildReleaseOrderPrefill).
- 워커: `release-pdf.ts`/`release-html.ts` — 변경 없음(설치주소만). PDF 시각검증만.

## 검증 계획
- 단위(Vitest): 동일-체크 초기 파생·동기화, 프리필 우선순위(company→app→빈칸), reflect 매핑.
- db-tests: `hq_address` 컬럼·RPC 10-arg 저장/폴백·발행 동결(hq_address도 동결되는지).
- e2e: 고객 폼 라벨·동일 체크 동작 / 출고의뢰서 본사·설치 입력·프리필·동일 체크.
- PDF: tsx 하니스 렌더 → Read 대조(설치주소만 표시, 본사주소 미표시).
- 게이트: shared·web·db-tests·typecheck·lint·build·e2e·worker.

## 비목표
- PDF에 본사주소 표시(요구 없음).
- applications 테이블 주소 이원화(release order 스냅샷만 분리; application은 단일 address 유지).
- 기존 발행본 소급 변경(발행본은 동결 유지).

## 열린 항목(구현 중 확정)
- 의뢰↔고객 연결 경로 확인: `loadReleaseOrderForForm`에서 company.address_actual1에 도달하려면 application의 company 링크(company_id) 필요 — 구현 1단계에서 실제 연결 여부 확인 후 폴백 확정.
- `hq_address` 길이 CHECK 값(기존 install_address는 스냅샷 1000자 절단 — 컬럼 CHECK는 companies 관례 500 vs release 관례 확인).
