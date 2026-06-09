# Changelog

이 프로젝트의 주요 변경 사항을 기록한다. [Keep a Changelog](https://keepachangelog.com/) 형식, [Semantic Versioning](https://semver.org/)(4자리 MAJOR.MINOR.PATCH.MICRO).

## [0.12.10.0] - 2026-06-09

### Changed
- **견적 중심 프레임 시각 다듬기 + 연락처 하이픈 자동포맷** (슬라이스 3a 사용자 피드백 반영, 프론트 전용·**DB 변경 0**).
  - **공통 섹션 헤더**(`SectionHeader`): 모든 본문 카드(히어로 제외)에 네이비 세로막대(#0B1F3A) + 작은 제목 + 하단 구분선으로 통일.
  - **히어로**: 견적번호·담당자·유효기간 값 글씨 축소(합계금액만 강조 유지). 유효기간 표기 `07.09까지(30일)` + **유효기간 15일→30일**(`banner.ts` `VALID_DAYS` export, 요약패널 동기).
  - **처리바**(담당자·상태): 풀블리드 바 → 다른 카드와 같은 박스 형태 + 버튼·셀렉트 축소.
  - **신청기업 정보**: 제목 옆 등록/미등록 배지, 우측 끝에 "통합 이력 보기 →"(등록) 또는 "고객으로 등록"(미등록) 상호배타 배치. 기본정보 3열 9칸 + 추가정보(장부명·전화1/2·팩스·실제주소, 미수집은 `-`) + 요청장비 별도 블록.
  - **선택 장비**: 큰 이미지 + 카테고리칩·모델명 + 모델/카테고리/공급가(VAT별도)/포함·추가옵션 행(구분선) + 하단 견적번호 배지.
  - **우측 요약**: 장비/옵션 소계에 네이비 세로막대로 제목 강조 + 소계 아래 서브 라인(이름·단가×개수). 액션 3개(수정 / 견적서 발행 / 메일 발송·준비중). 발행 시 메일 자동발송 없음.
  - **연락처 하이픈 자동포맷**(`lib/format/contact.ts`, TDD 21건): 사업자번호 `XXX-XX-XXXXX`·전화 한국표준. 신청기업·요약패널·고객 상세에 적용.

## [0.12.9.0] - 2026-06-09

### Changed
- **의뢰 상세를 견적 중심 프레임으로 재구성** (의뢰관리 2분할 2단계 슬라이스 3a). 의뢰 상세를 열면 견적서처럼 "누가·얼마·무슨 장비·어디까지"를 한 화면에서 본다. 기존 데이터만 사용, **DB 변경 0, 읽기전용**.
  - **네이비 히어로**: QUOTE·V{n}·회사명·상태배지·접수번호·발급일시 + 4스탯(견적번호·담당자·유효기간·합계금액). 슬라이스2의 상단바·배너를 흡수.
  - **좌측 본문**: 버전 이력 표(행=`?v=` 버전 전환) · 신청기업 정보 그리드 · 설치설문 · 현장사진 · 선택 장비(견적 item 이름을 장비 카탈로그와 best-effort 매칭 → 이미지·카테고리·포함옵션, 미매칭은 텍스트) · 포함/추가 옵션.
  - **우측 sticky QUOTE SUMMARY**: 장비/옵션 소계·합계(골드)·VAT별도·유효15일 / 수정·견적서출력 / 발급·유효·담당자 / 발송정보.
  - 특기사항·영업일지·메일발송은 **"준비중(후속)" 비활성 플레이스홀더**(후속 슬라이스 3b/3c/3d).
  - 라우팅 통합: `/admin/applications/[id]`가 견적 유무로 분기(견적 없으면 상태 히어로+신청정보+"견적 작성" CTA). `/admin/quotes/[id]`는 `?v=`로 308 리다이렉트.
  - **유효기간 정정**: 발행일+**15일**(목표 견적서 명시). 슬라이스2의 30일 오류 수정.
  - 순수 로직 TDD: 장비 이름매칭(`matchEquipmentName`)·유효기간(15일) Vitest. 컴포넌트는 `_components/quote-frame/`로 분리.

## [0.12.8.0] - 2026-06-09

### Added
- **의뢰 상세 상단바 + 견적 배너** (의뢰관리 2분할 2단계 슬라이스 2/4). 의뢰 상세를 열면 핵심 정보(누가·어디까지·얼마)를 맨 위에서 한눈에 본다.
  - **상단바(스크롤해도 고정)**: 접수번호(mono)·회사명·미등록 고객 배지 / 담당자·상태(색 배지 + 변경 컨트롤). 어느 섹션을 보든 담당자·상태를 바꿀 수 있다. 기존 하단 '처리' 섹션은 상단바로 이동(제거).
  - **배너**: 대표 견적(최신 발행본 우선, 없으면 최신 임시본)의 **합계** + **유효기간**. 유효기간 = 발행일 + 30일(`D-N`/만료 표시, 표시전용 — DB 컬럼 아님). 임시 견적은 '발행 시 시작', 견적 없으면 안내.
  - 상단바 저장/변경 버튼은 값이 바뀌기 전엔 연한 고스트, 바꾸면 스틸블루로 강조(시각 소음 축소).
  - 순수 로직 TDD: 대표 견적 선택(`pickRepresentativeQuote`)·유효기간 계산(`computeQuoteValidity`, KST) Vitest 10건. DB 변경 없음(프론트 전용, `listQuotesForApplication`에 `issued_at` 셀렉트만 추가).

## [0.12.7.0] - 2026-06-08

### Added
- **의뢰 상태 5단계 — '견적발송' 추가 + 발행 시 자동 전이** (실사용 피드백 반영). 견적을 발행하면 의뢰 목록 상태가 '견적중'(작성중처럼 읽힘)에 머무르거나, 의뢰에서 작성한 경우 상태가 아예 안 바뀌던 문제 해결.
  - 상태 흐름: **접수 → 배정 → 견적중(작성중) → 견적발송(발행됨) → 완료(종결)**.
  - 자동 전이(`_quote_insert`): draft 저장 → 견적중, **발행(issued) → 견적발송**. 앞으로만 전진(`quote_sent`/`closed` 보존, 다운그레이드·재오픈 안 함). 기존 데이터 백필 포함.
  - '완료'는 영업이 직접 표시(시스템이 고객 수주 여부를 모르므로 자동 아님).
  - 색: 견적발송 = 초록 `#16A34A`(발송 성공), **완료 = 네이비 `#3a3770`**(종결). 상태 배지·목록 필터·상태 변경 드롭다운·대시보드 도넛에 자동 반영(`APPLICATION_STATUSES` 단일 출처).

### Changed
- `applications.status` CHECK 제약에 `quote_sent` 추가. 대시보드 '미완료' 집계에 견적발송 포함(진행중).

## [0.12.6.0] - 2026-06-07

### Added
- **통합 PDF 워커 골격 + jobs 큐**(마이그레이션 `20260607140000_jobs_queue.sql`) — 견적 발행 시 PDF를 비동기 생성하는 파이프라인. 무겁고 느린 작업을 발행 응답에서 분리(Railway 워커 + 큐, webhook/Realtime 회피).
  - `jobs` 큐 테이블(내부 전용·RLS 정책 0) + `claim_next_job()` RPC(`FOR UPDATE SKIP LOCKED`로 동시 워커 레이스 0, service_role 전용) + `quotes_enqueue_pdf` AFTER 트리거(견적이 `issued`로 전환될 때만 `quote_pdf` 잡 enqueue, `pdf_url` 갱신은 제외).
  - **워커**(`apps/worker`): `render-quote-pdf`(pdf-lib placeholder PDF), `quote-pdf` 처리(견적 로드→생성→`quote-pdfs` 버킷 업로드→`quotes.pdf_url` 기록), `queue`(claim/complete/fail + 재시도 3회), `runner.runOnce`, `index` 폴링 루프. env `GMAIL_*` optional 완화(메일은 E6). `pdf-lib` 의존성 추가.
- ⚠️ **PDF 레이아웃은 placeholder**(견적번호·금액만) — 의뢰사 견적서 양식 제공 시 `render-quote-pdf.ts`만 교체. 큐·워커·스토리지·재시도 파이프라인은 완성(통합 테스트로 발행→잡→PDF→pdf_url 전 과정 증명).
- ⚠️ 운영: 워커는 Railway에서 별도 프로세스로 실행해야 동작(코드 머지 ≠ 워커 기동). worker 테스트도 로컬 Supabase 필요.

## [0.12.5.0] - 2026-06-07

### Added
- **견적 작성 콘솔(영업용 UI)** — E5 백엔드 3종 위에 얹은 첫 사용자대면 화면. 영업이 견적을 만들고·보고·재발행한다. 프론트엔드 전용(DB 변경 없음).
  - **견적 작성 폼**(`/admin/applications/[id]/quote/new`) — 의뢰 상세 "견적 작성" → 장비·옵션 줄 추가/삭제, **`calculateQuote` 실시간 공급가·세액·합계**, 임시저장(draft)/발행(issued) → `create_quote` RPC. 의뢰 상세에 그 의뢰의 견적 목록 노출.
  - **수기 견적**(`/admin/quotes/new`) — 의뢰 없이 회사명부터 작성. 견적 목록 헤더 "수기 견적 작성" → `create_manual_quote`(application(source=manual)+quote 원자 생성) → 새 의뢰 상세로 이동.
  - **견적 상세 + 재발행**(`/admin/quotes/[id]`) — 읽기전용 내역(줄·금액·상태·번호). "재발행" → 그 줄이 채워진 폼 → 수정 후 저장 = **같은 번호 V2**(채번 트리거가 version 자동 증가).
  - 공유: `QuoteLinesEditor`(작성/수기 폼 공통 라인 에디터), 순수 로직 `lib/quotes/form.ts`(행 변환·실시간 합계·검증·프리필 파싱, Vitest). 권한 `quotes.write` 가드. 금액 미리보기는 클라, **저장 권위는 서버 RPC**(클라 금액 무시·재계산).
- ⚠️ 견적번호 형식(`JHQ-…`)·옵션 가격표·장비 자동가격·이미지·통합 PDF는 의뢰사 자료 대기로 후속. 현재는 영업 수기 입력.

## [0.12.4.0] - 2026-06-07

### Added
- **견적 생성 결선 RPC**(마이그레이션 `20260607130000_quote_create_rpc.sql`) — 계산 엔진·채번/불변을 실제 저장 흐름으로 연결. 서버가 금액의 최종 권위를 가진다(클라가 보낸 금액 무시, items·옵션만 받아 SQL에서 재계산).
  - `create_quote(application_id, items, options, status)` — 기존 의뢰 위 견적 생성. `quotes.write` 명시 체크(SECURITY DEFINER가 RLS 우회하므로), 채번 트리거가 `quote_no`/`version` 부여.
  - `create_manual_quote(company, ceo, phone, email, items, options, status)` — 영업 수기 경로(링크 없이 그 자리서 작성). `applications`(source='manual') + `quotes`를 **한 트랜잭션에 원자 생성**(orphan 없음).
  - 내부 헬퍼 `_quote_insert`/`_quote_validate_lines`(금액 계산·줄 검증=수량≥1·단가 정수, 직접 호출 revoke). `authenticated`만 grant, `anon`/`public` revoke.
  - 금액식 = 슬라이스1 TS `calculateQuote`와 동일 → **교차검증 db-test로 TS==SQL 일치 보장**(이중 구현 드리프트 방지).
- **`applications.source` 컬럼**(`public`/`manual`) — 공개폼 제출과 영업 수기 생성을 구분. 기본 'public', 트리거로 UPDATE 시 불변.
- ⚠️ E5 백엔드 3종(계산 엔진 → 채번/불변 → 생성 RPC) 완료. 다음 = 견적 작성 콘솔(UI)·통합 PDF.

## [0.12.3.0] - 2026-06-07

### Added
- **견적 계산 엔진**(`@jhtechsaas/shared` `quote-calc.ts`) — 견적 입력(장비 줄들 + 옵션 줄들)을 받아 공급가·세액·합계를 산출하는 순수 함수 `calculateQuote`. 모든 줄이 `단가 × 수량`(단가 음수 허용 → 할인/제외)이고, 헤드 개수는 특별 취급 없이 "수량을 가진 옵션 한 줄"로 일반화. 세액 = `round(공급가 × 0.1)` 원단위 반올림, 세율 주입 가능. 가격표를 내장하지 않아 의뢰사 자료 없이 완성(가격표는 후속 UI/조회가 주입). 입력 경계 검증 `QuoteInputSchema`(Zod: 정수 원·수량≥1·세율 0~1). TDD 13 케이스.
- **견적번호 채번 + 불변버전**(마이그레이션 `20260607120000_quote_numbering.sql`) — 견적 저장 시 서버가 `JHQ-YYYYMMDD-NNN-VN` 형식 번호를 자동 채번. `quote_number_counters`(연도 키 카운터, `ON CONFLICT DO UPDATE` 원자증가 → 레이스 0·연도별 리셋)와 `next_quote_base_no()`(KST 연/날짜 + 연도누적 NNN, 999 초과 자릿수 확장). `quotes_enforce_server_fields` 트리거: 첫 견적=새 번호+V1, 재발행=번호 유지+`version` 자동증가, 클라 지정 무시. `quote_no·version·created_at` 불변(draft도), 발행(issued) 행은 `pdf_url` 외 동결(통합 PDF 워커가 PDF만 사후 기록), draft→issued 시 `issued_at` 서버 기록. 롤백 스크립트 포함. db-tests 10 케이스.
- ⚠️ E5(견적서 발급)의 **백엔드 첫 조각들** — 견적 작성 UI·통합 PDF·실제 옵션 가격표는 후속(의뢰사 양식·가격표 제공 대기). 견적번호 형식은 함수 한 곳만 교체하면 변경 가능.

## [0.12.2.0] - 2026-06-06

### Added
- **관리자 콘솔에 KPI 페이지 추가**(`/admin/kpi`) — 운영 지표 대시보드 디자인 시안. 히어로 지표 4개(매출·견적요청·전환율·A/S 미처리), 최근 12개월 매출 추이 영역 차트(인디고 단색·부드러운 곡선), 담당자별 매출 가로 막대, 신청 상태 분포 도넛, 소모품 재주문 상위 미니 테이블. v3 디자인 토큰(Plus Jakarta Sans + Pretendard·소프트 인디고 액센트·시맨틱 색·mono tabular 숫자) 적용, Stripe 결(넉넉한 여백·큰 숫자·강조 1곳). 사이드바 nav에 KPI 항목 + chart 아이콘 추가.
- ⚠️ 데이터는 전부 **샘플**(프로덕션 집계가 0이라 디자인 검증용). 실집계 배선은 후속 작업.

## [0.12.1.1] - 2026-06-05

### Docs
- DESIGN.md를 v0.12.1.0 콘솔 리디자인(v3)에 맞춰 갱신 — 폰트(Plus Jakarta Sans + Pretendard), 액센트(소프트 인디고 `#6360c4`), 라이트 사이드바(224px `#e7e9f3`)·sidebar-text 토큰, 본문폭 1320, 대시보드 도넛 파스텔 팔레트·캘린더 레일, Decisions Log 항목 추가. 상태 스파인은 불변(의미 색) 명시.
- UI-SPEC.md 토큰 참조줄을 v3로 갱신 + 화면별 계약의 리디자인 전 표기(deep teal·196px·1140px)는 DESIGN.md 최신값으로 읽으라는 우산 노트 추가(역사적 계약 보존).

## [0.12.1.0] - 2026-06-05

### Fixed
- **공개 장비 상세 페이지가 로컬에서 404 나던 버그 수정** — Zod 4의 `z.string().uuid()`가 v3보다 엄격해져 RFC 9562의 version/variant 비트까지 검사, 형식은 정상이지만 그 비트가 0인 구조화/seed UUID(예: `00000000-0000-0000-0000-0000000e0001`)를 거부해 `notFound()`를 호출했다. 코드 전반 `z.string().uuid()` → `z.guid()`(형식만 검사, 쓰레기값은 여전히 거부) 34곳 일괄 교체. 장비·견적요청·고객·A/S·소모품·분류 상세/액션 전 영역. 실데이터는 `gen_random_uuid()`(정식 v4)라 프로덕션은 정상이었고, 로컬 seed 한정 증상이었음.

### Changed
- **관리자 콘솔 UI 리디자인** — 네이비 일색에서 연한 인디고(v3) 팔레트로. 좌측 사이드바를 라이트(본문 배경보다 살짝 진한 `#e7e9f3`)로 전환, nav 라벨은 AA 대비(4.5:1) 충족하는 톤. 영문·숫자 폰트를 Plus Jakarta Sans로(한글은 Pretendard 유지).
- **대시보드 전체 현황을 파스텔 도넛 차트 3개로** — 기존 색바(StatusBar)를 견적·A/S·소모품 도메인별 도넛 링(가운데 총계 + 상태별 범례)으로 교체.
- 대시보드 우측에 이번 달 캘린더(신청 제출일 표시) + 이번 달 신청 리스트 레일 추가.

### Added
- guid 형식 검증 회귀 가드 테스트 — 구조화 비-v4 UUID가 수락되는지 단언(`.uuid()`로 되돌리면 실패).
- 운영 데이터 입력용 장비·분류 seed 스크립트(`apps/worker/src/seed-equipment*.ts`, service_role·멱등).

(DB 스키마 변경 없음 — UI·검증 로직만)

## [0.12.0.1] - 2026-06-05

### Fixed
- 견적 담당자 배정이 연결 고객의 담당영업에 반영되지 않던 버그 수정. 견적 배정/claim 시 SECURITY DEFINER RPC `sync_company_assignee_from_application`로 연결 고객(`source_application_id`)의 담당영업이 비어있을 때만 채운다(단방향·fill-if-empty — 고객 담당영업 수정은 견적 담당자에 영향 없음, 이미 정해진 담당영업은 안 덮음). 도그푸딩 발견: 고객 등록이 배정보다 먼저면 담당영업이 영영 미배정으로 남았음.

### Security
- 전파 매칭을 `source_application_id`(서버 생성 링크)로만 제한 — biz_no 매칭은 claim 영업이 견적 biz_no를 변조해 임의 고객 담당영업을 탈취할 수 있는 IDOR 경로라 제외(DEFINER가 companies RLS 우회).

## [0.12.0.0] - 2026-06-05

### Added
- **E5b 역할 인식 요약 대시보드** — 로그인 후 첫 화면을 `/admin/dashboard`로 전환. 상단 액션 큐(견적 미배정·A/S·소모품 미열람) + 하단 전체 현황(도메인별 상태분포 색바 + 고객·보유장비·카탈로그 참조 숫자). RLS가 역할별 데이터를 자동 차등(영업=본인+미배정 풀, view_all=전체).
- 현황 섹션 라벨 역할 인식 — 전체열람 권한 보유자는 "전체 현황", 본인 스코프 영업은 "내 현황"(RLS-scoped count를 "전체"로 오도하지 않음).
- 데이터 0 빈상태 온보딩 카드(고객→장비→영업계정 등록 안내, 사이드바 nav와 동일 권한 게이팅).
- 담당자별 부하(미완료) — `users.manage` 전용(profiles 이름 RLS).

### Changed
- 사이드바 최상단에 "대시보드" 메뉴 추가. `landingPathFor`는 콘솔 자격자 전원 `/admin/dashboard` 반환(`LANDING_RULES`는 향후 우선순위 힌트로 보존).

(Closes #46 · DB 스키마 변경 없음 — 읽기 전용 집계)

## [0.11.0.4] - 2026-06-04

### Fixed
- 장비 상세 갤러리 메인 이미지에 여백(`p-8`, 32px) 추가 — 카탈로그 카드와 일관되게, 여백 없는 원본 사진의 답답함 해소(썸네일은 object-cover 유지).

## [0.11.0.3] - 2026-06-04

### Fixed
- 공개 카탈로그 카드 이미지에 여백(`p-6`, 24px) 추가 — 여백 없는 원본 사진이 카드 가장자리까지 닿아 답답해 보이던 문제 해소(object-contain 유지, 잘림 없음).

## [0.11.0.2] - 2026-06-04

### Performance
- Vercel 함수 리전을 서울(`icn1`)로 고정(`apps/web/vercel.json`). 함수가 기본 미국(iad1)에서 실행돼 서울 Supabase와 태평양 왕복(쿼리당 ~180ms)하던 것을 DB와 같은 리전에 두어 제거 — admin SSR(레이아웃 auth+프로필+카운트 다중 쿼리) 체감 속도 대폭 개선.

## [0.11.0.1] - 2026-06-04

### Changed
- 공개 홈 3분기 — A/S(`/support`)·소모품(`/supply`) 박스의 "준비중" 해제, 실제 페이지로 연결(견적요청 포함 3개 전부 활성). 홈 진입 e2e 추가.

## [0.11.0.0] - 2026-06-04

### Added
- **E5a 권한 모델 + 관리자 사용자관리** (이슈 #38, #29 해소) — 여러 명이 나눠 쓰는 운영의 토대. capability(권한=키 목록) 모델을 액션 단위로 분해하고, 영업담당 role·관리자 계정관리 UI를 신설했다.
  - **권한 registry 키화**: 굵게 묶였던 `*.manage`(생성+수정+삭제 한묶음)를 액션 키로 분해 — `customers.edit/delete/view_all`, `applications/service/supply.status/claim`. 한글 메타(label·description·group) 단일 출처, `SALES_PRESET`(영업 9키)·`ADMIN_PRESET`(users.manage super).
  - **영업담당 self-claim**: 미배정 신청(견적·A/S·소모품)을 "내가 맡기"로 본인 담당에 가져온다. RLS에 `(미배정 AND claim)` 절 추가(SELECT·UPDATE USING), WITH CHECK엔 미포함 → 본인 배정만 허용·타인 배정/권한 상승 차단. 견적은 `new→assigned` 자동 전이.
  - **관리자 사용자관리** (`/admin/users`): 계정 목록·생성(임시 PW 1회 노출 모달)·권한 편집(영업/관리자/직접설정 프리셋 2단)·활성/비활성 토글. `server-only` service_role admin 클라이언트(`auth.admin.createUser`).
  - **콘솔 게이트 느슨화**(#29): 레이아웃 가드 `equipment.manage` → "콘솔 키 중 하나라도"(영업담당도 셸 진입). nav 권한별 노출. 로그인 첫 화면 role-aware(`resolveLandingPath`, 운영 허브 `/admin/applications`).
  - **비활성 계정 차단**: `requirePermission`에 is_active 체크 추가(비활성 계정 콘솔 진입 차단). 관리자 **자가 락아웃 방어 트리거**(본인 users.manage 회수·본인 비활성화를 DB레벨 거부).
- 마이그레이션 4건: customers 스코프 분해·신청 3종 claim·deprecated 키 데이터 remap·profiles 자가락아웃 트리거(모두 +rollback).

### Changed
- deprecated `customers/service/supply.manage` 3키 삭제(registry 18키). 라이브 RLS·RPC·액션은 신규 키로 재배선, 기존 운영 계정 권한은 데이터 마이그레이션으로 보수적 remap.

## [0.10.0.0] - 2026-06-04

### Added
- **E4 견적 트리아지 콘솔** (`/admin/applications`, 이슈 #5) — 고객이 공개폼으로 넣은 견적을 관리자가 보고·맡고·진행시키는 본업 루프의 첫 칸. 마이그레이션 0(순수 웹 레이어, E1 RLS·capability 재사용).
  - 목록: 서버 검색(업체·접수번호)·상태 필터·미처리(`status='new'`) 강조·견적 내용 컬럼·100건 초과 경고. 좌측 네비 '견적' 미처리 배지.
  - 상세: 고객정보·요청·설치설문(라벨맵)·라벨 캡션 사진 4슬롯·biz_no 정규화 매칭 P-F 역링크.
  - 담당 배정(`new→assigned` 자동 전이)·해제(`assigned→new` 복귀)·상태 자유전이(접수/배정/견적중/완료)·미등록 고객 등록(P-F 즉시 연결).
  - 담당자 미배정 시 상태 변경 차단(UI+서버 가드). 권한: `applications.view_all`·`applications.assign` 재사용.

### Fixed
- 견적 상태 색 스파인 스왑 수정 — 배정=보라(#7C3AED)·견적중=앰버(#D97706)로 DESIGN.md 복원(P-F에도 전파).

## [0.9.1.0] - 2026-06-03

### Changed
- **공개 신청폼 UX 개선** — 실사용 도그푸딩에서 발견한 마찰 해소.
  - 긴 폼(견적·A/S·소모품) 제출 시 빠뜨린 항목이 있으면 **폼 상단에 "입력 안 된 N개" 요약 배너**가 뜨고 그 위치로 스크롤 → 한 칸 누락 후 "아무 반응 없는 제출"로 이탈하던 문제 해소. 소모품폼은 "소모품 1개 이상 선택" 같은 항목도 배너에 함께 표시.
  - 견적폼의 **설치 환경 정보·사진 입력을 "선택" 아코디언으로 접어** 기본 화면을 짧게(연락처·요청사항만). 접힌 영역 위에 작성 안내 문구.
  - 견적·A/S 폼 사업자등록번호 입력 시 **자동 하이픈**(고객 관리·소모품폼과 동일).

### Added
- 관리자 A/S·소모품 신청 상세에서 **"이 고객의 통합 이력 보기 →" 링크** — 처리 중 그 고객의 견적·구입·A/S·소모품 이력으로 바로 이동.

## [0.9.0.0] - 2026-06-03

### Added
- **M2 P-F 통합 고객 이력** (GitHub #24) — 관리자가 고객(업체) 한 곳을 열면 그 고객의 견적·구입·AS·소모품 활동을 완료 여부와 함께 한 화면에서 본다.
  - 신규 고객 상세 뷰 `/admin/customers/[id]` — 업체 헤더(업체명·사업자번호·대표·연락처·담당영업) + 견적/구입(보유장비)/AS/소모품 4개 카테고리 섹션. 각 섹션 헤더에 `전체 N · 완료 M` 카운트, 상태 색 배지, 접수번호·날짜 mono 표기. AS·소모품 행은 기존 상세로 딥링크, 견적·구입은 인라인 표시. 이력 0건이면 "내역 없음".
  - 고객 목록(`/admin/customers`)에서 업체명·행 클릭 시 상세 뷰로 이동(기존 바로 수정 → 상세 경유로 변경). 상세의 [수정] 버튼으로 편집 진입.
  - `get_company_request_history` SECURITY DEFINER RPC — `customers.manage` 권한 게이트로 담당자와 무관하게 해당 고객의 전체 이력 조회(테이블 RLS 정책은 변경하지 않음). 견적은 사업자번호 정규화 매칭 또는 `source_application_id`로 연결(사업자번호 없는 고객도 출처 견적 표시), 소모품은 품목수·품목 스냅샷까지 집계.
  - 견적 전용 상태 배지 모듈(`application-status.tsx`, `new·assigned·quoted·closed`) — AS·소모품 공용 배지와 별도. 완료 집계는 견적=`closed`, AS·소모품=`done`(취소 제외).

## [0.8.0.0] - 2026-06-03

### Added
- **M2 P-E 소모품신청** (GitHub #23) — 기존 장비 구매 고객이 사업자등록번호로 조회해 보유 장비에 맞는 소모품을 골라 수량을 신청하고, 내부 담당자가 콘솔에서 접수·처리하는 흐름.
  - 공개 `/supply` 폼 — 사업자번호 조회(자동 하이픈) → 등록 고객 정보 표시(보유 장비·모델명 포함) → 보유 장비에 매칭되는 소모품을 **장비별 그룹·공용 섹션**으로 보여주고 수량 스테퍼로 선택 → 신청자·메모·개인정보 동의 → 접수번호(`SUP-YYYYMMDD-NNNNN`) 완료화면. 직전 신청을 한 번에 채우는 "지난 신청과 동일" 재주문 + 내용 미리보기.
  - 미등록 사업자번호는 담당자 안내(보유장비 매칭이 전제라 신청 차단), 조회 실패와 일시 네트워크 오류를 구분.
  - `supply_requests` + `supply_request_items` 테이블 — 접수번호 채번·생성시각·담당자 자동배정·company_id·완료/취소 종결잠금을 트리거로 강제. 담당자 본인 또는 전체조회 권한자만 열람(RLS), 자식 아이템은 부모 권한을 따르고 직접 쓰기 차단.
  - anon RPC 3개 — `list_consumables_for_company`(보유장비 매칭 소모품, 가격 미반환), `last_supply_request_for_company`(직전 신청 프리필), `submit_supply_request`(동의·체크섬·보유장비 매칭·수량 1~9999·신청자 필수를 서버가 전량 검증, 등록 고객만 신청).
  - admin `/admin/supply-requests` — 접수 목록(검색·상태필터·미배정필터·품목수·대표품목·미열람 표시), 상세(소모품 라인·상태 변경), 좌측 네비 미열람 배지.
  - 신규 권한 `supply_requests.view_all`(전체 조회)·`supply_requests.manage`(상태 변경).

### Changed
- `lookup_company_by_biz_no` 응답에 보유 장비 `equipment_model` 추가(A/S `/support`는 영향 없음).
- 요청 status 색 배지를 `request-status` 공통 모듈로 승격(A/S·소모품 단일 출처).

## [0.7.0.0] - 2026-06-02

### Added
- **M2 P-D A/S신청** (GitHub #22) — 기존 장비 구매 고객이 사업자등록번호로 조회해 A/S(고장 수리)를 웹에서 직접 신청하고, 내부 담당자가 콘솔에서 접수·처리하는 흐름.
  - 공개 `/support` 폼 — 사업자번호 조회 → 등록 고객은 보유장비·연락처 자동완성, 미등록은 직접 입력. 고장 증상·희망 방문일·증상 사진(최대 3장, 모바일 카메라 직행) 제출 → 접수번호(`AS-YYYYMMDD-NNNNN`)와 담당자·영업일 1일 SLA 안내 완료화면.
  - `service_requests` 테이블 — 접수번호 채번·생성시각·담당자 자동배정·완료/취소 종결잠금을 트리거로 강제. 담당자 본인 또는 전체조회 권한자만 열람(RLS).
  - `submit_service_request()` 익명 제출 함수 — 동의·사업자번호 체크섬·보유장비 소유검증·증상/사진 형식·길이 제한을 서버가 전량 검증(미등록도 접수, 담당자 콜백으로 검증).
  - admin `/admin/service-requests` — 접수 목록(검색·상태필터·미확인 태그·미열람 표시), 상세(증상사진 보기·상태 변경), 좌측 네비 미열람 배지.
  - 신규 권한 `service_requests.view_all`(전체 조회)·`service_requests.manage`(상태 변경).
  - `customer-uploads` 버킷에 A/S 증상사진 슬롯 추가.

### Changed
- 고객 신원 모델 확정: 사업자번호 조회 + 담당자 콜백 검증(고객 로그인 도입 안 함). `/support`는 비로그인 공개 흐름.
- DESIGN.md: A/S 상태 5종(접수·진행중·보류·완료·취소) 색 매핑을 기존 색 스파인 재사용으로 추가.

## [0.6.0.0] - 2026-06-02

### Added
- **M2 P-C 소모품 카탈로그** (GitHub #21) — 장비별 소모품을 분류·장비 단위로 매핑하는 카탈로그와 admin 관리. A/S·소모품 신청(P-D·P-E)의 토대.
  - `consumables`(소모품 마스터) 테이블: 이름·단위·품번·가격(내부용)·상태. 서버통제값 불변 트리거.
  - `consumable_scope`(매핑) 테이블: 분류(category_id) XOR 특정 장비(equipment_id) — 소모품 하나가 "프린터 공통" 같은 분류나 특정 모델에 연결. id 보존 diff-upsert.
  - 신규 권한 `consumables.manage` — 쓰기 게이트(RLS), 읽기는 로그인 스태프 전원.
  - `consumables_for_equipment()` 해석 함수 — 장비를 고르면 매칭 소모품을 반환(대분류 scope가 하위 소분류 장비까지 커버). P-E 재사용.
  - admin 소모품 콘솔 `/admin/consumables` — 목록(검색·상태필터·적용범위 요약), 생성·수정(범위 에디터: 분류/특정 장비 토글), 삭제.
- **장비 분류 체계(taxonomy)** — 기존 자유텍스트 분류를 관리형 2단계 구조로 전환(오타·동의어 분산 제거).
  - `equipment_category`(2단계) 테이블: 대분류(프린터·커팅기) → 소분류(UV프린터·솔벤트프린터…). 손자(3단계) 금지 트리거, 참조 중 분류 삭제 차단.
  - admin 분류 관리 `/admin/categories` — 대분류/소분류 트리 CRUD.
  - 장비 등록 폼: 분류 자유입력 → 드롭다운(자식 있는 대분류는 그룹헤더, 소분류·단독 대분류만 선택). 선택 불가가 된 분류는 "재배정 필요"로 보존.
  - 소모품 범위 에디터: 분류를 taxonomy 드롭다운(대분류=공통 / 소분류)으로 선택.

### Changed
- **`equipment.category`(자유텍스트) → `category_id`(FK)** — 기존 분류 텍스트를 대분류 노드로 보존 마이그레이션. 공개 카탈로그 뷰는 분류명을 조인해 노출(호환 유지).

## [0.5.0.0] - 2026-06-02

### Added
- **M2 P-B 고객·구매 마스터** (GitHub #20) — 고객(업체)과 보유 장비를 정규화된 마스터로 관리. A/S·소모품·통합이력의 전제.
  - `companies`(고객) 테이블: 사업자번호(부분 UNIQUE)·업체명·대표·연락처·주소·담당영업·자동생성 출처. 서버통제값(created_at·source_application_id) 불변 트리거.
  - `company_equipment`(보유장비) 테이블: 카탈로그 장비(FK) XOR 자유입력 장비명, 구입일·설치주소·시리얼.
  - 신규 권한 `customers.manage` — 쓰기 게이트(RLS), 읽기는 로그인 스태프 전원. (관리자는 `users.manage`로 자동 통과.)
  - admin 고객 관리 콘솔 `/admin/customers` — 목록(담당영업 필터·미배정 amber·사업자번호 mono 포맷·보유장비수), 직접입력/견적요청 가져오기 2모드 신규, 편집(보유장비 인라인 편집기·diff-upsert로 id 보존).
  - anon 사업자번호 조회 RPC `lookup_company_by_biz_no` — A/S·소모품 폼 자동완성용. 노출 필드 화이트리스트(비활성 장비명 미노출).
  - 견적요청→고객 멱등 upsert RPC `upsert_company_from_application` — 사업자번호/출처 기준 중복 방지, 신규/기존 배너 피드백.
- **연락처 자동 대시 포맷** — 고객 폼 연락처가 사업자번호처럼 010-1234-5678 형태로 자동 정리(`formatPhone`).
- **장비 사양 아이콘 미리보기** — 관리자 장비 폼에서 사양 그룹 아이콘 이름 옆에 실제 아이콘 표시.

### Changed
- **장비 카탈로그 카드 이미지** — `object-contain`으로 변경, 가로로 긴 장비(프린터) 사진이 잘리지 않고 전체 노출.

### Fixed
- 로컬 개발 환경에서 Next.js 16 SSRF 가드가 차단하던 private IP(로컬 Supabase Storage) 이미지 최적화 허용(dev 한정, 프로덕션 가드 유지).

## [0.4.0.0] - 2026-06-01

### Added
- **M2 P-A2 견적요청 v2 — 공개 고객 흐름** (GitHub #19b) — 고객이 직접 쓰는 공개면. P-A1 데이터 위에 구축.
  - **홈 3분기 진입**: 견적요청(활성) · A/S신청 · 소모품신청(준비중, P-D/P-E 예정).
  - **카탈로그 박스**: 장비 카드에 [상세정보]·[장비선택] 2버튼. [장비선택]은 견적폼에 장비 사전선택.
  - **장비 상세 재구성**: 상단 2열(대표사진 갤러리 ‖ 제품명·모델·요약 highlights·견적요청 CTA) · 중단 전폭 아이콘 그룹 사양 · 하단 전폭 제품 영상(복수, 0개면 생략). 가격·옵션은 계속 비노출.
  - **대형 견적요청 폼**: 개인정보 수집·이용 동의(필수 체크 + 전문 인라인 아코디언) · 회사·대표·사업자번호·연락처·이메일·주소·요청사항 · 현장 사진 4슬롯(외부/내부 전경, 선택, 선택 시 미리보기→제출 시에만 업로드) · 설치 장소 설문(건물유형·위치·엘리베이터·전력·공압·기타 다중·기타요청) · 사업자등록번호 국세청 체크섬 즉시 검증.
  - 제출 시 접수번호(`REQ-…`) 발급. 선택 장비·동의·설문·사진이 견적 요청에 함께 저장됨.



### Added
- **M2 P-A1 견적요청 v2 — 데이터 기반 + 운영자 입력 UI** (GitHub #19a) — M2 고객 포털의 첫 단계. 공개 흐름(P-A2) 전에 데이터 토대를 깐다.
  - 장비 사양을 평면 `{label,value}` → **아이콘 그룹 구조**(`{group,icon,items[]}`, 9종 고정 아이콘 enum)로 확장. 기존 평면 데이터는 단일 기본그룹으로 자동 마이그레이션 + 하위호환 파서.
  - `equipment`에 **요약(highlights) 불릿**·**복수 제품영상(youtube_urls)** 추가. 공개 뷰 재생성(가격·옵션 비노출 유지).
  - `applications`에 **개인정보 동의 3컬럼**(동의·시각·버전) + **equipment_id FK** 추가. 기존 `fields.equipment_id` 백필.
  - **`privacy_policies`** 버전 테이블(v1.0 플레이스홀더) + RLS. **`customer-uploads`** 비공개 버킷(현장 사진, anon 업로드·스태프 열람, 경로 형식 강제).
  - **견적요청 RPC v2**: 개인정보 동의(엄격 boolean·실재 버전 검증)·선택 장비(active 검증)·현장 사진 경로·사업자번호 국세청 체크섬을 서버에서 강제. `status='new'`·미배정 하드코딩 유지(익명 위조 차단).
  - **운영자 장비 폼 확장**: highlights·복수 youtube·그룹 사양(아이콘 드롭다운, 중첩 편집) 입력.
  - 사업자등록번호 체크섬 순수함수(`validateBizNo`) 추가(클라+서버 공유, P-A2 폼에서 배선 예정).
- **M2 고객 포털 마일스톤 등록** — 설계문서·로드맵(roadmap.json/ROADMAP.md)·프로젝트 지도에 M2(P-A~P-G) 반영.

## [0.3.0.0] - 2026-05-31

### Added
- **E3 공개 장비 카탈로그·상세 + 견적요청 폼** (GitHub #4) — 비로그인 고객이 장비를 둘러보고 견적을 요청.
  - 공개 카탈로그 `/equipment`: active 장비 목록(반응형 그리드, 대표사진·이름·모델·카테고리). `equipment_public` 뷰 경유로 가격·옵션 영구 비노출, inactive 비노출.
  - 장비 상세 `/equipment/[id]`: 사진 갤러리 · 사양 테이블 · YouTube 임베드(nocookie). 동적 SSR로 admin 수정 즉시 반영. 잘못된/inactive id는 404(not-found).
  - 견적요청 폼 `/request`: react-hook-form + zod, 상세에서 장비 사전선택(`?equipment=`). 회사명·대표·사업자번호·연락처·이메일·주소 + 요청사항. 제출 시 접수번호(`REQ-…`) 확인. 기존 `quote.html`의 silent-fail 버그 제거(저장 실패 시 명시적 통지).
  - 접수완료 `/request/success`: 접수번호 표시 + 위조·직접진입 방지(형식 검증 후 미달 시 카탈로그로).
  - SEO: 동적 `sitemap.xml`(active 장비 포함) · `robots.txt`(admin disallow) · 상세 `generateMetadata`(OpenGraph) · 루트 title template.
  - 미니멀 홈 `/` + 재사용 카탈로그 버튼.
  - `submit_application(payload jsonb)` SECURITY DEFINER RPC — anon 견적요청 저장 + 접수번호 반환(anon SELECT 금지 우회). `status='new'`·미배정 서버 강제, 입력 길이 캡.

### Changed
- `applications` 컬럼 길이 CHECK 제약 추가 — anon이 공개 키로 REST에 직접 INSERT해 RPC 길이 캡을 우회하는 경로를 DB 레벨에서 차단.

## [0.2.0.0] - 2026-05-30

### Added
- **E2 장비·옵션 관리 admin** (GitHub #3) — 영업/관리자가 웹에서 장비 카탈로그를 생성·조회·수정·삭제.
  - 웹 인증 토대: `@supabase/ssr` 쿠키 세션, `proxy.ts` 라우트 가드(미인증 → `/login`), 이메일·비번 로그인/로그아웃, admin 콘솔 셸(권한 없으면 403). E4 콘솔에서 재사용.
  - 장비 목록 `/admin/equipment`: 서버 읽기 + 클라 검색·상태 필터·카드뷰 + 5-state(로딩/빈/에러/조회/부분).
  - 장비 폼(생성·수정): react-hook-form + zod 공유 스키마. 사양·옵션·이미지 리치 에디터 포함.
  - 사양 에디터: `{항목, 값}` 행 추가·삭제·순서변경(↑↓ 버튼 + 드래그), jsonb 순서 보존.
  - 옵션 에디터: 포함/추가(included/extra) 옵션 행 인라인 편집.
  - 이미지 업로더: 브라우저에서 Storage로 직접 업로드(다중·드래그 순서·대표 지정·삭제 동기). 저장 실패·취소 시 이번 세션 업로드분을 best-effort 정리.
  - 쓰기 = Server Actions(권한 3중 가드: proxy + layout + 액션 재검증, RLS 최종 강제), 옵션은 replace 전략.
  - 첫 Playwright E2E 도입: 미인증 리다이렉트·생성 플로우·inactive 토글(로컬 Supabase 기반).
  - DESIGN.md 디자인 토큰을 globals.css `@theme`로 확립(Pretendard · JetBrains Mono · deep teal accent).

### Changed
- `Equipment.specs`를 자유형 객체에서 `Spec[]`(항목+값 배열)로 구체화 + jsonb 직렬화/역직렬화 방어 헬퍼.
- `equipment-images` 버킷에 서버측 업로드 제한(5MB · jpg/png/webp) 적용 — 클라이언트 검증 우회 차단(AC4 서버 강제).

### Fixed
- 리뷰 보강: `youtube_url`을 YouTube 호스트로 제한(`javascript:`/`data:` 등 위험 스킴 차단), `photos` 경로 형식 강제(타 장비 객체 삭제·경로조작 방지), update/delete 0행 감지 + id UUID 검증, 생성 원자성(옵션 저장 실패 시 보상 삭제), DB 에러 메시지 일반화(스키마 노출 방지).

## [0.1.0.1] - 2026-05-29

### Fixed
- seed-admin 프로덕션 비밀번호 가드 — 비로컬(프로덕션) 시드는 `SEED_*_PASSWORD` env(≥16자) 필수, 약한 dev 기본 비번 사용 차단. 개발 전용 계정은 프로덕션 시드에서 제외. (코드리뷰 후속 보안 보완)

## [0.1.0.0] - 2026-05-29

### Added
- **E1 Foundation** — 견적관리 시스템의 단일테넌트 Postgres 토대(GitHub #2).
  - 6개 도메인 테이블(profiles·equipment·equipment_option·applications·quotes·email_log) 마이그레이션 + 전 테이블 RLS.
  - capability 권한 모델: `profiles.permissions[]` + 코드 registry(6키) + `has_permission()`(SECURITY DEFINER, InitPlan 래핑) RLS 헬퍼.
  - Supabase Auth 연동: `auth.users` INSERT 트리거로 profiles 자동 생성, service_role 부트스트랩 시드(개발 관리자·영업 계정).
  - 공개 장비 카탈로그: `equipment_public` 뷰(가격·옵션 비노출, active만)로 비로그인 고객에게 사진·스펙·YouTube 노출.
  - 공개 견적요청 폼 기반: `applications` anon INSERT(WITH CHECK status='new', 미배정) + 서버 생성 접수번호 `REQ-YYYYMMDD-NNNNN`(KST, 전역 sequence).
  - Storage 버킷: `equipment-images`(public) + `quote-pdfs`(private, 서명 URL).
  - `@jhtechsaas/shared` 패키지: permission registry + `can()` 헬퍼, Supabase 클라이언트 팩토리(anon/service_role 분리), 도메인 타입.
  - RLS 통합 테스트 하니스(`@jhtechsaas/db-tests`, `set role`+JWT) — 47 RLS + 10 단위 테스트.
  - 마이그레이션별 롤백 스크립트.
