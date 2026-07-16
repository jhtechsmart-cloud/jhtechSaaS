# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

(주)재현테크 SaaS 신규 프로젝트. `jhtechsmart`(정적 HTML + GAS + Google Sheets 스택)의 후속 또는 재구성 버전으로, Supabase 기반 아키텍처를 전제로 한다.

관련 프로젝트:
- `../jhtechsmart` — 현 운영 시스템 (건드리지 않음)
- `../jhtechsmart-dev` — Supabase 마이그레이션 테스트 환경
- `../migration-plan.md` — 마이그레이션 전체 계획

## 커밋 컨벤션

한국어 Conventional Commits 스타일:
- `feat:` / `fix:` / `chore:` / `docs:` / `config:` 접두사
- 예: `feat: 신청 목록 자동 갱신 추가`

## 작업 원칙

- 코드·에러·DB 설정에 근거 없이 추측으로 수정하거나 응답하지 않는다.
- 이 프로젝트는 초기 단계 — 아키텍처 결정 전에 사용자에게 확인한다.
- **이미지(PNG 등)를 `cat`·`grep`·`head`·`tail`·`xargs`·`find … | xargs cat` 등으로 텍스트처럼 읽지 않는다.** PNG 원시 바이트(외톨이 high surrogate)가 도구 출력에 섞여 컨텍스트에 들어가면 다음 API 요청 본문이 무효 JSON이 돼 `400 invalid high surrogate in string`으로 대화 전체가 막힌다. 특히 `.gstack/{qa,canary}-reports/screenshots/`의 스크린샷이 위험. 이미지 확인은 **반드시 Read 도구**(이미지로 안전 처리)로. (이 머신엔 `.claude/hooks/block-image-bytes.sh` PreToolUse 가드가 차단하지만, 등록이 머신별 `settings.local.json`이라 **다른 머신엔 가드가 없으니** 이 규칙을 스스로 지킬 것. 이미 에러 난 세션은 `/clear`로만 복구.)

## Design System

UI·시각 결정 전에 항상 `DESIGN.md`를 먼저 읽는다. 폰트·색·간격·레이아웃·미학 방향이 거기 정의돼 있다.
사용자 명시 승인 없이 벗어나지 않는다. QA 시 DESIGN.md와 어긋나는 코드를 플래그한다.
북극성: "복잡한 것을 한눈에"(명료함). 상태 = 색 스파인, 숫자·식별자 = mono tabular.


## 응답 스타일 (사용자 맞춤)

- 나는 vibe-coding 개발자다. 실행은 강하지만 아키텍처·전문용어는 약하다.
- 영어 약어/DB 전문용어/패턴 이름을 쓸 때는, 처음 등장하는 곳에서
  반드시 괄호로 쉬운 우리말 풀이를 붙여라.
  예) "RLS(행 단위 접근 규칙)", "diff-upsert(바뀐 것만 골라 저장)"
- 계획·설계 문서를 줄 때는 맨 위에 "한 문장 요약"과
  "이게 왜 필요한지"를 비전문가도 알게 먼저 적어라.
- 자연스러운 한국어로 써라. 영어 직역 말투(예: "~을 가진다", "~되어진다") 금지.
- 표를 쓸 땐 '용어 → 쉬운 말 → 예시' 컬럼을 기본으로 고려하라.
- 어려운 결정을 설명할 땐 비유나 예시를 하나씩 곁들여라.


## 아키텍처 전제 (글로벌 CLAUDE.md 일부 override)

이 프로젝트는 **단일 테넌트(jhtech 전용)**다. 글로벌의 멀티테넌트 규칙을 아래로 대체한다:
- 글로벌 "모든 도메인 테이블 `tenant_id NOT NULL` 필수 / `tenant_id` 기반 RLS만" → **적용 안 함** (단일테넌트라 tenant_id 없음). 사용자 결정: "bpk는 항목이 달라 같이 못 담음".
- 권한 = **capability**: `profiles.permissions text[]` + 코드 permission registry + `has_permission()`(SECURITY DEFINER, `search_path=''`, 정책은 `(select has_permission(...))` InitPlan 래핑) 기반 RLS.
- row scope = `assignee_id = auth.uid() OR has_permission('applications.view_all')` (명문화 안 하면 RLS가 "로그인=전체열람"이 됨).
- service_role 서버/워커 전용은 글로벌 그대로. RLS는 여전히 모든 도메인 테이블 필수.
- 아키텍처 B: Next.js(Vercel) + Supabase(DB/Auth/Storage) + Railway 워커(통합 PDF·메일 = `jobs` 큐 테이블 + `FOR UPDATE SKIP LOCKED` 폴링, webhook/Realtime 회피).
- **견적서 PDF = 워커 Puppeteer HTML→PDF**(`apps/worker/src/jobs/quote-html.ts renderQuoteHtml`로 HTML 조립 → `puppeteer-core`로 변환, base64 인라인 자산). 크롬 실행은 `browser.ts`가 환경 분기 = Railway(Linux) `@sparticuz/chromium` · macOS(로컬) `channel:"chrome"`. ⚠️ `puppeteer`(번들 크롬) 금지 — Railway 배포 실패 + 전이의존성 zod@3가 web RHF typecheck 깸(pnpm `overrides:zod` 핀). 시각 검증 = tsx 하니스(`_render-sample.ts`) 렌더 → **Read 도구로 PDF 대조**(PNG/PDF를 cat/grep 금지). 화면·PDF 공용 로직(금액 한글표기·공급자·장비명매칭)은 `packages/shared`. [E5 확립]
- **견적서 PDF 양식·자산 [E8 재구성]**: 양식 = 상단헤더(회색띠 배경 + 좌상단 회사로고 + 큰 모델명 텍스트) + 본문(공급자표·합계·품목·사양·특기) + 하단 좌(모델명 로고)·우(장비 사진). **고정 자산**(A4배경 `quote-bg.jpg`·회사로고 `company-logo.png`·상단띠 `top-banner.png`·폰트)은 워커 번들(`apps/worker/assets/`, `assets.ts`가 base64 1회 로드 캐시). **장비별 자산**은 `equipment.quote_device_name`(좌하단 모델명 로고)·`quote_device_image`(우하단 장비 사진), 경로 정규식 `equipment/{uuid}/device-(name|image).{ext}`(DB CHECK + web Zod 동시). ⚠️ **PDF 폰트는 번들 @font-face base64 임베드 필수** — Railway(Linux) 크롬엔 시스템폰트가 0이라 미임베드 시 서버 발행본만 폰트가 깨진다: 한글·본문 = `NotoSansKR`, 영문 제목 = `Arimo Bold Italic`(Arial 메트릭 호환 오픈폰트, Arial은 MS 독점이라 번들 불가). 한글 모델명은 `font-family:'ModelBI','KR',…` 폴백(Arimo는 라틴 전용 → 한글은 KR로). 사양 항목 多 장비는 그룹 내 `.spec-items` 2열 grid로 1페이지 유지(`.specs` 자체 grid는 spec-group 단위라 그룹 1개면 1열로 길어짐).
- **좌상단 회사로고 = 장비 대분류(프린터/커팅기)별 분기** [E8]: 회사로고는 더 이상 단일 고정이 아니라 장비 종류로 갈린다. `equipment_category.quote_logo_kind`(`'cutter'`|`'printer'`|null, **대분류에만 — CHECK가 `parent_id is null` 강제**)를 관리자가 `/admin/categories` 대분류 행 '견적 로고' 드롭다운으로 1회 설정. 워커는 견적 장비의 `category_id`로 대분류 루트를 거슬러(`resolveLogoKind` 순수함수, 소분류면 부모 대분류 값) `quote_logo_kind`를 읽어 좌상단 로고를 고른다: cutter→`company-logo-cutter.png`·printer→`company-logo-printer.png`·미설정→`company-logo.png`(기존 동작 폴백). 로고 3종 모두 워커 번들 고정자산(`assets.ts` base64 캐시). ⚠️ 기존 `company-logo.png`는 커팅기 로고와 동일 바이트(과거 전 견적이 커팅기 로고였음) → **각 대분류에 로고 종류를 설정해야** 프린터 견적에 프린터 로고가 찍힌다. 시각검증 = `_render-logo-check.ts`로 2종 렌더 → Read 대조.
- **견적 PDF 장비정보(사양·로고·이미지) = 견적에 저장된 `items[].equipmentId` 기준 조회** [E8]: 견적 작성/수정 시 선택 장비 id를 `items` jsonb에 보존(직접입력 줄은 미포함). ⚠️ Zod `z.object`는 미정의 키를 strip → `equipmentId` 보존하려면 shared `QuoteLineSchema`·web `QuoteRow`에 명시 필수. 워커 조회 우선순위 = ①견적 장비id ②의뢰 신청장비(`application.equipment_id`) ③메인품목 이름매칭(구 견적 하위호환). 미보존이면 의뢰 신청장비로 폴백 → 견적에서 장비 바꿔도 사양/로고가 안 따라오는 버그.
- **견적 화면은 부가세 미표시 = 합계를 공급가(VAT 별도)로 통일** [E8]: 견적 상세·작성·수정·버전이력의 합계는 `total`(세포함) 아니라 `supply_price`(공급가). 'VAT 별도' 안내 문구만 유지(부가세는 별도 안내로 갈음). 계산 엔진·RPC 저장(tax/total)은 그대로, 화면 표시만.
- **견적 삭제 = 관리자(`users.manage`) 전용 + storage PDF 동반 삭제** [E8]: `deleteQuoteAction`(버전 1개+그 PDF)·`deleteAllQuotesForApplicationAction`(의뢰 전 버전+전 PDF). ⚠️ DB 행만 지우면 `quote-pdfs` 버킷에 PDF 고아가 남으므로 `storage.from('quote-pdfs').remove([pdf_url])` 동반 필수.
- **견적 메일 발송 = 워커 하이웍스 Office Token REST [E6]**: 발행 견적서를 영업담당자 명의로 고객 메일 발송 + 담당자 보낸편지함 기록. 인증 = **Office Token**(`오피스 관리`서 self-service 발급, OAuth/AccessToken은 deprecated·메일 미지원). 엔드포인트 `POST api.hiworks.com/office/v2/webmail/sendMail`(form-data·`Authorization: Bearer {office_token}`·`user_id`=발송자·`content`=본문·`save_sent_mail=Y`=보낸편지함 적재·응답 `code=SUC`). 한도 오피스당 1000건/일. **토큰 = Railway 워커 env `HIWORKS_OFFICE_TOKEN`**(발송 코드가 워커서 돌고, 하이웍스 허용 IP가 **워커 고정 egress IP만** 받아 발송=워커 경유 강제. 시크릿이라 코드 아닌 env. Vercel 아님). 미설정 시 `FakeMailSender`(실발송 안 함 → 토큰 전엔 안전). 흐름 = [견적상세 '메일 발송' 버튼]→확인모달→`enqueue_quote_email` RPC(SECURITY DEFINER: `email.send`·행스코프·issued·pdf_url·**발송자 `auth.uid()` 서버강제**[클라 user_id 미신뢰]·`hiworks_user_id` 필수·중복거부·이메일/개행/길이 검증)→`jobs(type=email)`→워커 `processEmailJob`. **멱등성 = 메일은 PDF 잡과 달리 재시도=중복 발송**이므로 `email_log` 상태기계(pending→sending→sent/failed) + 발송 직전 **CAS 잠금**(`update ... where status='pending'` 0행이면 스킵) + 견적당 활성 1건 **부분 유니크 인덱스**로 차단. 재시도 한도 도달 = `failed` 종단(pending 고착 금지). 발송기 경계 = shared `MailSender`(`HiworksMailSender`/`FakeMailSender`, `attachments` 첨부 확장형). v1 = 본문 30일 서명URL PDF 다운로드 링크(하이웍스 첨부 필드 미확인 → 인터페이스만 준비). ⚠️ SMTP 불가(하이웍스 POP-only → 보낸편지함 미적재; `save_sent_mail`이 핵심 요구). 담당자별 하이웍스 ID = `profiles.hiworks_user_id`(`/admin/users`서 설정). 실발송 활성화는 토큰 발급 + 워커 IP 허용등록 + 라이브 스모크테스트(응답 스키마는 추정값) 후. [E6 확립]
- 견적 버전 = `MAX(version)` + `UNIQUE(application_id, version)`. 채번 `applications.seq_no = REQ-YYYYMMDD-NNNNN` = **KST(Asia/Seoul)** + 전역 Postgres sequence(10만 건 비잘림).
- **의뢰 상태 = 8단계 라이프사이클** [#148]: 접수→배정→견적중→견적발송→**납품완료→수금중→수금완료**(+종료=중단/종결, 수동·아무때나). 단일 출처 `apps/web/src/lib/application-status.tsx`(8상태 배열 + `ACTIVE`/`DONE`/`UNPAID` 파생셋[`satisfies`] + 색·라벨). 자동 전이는 `_quote_insert`의 발행→견적발송뿐, **납품·수금 진행은 영업 수동**(StatusControl). 상태 enum 확장 시 **DB CHECK·zod(`status-schema`)·타입(`history.ts`·`shared/types`)·필터(`admin-queries`)·대시보드 집계**를 단일출처서 전수 동기화(6~9곳 산재). **미수금 = VAT포함 `quote.total` − Σ수금** = 대시보드 미수금 위젯(납품완료·수금중). ⚠️ 수금(입금)액 추적 데이터는 **미구현** — 현 위젯은 임시로 공급가 표시. 정확화 계획 = memory `receivables-ledger-plan`(별도 '수금 원장' 페이지 + payments 원장 테이블).
- **RLS 컬럼 불변**: seq_no·created_at 등 서버 통제값은 컬럼 GRANT REVOKE로 못 막음(테이블 GRANT 있으면 무효) → **BEFORE INSERT/UPDATE 트리거로 강제**(service_role도 트리거는 우회 불가). [E1 확립, E3~E7 재사용]
- **서비스 리포트(#228) = 현장 A/S 결과 문서** [세션26 확립]: `service_reports`(SR- 채번=`next_service_request_seq_no` 비잘림 템플릿, draft→issued→voided). **발행 동결 = `to_jsonb(old/new) - 화이트리스트[]` 비교**(블록리스트 열거 금지 — 새 컬럼이 기본 동결) + **상태 전환은 tx-local 플래그**(`app.service_reports_status_change`, RPC만 set_config — RLS UPDATE 권한자의 서명검증 우회 발행 차단). 확정 RPC = `FOR UPDATE` 직렬화+서명 `storage.objects` 실존 검증+신규 고객/장비 행 생성+신청 전이(가드 단문·종결 레이스 no-op). 메일 = `pdf_url` 기록 AFTER 트리거 enqueue(부분 유니크+`unique_violation` 흡수 멱등, 링크 7일). **금액 VAT=round**(견적 엔진 `quote-calc.ts` `Math.round`와 동일 — floor 아님). 현장 콘솔 = `/field`(as.jhtech.co.kr 호스트 분기, 모바일 430px, 서명 잠금 뷰→기사 확정 2단, 서명 후 내용 변경 시 서명 자동 무효화). 파인 그린 토큰만(인디고는 폐기된 구 테마). 서브도메인 간 세션(쿠키)은 호스트별 분리 — admin./as. 각각 로그인.
- **RLS 테스트**: vi.mock 불가 → `packages/db-tests`(pg `set role`+`request.jwt.claims`, Supabase 로컬)로 권한별 단언. 순수 로직은 Vitest 단위.
- **자식 테이블 저장 = id 보존 diff-upsert**: company_equipment·향후 consumables·supply_request_items 등 부모에 종속된 자식 행은 폼 저장 시 **삭제·업데이트·신규를 id로 분리**(삭제된 것만 DELETE, 기존 id는 UPDATE, 신규만 INSERT). equipment_option식 `replace`(delete-all-insert) **금지** — 자식 id가 P-D/P-E/P-F의 FK·이력에 참조되므로 매 저장마다 id가 바뀌면 이력이 끊긴다. [P-B 확립, P-C~F 재사용]
- **부분 UNIQUE(`WHERE ...`)는 `ON CONFLICT` arbiter 미작동(42P10)** → 멱등 upsert는 `BEGIN/EXCEPTION WHEN unique_violation` 블록 + 재조회로. capability는 `customers.manage` 등 키만 추가(registry+seed), admin은 `users.manage`로 자동 통과. [P-B]
- **마이그레이션 롤백 위치**: 롤백 스크립트는 **`supabase/rollback/`(단수)** 에 `<timestamp>_<name>_down.sql`로 둔다. ⚠️ `supabase/migrations/` 안에 두면 같은 타임스탬프 파일이 마이그레이션으로 적용돼 방금 변경을 되돌림. (`supabase/rollbacks/` 복수 디렉토리는 P-A1 실수 — 단수로 통합됨.)
- **익명 RPC/anon 정책 = 서버가 모든 값 강제**: SECURITY DEFINER RPC가 동의(엄격 JSON boolean true + `privacy_policies` 버전 exists 대조)·biz_no 체크섬·사진경로 정규식·equipment_id active를 모두 검증, status/assignee 하드코딩. **anon storage INSERT 정책은 `bucket_id`뿐 아니라 `name` 정규식(버킷-상대 `<uuid>/<slot>.ext`)까지** `with check`에 강제(임의경로 무제한 업로드 차단, RPC 경로 정규식과 동일). 클라는 표시·UX만.
- **게이트**: 단계 머지 전 `pnpm --filter @jhtechsaas/shared test`·`web test`·`@jhtechsaas/db-tests test:rls`·`web typecheck`·`lint`·`build`·**`web test:e2e`**·`as any` 0 모두 통과. ⚠️ E2E 누락 시 admin/공개 UI 회귀를 못 잡는다(P-A1 사례). **db-tests 전 `supabase db reset`**(전역 카운트 단언이 seed-local 잔여행에 취약). ⚠️ **`db reset`은 e2e 로그인 시드(admin/sales)도 지움 → e2e 실행 전 `bash supabase/seed/seed-local.sh`로 시드 복구 필수**(안 하면 로그인 타임아웃으로 admin e2e 전부 실패). ⚠️ **e2e·db-tests는 반드시 클린 `db reset`+`seed-local`에서만** — 시각검증용 데모/샘플 데이터(장비 카탈로그·견적 등)가 로컬 supabase에 남아 있으면 e2e의 카탈로그 이름매칭·전역 카운트 단언을 오염시킨다(예: 데모 장비 `UV3300S`가 견적폼 재발행 "직접입력" 가정을 깸). 게이트는 데모 삽입 전/후로 분리.
- **SSR되는 클라 컴포넌트의 영속 UI 상태 = 쿠키(서버가 `cookies()`로 읽어 initial prop 주입), localStorage 금지**: localStorage는 서버렌더(값 없음)↔클라(저장값) 불일치 → **hydration mismatch**(트리 클라 재생성·깜박임). lazy `useState` 초기화로 window 읽어도 마찬가지. 서버 layout이 쿠키를 읽어 prop으로 내려주면 서버·클라 초기값 일치(클라 토글은 `document.cookie` 기록). [의뢰관리 2분할 사이드바 접기서 확립]
- 상세 설계: GitHub EPIC #1 코멘트 / `~/.gstack/projects/jhtechSaaS/main-autoplan-review-20260528-173317.md`.

## 산출물 위치 · 작업법

- 계획 산출물(design doc·spec·autoplan 리뷰)은 **프로젝트 폴더 밖** `~/.gstack/projects/jhtechSaaS/`. 세션 간 기억은 `~/.claude/.../memory/jhtechsaas-project.md`. 백로그는 GitHub 이슈 #1~#8.
- 프로젝트 문서: `DESIGN.md`(디자인 시스템), `PROJECT-MAP.html`(구조 지도 — `/map`으로 갱신), `dev-notes/`(개발 일지 — `/devnote`).
- **로드맵·진행현황**: 단일 원본 = `docs/roadmap.json`(단계 status·기능 status). 거기서 고치고 `pnpm roadmap:sync` 실행 → `docs/ROADMAP.md` 재생성 + **Notion PRD**(page `36d652ff...`)의 라이브영역(진행현황 콜아웃·14표·기능DB) 자동 갱신(멱등). 동기화 엔진은 `~/scripts/claude-notion-sync`(Notion 토큰·@notionhq/client 재사용, 이 머신 전용). **단계(Exx) 머지·배포 시 `roadmap.json`의 해당 phase status를 done으로 바꾸고 sync** → `/eod` 마무리 단계에 포함. Notion 토큰 없는 머신/CI는 `pnpm roadmap:sync --no-notion`(MD만).
- git: repo = `jhtechsmart-cloud/jhtechSaaS`. **push는 SSH alias `github-jhtech`** 라 계정 전환 불필요. `gh` CLI(issue/PR)는 active 계정을 `jhtechsmart-cloud`로 두고 사용(개인 `koreakingLab`과 분리).
- codex는 이 계정에서 gpt-5.4/gpt-5 미지원 → /autoplan dual-voice·/spec 게이트가 자동 스킵됨(정상).
- **원격 DB 적용**: `/ship`은 git(PR)까지만 — DB 반영은 머지 후 `supabase db push`(CLI를 jhtech 계정 로그인 + `supabase link --project-ref <ref>`, ref·계정은 memory 참조). tsx는 `.env` 자동로드 안 함 → 로컬에서 워커 스크립트 실행 시 env 명시 주입(워커 본체는 Railway가 주입).
- **Vercel 배포**: 프로젝트 = `jhtech-saa-s-web`(team `jhtech-s-projects`, 프로덕션 alias `https://jhtech-saa-s-web.vercel.app`). **Root Directory=`apps/web`** 라 `.vercel` 링크는 **repo 루트**에 둔다(apps/web에 두면 경로 중복 에러). env 추가는 에이전트 환경에서 **`vercel env add NAME <env> --value "<v>"`**(stdin/`echo|` 값주입은 `--non-interactive` 기본이라 무시됨). 공개값은 **`--no-sensitive`** 명시(아니면 sensitive 기본 → `vercel env pull`로 값 안 읽힘). **Production env 필수 4종**: `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY`·`NEXT_PUBLIC_SITE_URL`(누락 시 env.ts Zod parse 실패 → **전 라우트 런타임 500**, 빌드는 성공하므로 배포 후 실제 200 검증 필수). **NEXT_PUBLIC_* 는 빌드타임 인라인** → env 변경 후 **재배포(`vercel --prod`)** 해야 반영. ⚠️ Preview env 3종 미설정(CLI `--yes + preview` 버그 → 대시보드에서 All Preview branches로).
