# E3 설계 — 공개 장비 카탈로그·상세 + 견적요청 폼

- **이슈**: #4 (E3) · EPIC #1
- **날짜**: 2026-05-30
- **선행**: E1(스키마·`equipment_public` 뷰·`applications` anon INSERT·`next_application_seq_no`), E2(장비·옵션 admin·사진·youtube_url) — 둘 다 머지·배포 완료
- **단일테넌트 / 권한=capability** (프로젝트 CLAUDE.md "아키텍처 전제" 참조)

---

## 1. 목표 · 범위

고객(anon, 비로그인)이 **공개 장비 카탈로그를 보고 → 장비별 상세(사진·스펙·YouTube)를 확인하고 → 견적을 요청**하는 흐름을 구현한다. 현 `jhtechsmart`의 `quote.html` silent-fail 버그(저장 안 됐는데 성공처럼 보임)를 제거하고 실제 DB 저장을 보장한다.

데이터는 항상 **`equipment_public` 뷰**(active만, 가격·옵션 비노출)에서만 읽는다. 원본 `equipment` 테이블은 anon 정책이 없어 자동 차단된다.

### Acceptance (이슈 #4)
- 공개 장비 카탈로그: active 장비 목록 + 장비별 상세 페이지(사진·스펙·YouTube), 비로그인 접근 가능
- 상세 페이지에 가격·옵션 미노출(`equipment_public` 뷰 경유)
- inactive 장비는 공개 목록·상세에서 비노출
- 제출 → DB 저장 확인, 실패 시 사용자 통지
- 모바일 반응형 동작

---

## 2. 분해 · 머지 전략

E2 선례(P1/P2/P3 순차 sub-plan)대로 **2개 sub-plan**으로 점진 진행한다.

| Sub-plan | 범위 | 위험 |
|---|---|---|
| **P1 (읽기전용)** | `/` 미니멀+카탈로그 버튼 · `/equipment` 카탈로그 목록 · `/equipment/[id]` 상세 · SEO(generateMetadata·sitemap·robots) | 낮음 |
| **P2 (쓰기경로)** | `/request` 견적요청 폼 · `submit_application()` SECURITY DEFINER RPC · silent-fail 제거 · 상세→폼 CTA 배선 | 중간 |

**머지**: 두 sub-plan 완료 후 **하나의 PR로 E3 머지**(E2가 P1~P3을 PR #15 하나로 머지한 것과 동일). 이렇게 하면 P1 상세 페이지의 "견적 요청" CTA가 `/request`(P2)를 가리켜도 머지 시점엔 둘 다 존재하므로 깨진 링크가 없다.

이 문서는 **P1을 상세 설계**하고, P2는 §7에 윤곽만 잡는다(P2 착수 시 별도 brainstorm/plan).

---

## 3. P1 — 라우트 · IA

모든 라우트는 anon·무인증 공개. App Router 파일 컨벤션 사용.

| 경로 | 파일 | 역할 |
|---|---|---|
| `/` | `app/page.tsx` (기존 보일러플 교체) | 미니멀 페이지 — 회사명 한 줄 + **"카탈로그 보기" 버튼 → `/equipment`**. 버튼은 재사용 컴포넌트(추후 랜딩 확장 시 활용). |
| `/equipment` | `app/equipment/page.tsx` | 카탈로그 목록 — 서버컴포넌트. `equipment_public` 전체 SELECT(active만, 뷰가 보장). 반응형 그리드, 카드 = 대표사진(`photos[0]`)+name+model+category. **카테고리 필터는 추후(이번 범위 제외).** |
| `/equipment/[id]` | `app/equipment/[id]/page.tsx` | 상세 — 서버컴포넌트. `equipment_public` single SELECT(id). 없거나 inactive면 `notFound()`. 사진 갤러리+스펙 테이블+YouTube 임베드+"이 장비로 견적 요청" CTA(`→/request?equipment=[id]`, **배선은 P2**). |
| `sitemap.xml` | `app/sitemap.ts` | `/`, `/equipment`, 각 active `/equipment/[id]` 동적 생성(`equipment_public` 읽기). |
| `robots.txt` | `app/robots.ts` | allow all + sitemap 포인터. |

> **참고**: admin 라우트(`/admin/...`)는 E2에서 이미 별도 트리. 공개 라우트는 루트 레벨에 둔다. 인증 가드(`proxy.ts`)는 공개 경로를 통과시켜야 하므로 matcher 확인 필요(공개 경로 화이트리스트 또는 admin-only 매칭).

---

## 4. P1 — 데이터 접근 · 렌더

- **동적 SSR**: `equipment_public` 읽기가 요청 시점 데이터라 매 요청 최신 렌더. admin이 장비를 수정하면 즉시 반영. `revalidate`/ISR 불필요(B2B 저트래픽, 신선도 우선).
- **읽기 클라이언트**: 기존 `apps/web/src/lib/supabase/server.ts`의 SSR 서버 클라이언트 재사용. 세션 쿠키 없으면 anon role로 동작 → `equipment_public` 뷰(anon SELECT grant 있음) 읽기 OK. 원본 `equipment`는 anon 정책 없어 차단.
- **이미지**: `publicImageUrl`(`apps/web/src/lib/equipment/images.ts`) 재사용. `equipment-images` 버킷은 public. next/image `remotePatterns`에 `*.supabase.co` 이미 허용됨. OG 이미지는 절대 URL 필요(메타데이터 빌더에서 origin 결합).
- **스펙 정규화**: `parseSpecs`(`packages/shared/src/specs.ts`)로 jsonb→`Spec[]`. 레거시 `{}`·null·비정형 방어.
- **메타데이터**: 상세 `generateMetadata` — title `${name} | (주)재현테크`, description(category·대표 스펙 요약), openGraph.images = 대표사진 절대 URL. 루트 `app/layout.tsx`에 title template `%s | (주)재현테크` 기본값.

---

## 5. P1 — 컴포넌트 (presentational, 비즈로직 없음)

CLAUDE.md Hard Rule 5(컴포넌트에 비즈로직 금지)대로 데이터 조회는 서버컴포넌트/서비스, 표현은 분리.

- `app/_components/CatalogButton.tsx` — 재사용 "카탈로그 보기" 버튼(`/`와 추후 랜딩에서 공유).
- `app/equipment/_components/EquipmentCard.tsx` — 목록 카드.
- `app/equipment/[id]/_components/PublicGallery.tsx` — 상세 사진 갤러리(클라 컴포넌트, 썸네일↔메인 전환). 대표=`photos[0]`.
- `app/equipment/[id]/_components/SpecTable.tsx` — 스펙 항목·값 테이블(mono tabular).
- `app/equipment/[id]/_components/YoutubeEmbed.tsx` — `youtube_url`→embed. id 추출 순수함수 분리(테스트 대상).

**DESIGN.md 정합**: 북극성 "복잡한 것을 한눈에". 식별자·model = mono tabular. 카탈로그는 상태 스파인 불필요(차분한 정보 표시). 사진 0장/스펙 0행은 DESIGN.md placeholder 토큰.

**UI-SPEC.md 갱신**: E2 패턴대로 공개 카탈로그·상세 화면계약(반응형 브레이크포인트·5-state·DESIGN.md 토큰)을 UI-SPEC.md에 추가.

---

## 6. P1 — 엣지 · 에러 · 테스트

### 엣지·에러
- 없는 id / inactive → `notFound()`(`equipment_public`이 active만 노출하므로 inactive는 자동으로 0건).
- 사진 0장 → placeholder.
- `youtube_url` null → 임베드 섹션 생략.
- `specs` 빈 배열 → "사양 정보 없음".
- 공개 그룹 `loading.tsx` / `error.tsx`.

### 테스트 (CLAUDE.md TDD — 테스트 먼저)
- **단위(Vitest)**: ① metadata 빌더(title/description/OG 절대 URL), ② sitemap URL 생성(active 목록→경로), ③ `youtube_url`→embed id 추출(다양한 URL 형식·null), ④ 사진/스펙 빈값 분기.
- **RLS 통합(db-tests)**: anon이 `equipment_public`에서 active만 보고 inactive 0건, 원본 `equipment` anon SELECT 차단. (E1에 일부 존재 가능 → 재확인·보강.)
- **E2E(Playwright)**: anon으로 `/equipment` 진입 → 카드 클릭 → 상세(사진·스펙) 표시 → inactive 미노출. `describe.serial`, 로컬 시드. E2 E2E 환경 패턴(로컬 Supabase 강제·afterAll 정리) 재사용.

---

## 7. P2 윤곽 (다음 sub-plan — 착수 시 별도 plan)

- **`submit_application(payload jsonb) returns text`** — SECURITY DEFINER, `search_path=''`, anon EXECUTE grant. 서버에서 입력 검증(company 필수, 타입·길이) 후 `status='new'`·`assignee_id=null` 강제 INSERT, `seq_no` 반환. anon SELECT 금지 우회(INSERT...RETURNING이 SELECT 정책 없어 막히는 문제 해결). 마이그레이션 1건 + 롤백 + db-test.
- **`/request` 폼** — RHF+zod. 컬럼(company·ceo·biz_no·phone·email·address) + 추가입력은 `fields jsonb`. 장비 사전선택(`?equipment=[id]`, `equipment_public`에서 이름 표시). 성공 시 **접수번호(REQ-...) 표시**, 실패 시 명시적 에러 통지(silent-fail 제거).
- **상세 CTA 배선** — P1에서 만든 "견적 요청" 버튼을 `/request?equipment=[id]`로 연결.

---

## 8. 비목표 (YAGNI)
- 카탈로그 카테고리 필터·검색(추후).
- 정식 랜딩 페이지(`/`는 미니멀 + 카탈로그 버튼만, 랜딩은 후속 이슈).
- ISR/정적생성(동적 SSR로 충분).
- 가격·옵션 공개(설계상 영구 비노출).
