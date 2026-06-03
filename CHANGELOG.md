# Changelog

이 프로젝트의 주요 변경 사항을 기록한다. [Keep a Changelog](https://keepachangelog.com/) 형식, [Semantic Versioning](https://semver.org/)(4자리 MAJOR.MINOR.PATCH.MICRO).

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
