# 장비출고의뢰서 — 설계 (Spec)

**작성일**: 2026-06-17 · **상태**: 승인됨 → 구현 대기
**레이아웃 레퍼런스**: `docs/superpowers/specs/2026-06-17-release-order-mockup.html`

## 한 문장 요약
계약 확정된 의뢰에서 출고의뢰서를 (고객·장비·설치일시·설치설문 자동채움 +) 나머지 입력해 작성하고, 워커로 PDF를 만들어 공장에 전달한다.

## 왜 필요한가
견적 메일 발송 → 고객 미팅·계약 후, 공장에 "이 장비를 이렇게 구성해 이 현장으로 출고·설치하라"고 지시하는 종이 양식을 시스템으로. 고객·장비·설치설문 데이터는 이미 시스템에 있으므로 자동채움하고, 물류·장비 구성 상세만 담당자가 채운다.

## 결정사항 (사용자 확정)
- **연결**: 의뢰(application)에 **1:1**(`UNIQUE(application_id)`). 최신 발행 견적에서 프리필. 계약서 단계는 나중에 별도.
- **범위**: 종이 양식 **전체 재현(프린터+커팅기)**. v1에 둘 다.
- **출력**: **워커 PDF + 다운로드/인쇄**(견적서와 동일 인프라). 공장 이메일 발송은 나중.
- **UI**: 종이 양식의 구획·입력위치·체크박스 배치를 **그대로** 따라가 담당자가 헷갈리지 않게. 자동채움 칸은 민트색으로 구분.

---

## 1. 데이터 모델 — `release_orders` (의뢰 1:1)
견적(quotes)이 `items` jsonb를 쓰듯, 항목이 많아 **핵심 컬럼 + details jsonb**.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid pk | |
| seq_no | text | 출고번호 `REL-YYYYMMDD-NNNNN`(KST·전역 sequence·BEFORE INSERT 트리거 강제) |
| application_id | uuid | **UNIQUE** not null, FK applications |
| quote_id | uuid | FK quotes(프리필 출처, nullable) |
| device_kind | text | check in ('printer','cutter') |
| status | text | check in ('draft','issued') default 'draft' |
| company | text | 스냅샷(작성 시점 고정) |
| contact_phone | text | 스냅샷 |
| install_address | text | 스냅샷 |
| install_at | timestamptz | 설치 일시(스냅샷) |
| device_name | text | 스냅샷 |
| details | jsonb | not null default '{}' — 아래 구조(Zod 검증) |
| pdf_url | text | 워커 생성 |
| created_by | uuid | FK profiles |
| created_at, issued_at | timestamptz | created_at 서버 트리거 강제 |

**details jsonb 구조**(shared Zod `ReleaseOrderDetailsSchema`):
```
{
  printer: { rip, headType, headCount, colors:[CMYK,W,varnish 부분], inkType, inkQty } | null,
  cutter:  { tools:[기본툴,RCT,POT,라우터툴,라우터매트], camera:[내장형,외부OCC], extras:[링블로워,에어컴프레서,컨베이어벨트] } | null,
  common:  { testMaterial, otherSupplies, computerPrep:bool, dobi:bool, disassemble:bool },
  prep:    { transport:[1톤리프트,윙바디,카고], inboundItems:[도비바퀴,자키,침목,나무,랩핑테이프,리프트,밧줄],
             electrical:[케이블,예비멀티탭,컴퓨터용멀티탭,차단기], otherPrep:[명판로고안전,에어라인] },
  site:    { inboundPlan, doorType, doorSize, power, parking,
             blower:{install:bool,note}, compressor:{install:bool,note} }
}
```
device_kind에 따라 printer/cutter 중 하나만 채움(다른 쪽 null). 체크박스류는 문자열 배열, 자유입력은 문자열.

## 2. 자동 프리필
| 출고서 항목 | 출처 |
|---|---|
| company / contact_phone / install_address | application |
| device_name | 최신 발행 quote `items[0].name`(+equipmentId) |
| device_kind | 견적 장비의 `equipment_category.quote_logo_kind`(printer/cutter, 자동·수정가능) |
| install_at | quote `delivery_date`+`delivery_time` |
| site 초안(inboundPlan·power·parking 등) | application `fields.install_survey`(building_type·location·elevator·handling·power·pneumatic) |
| prep.electrical 초안 | install_survey.power 기반 |

프리필은 **순수 함수**(shared `buildReleaseOrderPrefill(application, quote, surveyMaps)`)로 분리 → 단위 테스트.

## 3. 작성/발행 (RPC, SECURITY DEFINER)
- `upsert_release_order(p_application_id, p_device_kind, p_details jsonb, ...)`: `release_orders.write` 권한 + 행 스코프(배정 본인/view_all) 검증, 스냅샷(company 등)은 서버가 application/quote에서 채움(클라 미신뢰), draft upsert(application_id 1:1).
- `issue_release_order(p_id)`: status draft→issued + `jobs(type='release_pdf')` enqueue(AFTER 트리거 또는 RPC 내). 발행본 불변(트리거: issued 행은 pdf_url 외 동결 — 견적 패턴 재사용).
- authenticated grant, anon revoke.

## 4. UI (작성 페이지 — 종이 양식 본뜸)
- 의뢰 상세(`/admin/applications/[id]`)에 **"출고의뢰서"** 진입 → `/admin/applications/[id]/release-order`.
- 레이아웃(레퍼런스 mockup 그대로):
  - **① 고객정보**: 회사·장비·전화·설치일시·주소. 자동채움 칸 = **민트 배경 + "자동" 배지**.
  - **② 장비상세정보**: 상단 **프린터/커팅기 토글**(자동판별·수정), 좌 프린터(활성=파인 테두리)/우 커팅기(미선택=흐림) **2분할** — 종이대로. 체크박스 위치도 종이대로(RIP·칼라·툴·카메라). 하단 공통(테스트소재·기타물품·컴퓨터관련·도비/분해).
  - **③ 기본 준비사항 체크**: 운송차량/전기(설문연동)/입고준비물/기타준비물 — **2×2 카드** 그룹.
  - **④ 설치 현장정보**: 입고계획·출입문·전원·주차·링블로워·컴프레서. 설문 유래 칸엔 "설문" 배지.
  - 하단: 임시저장 / 발행+PDF 생성.
- 발행본은 견적처럼 잠금(편집 시 새로 고치려면 경고).
- **모바일 반응형 필수 (처음부터)**: 이 폼은 관리자 모바일 대응 범위에 포함된다(`docs/superpowers/specs/2026-06-17-mobile-admin-design.md` 참조). 작성 페이지를 짓는 단계에서 **반응형을 처음부터** 넣는다 — 나중에 따로 뜯어고치지 않는다.
  - 분기점은 모바일 대응 전체와 동일하게 `lg`(1024px). 아래는 `lg` 미만 동작.
  - ②의 **프린터·커팅기 2분할은 모바일에서 세로 1열**(토글로 한쪽씩 보여도 됨).
  - ①(grid3)·③(2×2 카드)·④(grid2)는 **`lg` 미만에서 1열로 쌓임**(grid3→grid2→grid1 식).
  - 하단 "임시저장/발행" 액션은 모바일에서 **하단 고정 바**로(견적 작성과 동일 패턴).
  - 자동채움 칸 민트 배경·"자동"/"설문" 배지는 모바일에서도 유지.

## 5. PDF (워커, 견적서 인프라 재사용)
- `jobs(type='release_pdf', payload.release_order_id)` → 워커 `render-release-pdf`가 종이 양식 레이아웃을 HTML 조립(`apps/worker/src/jobs/release-html.ts`) → `puppeteer-core`(browser.ts 재사용) → 비공개 버킷 `release-orders` 업로드 → `release_orders.pdf_url`.
- 다운로드 = 견적 PDF 라우트 패턴(`/admin/.../release-order/pdf` 클릭 시 서명URL 발급).

## 6. 권한·보안
- 신규 capability **`release_orders.write`**: permissions registry + SALES_PRESET + admin(`users.manage`) 자동 통과.
- `release_orders` RLS 4종(SELECT=배정/view_all 또는 release_orders.write, INSERT/UPDATE=release_orders.write + 행스코프, DELETE=users.manage). 발행본 불변 트리거. seq_no·created_at 서버 트리거 강제.
- 버킷 `release-orders` 비공개, 워커(service_role) 쓰기, 읽기 권한자 서명URL.

## 테스트 / 게이트
- shared: `ReleaseOrderDetailsSchema` 검증, `buildReleaseOrderPrefill` 순수 단위.
- db-tests: RLS(권한·행스코프), seq_no 채번/불변, 발행본 동결, 1:1 UNIQUE.
- web: 작성 폼 순수 로직(섹션 직렬화·토글) 단위, e2e(작성→발행→PDF버튼).
- worker: release-html 렌더(시각검증 tsx → Read 대조), 통합(발행→잡→PDF→pdf_url).
- 공통 게이트(typecheck·lint·build·`as any` 0). db-test/e2e 클린 reset+seed.

## 범위 밖 (YAGNI)
- 계약서 단계, 공장 이메일 발송(다운로드/인쇄로 v1), 장비별 RIP/헤드/잉크 **기본값 프리셋**(v1 매번 입력 — 나중 equipment 구조화 필드), 출고 이력/상태추적 워크플로.

## 구현 단계 (각 PR)
1. **DB**: release_orders 테이블·seq_no·RLS·불변·capability·버킷 + db-tests.
2. **shared**: details Zod + prefill 순수함수 + 테스트.
3. **RPC + UI**: upsert/issue RPC + 작성 페이지(종이 양식 레이아웃, **`lg` 미만 반응형 처음부터** — §4 모바일 조항) + 의뢰상세 진입.
4. **워커 PDF**: release-html 조립 + render-release-pdf 잡 + 다운로드 라우트.
5. **게이트·배포**(단계별 db push).
