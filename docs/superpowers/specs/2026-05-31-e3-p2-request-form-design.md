# E3 P2 설계 — 견적요청 폼 + submit_application RPC

- **이슈**: #4 (E3) · EPIC #1
- **날짜**: 2026-05-31
- **선행**: E3 P1(공개 카탈로그·상세, 같은 브랜치 `feat/e3-public-catalog` 완료), E1(`applications` 테이블·`next_application_seq_no`·BEFORE INSERT 트리거·anon INSERT 정책)
- **단일테넌트 / 권한=capability** (프로젝트 CLAUDE.md "아키텍처 전제" 참조)
- **상위 설계**: `2026-05-30-e3-public-catalog-design.md` §7 (P2 윤곽) — 본 문서가 이를 상세화한다.

---

## 1. 목표 · 범위

공개 장비 상세에서 고객(anon, 비로그인)이 **"이 장비로 견적 요청" → `/request` 폼 작성 → 실제 DB 저장 → 접수번호(REQ-…) 확인**까지 완주하는 쓰기 경로를 구현한다. 현 `jhtechsmart` `quote.html`의 **silent-fail 버그**(저장 안 됐는데 성공처럼 보임)를 제거하고, 저장 성공·실패를 항상 명시적으로 통지한다.

### Acceptance (이슈 #4 중 쓰기 경로)
- 제출 → DB `applications` 행 저장 확인, 성공 시 접수번호 표시
- 실패 시 사용자에게 명시적 에러 통지 (silent-fail 제거)
- 모바일 반응형 동작
- P1 상세의 CTA(`/request?equipment=[id]`)가 정상 동작 (라우트 존재)

### 비목표 (YAGNI)
- 첨부파일 업로드, 이메일 자동알림(워커 = 후속 에픽), reCAPTCHA/봇 방어, 고객용 요청 조회/추적, 카테고리 검색.

---

## 2. 결정 사항 (brainstorm 합의)

| 항목 | 결정 |
|---|---|
| 필드 범위 | 코어 6필드(`company·ceo·biz_no·phone·email·address`) + `요청사항` 자유입력 한 칸 + 선택장비 |
| 필수 입력 | 코어 6필드 **모두 필수**, `요청사항`은 선택 (`company`는 DB상 NOT NULL) |
| 제출 경로 | 클라이언트 RHF+zod → `"use server"` 서버액션이 zod 재검증 → 서버 anon 클라이언트 `supabase.rpc('submit_application')` → seq_no 반환 |
| 성공 UX | `/request/success?no=REQ-…` 로 **redirect**(새로고침·중복제출 방지) |

---

## 3. `submit_application()` RPC — 마이그레이션

신규 마이그레이션 1건 + 롤백 1건. 타임스탬프는 기존 마지막(`20260530120000`) 이후.

```
public.submit_application(payload jsonb) returns text
  language plpgsql
  security definer
  set search_path = ''
```

### 왜 RPC가 필요한가
anon은 `applications` INSERT는 가능(E-5 정책: `status='new' and assignee_id is null`)하지만 **SELECT 정책이 없어** `INSERT … RETURNING seq_no`가 막힌다. 접수번호를 고객에게 돌려주려면 RETURNING이 필요 → **SECURITY DEFINER 함수**는 함수 소유자(=테이블 소유자) 권한으로 실행되어 RLS를 우회하므로 RETURNING이 동작한다. 이것이 RPC를 두는 유일한 이유다.

### 동작
1. payload(jsonb)에서 코어 6필드를 텍스트로 추출(`payload->>'company'` 등). 누락 시 null.
2. `fields := coalesce(payload->'fields', '{}'::jsonb)` — `요청사항`·`선택장비(equipment_id·equipment_name)` 보관.
3. `status='new'`, `assignee_id=null`, `submitted_at=now()`를 **함수가 하드코딩 강제**(payload에 status/assignee가 있어도 무시).
4. `insert into public.applications (...) values (...) returning seq_no into v_seq;`
5. `return v_seq;`

INSERT는 기존 **`applications_server_fields` BEFORE INSERT 트리거를 그대로 통과** → `seq_no`(서버 채번)·`created_at`(now)은 트리거가 강제(이중 안전). 함수 내 RETURNING은 트리거 적용 후 최종 seq_no를 돌려준다.

### SQL 방어검증 (2차 — 1차는 zod)
- `company`가 null/공백 → `raise exception '회사명은 필수입니다'`.
- 각 text 필드 길이 캡(예: 코어 ≤ 200자, `요청사항` ≤ 2000자) 초과 시 raise — anon 폭주/저장소 남용 방지.
- `fields` jsonb 직렬화 크기 캡(예: ≤ 8KB) 초과 시 raise.

### 권한
```sql
revoke all on function public.submit_application(jsonb) from public;
grant execute on function public.submit_application(jsonb) to anon, authenticated;
```

### 롤백
`drop function if exists public.submit_application(jsonb);` (단일 의도 1건).

---

## 4. zod 스키마 · payload 빌더 (순수, 테스트 대상)

`apps/web/src/lib/applications/schema.ts` (equipment 스키마 위치 패턴 답습):

- `requestFormSchema` — 필수: `company·ceo·biz_no·phone·email·address` 모두 비어있지 않음 + 형식
  - `biz_no`: 사업자등록번호 10자리(하이픈 허용 후 정규화). `phone`: 숫자·하이픈. `email`: `.email()`.
  - 선택: `requirements`(string, 최대 2000), `equipment_id`(uuid).
- `RequestFormInput` 타입 export.
- `buildSubmitPayload(input): SubmitPayload` — 폼입력 → `{ company, ceo, biz_no, phone, email, address, fields: { requirements?, equipment_id?, equipment_name? } }`. (`equipment_name`은 서버액션이 조회해 합칠 수도 있음 — §5 참조.)
- `seqNoSchema` — `/^REQ-\d{8}-\d{5,}$/` (RPC 응답 검증용, 외부응답 신뢰 금지 원칙).

스키마는 클라이언트(RHF resolver)와 서버액션(재검증)이 **동일 인스턴스 공유**.

---

## 5. 제출 경로 (서버액션 → RPC)

- `app/request/_components/RequestForm.tsx` (`"use client"`) — RHF + `zodResolver(requestFormSchema)`. 필드별 인라인 에러. `onSubmit(data)` → 서버액션 `submitRequest(data)` await. 서버액션이 `{ error }`를 돌려주면 폼 상단 에러 표시; 성공 시 서버액션이 redirect하므로 클라는 자동 이동. 제출 중 버튼 `disabled`(중복제출 방지).
- `app/request/actions.ts` (`"use server"`):
  1. `requestFormSchema.safeParse(input)` 재검증 — 실패 시 `{ error }`.
  2. `equipment_id` 있으면 `getPublicEquipment(id)`로 장비명 조회(없으면 무시) → payload `fields.equipment_name` 합침.
  3. `createSupabaseServerClient()`(세션 없으면 anon) `.rpc('submit_application', { payload })`.
  4. `error` 또는 `seqNoSchema.safeParse(data)` 실패 → `{ error: '제출에 실패했습니다. 잠시 후 다시 시도해주세요.' }`.
  5. 성공 → `redirect('/request/success?no=' + encodeURIComponent(seqNo))`.

> redirect()는 서버액션에서 throw로 동작하며 Next가 클라 네비게이션 처리. RHF onSubmit에서 호출해도 정상.

---

## 6. 라우트 · IA

모든 라우트 anon·무인증. `proxy.ts`는 `/admin`만 게이트하므로 **변경 불필요**.

| 경로 | 파일 | 역할 |
|---|---|---|
| `/request` | `app/request/page.tsx` (server) | `searchParams`(Next 16 Promise) `equipment` 있으면 `getPublicEquipment`로 장비명 조회·표시·hidden `equipment_id` 주입. 없거나 inactive면 무시(일반 문의로 동작). `<RequestForm>` 렌더 |
| `/request/success` | `app/request/success/page.tsx` (server) | `searchParams.no` 접수번호 카드 + "카탈로그로" 링크. `no` 없으면 `/equipment` redirect |

- **CTA 배선**: P1 상세(`app/equipment/[id]/page.tsx`)의 `Link href="/request?equipment=${eq.id}"`는 이미 존재 → **라우트 생성만으로 링크 정상화**, 코드 변경 없음.
- `/request`는 `?equipment` 없이도 동작(일반 견적 문의 진입점).

---

## 7. 컴포넌트 · DESIGN.md 정합

- `RequestForm.tsx` — 표현+RHF만, 비즈로직 없음(Hard Rule 5). 라벨·인라인 에러·제출버튼. 선택장비 표시(읽기전용 칩). 입력 그리드 반응형(모바일 1열 / ≥sm 2열).
- 식별자·사업자번호·전화·접수번호 = `font-mono` tabular(DESIGN.md 북극성). 에러색 = `text-danger`. login 폼 토큰 답습.
- 성공 페이지: 접수번호 강조(mono) + 안내문구.
- **UI-SPEC.md 갱신**: E3 P1 패턴대로 `/request`·`/request/success` 화면계약(필드·5-state·반응형·DESIGN.md 토큰) 추가.

---

## 8. 엣지 · 에러

- 잘못된/inactive `equipment` id → preselection 없이 폼 정상 표시(에러 아님).
- RPC 실패(네트워크·DB·검증) → 폼 상단 명시적 에러. **silent-fail 제거**.
- `/request/success` 직접진입(no 없음) → `/equipment` redirect.
- 중복제출 → 제출 중 버튼 비활성 + 성공 redirect로 폼 폐기.
- 공개 그룹 `error.tsx`는 `/request` 트리에도 적용되도록 필요 시 `app/request/error.tsx` 추가(서버컴포넌트 조회 실패 대비).

---

## 9. 테스트 (CLAUDE.md TDD — 테스트 먼저)

- **단위(Vitest, web)**: ① `requestFormSchema` — 유효 통과·코어 누락 실패·biz_no/phone/email 형식오류 실패·`requirements`/`equipment_id` 선택 허용. ② `buildSubmitPayload` — `fields` jsonb 형태. ③ `seqNoSchema` — REQ- 정규식 매칭/거부.
- **DB-test(`packages/db-tests`)**: `submit_application` —
  - anon EXECUTE → `REQ-…` 반환, 행 저장(`status='new'`·`assignee_id` null·`submitted_at` not null·`fields` jsonb 보관).
  - `company` 누락/공백 → raise.
  - payload의 `status`/`assignee_id` 무시(강제 new·null).
  - anon은 여전히 `applications` 직접 SELECT 0건(RPC만 read-back 경로).
  - 다회 호출 seq_no 유일.
  - `grant execute to anon` 확인(권한 없는 호출 거부 회귀).
- **E2E(Playwright)**: anon `/equipment`→상세→CTA→`/request?equipment=`(장비명 표시)→폼 작성→제출→`/request/success` REQ- 표시. 빈/잘못된 폼 제출 시 인라인 에러·미이동. E3 P1 E2E 환경패턴(로컬 Supabase 강제·`describe.serial`·afterAll 정리) 재사용.

---

## 10. 산출물 · 게이트

- 마이그레이션 1 + 롤백 1, zod 스키마 + 빌더, 서버액션, `/request`·`/request/success` 페이지 + `RequestForm`, UI-SPEC.md 갱신, 위 3종 테스트.
- 머지: **P1 + P2 한 PR로 E3 머지**(메모리 계획). DB 반영은 머지 후 `supabase db push`.
- 게이트: vitest(웹+db-tests) · tsc · lint · build 전부 GREEN, `as any` 0.
