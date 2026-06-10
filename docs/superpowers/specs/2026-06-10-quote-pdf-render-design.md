# 견적서 PDF 실제 양식 생성 — 설계

> **한 문장 요약**: 이미 라이브인 PDF 파이프라인(발행→jobs 큐→워커→스토리지 업로드→`pdf_url`)에서 **placeholder를 Puppeteer HTML→PDF 렌더로 교체**해, 재현테크 실제 견적서 양식(장비별 상·하단 배너 + 동적 가운데)을 충실히 재현한다.
>
> **왜 필요한가**: 배관(트리거·큐·워커·업로드·다운로드 UI)은 PR #63에서 완성·라이브지만, 나오는 PDF가 영문 금액 몇 줄짜리 placeholder다. 발행 시 진짜 견적서가 나오게 "내용물"을 채우는 작업이다.

- 날짜: 2026-06-10
- 브랜치: `feat/quote-pdf-render`
- 기준 양식: `Multicut Eco SG1625_예일아트.pdf`(커팅기), `JU1810 PLUS-문우명판.pdf`(프린터) — 재현테크 실제 발행본 2종.

---

## 1. 확정된 결정 (브레인스토밍)

| 항목 | 결정 |
|---|---|
| 양식 기준 | 재현테크 실제 양식 충실 재현 |
| 장비별 이미지 | **완성된 띠 배너 2장**(상단·하단, 로고·제목·그라데이션·제품사진 전부 포함). Seonje 제공. |
| 렌더 엔진 | **Puppeteer**(HTML→PDF). 속도는 Playwright와 동일, footprint·부하 더 가벼움. 워커 상주라 크롬 1회 기동 후 재사용. |
| 장비사양 섹션 | **동적 표시** — `equipment.specs`(jsonb, `SpecGroup[]`)가 있으면 렌더, 없으면 생략(커팅기·프린터 양식 차이 자연 수용). |
| 배너 관리 | **관리자 장비 화면에 업로드 슬롯 2칸**(기존 `ImageUploader` 패턴 재사용). |
| 담당자 전화 | **`profiles.phone`(nullable) 추가**. |
| 도장 이미지 | Seonje 제공(공급자 박스용 상수 자산). |

---

## 2. 양식 구조 (두 양식 공통 골격)

```
┌──────────────────────────────────────────┐
│ [상단 띠 — 장비별 배너 이미지]             │  로고+제품명 로고+제품 렌더(그라데이션)
├──────────────────────────────────────────┤
│ 견적일자/번호/담당자+전화 │ 공급자 박스+도장 │  좌: 견적 메타 / 우: 재현테크 고정정보 + 직인
│ ___ 귀하 (수신=신청기업)                    │
│ 아래와 같이 견적합니다.                      │
│ [합계금액 띠] 일금 ○○원정(VAT별도)(₩공급가-) │
│ ┌품목표 품목명│수량│단가│공급가액│비고┐      │  메인품목(굵게)+포함옵션(들여쓰기"포함")+총계
│ (장비사양 섹션 — specs 있을 때만)           │
│ [특기사항 띠] 1.VAT별도 2.유효기간 1개월     │
├──────────────────────────────────────────┤
│ [하단 띠 — 장비별 배너 이미지]             │  제품 대형사진+제품로고+기능아이콘
└──────────────────────────────────────────┘
```

- 헤드라인 금액 = **공급가(VAT별도)** = `quote.supply_price`. (양식이 VAT별도 표기, 총계도 공급가)
- 품목표 매핑: 메인품목=`quote.items`(굵은 행), 포함옵션=`quote.options(kind=included)`(단가·공급가액 칸 "포함"), 추가옵션=`quote.options(kind=extra)`(실제 ₩), 총계=공급가 합.

---

## 3. 아키텍처 — 기존 재사용, 한 곳만 교체

**그대로 유지(라이브)**: `quotes_enqueue_pdf` 트리거 / `jobs` 큐 / `claim_next_job` / 워커 폴링 / `quote-pdfs` 업로드 / `pdf_url` 기록 / UI 다운로드 버튼.

**교체·확장**:
1. 워커 `apps/worker/src/jobs/render-quote-pdf.ts`: pdf-lib `buildQuotePdf` → **Puppeteer 렌더**(`renderQuoteHtml`로 HTML 생성 → 크롬 print-to-PDF).
2. 워커 `apps/worker/src/jobs/quote-pdf.ts`: 데이터 조회 확장(현재 금액만 → 품목·옵션·신청기업·담당자·장비배너·specs).
3. 크롬 기동: 워커 상주 프로세스에서 **싱글턴 1회 기동 후 잡마다 재사용**, 프로세스 종료 시 `browser.close()`.

데이터 흐름:
```
job{quote_id} → quote(items,options,supply_price,quote_no,version,issued_at,assignee_id,application_id)
              → application/company(수신처·biz정보) + assignee(profiles.name, phone)
              → equipment(배너·specs): application.equipment_id 우선, 없으면 메인품목 이름매칭
              → COMPANY_INFO 상수 + 도장 자산 + 한글금액
              → renderQuoteHtml(data) → Puppeteer page.pdf() → quote-pdfs 업로드 → pdf_url
```

---

## 4. 데이터 모델 변경

### 4.1 마이그레이션 (신규 1개)
- **equipment 배너 컬럼**: `quote_banner_top text`, `quote_banner_bottom text`(nullable, 스토리지 경로). `equipment-images` 버킷 재사용(경로 예 `equipment/{id}/banner-top.{ext}`). RLS 무변경.
- **profiles 전화**: `profiles.phone text`(nullable). RLS 무변경(기존 profiles 정책 범위 내, 사용자 편집 컬럼).
- 롤백 스크립트 `supabase/rollback/<ts>_quote_pdf_fields_down.sql`.

### 4.2 공급자 상수 (신규 `packages/shared/src/company.ts`)
두 양식에서 읽은 고정값. **워커·web 둘 다 써야 하므로 `packages/shared`에 두고 공유**(web은 향후 화면에서도 재사용 가능).
```ts
export const SUPPLIER = {
  bizNo: "113-81-80804",
  name: "(주)재현테크",
  ceo: "이무직",
  address: "서울시 구로구 구로동 235-2 에이스하이앤드타워 705호",
  phoneHQ: "02-839-7723",      // 서울본사
  phoneDaegu: "053-650-7723",  // 대구지사
  bizType: "제조, 도소매, 도매", // 업태
  bizItem: "인쇄, 인쇄기기 외",   // 종목
} as const;
```

### 4.3 견적→장비 매핑(배너·specs)
- `application.equipment_id` 있으면 그 장비.
- 없으면(수기 등) `quote.items` 메인품목 이름을 카탈로그와 매칭(기존 `matchEquipmentName`/`equipment-match` 로직 재사용).
- 매칭 실패 → 배너·specs 생략(graceful, 가운데 데이터만 렌더).

---

## 5. 관리자 장비 화면 — 배너 업로드 2칸
- `apps/web/src/app/admin/equipment/_components/EquipmentForm.tsx`에 기존 `ImageUploader`(클라 직접 `equipment-images` 업로드, 5MB·확장자 검증·세션 cleanup) 패턴을 재사용해 **"견적서 상단 배너"·"견적서 하단 배너" 슬롯 2개** 추가.
- 저장 시 경로를 `quote_banner_top`/`quote_banner_bottom`에 기록(`equipment/schema.ts`·`actions.ts` 확장).
- 단일 이미지 슬롯(배열 아님) — 기존 `ImageUploader`가 다중이면 max 1로 제한하거나 단일용 래퍼.

---

## 6. PDF 템플릿 + 렌더 (워커)

### 6.1 `renderQuoteHtml(data): string` (순수 함수)
- A4(210×297mm), `@page { size:A4; margin:0 }`, `printBackground`.
- **한글 폰트**: Pretendard 또는 Noto Sans KR **TTF를 워커에 번들**(`apps/worker/assets/`), `@font-face`에 **base64 data-URI inline**(컨테이너 폰트 경로 의존 제거).
- **배너 이미지**: 워커가 스토리지에서 서명URL(또는 service_role 다운로드 후 base64)로 가져와 `<img>`. base64 inline이 가장 안전(외부 fetch 타이밍 회피).
- **도장**: 번들 자산 base64 inline.
- 섹션: 상단배너 → 헤더(견적메타 / 공급자박스+도장) → 수신처 → 합계띠+한글금액 → 품목표 → (specs면)장비사양 → 특기사항 → 하단배너.

### 6.2 Puppeteer 렌더
```ts
// 싱글턴 브라우저(상주 워커, 1회 기동 후 재사용)
const browser = await getBrowser();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle0" });
const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
await page.close();
return pdf;
```
- Railway 크롬: `puppeteer`(번들 크롬) 우선, 컨테이너 구동 불안정 시 `@sparticuz/chromium` 검토(구현 단계 결정).

### 6.3 한글 금액 유틸 (shared, TDD)
- `packages/shared/src/korean-amount.ts`: `numberToKoreanAmount(75000000) → "칠천오백만"`(억·만·천·백·십 단위, 0 처리). 헤드라인 "일금 {한글}원정(VAT별도)".

---

## 7. 필요 자산 (Seonje 제공)
- 장비별 상·하단 배너 2장 → 관리자 장비 화면 업로드.
- **도장(빨간 직인) 이미지 1장** → 워커 번들 자산(공급자 박스).
- 한글 폰트 TTF는 오픈소스(Pretendard/Noto Sans KR) 번들 — 별도 제공 불필요.

---

## 8. 스코프 / 비범위 (v1)

**포함:**
- 상·하단 장비 배너, 공급자 박스+도장, 수신처, 견적메타(일자·번호·담당자+전화), 합계띠+한글금액, 품목표(메인+포함"포함"+추가+총계), 장비사양(specs 있을 때), 표준 특기사항 2줄.
- equipment 배너 컬럼·업로드 UI, profiles.phone, 공급자 상수, 한글금액 유틸.

**비범위:**
- 견적별 **커스텀 특기사항**(3번째 줄 등) — 기존 계획 "3b 특기사항(quotes 컬럼)"과 묶어 후속. v1은 표준 2줄 상수.
- 메일 발송(E6 하이웍스).
- 다중 페이지(단일 A4 가정 — 품목 많으면 후속에서 페이지네이션).
- 견적 items `equipment_id` 영속(기존 후속 과제) — v1은 이름매칭으로 충분.

---

## 9. 테스트 · 게이트
- `numberToKoreanAmount` 단위(shared Vitest).
- `renderQuoteHtml` 순수 — 핵심 데이터가 HTML에 포함되는지 단언(회사명·견적번호·공급가·메인품목명·"포함"·수신처·한글금액). 픽셀검증은 비현실적 → 구조 단언.
- 워커 통합 — 렌더 산출물이 유효 PDF(`%PDF` 헤더, 비어있지 않음). 기존 `runner.integration.test.ts`·`render-quote-pdf.test.ts` 확장.
- db-test — 신규 컬럼(equipment 배너·profiles.phone) INSERT/UPDATE 권한 단언(`packages/db-tests`).
- 게이트: shared·web·worker test·typecheck·lint·build·e2e·db-tests:rls·`as any` 0 모두 GREEN. 마이그레이션 추가 → **클린 `db reset`+`seed-local`**에서 db-test·e2e.

---

## 10. 리스크 · 완화
| 리스크 | 완화 |
|---|---|
| Railway 크롬 구동 안정성 | `puppeteer` 번들 크롬 우선, 불안정 시 `@sparticuz/chromium`. 상주 워커라 1회 기동. |
| 한글 폰트 임베딩 실패 | base64 data-URI `@font-face`로 경로 의존 제거. `waitUntil:networkidle0`로 폰트 로드 대기. |
| 양식 픽셀 100% 불일치 | 배너가 시각 대부분을 차지(완성 이미지)하고 가운데는 표/텍스트 → 구조 충실 재현 목표. 발행 후 실물 PDF 육안 검수. |
| 워커 메모리(크롬) | 상주 1개 브라우저 재사용, 페이지는 잡마다 생성·close. Railway 플랜 메모리 확인. |
| 매핑 실패(배너 못 찾음) | graceful — 배너·specs 생략하고 가운데만 렌더(에러 아님). |
