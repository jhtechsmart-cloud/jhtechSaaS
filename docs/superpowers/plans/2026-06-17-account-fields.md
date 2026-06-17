# 계정 항목(직책·연락처) Implementation Plan — Part A

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 새 계정 생성·수정 폼에서 직책·연락처를 입력/편집하고 사용자 목록에 표시한다.

**Architecture:** `profiles`에 `position` 컬럼 추가(phone은 기존 재사용). 생성/수정 액션이 저장, 목록 쿼리·테이블이 표시.

**Tech Stack:** Supabase(Postgres/RLS), Next.js App Router, Vitest, pg(db-tests).

## Global Constraints
- 마이그레이션 한 의도 + 롤백 별도(`supabase/rollback/`).
- `as any` 금지. 길이 캡은 DB CHECK + Zod 양쪽.
- 게이트: web `typecheck`·`lint`·`build` · db-test · e2e 회귀.

---

### Task 1: DB — profiles.position 컬럼

**Files:**
- Create: `supabase/migrations/20260617130000_profiles_position.sql`
- Create: `supabase/rollback/20260617130000_profiles_position_down.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 계정 직책(position). 연락처(phone)는 20260610120000에 이미 있음 → 재사용.
alter table public.profiles
  add column if not exists position text;
alter table public.profiles
  add constraint profiles_position_len check (position is null or char_length(position) <= 50);
```

- [ ] **Step 2: 롤백 작성**

```sql
alter table public.profiles drop constraint if exists profiles_position_len;
alter table public.profiles drop column if exists position;
```

- [ ] **Step 3: 적용 + 확인**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS && supabase db reset && bash supabase/seed/seed-local.sh`
Expected: 에러 없이 완료.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260617130000_profiles_position.sql supabase/rollback/20260617130000_profiles_position_down.sql
git commit -m "feat: profiles.position(직책) 컬럼 추가"
```

---

### Task 2: 생성 액션 + 새 계정 폼

**Files:**
- Modify: `apps/web/src/lib/users/actions.ts` (createUserAction 입력·patch에 position·phone)
- Modify: `apps/web/src/app/admin/users/new/NewUserClient.tsx` (직책·연락처 입력)

**Interfaces:**
- Produces: `createUserAction({ name, email, permissions, position?, phone? })`.

- [ ] **Step 1: createUserAction 확장**

`actions.ts`의 `createUserAction` 입력 타입에 `position?: string; phone?: string` 추가. profile update patch에 `position: position?.trim() || null, phone: phone?.trim() || null` 포함. (기존 name·permissions·is_active·must_change_password 옆)

- [ ] **Step 2: 새 계정 폼에 입력 추가**

`NewUserClient.tsx`에 직책·연락처 state + input 추가(이름 아래, 권한 위). 제출 시 `createUserAction`에 position·phone 전달. 연락처 input은 `inputMode="tel"`.

- [ ] **Step 3: typecheck**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS/apps/web && pnpm run typecheck`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/lib/users/actions.ts "apps/web/src/app/admin/users/new/NewUserClient.tsx"
git commit -m "feat: 새 계정 폼에 직책·연락처 입력"
```

---

### Task 3: 사용자 목록 표시

**Files:**
- Modify: `apps/web/src/lib/users/queries.ts` (select + UserListRow)
- Modify: `apps/web/src/app/admin/users/_components/UserTable.tsx` (컬럼)

- [ ] **Step 1: 쿼리·타입 확장**

`queries.ts` `listUsers` select를 `"id,name,permissions,is_active,hiworks_user_id,position,phone,created_at"`로. `UserListRow`에 `position: string | null; phone: string | null` 추가.

- [ ] **Step 2: 테이블 컬럼 추가**

`UserTable.tsx` thead에 `<th>직책</th><th>연락처</th>` 추가(이름·이메일 뒤), tbody에 `user.position ?? "-"`, `formatPhone(user.phone ?? "") || "-"`. `formatPhone`은 `@jhtechsaas/shared`에서 import.

- [ ] **Step 3: typecheck + build**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS/apps/web && pnpm run typecheck && pnpm run build`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/lib/users/queries.ts apps/web/src/app/admin/users/_components/UserTable.tsx
git commit -m "feat: 사용자 목록에 직책·연락처 표시"
```

---

### Task 4: 수정 페이지 — 이름·직책·연락처 편집

**Files:**
- Modify: `apps/web/src/lib/users/actions.ts` (updateUserBasics 신설)
- Modify: `apps/web/src/app/admin/users/[id]/EditUserClient.tsx` (편집 UI)
- Modify: `apps/web/src/lib/users/queries.ts` (단건 조회가 position·phone 포함하는지 확인·보강)

**Interfaces:**
- Produces: `updateUserBasics(userId: string, v: { name: string; position: string; phone: string }): Promise<{ error: string } | null>`.

- [ ] **Step 1: updateUserBasics 액션**

`actions.ts`에 추가. `users.manage` 가드 → `profiles.update({ name: name.trim(), position: position.trim()||null, phone: phone.trim()||null })` + auth `admin.auth.admin.updateUserById(userId, { user_metadata: { name } })`로 이름 동기. 길이캡(name≤60, position≤50, phone≤30) 위반 시 `{ error }`.

- [ ] **Step 2: 수정 페이지 편집 UI**

`EditUserClient.tsx`에 이름·직책·연락처 입력 + 저장 버튼(useTransition). 저장 시 `updateUserBasics` 호출 후 `router.refresh()`. 기존 권한·활성·하이웍스ID 섹션은 유지. 단건 데이터에 position·phone 없으면 `queries`의 단건 조회 select에 추가.

- [ ] **Step 3: typecheck + lint + build**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS/apps/web && pnpm run typecheck && pnpm run lint && pnpm run build`
Expected: 통과, as any 0.

- [ ] **Step 4: e2e 회귀(사용자 관련)**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS && supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter web exec playwright test e5a-permissions.spec.ts`
Expected: PASS(사용자 생성/권한 시나리오 — 새 필드로 깨지지 않음).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/users/actions.ts "apps/web/src/app/admin/users/[id]/EditUserClient.tsx" apps/web/src/lib/users/queries.ts
git commit -m "feat: 사용자 수정에서 이름·직책·연락처 편집"
```

---

### Task 5: PR + 배포

- [ ] PR 생성 → 머지 → `supabase db push`(원격) → 프로덕션 200 확인.

## Self-Review
- Spec A1=Task1, A2=Task2, A3=Task3, A4=Task4. 커버 완료.
- 타입 일관: `position`·`phone` 컬럼명, `createUserAction`/`updateUserBasics`/`UserListRow` 시그니처 일치.
- 플레이스홀더 없음(컬럼·select·시그니처 구체).
