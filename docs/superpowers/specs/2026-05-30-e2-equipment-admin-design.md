# E2 — 장비·옵션 관리 admin 설계 (design doc)

- 날짜: 2026-05-30
- 브랜치: `feat/e2-equipment-admin`
- 입력: GitHub 이슈 #3(E2 스펙) · `UI-SPEC.md`(화면 계약) · `DESIGN.md`(시스템 토큰)
- 산출: 이 문서 → writing-plans → TDD 구현

## 목표

영업/관리자가 장비 카탈로그를 웹에서 CRUD한다. E2는 웹의 첫 인증 surface라 Supabase SSR 인증 토대(로그인·세션·라우트 가드)를 함께 깐다(E4 콘솔 재사용). E2 데이터가 E3 공개 카탈로그(`equipment_public`)·E5 견적을 채운다.

## 범위 (이슈 #3)

- (A) 웹 인증 토대: `@supabase/ssr` 쿠키 클라이언트, 미들웨어 세션 갱신 + `/admin/*` 가드, `/login`(이메일/비번), 로그아웃.
- (B) 장비 CRUD UI(`/admin/equipment`): 목록 + 폼(생성/수정) + 이미지 업로더 + specs/옵션 에디터.
- (C) shared `Equipment.specs` 타입 구체화 + seed.ts `minProdLength=8` 이월.

비범위: 공개 `/equipment/[id]`(E3) · 운영 데이터 이관(v1.1) · 사양 카테고리 템플릿(#12) · 2FA(#11) · 다크모드(우선순위 낮음).

## 확정 결정 (브레인스토밍 2026-05-30)

| # | 결정 | 근거 |
|---|---|---|
| D-A | CRUD 쓰기 = **Server Actions** (`server.ts` 사용자 세션) | Next 16 idiom. RLS가 equipment.manage 강제 + 앱 레이어 명시 체크 2차 |
| D-B | 이미지 = **브라우저 직접 → Storage**(사용자 JWT) | E1이 `equipment-images` insert/update/delete를 `has_permission('equipment.manage')`로 게이트(20260529150007). 파일별 progress·partial 상태(UI-SPEC) 가능. 신규 마이그레이션 0 |
| D-C | 폼 = **react-hook-form + useFieldArray** + zod | 동적 행(specs/옵션/이미지 순서) 상태관리. 신규 deps 2개 수용 |
| D-D | 고아 이미지 = **베스트-에포트 정리** | 저장 실패·취소 시 클라가 방금 업로드분 즉시 삭제. 전용 sweep은 운영 필요 시 후속 |
| D-E | 디자인 토큰 = **globals.css `@theme`에 1회 확립**(DESIGN.md) | E2가 첫 실 UI. 전 phase 재사용. Tailwind 4 CSS-first |
| (UI-SPEC) | status 2색(운영중 green/비활성 muted) · 목록 전량 로드 · 순서=드래그+↑↓ | UI-SPEC.md 확정 |

## 아키텍처

### 모듈 경계 / 라우트

```
apps/web/src/
  lib/supabase/server.ts    @supabase/ssr createServerClient (쿠키, RLS=세션)
  lib/supabase/browser.ts   @supabase/ssr createBrowserClient (이미지 직접 업로드)
  lib/auth/guard.ts         requireEquipmentManage(): 세션+권한 서버 검증 (단위 테스트)
  middleware.ts             세션 갱신 + /admin/* 미인증 → /login
  app/login/page.tsx + actions.ts        signInWithPassword / signOut
  app/admin/layout.tsx                    콘솔 셸(사이드바196+툴바) + 가드
  app/admin/equipment/page.tsx            목록(서버 컴포넌트 fetch)
  app/admin/equipment/new|[id]/edit       폼
  app/admin/equipment/actions.ts          create/update/deleteEquipment (Server Actions)
  components/equipment/{SpecEditor,ImageUploader,OptionEditor}.tsx
```

- `@supabase/ssr` 클라이언트는 apps/web 전용(Next 종속) — shared에 두지 않음. shared의 anon/service 팩토리와 역할 분리.
- ⚠️ Next 16 breaking changes: 코드 전 `node_modules/next/dist/docs/01-app`의 middleware·server-actions·async `cookies()` 가이드 확인(`apps/web/AGENTS.md`).

### 데이터 흐름

- **읽기**: 서버 컴포넌트 + `server.ts` → RLS 강제(+앱 명시 체크). 전량 로드, 클라 검색·필터.
- **쓰기**: Server Actions, `server.ts`. equipment + equipment_option 서버 일괄 처리.
- **이미지 생성 흐름**:
  1. 폼 진입 시 `id = crypto.randomUUID()` 확정
  2. 이미지 추가 → `browser.ts`로 `equipment/{id}/{uuid}.{ext}` 직접 업로드(RLS) → 경로를 폼 `photos[]`에 누적, 파일별 progress
  3. [저장] → Server Action이 equipment(`photos[]` 포함) + options insert
  4. 실패 → 클라가 방금 업로드분 best-effort 삭제
- **삭제**: 이미지 ✕ → Storage delete + 폼 상태 제거. 장비 삭제 → row delete 후 `equipment/{id}/` 정리.

### 컴포넌트 (단일 책임)

| 컴포넌트 | 책임 | 의존 |
|---|---|---|
| `admin/layout` 셸 | 사이드바·툴바·가드 | guard.ts |
| `EquipmentTable` | 목록·5-state·검색/필터·카드뷰 | 순수(props) |
| `EquipmentForm` | RHF form 조립·제출 | RHF, actions |
| `SpecEditor` | `{label,value}[]` useFieldArray·순서(드래그+↑↓) | RHF control |
| `OptionEditor` | included/extra 행 useFieldArray | RHF control |
| `ImageUploader` | 직접 업로드·progress·순서·대표·삭제 | browser.ts |

각 에디터는 RHF `control`만 받는 격리 unit → 독립 테스트.

### 디자인 토큰 (Tailwind 4 ← DESIGN.md)

globals.css `@theme`: Pretendard(jsdelivr)+JetBrains Mono(Google) 로드, accent `#155E75`, 중립 스케일, status(운영중 green `#16A34A`/비활성 muted `#64748B`), 4px 간격, radius sm4/md8/lg12. 컴포넌트는 토큰만 참조(하드코딩 색 금지).

## 5-state / 에러 처리

UI-SPEC.md의 화면별 5-state(loading/empty/error/populated/partial) 그대로 구현. 검증은 zod 공유 스키마(클라+서버) → inline 필드 에러. 권한 실패: 미인증→/login(미들웨어), 권한 없음→403 안내.

## 테스트 전략 (TDD)

| 레이어 | 대상 | 도구 |
|---|---|---|
| Unit | specs 직렬화(`{label,value}[]`↔jsonb), 이미지 경로 빌더, `requireEquipmentManage` | Vitest |
| Integration/RLS | equipment.manage 유무별 CRUD, Storage 업로드 차단 | db-tests(E1 하니스, pg set role+jwt) |
| E2E | 로그인→생성+사진2장→목록 노출→inactive 토글→`equipment_public` 제외 | Playwright(첫 도입) |

**TDD 순서:** ① shared types.specs+직렬화 단위 → ② auth 토대(guard 단위+미들웨어) → ③ 목록 읽기 → ④ 폼 CRUD(server actions+RLS) → ⑤ 업로더 → ⑥ 옵션/specs 에디터 → ⑦ E2E 통합.

## shared 변경 & 신규 의존성

- `packages/shared/src/types.ts`: `Equipment.specs` → `{ label: string; value: string }[]`, `EquipmentPublic.specs` 동일. 직렬화 헬퍼 추가.
- `apps/web` deps: `@supabase/ssr`, `@supabase/supabase-js`, `react-hook-form`, `@hookform/resolvers` (zod 기존).
- seed.ts `minProdLength=8` + stale 테스트 주석 정리 동봉.

## Acceptance Criteria (이슈 #3)

1. 미인증 → `/admin/equipment` 접근 시 `/login` 리다이렉트.
2. `equipment.manage` 없는 로그인 사용자 → 403(목록 미노출).
3. 관리자: 장비 생성(name+가격+specs 2행+옵션 1행+사진 2장) → 목록에 대표사진과 노출.
4. 사진 다중 업로드(jpg/png/webp, >5MB 거부), 드래그 순서변경 → `photos[]` 반영, 삭제 시 Storage·DB 동기.
5. status=inactive 토글 → `equipment_public`에서 제외(가격·옵션 비노출).
6. specs 항목+값 편집 → jsonb `[{label,value}]` 저장, 순서 보존.
7. equipment_option(included/extra) 추가·수정·삭제 반영.
8. lint+typecheck+build+test 통과. service_role 키 클라 번들 미포함.

## 리스크 / 주의

- Next 16 API 변경 → docs 우선 확인(미들웨어 matcher, async cookies, server actions 바디 제한).
- service_role 키 클라 번들 유입 금지(env 경계: `NEXT_PUBLIC_` 접두사 검증). E2E 빌드 산출물에서 키 검색 단언.
- 고아 이미지 best-effort라 드물게 잔존 가능 — 운영 모니터링 시 sweep 도입 신호.
- E2E는 첫 도입 → 로컬 Supabase + 시드 관리자 의존. CI 통합은 별도 점검.

## Rollback

앱 코드 변경(마이그레이션 없음 — specs는 jsonb라 스키마 불변). 문제 시 PR revert. 업로드 실패 시 best-effort 정리 + 운영 시 고아 sweep 스크립트.
