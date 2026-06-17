# 계정 항목 확장 + 장비 카탈로그 + 메일 카탈로그 링크 — 설계 (Spec)

**작성일**: 2026-06-17 · **상태**: 승인됨 → 구현 대기

## 한 문장 요약
사용자 계정에 직책·연락처를 받아 목록에 보이게 하고, 장비에 카탈로그 PDF를 등록해서 견적 메일에 견적서·카탈로그 다운로드 링크를 함께 보낸다.

## 왜 필요한가
- 새 계정 폼이 이름·이메일·권한만 받아 직책·연락처를 못 남김 → 관리·연락에 불편.
- 고객에게 견적서만 보내는데, 제품 카탈로그(PDF)도 같이 주면 영업에 도움.

## 결정사항(사용자 확정)
- 카탈로그 저장 = **공개 버킷, 영구 링크**(만료 없음). 카탈로그는 홍보용이라 공개가 자연스럽고 메일 링크가 안 만료됨.
- 직책·연락처 = **생성 폼 + 수정 페이지** 양쪽 편집.

---

## A. 계정 항목 (직책·연락처)

### A1. DB
- `profiles`에 `position text` 추가(nullable) + 길이 CHECK(`char_length(position) <= 50`). 마이그 + 롤백.
- `phone`은 **이미 존재**(`20260610120000`) → 재사용, 신규 컬럼 없음.

### A2. 새 계정 폼 (`apps/web/src/app/admin/users/new/NewUserClient.tsx`)
- 입력 추가: **직책**(text), **연락처**(text). 이름·이메일(로그인ID)·권한은 기존.
- `createUserAction(input)` 시그니처에 `position?: string`, `phone?: string` 추가 → profile update patch에 포함(빈 문자열→null).

### A3. 사용자 목록 (`queries.listUsers` + `UserListRow` + `UserTable`)
- `listUsers` select에 `position, phone` 추가. `UserListRow`에 `position: string|null; phone: string|null`.
- `UserTable`에 컬럼 **직책·연락처** 추가(빈값='-'). 연락처는 `formatPhone`로 표시.

### A4. 수정 페이지 (`EditUserClient`)
- 이름·직책·연락처 편집 추가. 신설 액션 `updateUserBasics(userId, { name, position, phone })`(서버 검증·길이캡, 빈값→null; name은 `profiles.name` + auth `user_metadata.name` 동기). 이메일=로그인ID라 읽기전용.

---

## B. 장비 카탈로그 PDF

### B1. DB — 버킷 + 컬럼
- 새 버킷 `equipment-catalogs`: `public=true`, `allowed_mime_types={'application/pdf'}`, `file_size_limit=20MiB`.
- 정책: SELECT 공개(anon+authenticated), INSERT/UPDATE/DELETE는 authenticated + `has_permission(auth.uid(),'equipment.manage')` + **경로 정규식**(`name ~ '^equipment/<uuid>/catalog\.pdf$'`)을 `with check`에 강제.
- `equipment.catalog_pdf text`(nullable) + CHECK `catalog_pdf is null or catalog_pdf ~ '^equipment/[0-9a-f-]{36}/catalog\.pdf$'`.
- 마이그 + 롤백 + db-test(컬럼 CHECK, 버킷 정책 경로 강제).

### B2. 장비 폼 (`EquipmentForm` + `CatalogUploader`)
- 신규 컴포넌트 `CatalogUploader.tsx`(BannerUploader 패턴): `application/pdf`만, 단일 파일, 경로 `equipment/{id}/catalog.pdf`, 버킷 `equipment-catalogs`, `upsert:true`, 최대 20MB. 업로드된 파일명/상태 + 제거 버튼.
- `equipment/schema.ts` Zod에 `catalog_pdf` union("" | regex `^equipment/[0-9a-f-]{36}/catalog\.pdf$`).
- `createEquipment`/`updateEquipment`가 `catalog_pdf`(빈문자열→null) 저장.

---

## C. 견적 메일에 카탈로그 링크

### C1. 워커 (`apps/worker/src/jobs/email.ts`)
- 견적의 장비 해석(우선순위: 견적 `items[0].equipmentId` → 의뢰 `application.equipment_id`)으로 그 장비의 `catalog_pdf` 조회. (기존 `quote-pdf.ts`와 동일 우선순위 — 순수 함수 `pickQuoteEquipmentId(items, applicationEquipmentId)`로 추출해 단위 테스트)
- `catalog_pdf` 있으면 `supabase.storage.from('equipment-catalogs').getPublicUrl(path)`로 **공개 URL**(만료 없음).
- `composeQuoteEmailHtml`에 `catalogDownloadUrl`(있을 때만) 전달.

### C2. 메일 템플릿 (`packages/shared/src/mail.ts`)
- `composeQuoteEmailHtml(p)`에 `catalogDownloadUrl?: string` 추가. 있으면 견적서 버튼 아래 **"📘 제품 카탈로그(PDF) 다운로드"** 두 번째 버튼(파인 아웃라인 또는 보조색)을 렌더. 없으면 현행대로 견적서 버튼만.
- 견적서 서명URL·카탈로그 공개URL 모두 href에만(긴 주소 비노출 유지).

---

## 테스트 / 게이트
- shared: `composeQuoteEmailHtml` 카탈로그 버튼 유무(있을 때 버튼·링크, 없을 때 미노출).
- 워커: `pickQuoteEquipmentId` 우선순위 순수 단위.
- equipment Zod: `catalog_pdf` 경로 검증 단위.
- db-test: `equipment.catalog_pdf` CHECK(정상/위반), `equipment-catalogs` 정책(경로 정규식·권한).
- web: `typecheck`·`lint`·`build` · 기존 `e2e` 회귀(사용자/장비 폼). 새 필드 표시 e2e는 고가치만.
- `as any` 0. db-test/e2e는 클린 `db reset`+`seed-local`.

## 범위 밖 (YAGNI)
- 진짜 파일 첨부(하이웍스 첨부 미확인 → 링크 유지).
- 견적에 장비 다수일 때 카탈로그 다수(v1=주 장비 1개 카탈로그).
- 카탈로그 버전관리·미리보기.

## 산출물 위치
- 마이그: `supabase/migrations/`, 롤백: `supabase/rollback/`, db-test: `packages/db-tests/src/`.
- 계정: `apps/web/src/app/admin/users/**`, `apps/web/src/lib/users/**`.
- 장비: `apps/web/src/app/admin/equipment/**`, `apps/web/src/lib/equipment/**`.
- 메일: `packages/shared/src/mail.ts`, `apps/worker/src/jobs/email.ts`.
