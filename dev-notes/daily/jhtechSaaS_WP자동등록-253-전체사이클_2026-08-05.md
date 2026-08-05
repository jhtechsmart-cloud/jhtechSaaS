# jhtechSaaS — Dev Note: 장비 → 홈페이지(워드프레스) 자동 등록 (#253 전체 사이클)

> **📅 Date:** 2026-08-04 ~ 2026-08-05 · **🗂️ Project:** jhtechSaaS · **🏷️ Main Task:** WP 자동 등록 (#253)
> **👤 Author:** Seonje · **🔖 Tags:** wordpress, worker, jobs-queue, triggers, rpc, dual-voice, gabia, ssl

---

## TL;DR

장비 등록 체크박스 하나로 jhtech.co.kr(워드프레스)에 글을 자동 생성·갱신·발행·비공개하는 기능을 **기획(가비아 실사)→/spec→/autoplan(dual-voice)→TDD→/review(스페셜리스트 5+적대)→/ship** 전체 사이클로 완주. PR #254 머지(main `26df39e`)·prod 마이그레이션 적용·Vercel/Railway 라이브. 단, **기존 장비 전부 체크 off + 워커 Fake 모드**라 prod 동작 변화 0 — SSL 승인 후 env 3종 주입으로 라이브 전환하는 안전 대기 상태.

---

## Today's Work

### 🔧 `chore(ops)`: 가비아 실사 — SSL 견적·웹쉘 오탐 해결·요금제 발견

**Status:** `completed`

- jhtech.co.kr 실측: WP 6.9.5, **wp-json 열려 있음**(구 메모리 "안 열림"은 post/pages 타입 착오 — 정정), 장비 글 = `post`+카테고리 `product(9)`, `/product/` 목록 = Elementor Portfolio 위젯(카테고리 동적 쿼리 = 자동 노출).
- **SSL 없음**(가비아 *.gabia.io 기본 인증서) → WP Application Password의 선행 조건. 가비아 웹호스팅은 자가 설치 불가 → Sectigo Basic 44,000 + 설치대행 33,000 = **연 77,000원**(회사 승인 대기).
- 가비아 콘솔 "웹쉘 탐지 1건" = **오탐 확정**(Elementor 3.13.3 정식 editor.js — WP 공식 원본과 SHA256 동일) → 예외 등록 완료.
- 부수 발견: 현 웹호스팅 = 2005년 구형 **월 245,000원**, 신형 워드프레스호스팅 스탠더드 = 월 22,000원(단 SSL은 어느 요금제도 미포함). **이전 시 연 ~260만 절약** — 별도 프로젝트 후보.

### ✨ `feat(#253)`: WP 자동 등록 전체 구현 — PR #254

**Status:** `completed` (머지·prod 반영)
**Files:** `supabase/migrations/20260804183000_equipment_wp_sync.sql`(+롤백), `packages/shared/src/wp-{publisher,post-html,status,category}.ts`·`youtube.ts`(승격), `apps/worker/src/jobs/wp-publish.ts`, `apps/web` 폼·상세 패널·분류 관리, 테스트 5레이어

#### 📋 Context

새 장비마다 SaaS와 홈페이지 이중 수동 등록 → 체크박스 1개로 통합. autoplan에서 두 모델이 "SaaS 카탈로그로 대체(C안)"를 권고했으나 사용자가 의뢰사 맥락으로 원안(A, 자동 동기화) 확정 + 절충(초안=저장 자동, 공개 글=[홈페이지 갱신] 버튼으로만).

#### 🔨 Implementation

- **DB**: equipment `wp_*` 8컬럼 + BEFORE 트리거(서버통제·INSERT 위조 차단·`wp_dirty` 필드비교=`equipment_wp_fields_changed` 단일 출처) + AFTER 트리거(INSERT/UPDATE/DELETE 분기 enqueue) + DEFINER RPC 2종(`enqueue_wp_publish` 권한·상태검증·활성잡 명시거부 / `record_wp_sync` post_id CAS·dirty 해제 CAS·p_replace) + 활성 잡 장비당 1건 부분 유니크(unpublish는 queued 대체).
- **shared**: `WpPublisher` 경계(Rest: https 강제·30s 타임아웃·Zod·permanent/auth/not_found/transient / Fake: calls·failNext — HIWORKS `FakeMailSender` 동형), `renderWpPostHtml`(전량 이스케이프·유튜브 화이트리스트·미리보기 썸네일 모드), `deriveWpStatus` 3축(공개×콘텐츠×작업).
- **worker**: sync(미디어 diff 업로드+선기록·post meta uuid 재연결·404 재생성·하트비트)·publish(재검증)·unpublish + **자가 치유**(sync가 상태 재확인 후 스스로 내림).
- **web**: 폼 체크박스+동적 캡션+공개 해제 확인 모달(전환만), 상세 홈페이지 패널(배지 매트릭스·sandbox iframe 미리보기·폴링), 분류 관리 WP 드롭다운(상속 표시).

#### 🐛 Problems & Solutions

1. **로컬 Supabase 이미지 segfault**: revoke된 함수를 authenticated/anon이 직접 호출하면 backend가 시그널 11로 죽음(기존 `claim_next_job`도 재현 — 롤백 이분검증으로 본 변경과 무관 확정). 권한 단언은 실행 대신 `has_function_privilege`로.
2. **tx-local 플래그 누수**: `set_config(...,true)`가 트랜잭션 끝까지 살아 같은 tx 후속 UPDATE의 가드·enqueue가 통째로 꺼짐 → UPDATE 한 문장 직전 set·직후 clear.
3. **`now()`는 tx 상수**: dirty 해제 CAS가 무력화 → `clock_timestamp()`. pg 드라이버 Date 변환은 μs 소실 → 타임스탬프는 문자열 왕복.
4. **/review 치명 2건**: ①WP 코어 REST가 meta 쿼리를 **조용히 무시**(최신 글 반환) → findByMeta 응답 meta 클라이언트 대조로 무관 글 덮어쓰기 차단 ②활성 잡 유니크 흡수로 unpublish 소실 → queued 대체+자가 치유+publish 재검증 3중 방어.
5. **INSERT 트리거 공백**: 체크 켠 채 신규 등록하면 잡이 안 생김(UPDATE만 걸려 있었음) → INSERT 분기 추가.

#### ✅ Gates

shared 201 · worker 98(integration 11) · web 525 · db-tests 29/545(클린 reset) · e2e wp-publish 3/3+전체 102 · typecheck·lint 0err·build · `as any` 0. (db-tests 잔여 4건 = 위 segfault 환경버그, 본 변경 무관 이분검증됨)

---

## 다음 세션

1. **SSL 회사 승인 후 라이브 전환**: 가비아 SSL 적용 → WP 전용 계정+App Password → Railway env 3종 → `wp-public.ts` https → `/admin/categories` 매핑 → 라이브 스모크(5MB 사진·meta 재연결 — WP측 `register_post_meta(show_in_rest)` 필요 여부 확인).
2. prod에서 UI 실동작 확인(체크박스·패널·매핑 — Fake라 안전).
3. 이월: #245 AS 히스토리 Part 4·기사 파일럿·as.jhtech.co.kr·HIWORKS 토큰·가비아 호스팅 이전 검토(연 260만).
