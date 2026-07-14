# 고객 중복·견적요청 매칭·개인정보 전문 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (인라인 실행 — 이 repo는 서브에이전트 쓰기 금지 관행). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객 등록 시 동명(회사명만 일치) 경고+확인 게이트, 관리자 견적요청 화면의 기존 고객 매칭·연결·선택 교정, 개인정보 동의 전문 v1.1 실문안 반영.

**Architecture:** 중복 판정은 기존 `check_company_duplicate` RPC에 3순위(name_only)를 추가해 재사용. 견적요청 매칭은 순수함수(`company-match.ts`)+목록/상세 쿼리 통합. 연결은 `applications.company_id` 트리거 동결 해제 후 서버 액션. 전문은 `privacy_policies` v1.1 행 추가+상수 범프.

**Tech Stack:** Next.js(App Router)+Supabase(RLS·SECURITY DEFINER RPC), Zod, react-hook-form, Vitest, pg db-tests, Playwright.

## Global Constraints

- 마이그레이션 = 한 의도 1파일, 롤백은 `supabase/rollback/<timestamp>_<name>_down.sql`(단수 디렉토리).
- `as any` 금지. 코드 주석 한국어. 외부(RPC) 응답은 Zod 검증.
- 기존 1·2순위 중복 판정(biz_no·name+phone = 저장 차단)은 동작 불변.
- db-tests는 클린 `supabase db reset` 후 실행, e2e는 reset+`bash supabase/seed/seed-local.sh` 후 실행.
- 게이트: shared test · web test · db-tests:rls · typecheck · lint · build · e2e 전부 GREEN 후 머지.

---

### Task 1: RPC `check_company_duplicate` 3순위(name_only) 추가

**Files:**
- Create: `supabase/migrations/20260714120000_check_company_duplicate_name_only.sql`
- Create: `supabase/rollback/20260714120000_check_company_duplicate_name_only_down.sql`
- Modify: `packages/db-tests/src/check_company_duplicate.test.ts`

**Interfaces:**
- Produces: RPC가 3순위에서 `{company_id, name, ceo, match:'name_only', biz_no, manager, address}` jsonb 반환. 1·2순위 반환 형태 불변.

- [ ] **Step 1: db-test에 실패 케이스 추가** — 기존 테스트 파일 패턴(helpers의 role/claims 세팅)을 따라: ①회사명만 같고 사업자번호·전화 다른 회사 → `match='name_only'` + `biz_no`/`manager`/`address` 필드 포함 ②biz_no 일치가 name_only보다 우선 ③`p_exclude_id` 자기 제외 ④이름 다른 경우 null.
- [ ] **Step 2: db-test 실행 → 실패 확인** — `pnpm --filter @jhtechsaas/db-tests test:rls -- check_company_duplicate` (name_only 케이스 FAIL).
- [ ] **Step 3: 마이그레이션 작성** — 기존 20260713120100 본문에 3순위 추가 재정의:

```sql
-- 3순위 name_only: 회사명(정규화)만 일치 — 저장 차단이 아니라 "확인 후 진행" 경고용.
-- 경고 배너에 기존 고객 정보를 보여줘야 해서 name_only 반환에만 biz_no·manager·address를 추가.
create or replace function public.check_company_duplicate(
  p_biz_no text, p_name text, p_phone text, p_exclude_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' stable as $$
declare
  v_biz text := regexp_replace(coalesce(p_biz_no, ''), '\D', '', 'g');
  v_name text := lower(regexp_replace(coalesce(p_name, ''), '[[:space:]　]', '', 'g'));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_row public.companies%rowtype;
begin
  -- ① 사업자번호 정확 일치(불변)
  if v_biz ~ '^\d{10}$' then
    select * into v_row from public.companies
      where biz_no = v_biz and (p_exclude_id is null or id <> p_exclude_id) limit 1;
    if found then
      return jsonb_build_object('company_id', v_row.id, 'name', v_row.name, 'ceo', v_row.ceo, 'match', 'biz_no');
    end if;
  end if;
  -- ② 회사명+전화 동시 일치(불변)
  if v_name <> '' and v_phone <> '' then
    select * into v_row from public.companies
      where lower(regexp_replace(coalesce(name, ''), '[[:space:]　]', '', 'g')) = v_name
        and (
          regexp_replace(coalesce(mobile, ''), '\D', '', 'g') = v_phone or
          regexp_replace(coalesce(phone1, ''), '\D', '', 'g') = v_phone or
          regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone
        )
        and (p_exclude_id is null or id <> p_exclude_id)
      order by id limit 1;
    if found then
      return jsonb_build_object('company_id', v_row.id, 'name', v_row.name, 'ceo', v_row.ceo, 'match', 'name_phone');
    end if;
  end if;
  -- ③ 회사명 단독 일치(신규) — 확인 후 진행 경고
  if v_name <> '' then
    select * into v_row from public.companies
      where lower(regexp_replace(coalesce(name, ''), '[[:space:]　]', '', 'g')) = v_name
        and (p_exclude_id is null or id <> p_exclude_id)
      order by id limit 1;
    if found then
      return jsonb_build_object(
        'company_id', v_row.id, 'name', v_row.name, 'ceo', v_row.ceo, 'match', 'name_only',
        'biz_no', v_row.biz_no, 'manager', v_row.manager, 'address', v_row.address);
    end if;
  end if;
  return null;
end;
$$;
```

(grant/revoke는 기존과 동일하게 재선언.) 롤백 파일 = 20260713120100 원문 그대로 복원.
- [ ] **Step 4: `supabase db reset` 후 db-test 통과 확인.**
- [ ] **Step 5: 커밋** — `feat: 고객 중복 RPC 3순위(name_only) — 동명 경고용`

### Task 2: 웹 스키마·액션 — 동명 확인 게이트(fail-closed)

**Files:**
- Modify: `apps/web/src/lib/customers/schema.ts` (`name_only_confirmed` 폼 전용 필드)
- Modify: `apps/web/src/lib/customers/actions.ts` (`DuplicateHit` 확장 + create/update 게이트)
- Test: `apps/web/src/lib/customers/__tests__/` 또는 기존 스키마 테스트 파일 위치를 따름

**Interfaces:**
- Produces: `DuplicateHit = { company_id, name, ceo, match: "biz_no"|"name_phone"|"name_only", biz_no?, manager?, address? }`, `CompanyFormValues.name_only_confirmed: boolean`.

- [ ] **Step 1: 실패 테스트** — 스키마: `name_only_confirmed` 기본 false·boolean. duplicateHitSchema: name_only 페이로드 파싱.
- [ ] **Step 2: 구현** — schema.ts object에 `name_only_confirmed: z.boolean().default(false), // 폼 전용 — 동명(name_only) 경고 확인` 추가(DB 미저장 — `companyRow`가 명시 필드만 뽑으므로 자동 제외). actions.ts:

```ts
export type DuplicateHit = {
  company_id: string; name: string; ceo: string | null;
  match: "biz_no" | "name_phone" | "name_only";
  biz_no?: string | null; manager?: string | null; address?: string | null;
};
const duplicateHitSchema = z.object({
  company_id: z.guid(), name: z.string(), ceo: z.string().nullable(),
  match: z.enum(["biz_no", "name_phone", "name_only"]),
  biz_no: z.string().nullable().optional(),
  manager: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});
```

create/update의 `if (dupRes.hit)` 분기 교체(양쪽 동일):

```ts
if (dupRes.hit && dupRes.hit.match !== "name_only") return { error: `이미 등록된 업체입니다: ${dupRes.hit.name}` };
// 동명(name_only)은 차단이 아니라 확인 게이트 — 확인 플래그 없으면 거부(fail-closed, 화면 우회 방지).
if (dupRes.hit && !v.name_only_confirmed) {
  return { error: `동일한 업체명이 이미 등록돼 있습니다: ${dupRes.hit.name}. 동명의 다른 회사가 맞으면 확인 체크 후 다시 저장하세요.` };
}
```

- [ ] **Step 3: 테스트 통과 확인** — `pnpm --filter web test -- customers`
- [ ] **Step 4: 커밋** — `feat: 고객 저장 동명 확인 게이트(name_only_confirmed) fail-closed`

### Task 3: CompanyForm — 동명 경고 배너+확인 체크박스

**Files:**
- Modify: `apps/web/src/app/admin/customers/_components/CompanyForm.tsx`

**Interfaces:**
- Consumes: Task 2의 `DuplicateHit.match === 'name_only'`, `register("name_only_confirmed")`.

- [ ] **Step 1: 실시간 조회 트리거 확대** — `canQuery`에 `(nameVal ?? "").trim() !== ""` 단독 조건 추가(업체명만 입력해도 name_only 자문 조회).
- [ ] **Step 2: 배너 분기** — 기존 danger 배너는 `match !== 'name_only'`일 때만. name_only는 amber(warn) 배너: 기존 고객 이름·대표·사업자번호(`formatBizNo`)·담당자·주소 + "기존 업체 열기" 링크 + 체크박스:

```tsx
{dupHit?.match === "name_only" && (
  <div className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-small text-text">
    <b>동일한 업체명이 이미 등록돼 있습니다</b>: {dupHit.name}
    {dupHit.ceo ? ` (대표 ${dupHit.ceo})` : ""} —{" "}
    <Link href={`/admin/customers/${dupHit.company_id}`} className="underline">기존 업체 열기</Link>
    <div className="mt-0.5 text-micro text-muted">
      사업자번호 {dupHit.biz_no ? formatBizNo(dupHit.biz_no) : "미등록"} · 담당자 {dupHit.manager || "-"} · {dupHit.address || "주소 미등록"}
    </div>
    <label className="mt-2 flex items-center gap-1.5 text-small">
      <input type="checkbox" {...register("name_only_confirmed")} className="h-4 w-4 accent-accent" />
      동명의 다른 회사가 맞습니다(중복 아님 확인)
    </label>
  </div>
)}
```

- [ ] **Step 3: 저장 잠금 조건 변경** — `blocked`/onSubmit 가드: `dupHit && (dupHit.match !== 'name_only' || !confirmed)` (`useWatch`로 name_only_confirmed 구독).
- [ ] **Step 4: 수동 확인 + 기존 web test 회귀** — `pnpm --filter web test`
- [ ] **Step 5: 커밋** — `feat: 고객 폼 동명 경고 배너+확인 체크박스`

### Task 4: `applications.company_id` 동결 해제 + upsert RPC가 연결 기록

**Files:**
- Create: `supabase/migrations/20260714121000_applications_company_link_update.sql`
- Create: `supabase/rollback/20260714121000_applications_company_link_update_down.sql`
- Modify: `packages/db-tests/src/manual_quote_company_link.test.ts` (또는 신규 테스트)

**Interfaces:**
- Produces: `applications.company_id` UPDATE 허용(RLS: assignee 또는 applications.assign). `upsert_company_from_application`이 applications.company_id도 세팅.

- [ ] **Step 1: db-test 작성(실패)** — ①assignee가 자기 의뢰 company_id UPDATE 성공 ②upsert RPC 후 applications.company_id가 반환 company_id와 일치.
- [ ] **Step 2: 마이그레이션** — `applications_enforce_server_fields()` 재정의에서 `new.company_id := old.company_id;` 줄 제거(주석: company_id는 '연결 고객' 가변 링크로 의미 변경 — 보호는 RLS applications_update). `upsert_company_from_application` 재정의: `return` 직전에

```sql
  update public.applications set company_id = v_company_id
    where id = p_application_id and company_id is distinct from v_company_id;
```

롤백 = 두 함수 직전 정의(20260619140000·20260602100004) 복원.
- [ ] **Step 3: db reset 후 테스트 통과.**
- [ ] **Step 4: 커밋** — `feat: applications.company_id 연결 가능화+고객등록 시 자동 연결`

### Task 5: 매칭 순수함수 + 목록/상세 쿼리 통합

**Files:**
- Create: `apps/web/src/lib/applications/company-match.ts`
- Test: `apps/web/src/lib/applications/__tests__/company-match.test.ts` (기존 테스트 위치 관행 따름)
- Modify: `apps/web/src/lib/applications/admin-queries.ts`

**Interfaces:**
- Produces: `matchCompany(app, companies): { kind: 'linked'|'biz_no'|'name_only'|null; companyId: string|null }`, `CompanyLite = { id, name, biz_no }`, `ApplicationListRow.match_kind`, `getApplicationForAdmin` 반환에 `company_id`(DB링크)·`match_kind`·`matched_company_id` 포함.

- [ ] **Step 1: 순수함수 TDD** — linked 우선, biz_no 정규화 일치, name 정규화 일치, 미일치 null. `normalizeCompanyName`(validation.ts)·`normalizeBizNo`(shared) 재사용.
- [ ] **Step 2: 구현**

```ts
import { normalizeBizNo } from "@jhtechsaas/shared";
import { normalizeCompanyName } from "@/lib/customers/validation";

export type CompanyMatchKind = "linked" | "biz_no" | "name_only" | null;
export type CompanyLite = { id: string; name: string; biz_no: string | null };

// 견적요청 1건을 고객 마스터와 대조 — 연결됨 > 사업자번호 일치 > 회사명(정규화) 일치.
export function matchCompany(
  app: { company: string | null; biz_no: string | null; company_id: string | null },
  companies: CompanyLite[],
): { kind: CompanyMatchKind; companyId: string | null } {
  if (app.company_id) return { kind: "linked", companyId: app.company_id };
  const digits = normalizeBizNo(app.biz_no ?? "");
  if (digits) {
    const hit = companies.find((c) => c.biz_no === digits);
    if (hit) return { kind: "biz_no", companyId: hit.id };
  }
  const n = normalizeCompanyName(app.company ?? "");
  if (n) {
    const hit = companies.find((c) => normalizeCompanyName(c.name) === n);
    if (hit) return { kind: "name_only", companyId: hit.id };
  }
  return { kind: null, companyId: null };
}
```

- [ ] **Step 3: 쿼리 통합** — `loadCompanyLites()`(select id,name,biz_no 단일 조회, 이관 ~1,600행 규모라 허용 — 주석 명시) 추가. `listApplicationsPage` select에 `biz_no,company_id` 추가, 행마다 `match_kind` 계산. `getApplicationForAdmin`: 기존 biz_no 즉석 매칭 블록을 `matchCompany` 사용으로 교체 — DB `company_id`(링크) 보존 + `match_kind`·`matched_company_id` 반환(기존 소비처는 `company_id ?? matched_company_id`로 배지 유지).
- [ ] **Step 4: 테스트+typecheck 통과, 커밋** — `feat: 견적요청-고객 매칭 순수함수+목록/상세 통합`

### Task 6: 목록 배지

**Files:**
- Modify: `apps/web/src/app/admin/applications/_components/ApplicationListPane.tsx`

- [ ] **Step 1: 행 칩 추가** — 회사명 옆: `match_kind==='name_only'` → amber "확인 필요" 칩 / `'biz_no'` → mint "기존 고객" 칩 / `'linked'`·null → 표시 없음(연결 완료는 조용히).
- [ ] **Step 2: 수동 확인, 커밋** — `feat: 견적요청 목록 기존고객/확인필요 배지`

### Task 7: 상세 매칭 패널 — 연결 + 선택 교정

**Files:**
- Create: `apps/web/src/app/admin/applications/[id]/_components/CustomerMatchPanel.tsx`
- Modify: `apps/web/src/app/admin/applications/[id]/page.tsx`
- Modify: `apps/web/src/lib/applications/admin-actions.ts`

**Interfaces:**
- Produces: 서버 액션 `linkApplicationToCompany(applicationId: string, companyId: string, resolutions: FieldResolution[])`, `FieldResolution = { field: 'company'|'ceo'|'biz_no'|'phone'|'email'|'address'; use: 'application'|'company' }`.

- [ ] **Step 1: 액션 TDD(가능 범위)+구현** — zod: guid 2개 + resolutions 화이트리스트 배열(최대 6). 가드 `requirePermission("customers.edit")`. 처리: 두 행 조회 → `use==='application'` 필드는 companies UPDATE(요청값 반영), `use==='company'` 필드는 applications UPDATE(요청 교정; 컬럼명 매핑 company↔name 주의) → `applications.company_id = companyId` 세팅 → revalidatePath. 실패 시 한국어 에러.
- [ ] **Step 2: 패널 구현** — 서버에서 내려준 `matchKind`·후보 고객 전체 필드·요청 필드로: `biz_no`(미연결)면 mint 안내 "사업자번호가 일치하는 기존 고객이 있습니다", `name_only`면 amber "회사명이 같은 고객이 있습니다(사업자번호 불일치) — 오타인지 확인하세요". "이 고객으로 연결" 버튼 → 모달: 값이 다른 필드만 행으로(요청값|고객DB값 라디오, 기본 = 고객DB값 유지=no-op), 확인 → 액션 → `router.refresh()`. 값 차이 없으면 즉시 연결.
- [ ] **Step 3: page.tsx 배선** — `getApplicationForAdmin` 반환의 match 정보로 ApplicantInfo 위에 조건 렌더. 기존 `registerButton`(고객으로 등록)은 match 후보가 전혀 없을 때만 노출(있으면 연결 유도).
- [ ] **Step 4: e2e** — 기존 admin e2e 패턴(자체 시드)으로: 고객 A 등록 → 같은 사업자번호 견적요청 시드 → 상세에서 "이 고객으로 연결" → 배지 '등록 고객'+company_id 반영 확인.
- [ ] **Step 5: 커밋** — `feat: 견적요청 상세 고객 매칭 패널(연결+선택 교정)`

### Task 8: 개인정보 수집·이용 동의 전문 v1.1

**Files:**
- Create: `supabase/migrations/20260714122000_privacy_policy_v1_1.sql`
- Create: `supabase/rollback/20260714122000_privacy_policy_v1_1_down.sql`
- Modify: `apps/web/src/lib/applications/schema.ts`, `apps/web/src/lib/service-requests/schema.ts`, `apps/web/src/lib/supply-requests/schema.ts` (PRIVACY_VERSION → "v1.1")
- Modify: `packages/db-tests/src/privacy_policies.test.ts`

- [ ] **Step 1: 전문 작성** — 마이그레이션에 v1.1 INSERT(전문은 실행 시 확정 문안, 아래 골자):

```
개인정보 수집·이용 동의

(주)재현테크(이하 "회사")는 개인정보 보호법 제15조에 따라 견적·A/S·소모품 온라인 접수 처리를 위해
아래와 같이 개인정보를 수집·이용합니다.

1. 수집 항목
- 공통: 회사명, 대표자명, 사업자등록번호, 담당자 성명·연락처·이메일, 주소
- 견적 요청: 설치 환경 정보(건물 형태·설치 위치·전원·현장 사진 등)
- A/S 신청: 보유 장비 정보, 증상 내용
- 소모품 신청: 주문 품목·수량, 배송지 주소

2. 수집·이용 목적
- 견적서 작성·발송, A/S 접수·처리, 소모품 주문 상담 등 문의하신 업무의 처리
- 처리 경과 안내(전화·이메일) 및 처리 이력 관리

3. 보유·이용 기간
- 목적 달성(문의 처리 완료) 후 3년간 보관 후 지체 없이 파기
- 단, 거래가 성사된 경우 전자상거래 등에서의 소비자보호에 관한 법률 등 관계 법령에 따라 보존

4. 동의 거부 권리 및 불이익
- 귀하는 개인정보 수집·이용 동의를 거부할 권리가 있습니다.
- 다만 동의하지 않을 경우 온라인 접수 이용이 제한됩니다(전화 02-839-7723 문의는 가능).

개인정보 관련 문의: (주)재현테크 02-839-7723 / support@jhtech.co.kr
```

- [ ] **Step 2: 마이그레이션+롤백** — INSERT `(version, body) values ('v1.1', '<전문>')`; 롤백 = `delete from public.privacy_policies where version='v1.1'`. (v1.0은 불변 — 기존 동의 기록 원문 보존.)
- [ ] **Step 3: PRIVACY_VERSION 3곳 "v1.1" 범프** (누락 시 RPC version-exists 검증이 제출을 거부하므로 3곳 동시).
- [ ] **Step 4: db-test** — anon이 v1.1 select 가능 + body에 '수집 항목' 포함 단언. web test·e2e 회귀(공개 폼 3종 제출 e2e가 있으면 통과 확인).
- [ ] **Step 5: 커밋** — `feat: 개인정보 수집·이용 동의 전문 v1.1(3개 공개 폼 공통)`

### Task 9: 전체 게이트 + 마무리

- [ ] `supabase db reset` → `pnpm --filter @jhtechsaas/db-tests test:rls` GREEN
- [ ] `bash supabase/seed/seed-local.sh` → `pnpm --filter web test:e2e` GREEN
- [ ] `pnpm --filter @jhtechsaas/shared test` · `pnpm --filter web test` · `typecheck` · `lint` · `build` GREEN, `as any` 0
- [ ] 커밋·push·PR 생성(/ship 관행) — DB 마이그 3건 포함이므로 PR 본문에 `db push` 필요 명시
