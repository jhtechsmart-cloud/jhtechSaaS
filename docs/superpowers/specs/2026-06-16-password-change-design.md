# 비밀번호 변경 (3종) — 설계 문서

> **한 문장 요약**: 직원이 임시 비밀번호로 로그인한 뒤 **본인이 직접 비밀번호를 바꾸고**, 관리자가 잊은 직원의 비밀번호를 **새 임시값으로 재설정**하며, 임시 비밀번호로 처음 들어온 사람은 **바꾸기 전엔 콘솔을 못 쓰게** 막는다.
>
> **왜 필요한가**: 지금은 임시 비밀번호를 받으면 영원히 그걸 써야 한다(바꿀 화면이 아예 없음). 보안상 최소한의 "본인 비밀번호 변경"이 반드시 필요하고, 잊었을 때 복구 경로(관리자 재설정)도 함께 있어야 운영이 된다.

작성일: 2026-06-16
브랜치: `feat/auth-password-change` (worktree 격리)

---

## 1. 배경 · 현재 상태

조사 결과 확인된 현황:

- **계정 생성 + 임시 비밀번호 1회 발급**: `apps/web/src/lib/users/actions.ts`의 `createUserAction()`. `generateTempPassword()`(`lib/users/password.ts`, 14자 CSPRNG)로 임시값 생성 → `admin.auth.admin.createUser()` → 트리거가 `profiles` 행 자동 생성 → 권한 UPDATE. 임시값은 저장하지 않고 1회만 반환.
- **로그인**: `app/login/actions.ts`의 `signIn()` → `supabase.auth.signInWithPassword()`.
- **비밀번호 변경 / 재설정 / 본인 계정 설정 페이지**: **전부 없음**.
- **인증 구조**: 미들웨어 없음. 모든 콘솔 페이지가 `app/admin/layout.tsx`의 `requireAnyConsoleCapability()` 서버 가드를 거친다(단일 choke point).
- **profiles RLS**: 본인 SELECT 허용, **UPDATE는 `users.manage`만**(`profiles_update` 정책, `20260529150002_permissions.sql`). 자가 락아웃 방어 트리거 존재(`20260604150000_e5a_profiles_self_lockout.sql`).

핵심 함의: 일반 직원은 자기 `profiles` 행을 직접 UPDATE할 수 없다 → 새로 추가할 플래그의 해제는 **서버 액션(admin 클라이언트)** 이 수행해야 한다.

---

## 2. 범위

세 가지를 모두 구현한다(사용자 결정 "셋 다"):

1. **본인 비밀번호 변경** — `/admin/account` 계정 설정 페이지
2. **관리자 재설정** — `/admin/users/[id]`에서 특정 직원 비밀번호를 새 임시값으로 재발급
3. **최초 로그인 강제 변경** — 임시 비밀번호 상태면 바꾸기 전까지 콘솔 차단

비범위(YAGNI): 비밀번호 찾기(이메일 재설정 링크), 2FA, 비밀번호 만료 정책, 로그인 시도 제한.

---

## 3. 데이터 모델 변경

마이그레이션 1개 + 롤백 1개.

```sql
-- supabase/migrations/<ts>_password_must_change.sql
alter table public.profiles
  add column must_change_password boolean not null default false;
```

- 의미: "이 사람은 임시 비밀번호 상태라 비밀번호를 바꿔야 함" 표시.
- 기존 `profiles_update` RLS(`users.manage`만)가 그대로 적용 → **일반 직원은 이 플래그를 스스로 끌 수 없다**. 플래그 해제는 본인 변경 서버 액션이 admin 클라이언트로 처리.
- 롤백: `supabase/rollback/<ts>_password_must_change_down.sql` (단수 디렉토리)에 `drop column`.

플래그 라이프사이클:

| 시점 | must_change_password |
|---|---|
| 계정 생성(`createUserAction`) | `true`로 설정 |
| 관리자 재설정(`resetUserPasswordAction`) | `true`로 설정 |
| 본인 비밀번호 변경 성공 | `false`로 해제 |

---

## 4. 컴포넌트 · 데이터 흐름

### 4.1 공통 검증 로직 (shared, 순수함수)

`packages/shared/src`에 `validateNewPassword` 추가(TDD 대상):

```ts
// 새 비밀번호 규칙: 최소 8자, 현재 비밀번호와 동일 금지.
// 반환: 위반 메시지(string) | null(통과)
export function validateNewPassword(
  next: string,
  opts: { current?: string },
): string | null
```

규칙(사용자 결정 "8자+ 느슨함"):
- 길이 < 8 → "비밀번호는 8자 이상이어야 합니다"
- `next === opts.current` → "현재 비밀번호와 다른 비밀번호를 입력하세요"
- 그 외 → `null`

비밀번호는 trim하지 않는다(공백도 유효 문자).

### 4.2 본인 비밀번호 변경 — `/admin/account`

- **페이지**(서버 컴포넌트, 콘솔 셸 내부): 내 이메일·이름·권한(읽기전용) + `ChangePasswordForm`(클라이언트).
- **진입 동선**: `admin/layout.tsx` 상단바 우측 아바타(관/영)를 `/admin/account` 링크로 변경.
- **폼 필드**: 현재 비밀번호 / 새 비밀번호 / 새 비밀번호 확인.
- **서버 액션** `changeOwnPasswordAction({ currentPassword, newPassword })`:
  1. 세션 사용자(`supabase.auth.getUser()`) 확인. 없으면 실패.
  2. **현재 비밀번호 검증** — 세션을 건드리지 않는 별도 Supabase 클라이언트로 `signInWithPassword({ email, password: currentPassword })` 시도. 실패 시 `{ error: "현재 비밀번호가 올바르지 않습니다" }`. (검증용 클라이언트는 쿠키/세션을 persist하지 않도록 구성 → 현재 콘솔 세션에 영향 없음.)
  3. `validateNewPassword(newPassword, { current: currentPassword })` → 위반 시 메시지 반환.
  4. `supabase.auth.updateUser({ password: newPassword })` (현재 세션 클라이언트).
  5. admin 클라이언트로 `profiles.must_change_password = false` (해당 user.id).
  6. `{ ok: true }`.
- 폼은 성공 시 "비밀번호가 변경되었습니다" 표시 + 입력 초기화.

### 4.3 최초 로그인 강제 변경 — 차단 패널(리다이렉트/미들웨어 X)

- `requireAnyConsoleCapability()`(또는 `admin/layout.tsx`의 컨텍스트 로딩)가 `must_change_password`를 함께 읽도록 확장. (`loadAccessContext`의 select에 `must_change_password` 추가, 가드 반환에 포함.)
- `admin/layout.tsx`에서 **forbidden 체크 다음**에:
  - `must_change_password === true` → 사이드바·본문 대신 **전체 화면 강제 변경 패널** 렌더(2번과 같은 `ChangePasswordForm` + "임시 비밀번호를 변경해야 합니다" 안내 + 로그아웃 링크). children을 렌더하지 않으므로 어떤 콘솔 메뉴에도 접근 불가.
  - 변경 성공 → `router.refresh()` → 플래그 false → 다음 렌더에서 정상 콘솔.
- 리다이렉트가 없으므로 pathname 의존·루프·미들웨어가 전부 불필요. layout이 모든 콘솔 페이지를 감싸는 단일 choke point라는 기존 구조를 그대로 활용.
- **엣지**: 권한 0개 신규 계정은 `is_active=false` → forbidden 패널이 먼저 뜬다(강제 변경 패널에 도달 안 함). 현실 시나리오는 관리자가 권한을 부여하며 생성 → `is_active=true` → 강제 변경 패널 정상 노출. 비활성+임시 상태는 어차피 콘솔 사용 불가이므로 문제 없음(문서화).

### 4.4 관리자 재설정 — `/admin/users/[id]`

- `EditUserClient`에 **"비밀번호 재설정"** 버튼 추가(`confirm` 1번).
- **서버 액션** `resetUserPasswordAction(userId)`:
  1. `requirePermission("users.manage")`. forbidden이면 거부.
  2. `generateTempPassword()`로 새 임시값 생성(기존 함수 재사용).
  3. admin 클라이언트 `auth.admin.updateUserById(userId, { password: tempPassword })`.
  4. admin 클라이언트로 `profiles.must_change_password = true` (해당 userId).
  5. `{ ok: true, tempPassword }` (1회만 반환, 저장 안 함).
- UI: 반환된 임시 비밀번호를 **계정 생성 때와 동일한 '1회 노출' 방식**(`NewUserClient`의 노출 컴포넌트 패턴 재사용/공유)으로 1번만 표시.
- 자기 자신 재설정은 막지 않는다(본인은 `/admin/account`로도 바꿀 수 있어 무해). 단, 발급된 임시값으로 본인 `must_change_password=true`가 되어 다음 콘솔 진입 시 강제 변경 패널을 보게 됨 — 의도된 동작.

### 4.5 계정 생성 시 플래그 설정

`createUserAction`의 profiles UPDATE patch에 `must_change_password: true` 추가:

```ts
const patch = { permissions, name, is_active: isActive, must_change_password: true };
```

---

## 5. 보안 고려사항

- **플래그 위변조 방지**: `profiles_update` RLS가 `users.manage`만 허용 → 일반 직원은 자기 `must_change_password`를 false로 못 바꾼다. 해제는 본인 변경 액션이 현재 세션 user.id를 확인한 뒤 admin 클라이언트로만 수행.
- **현재 비밀번호 검증**: 세션 탈취 시 무단 변경 방지를 위해 변경 전 현재 비밀번호 재입력·재로그인 검증.
- **임시 비밀번호 비저장**: 생성·재설정 모두 평문 임시값을 DB에 저장하지 않고 1회만 화면 노출(기존 정책 유지).
- **admin 클라이언트는 서버 전용**: service_role 키는 서버 액션 파일에서만 사용(기존 패턴).
- 자가 락아웃 방어 트리거(`profiles_self_lockout_guard`)는 `must_change_password` 컬럼을 검사하지 않으므로 영향 없음(명시 컬럼만 검사).

---

## 6. 테스트 계획

- **shared 단위(Vitest)**: `validateNewPassword` — 8자 미만 거부 / 현재와 동일 거부 / 통과 케이스 / 공백 미trim.
- **db-tests(RLS, pg set role)**:
  - `must_change_password` 기본값 false / 컬럼 존재.
  - 일반 authenticated 사용자가 본인 `must_change_password`를 직접 UPDATE 시도 → RLS로 0행(차단).
  - `users.manage` 보유자는 타인 `must_change_password` UPDATE 가능.
- **e2e(Playwright)**:
  - 본인 변경: `/admin/account`에서 현재 비밀번호 검증 실패·성공 흐름.
  - 관리자 재설정: 버튼 → 임시 비밀번호 1회 노출.
  - (가능하면) 강제 변경 패널: `must_change_password=true`로 시드된 계정 로그인 시 콘솔 대신 패널 노출, 변경 후 정상 진입.
- **게이트**: `pnpm --filter @jhtechsaas/shared test` · web test · `@jhtechsaas/db-tests test:rls` · web typecheck · lint · build · web test:e2e · `as any` 0 모두 통과. db-tests/e2e 전 `supabase db reset` + `seed-local.sh`.

---

## 7. 파일 변경 요약(예상)

신규:
- `supabase/migrations/<ts>_password_must_change.sql` + `supabase/rollback/<ts>_..._down.sql`
- `apps/web/src/app/admin/account/page.tsx`
- `apps/web/src/app/admin/account/ChangePasswordForm.tsx` (또는 `_components/`)
- 강제 변경 패널 컴포넌트(`admin/_components/ForcedPasswordChange.tsx` 등, 폼 공유)
- shared: `validateNewPassword` + 테스트
- `apps/web/src/lib/users/password-actions.ts`(또는 기존 `actions.ts`에 추가): `changeOwnPasswordAction`, `resetUserPasswordAction`
- db-tests: must_change_password RLS 테스트
- e2e 스펙

수정:
- `apps/web/src/lib/users/actions.ts` — `createUserAction` patch에 `must_change_password: true`
- `apps/web/src/lib/auth/guard.ts` — `loadAccessContext`/가드에 `must_change_password` 포함
- `apps/web/src/app/admin/layout.tsx` — 강제 변경 패널 분기 + 아바타→`/admin/account` 링크
- `apps/web/src/app/admin/users/[id]/EditUserClient.tsx` — 재설정 버튼 + 임시값 노출

---

## 8. 결정 기록

| 결정 | 선택 | 근거 |
|---|---|---|
| 범위 | 본인 변경 + 관리자 재설정 + 강제 변경(셋 다) | 사용자 결정 |
| 본인 변경 화면 위치 | `/admin/account` | 사용자 결정. 앞으로 본인 설정 확장 시 모음 |
| 현재 비밀번호 확인 | 요구함 | 사용자 결정. 세션 탈취 악용 방지 |
| 비밀번호 규칙 | 최소 8자 + 현재와 동일 금지 | 사용자 결정("느슨함") |
| 강제 변경 구현 | 리다이렉트 X, layout 차단 패널 | 미들웨어 부재 구조. 루프/pathname 의존 회피 |
