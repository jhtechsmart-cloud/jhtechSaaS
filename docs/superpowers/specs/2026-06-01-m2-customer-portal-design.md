# Design: M2 — 고객 포털 & 운영 백본 (재현테크 SaaS)

- 작성: 2026-06-01 / 오너: 조선제
- 상태: APPROVED (brainstorm) — 마일스톤 설계. 각 단계(P-A~P-G)는 자체 상세 spec→plan으로 진행.
- 선행: E1~E7(M1). 이 문서는 M1과 **별개의 새 마일스톤**이다.
- 참고: 어제(5/31) 상세 재구성 미리보기 `~/workspace/e3-detail-mockup.html`, 참조 이미지 `~/workspace/SCR-20260531-tprs.jpeg`(요약/highlights)·`SCR-20260531-tpvi.png`(그룹 사양).

## 1. 개요 / 북극성

고객이 직접 쓰는 **고객 포털**을 신설한다. 홈에서 의도에 따라 3분기(견적요청 / A/S신청 / 소모품신청)로 갈라지고, 각 흐름이 DB에 저장되어 내부 운영(견적·이력·유지보수)으로 이어진다.

핵심 전환점: A/S·소모품은 **이미 장비를 구매한 업체**가 쓰는 기능이라, "누가 어떤 장비를 언제 샀는지"를 담는 **고객·구매 마스터(미니 CRM)** 가 전제다. 이는 M1에서 v1.1+/Out-of-scope로 미뤘던 영역이며 E7(업체 이력)과 겹친다. 따라서 M2는 단순 폼 3개가 아니라 **고객 포털 + 운영 백본** 신설이다.

설계 원칙은 M1 그대로: 단일테넌트, capability 권한 + RLS 전 테이블, 서버통제값은 트리거 불변, 무거운/주기 작업은 Railway 워커, 외부 API 응답은 Zod 검증.

## 2. 정보구조(IA) / 흐름

```
홈 (3분기: 버튼 등)
 ├─ 견적요청
 │   └─ 카탈로그(장비 박스: 사진·모델명·간단설명 + [상세정보][장비선택])
 │       ├─ [상세정보] → 장비 상세페이지 → [장비선택]
 │       └─ [장비선택] → 견적요청 폼
 ├─ A/S신청 → 사업자번호 조회 → (자동완성) → 신청
 └─ 소모품신청 → 사업자번호 조회 → (정보표시 + 소모품 선택) → 신청
```

- 현재 `/`(미니멀)·`/equipment`(공개 카탈로그)·`/request`(폼)은 이 IA로 재배치된다. 카탈로그는 "견적요청" 분기 안으로 들어간다.

### 2.1 장비 상세페이지 (재구성, 어제 합의)
- **상단(2열)**: 좌 = 대표사진 + 썸네일 / 우 = 제품명·모델·카테고리 + **요약(highlights 불릿)** + `[장비선택]` CTA
- **중단(전폭)**: 제품 사양 — **아이콘 + 그룹**(해상도·속도·잉크·크기·전원·환경 등). 현재 우측 단순표를 전폭 그룹형으로.
- **하단(전폭)**: 제품 영상 — **1개 또는 여러 개**(youtube_urls 그리드, 0개면 섹션 생략)

### 2.2 견적요청 폼 (대폭 확장)
- 최상단: **개인정보 동의**(필수 체크박스 + 전문 아코디언/모달)
- 기본: 선택장비(1건) · 회사명 · 대표자(담당자) · 사업자등록번호 · 연락처 · 이메일 · 주소 · 요청사항
- **외부전경**(섹션): 출입구 1장 · 건물외관 1장 — 이미지 업로드(선택)
- **내부전경**(섹션): 출입구 1장 · 설치예정 장소 1장 — 이미지 업로드(선택)
- **설치장소유형**: 건물유형(공장/상가/사무실/기타) · 설치위치(지하/1층/2층이상) · 엘리베이터(있음/없음) · 기타사항(차량진입난·수작업운반·사다리차 — **다중 체크**) · 전력(단상220V/3상380V) · 공압(있음/없음) · 기타요청사항
- 제출 → `applications` 저장. 향후 견적확정·견적서 발행(E5) 시 status 전이.
- 사진 = **선택**, 항목당 1장. **제출 완료 시에만 업로드**(미완료 시 미저장 → 고아 파일 없음).

### 2.3 A/S신청 (기존 고객)
- 최상단: 개인정보 동의 + **사업자번호 조회** 섹션
- 조회 성공 → 자동완성: 장비명(복수면 선택) · 구입일 · 담당영업 · 업체명 · 대표 · biz_no · 설치주소 · 연락처 · 이메일
- 조회 실패(미등록) → 직접 입력 또는 담당자 연락처 안내
- 제출 → `service_requests` 저장 → **접수증 PDF 발급·보관** + **담당자 알림(카톡/문자) + 관리자 웹 알림**

### 2.4 소모품신청 (기존 고객)
- A/S와 동일 조회. 단 업체정보는 **표시만**(편집 불가)
- 그 업체가 보유한 장비에 맞는 **소모품 목록**을 띄워 선택, 소모품별 **수량** 지정(1 소모품 다수량 가능)
- 미등록 시 직접 입력 또는 담당자 안내. 최상단 동의 필요.

## 3. 데이터 모델 (신규/변경)

> 모든 도메인 테이블 RLS 필수. anon은 INSERT 또는 최소 조회만. 서버통제값(접수번호·생성시각·status·동의시각)은 BEFORE INSERT/UPDATE 트리거로 불변 강제. 익명 제출 경로는 SECURITY DEFINER RPC.

| 테이블 | 변경/신규 | 핵심 컬럼 | 단계 |
|---|---|---|---|
| `equipment` | 변경 | +`highlights`(요약 불릿) · `youtube_url`→`youtube_urls`(배열) · `specs` 그룹구조(jsonb `[{group, icon, items:[{label,value}]}]`) | P-A |
| `applications`(견적) | 변경 | +`privacy_consent` bool NOT NULL · `privacy_consent_at` timestamptz NOT NULL · `privacy_consent_version` text NOT NULL · `fields` jsonb에 설치설문 · 사진 4슬롯 경로 · 선택 `equipment_id` | P-A |
| `privacy_policies` | 신규 | id · `version`(예 v1.0) · `body` text · `effective_at` | P-A |
| `companies`(고객) | 신규 | id · `biz_no` unique · 업체명 · 대표 · 연락처 · 이메일 · 주소 · `assignee_id`(담당영업→profiles) | P-B |
| `company_equipment`(보유장비) | 신규 | id · company_id · equipment_id · `purchased_at`(구입일) · `install_address` | P-B |
| `consumables` | 신규 | id · equipment_id(또는 M:N) · name · unit · price? | P-C |
| `service_requests`(A/S) | 신규 | id · company_id · equipment_id(선택) · 내용 · `status`(접수→완료) · 동의 3컬럼 · `receipt_pdf_url` | P-D |
| `supply_requests`(소모품) + `supply_request_items` | 신규 | request: company_id · status · 동의 3컬럼 / item: request_id · consumable_id · `qty` | P-E |
| `notifications` | 신규 | id · type · target(담당자/관리자) · ref · read · created_at | P-G |
| Storage `customer-uploads` | 신규 버킷 | anon insert · 용량/타입/개수 제한 · **제출 시 업로드** | P-A |
| `jobs` 큐 | 재사용 | A/S 접수증 PDF · 알림 발송 | P-D/P-G |

- 고객 마스터 채우기(1차): **admin 수기 + 견적확정 자동(혼합)**. 추후: 계약서 기반(견적확정 내용 불러와 변경분 수정) + 구시스템 일괄 import.
- 익명 사업자번호 조회 PII: **B2B 저위험 — 전체 자동완성 노출**(추가 본인확인 없음). 위험 재평가 시 본인확인 추가 여지.

## 4. 단계 분해 (P-A ~ P-G)

| 단계 | 내용 | 산출물 | 의존 |
|---|---|---|---|
| **P-A 견적요청 v2** | 홈 3분기 + 카탈로그 박스([상세][선택]) + 상세 재구성(highlights·그룹사양·youtube복수) + 대형 견적폼(동의·이미지업로드·설치설문·biz_no 체크섬) | equipment 마이그레이션, 카탈로그/상세/폼 라우트, 동의·설문·업로드, biz_no 순수함수, **E2 admin 입력 UI**(highlights·youtube복수·그룹사양) | E2, E3 |
| **P-B 고객·구매 마스터** | `companies` + `company_equipment` + admin 입력 + 견적확정 자동생성 훅 | 마이그레이션, admin CRUD, 조회 RPC | E1 |
| **P-C 소모품 카탈로그** | 장비별 `consumables` + admin 관리 | 마이그레이션, admin CRUD | E2, P-B |
| **P-D A/S신청** | biz_no 조회→자동완성 + 신청 저장 + 접수증 PDF(워커) + 알림 | service_requests, 조회 RPC, PDF 워커잡 | P-B, E5(PDF) |
| **P-E 소모품신청** | biz_no 조회→표시 + 장비별 소모품 선택(수량) + 저장 | supply_requests(+items) | P-C |
| **P-F 통합 고객이력** | 관리자: 견적/구입/AS/소모품 + 완료여부 한눈 | 고객 상세 뷰(E7 확장) | P-B~E |
| **P-G 알림 인프라** | 관리자 웹 알림(즉시) + 카톡/문자(외부, 후속) | notifications + 발송 워커잡 | P-D |

**순서**: P-A → P-B → P-C → P-D·P-E → P-F → P-G. (사용자 승인)
- P-A는 토대 의존이 없어 먼저 가치를 낸다(원래 원하던 상세 재구성 포함).
- P-B가 AS·소모품의 핵심 전제.
- 카톡/문자는 외부 의존이라 가장 뒤.

## 5. 결정 로그

- D1. 견적 1건 = 장비 1개.
- D2. 견적폼 사진 = 선택, 항목당 1장, 제출 시에만 업로드(고아 없음).
- D3. 개인정보 동의: 컬럼 3개 + `privacy_policies` 버전 테이블. 문구 = 사용자 제공 v1.0.
- D4. 사업자번호 검증: 1차 체크섬(클라+서버 순수함수). 국세청 상태조회·암호화는 후속 단계.
- D5. (후속 국세청 적용 시) 휴·폐업·미등록이어도 경고만, 제출 허용.
- D6. biz_no 1차 평문 유지(+RLS 권한자만 열람). pgcrypto 암호화는 별도 보안 단계.
- D7. 고객 마스터 채우기 = admin 수기 + 견적확정 자동(혼합). 계약서 자동·구시스템 import는 후속.
- D8. 익명 biz_no 조회 = B2B 저위험, 전체 자동완성 노출.
- D9. 자동 파기 cron·접수증 PDF·알림 발송 = Railway 워커(jobs 큐). Supabase Edge Function 회피(M1 배포 분리 원칙).
- D10. 데이터 모델: 견적 테이블명은 기존 `applications`(요구사항의 quote_requests와 동일 개념).

## 6. 외부 의존 / 사용자 액션 (리드타임)

- 카톡 알림톡/문자 **발송사 가입·발신프로필 심사**(알리고·카카오 비즈메시지 등) — P-G 전까지.
- 개인정보처리방침 **최종 법무 확인**(v1.0로 진행, 개정 시 `privacy_policies`에 새 버전).
- (후속) 국세청 사업자등록 상태조회 — data.go.kr 무료 서비스키 발급.

## 7. 보존·파기 (개인정보)

- 수집일 3년 경과 자동 파기(Railway 워커 cron). 단 계약 체결건(status)은 5년 보관(법령) → status 분기 파기.
- 동의 이력(여부·시각·버전)은 감사 목적 보존.

## 8. Out of scope (이 마일스톤 밖 / 후속)

- biz_no 국세청 진위·상태조회, biz_no 암호화(pgcrypto).
- 카톡/문자 실제 연동(P-G에서 관리자 웹 알림 먼저, 외부 발송은 발송사 준비 후).
- 구시스템(jhtechsmart) 운영 데이터 일괄 import.
- 견적서 발행·통합 PDF(=M1 E5) 본체. M2는 그 status 전이 지점만 연결.

## 9. 각 단계 spec에서 풀 사항(이 문서가 정하지 않음)

- 그룹 사양 jsonb 정확한 스키마·아이콘 셋·admin 입력 UX.
- highlights/ youtube_urls admin 입력 위젯(불릿 textarea·URL 리스트).
- customer-uploads 버킷 정책 상세(경로 규칙·MIME·크기·개수·RLS).
- companies/ownership RLS 정책표·조회 RPC 시그니처.
- consumables ↔ equipment 관계(M:N 여부).
- service/supply request status enum·전이 규칙.
- notifications 스키마·관리자 UI·읽음 처리.
