# 외부 점검툴 경고 검증 보고서

- **일자**: 2026-06-18
- **대상**: jhtechSaaS (main `04da5c2` 기준)
- **점검 도구**: 외부 정적 점검툴(snapdeck 계열) — 6개 경고
- **검증 방법**: 실제 코드 확인 + 프로덕션 빌드 후 클라이언트 번들 grep

---

## 한 문장 요약

6개 경고 중 **4개는 오탐(false positive), 1개는 유효(프로세스), 1개는 부분 유효(저우선 UX)**. 오탐 다수는 도구가 **`apps/worker`(백엔드)를 클라이언트로 오분류**하고 **유휴 git 워크트리 중복 사본까지 스캔**한 데서 비롯됨. 실제 보안 아키텍처(service_role 격리, jobs 큐 RLS 차단)는 오히려 권고사항을 이미 충족하고 있음.

## 판정 요약표

| # | 경고 | 판정 | 핵심 근거 |
|---|---|---|---|
| 1 | Supabase service_role 키 노출 | ❌ 오탐 | 클라 번들에 키 값 0건. `admin.ts`에 `import "server-only"`, `browser.ts`는 anon만 사용 |
| 2 | jobs 테이블 RLS 정책 없음 | ❌ 오탐 | 워커 전용 큐(의도된 설계). web에서 `.from('jobs')` 0건. 정책 추가 시 오히려 노출 |
| 3 | package.json start 스크립트 없음 | ❌ 오탐 | `apps/web/package.json`에 build/start 존재. Vercel Root Directory=`apps/web` |
| 4 | localhost/127.0.0.1 하드코딩 | ❌ 대부분 오탐 | `NEXT_PUBLIC_SITE_URL` 우선 + dev 폴백. 나머지는 테스트·시드·dev 설정 |
| 5 | DB 백업 전략 없음 | ✅ 유효(프로세스) | Supabase 자동백업은 있으나 BACKUP.md·복구테스트 문서 부재 |
| 6 | 로딩/에러 상태 미처리 | ⚠️ 부분 유효 | 일부 클라 컴포넌트에 로딩은 있고 에러 UI만 없음(저우선 UX) |

---

## 근본 원인 (오탐이 많은 이유)

1. **`apps/worker`(백엔드)를 클라이언트로 오분류** — 워커는 Railway/로컬에서 도는 독립 Node(tsx) 백엔드인데, 도구가 "`import 'server-only'` 마커 없음 → 클라이언트"로 판단. `server-only`는 Next.js 전용 개념이라 워커엔 해당 없음. → 경고 #1·#2의 원인.
2. **유휴 git 워크트리까지 스캔** — `.claude/worktrees/feat+release-order-rpc/`는 옛 세션의 중복 사본(배포 코드 아님). 같은 파일을 두 번 잡아 경고가 부풀려짐.

---

## 경고별 상세 검증

### #1 service_role 키 노출 — ❌ 오탐

**도구 주장**: `apps/web/src/env.ts`, `apps/worker/src/seed-*.ts`에서 service_role 키가 클라이언트 도달 경로에 사용됨.

**검증 결과 — 미노출 확정**:
- `apps/web/src/env.ts`는 `getPublicEnv()`(NEXT_PUBLIC만)와 `getServerEnv()`(service_role)를 **분리**. 비-`NEXT_PUBLIC` env는 Next.js가 클라 번들에 인라인하지 않음.
- service_role 클라이언트(`apps/web/src/lib/supabase/admin.ts`)는 **1행이 `import "server-only"`** + 🔴주석으로 유출 위험 명시. 클라 번들에 들어가면 빌드 에러로 차단.
- `browser.ts`(유일한 `"use client"` supabase)는 `getPublicEnv()`의 anon 키만 사용.
- `getServerEnv()` 호출처 = env.ts(정의)·admin.ts(server-only)뿐. admin.ts import처 = 전부 `server-only`/`use server` 파일.
- `apps/worker/src/seed-*.ts`는 백엔드 CLI 스크립트로 클라이언트 도달 불가. service_role 사용이 정상(설계 전제).

**결정적 검증 (프로덕션 빌드 후 클라 번들 grep)**:
```
grep -rl "service_role" apps/web/.next/static          → 0건 (역할 문자열 없음)
grep -roh "SUPABASE_SERVICE_ROLE_KEY...eyJ" .next/static → 0건 (변수명 옆 JWT값 인라인 없음)
```
→ 클라 번들에 **키 값 흔적 0**. (변수 *이름* 문자열 5건은 Zod 스키마 라벨일 뿐 — env 변수명은 비밀 아님.)

**조치**: 불필요. 키 회전(rotate)도 불필요(노출된 적 없음). (선택적 코스메틱: env.ts를 public/server 파일로 분리하면 변수명 문자열도 클라 번들에서 사라짐 — 값 유출이 아니므로 필수 아님.)

### #2 jobs 테이블 RLS 정책 없음 — ❌ 오탐

**도구 주장**: `jobs` 테이블이 RLS on + 0 policies인데 클라이언트로 분류된 코드에서 `.from('jobs')` 발견. 빈 배열 반환됨.

**검증 결과 — 의도된 설계**:
- `jobs`는 RLS on + 0 policies = **role(anon/authenticated) 접근 전면 차단**. 워커가 `createServiceClient(SERVICE_ROLE_KEY)`로만 우회 = 의도된 워커 전용 큐(CLAUDE.md: jobs 큐 = `FOR UPDATE SKIP LOCKED` 폴링).
- `.from('jobs')` 호출처 = `apps/worker/src/jobs/*`(queue.ts + 통합테스트)뿐. **apps/web(클라·서버 모두)에서 0건**.
- 도구가 워커를 클라로 오분류(step 0의 "서버 코드면 오탐" 케이스에 해당).

**조치**: 불필요. **정책 추가 금지**(큐가 role에 노출됨 = 틀린 처방). 도구 소음 제거가 필요하면 `jobs` ALTER TABLE 위에 `-- snapdeck:server-only` 주석 추가(선택).

### #3 package.json start 스크립트 없음 — ❌ 오탐

- `apps/web/package.json`: `dev/build/start/lint/typecheck/test/test:e2e` 모두 존재(`build: next build`, `start: next start`).
- Vercel은 Root Directory=`apps/web`로 배포(CLAUDE.md). 루트 package.json(워크스페이스)에 start 없는 건 모노레포 정상.

**조치**: 불필요.

### #4 localhost/127.0.0.1 하드코딩 — ❌ 대부분 오탐

- `apps/web/src/lib/seo/site.ts`: `process.env.NEXT_PUBLIC_SITE_URL` 우선, 미설정 시에만 `http://localhost:3000` 폴백. 프로덕션은 `NEXT_PUBLIC_SITE_URL` 필수 설정(CLAUDE.md Vercel 필수 4종) → 폴백 미사용.
- `playwright.config.ts`(테스트 서버), `packages/shared/src/seed.ts`·`scripts/seed-*.mjs`(시드), `next.config.ts`(dev/이미지) — 전부 테스트·시드·로컬 dev 용도.

**조치**: 불필요. (확인 권장: Vercel 프로덕션에 `NEXT_PUBLIC_SITE_URL`이 실제 도메인으로 설정돼 있는지 1회 점검.)

### #5 DB 백업 전략 없음 — ✅ 유효 (프로세스)

- Supabase 프로젝트. 대시보드 자동 백업은 존재(Free 7일 / Pro 일일 7~30일)하나, 프로젝트에 **백업 전략 문서·복구 테스트 기록이 없음**.
- **권장 조치**:
  1. `BACKUP.md` 작성: 사용 DB(Supabase), 자동백업 보존기간, 수동백업 명령(`supabase db dump > backup.sql`), 저장 위치, 복구 절차 1~2줄.
  2. **복구 테스트 1회**(dump를 별도 dev 프로젝트에 임포트해 데이터 안착 확인) — 가장 중요.

### #6 로딩/에러 상태 미처리 — ⚠️ 부분 유효 (저우선 UX)

- `CustomerKpiCards.tsx`, `CustomerTable.tsx` 등은 `"use client"` 컴포넌트. `CustomerTable`은 **로딩 스켈레톤 존재**, 에러 UI만 부재.
- 버그가 아닌 UX 폴리시: 클라 페치 실패 시 친절한 에러 메시지 + "다시 시도" 추가 권장(저우선).
- TanStack Query 전면 도입은 불필요(도구도 동의).

---

## 권장 조치 우선순위

| 우선 | 항목 | 비고 |
|---|---|---|
| 권장 | #5 BACKUP.md 작성 + 복구 테스트 1회 | 운영 안전(데이터 손실 방지) |
| 선택 | #6 클라 컴포넌트 에러 상태 보강 | UX 폴리시, 저위험 |
| 정리 | 유휴 워크트리 `.claude/worktrees/feat+release-order-rpc/` 제거 | 스캐너 중복 경고 원인 제거(브랜치는 origin 보존) |
| 불필요 | #1·#2·#3·#4 | 오탐 — 조치 없음 |

> 결론: 보안상 즉시 조치가 필요한 항목 없음. service_role 격리와 jobs 큐 RLS는 정상 설계. 유효 항목은 #5(백업 문서화)와 #6(에러 UX)뿐.
