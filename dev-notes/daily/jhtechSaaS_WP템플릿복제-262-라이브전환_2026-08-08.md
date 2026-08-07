# jhtechSaaS — Dev Note: WP 라이브 전환 + 템플릿 복제 v2 (#262 전체 사이클)

> **📅 Date:** 2026-08-07 ~ 2026-08-08 · **🗂️ Project:** jhtechSaaS · **🏷️ Main Task:** WP 라이브 전환 + Elementor 템플릿 복제 (#262)
> **👤 Author:** Seonje · **🔖 Tags:** wordpress, elementor, php-plugin, gabia-waf, template-clone, autoplan, live-smoke

---

## TL;DR

이틀에 걸쳐 두 개의 큰 덩어리를 완주. **①WP 자동 등록 라이브 전환**: SSL 확인→saas-bot 앱패스워드→Railway env→분류 매핑→스모크, 그 과정에서 가비아 환경 실버그 3건(findByMeta 3.8MB 타임아웃·DELETE 메서드 302 차단·미디어 원시 바이너리 차단)을 실측으로 잡아 수정(PR #256~259) + UX 2건(PR #260·261). **②레이아웃 격차 피드백("차라리 수동이 낫겠다") → 템플릿 복제 v2**: /spec(#262)→/autoplan(검증 게이트: Elementor Pro 확인·순수 복제 PoC 픽셀 동일·빈도 실측 — User Challenge 2회를 실측으로 해소)→TDD 구현(DB·PHP 플러그인·worker·web 5레이어)→/review(치명 4건 적발·수정)→/ship(PR #263~266)→**플러그인 설치·슬롯 마킹 23개·라이브 스모크까지 완료**. A3 Max 5가 수제 페이지와 동일한 Elementor 레이아웃으로 자동 생성됨을 육안 확인. 발행 버튼만 Seonje 승인 대기.

---

## Today's Work

### 🚀 `ops(#253)`: 라이브 전환 5단계 + 가비아 실버그 3건

**Status:** `completed` (PR #256~261, 전부 머지·라이브)

- SSL 이미 설치돼 있음 실측(Sectigo DV, apex+www) → `WP_PUBLIC_SITE` https 전환(#256), WP siteurl/home https 정리.
- WP `saas-bot`(편집자) + Application Password → Railway env 3종 주입, REST 인증 curl 검증 후 재배포.
- `/admin/categories` 분류→WP 카테고리 매핑 7건(승화 전사만 의도적 상속).
- **스모크가 잡은 실버그 3건** (전부 가비아 환경 특이):
  1. findByMeta가 Elementor 전문 3.8MB 수신 → 30s 타임아웃 → json 실패가 permanent 오분류(#257: `_fields` 축소 + 본문읽기실패 transient)
  2. **가비아 Apache가 HTTP DELETE 메서드 자체를 302 차단**(#258: POST+`X-HTTP-Method-Override`)
  3. **ModSecurity가 원시 바이너리 미디어 POST 차단** — 243KB도 0.2s 즉시 302(#259: multipart/form-data 전환, Content-Type은 fetch가 boundary와 함께 자동 부착)
- UX: 홈페이지 등록 체크 저장 → 상세(패널)로 리다이렉트(#260), 비활성 장비 사유 안내+버튼 정리(#261).

### ✨ `feat(#262)`: Elementor 템플릿 복제 v2 — 기획→리뷰→구현→배포 전체 사이클

**Status:** `completed` (PR #263 + 핫픽스 #265 + 엔진픽스 #266, prod 마이그·플러그인·매핑·스모크 완료)
**Files:** `supabase/migrations/20260807220000_*.sql`(+롤백), `wp-plugin/jhtech-saas-sync/`(신규 — PHP 플러그인+순수 슬롯엔진+픽스처 테스트 42), `packages/shared/src/wp-plugin.ts`·`wp-publisher.ts`, `apps/worker/src/jobs/wp-publish.ts`, web 폼·패널

#### 📋 Context

라이브 전환 직후 실사용 피드백: 표준 HTML 글이 수제 Elementor 랜딩(섹션 102개급)과 격차가 커서 수동 등록 회귀 위기. /autoplan CEO 듀얼 보이스가 원안에 User Challenge(빈도 ROI·PoC 미선행·Pro 미검토·호스팅 이전 순서) → **검증 게이트 실측**: Elementor Pro+Duplicate Post 설치 확인, 순수 복제 PoC 렌더 픽셀 동일, 빈도 연 7~10건 → 원안(플러그인 복제)+보강 확정. Eng 듀얼 보이스가 **배포 차단급 계약 결함 5건 공동 적발**(스펙 오버라이드 코멘트 = 본문보다 우선).

#### 🔨 Implementation

- **계약 5**: ①신규만 draft — 갱신은 status 보존 ②매 sync=템플릿 재복제(동기화본 패치 금지 — 섹션 복원) ③DB=post_id 1차 권위자(`known_post_id`+`created` 플래그, CAS 패자 정리는 created만 deletePost) ④수동 편집=정규화 해시(decode→canonical re-encode sha256 — Elementor 재직렬화 오탐 방지) 감지, precheck로 미디어 업로드 전 조기 409, `force_sync`(users.manage) 탈출구 ⑤Elementor 관리 글(`wp_render_mode`)은 플러그인 미가용 시 레거시 폴백 금지(침묵 품질 회귀 방지).
- **플러그인**: REST `jhtech/v1/equipment-post`(precheck·sync), 슬롯 마커=CSS 클래스(`jh-slot-*` 치환 / `jh-if-*` 빈 슬롯 제거 / 존재하지 않는 인덱스 `jh-if-image-90~95`=항상 제거), 순수 엔진 분리(도커 php-cli 픽스처 테스트 42 — 로컬 PHP 없음), `register_post_meta(show_in_rest)`로 findByMeta 재연결도 활성화. 안전 반경 = REST 콜백 밖 훅 0.
- **worker**: precheck→미디어→pluginSync 분기. 분류 `wp_template_post_id` 미설정 = 기존 경로 무변화(머지 즉시 prod 안전).
- **/review 치명 4건**: known_post_id uuid 미대조 덮어쓰기(+권한 edit_others_posts 상향·템플릿 자기 덮어쓰기 거부) / `clear_cache()`=사이트 전역 CSS 삭제→per-post / CAS 테스트 갭(Fake override) / 사양 다중 컬럼 잔존.
- **배포 마무리**: 플러그인 zip 설치(WAF 통과 실측), **Elementor 편집기 JS 자동화로 슬롯 마킹 23개**(`model.set('css_classes')`+`$e.run('document/save/update')`), 실제 export 픽스처 확보, 컷팅기 대분류→4605 매핑, 라이브 스모크 GREEN.

#### 🐛 Problems & Solutions

1. **Railway 배포 실패**: `SpecGroup.name` 오기 — vitest(런타임)는 통과, Railway 빌드 tsc만 검출 → 핫픽스 #265 + payload 내용 단언 테스트. **교훈: 배포가 tsc를 돌리면 머지 게이트에도 tsc가 있어야 한다.**
2. **시리즈명이 배경색에 매몰**: 템플릿 텍스트가 `<p class=테마클래스><span style=색>` 중첩인데 엔진이 단일 래퍼만 보존 → span(색) 소실 → 테마 클래스 색 승. 래퍼 체인 3겹 보존으로 수정(#266)·플러그인 재업로드·흰색 복원 확인.
3. Elementor 편집기 저장 직후 페이지 이동 시 저장 유실 가능(비동기) — 재확인 필수.

#### ✅ Gates

PHP 42 · shared 216 · worker 106 · db-tests 554(잔여 3=문서화된 로컬 이미지 버그) · web 525·typecheck·lint·build · e2e 전체(104+, wp-publish 6/6) · 라이브 스모크(재복제 렌더=수제 페이지 구조 동일·제자리 갱신·에러 0).

---

## 🔑 Key Learnings

1. **가비아 대상 HTTP 클라이언트 필수 패턴**: DELETE 메서드 차단(→POST+Override), 원시 바이너리 POST 차단(→multipart), 대형 응답은 `_fields` 축소 — 셋 다 라이브에서만 드러났다. 커스텀 REST(JSON)는 통과.
2. **vitest 통과 ≠ 타입 통과** — 배포 파이프라인이 tsc면 로컬 게이트에도 tsc.
3. **PoC 우선 원칙의 실증**: 두 모델의 User Challenge를 "2시간 실측"(Pro 여부 5분·복제 PoC·빈도 카운트)으로 해소 — 15h 매몰 리스크 제거.
4. **Elementor 프로그래밍 조작**: 편집기 JS(`elementor.elements` 모델 + `$e.run('document/save/update')`)로 슬롯 마킹·색 설정 자동화 가능. `_elementor_data`는 텍스트 색이 인라인 span에 있는 경우가 많다 — 치환 엔진은 래퍼 체인을 보존해야.
5. **worktree 가드**: 리다이렉트·다중 문장 명령이 차단됨 — 단문 분리 실행이 기본.

## ⏭️ Next

- Seonje 육안 승인 → A3 Max 5 [홈페이지 발행] 실공개 + 구 수제 글(멀티컷 SG 등) 비공개 정리
- 프린터용 템플릿 1개 마킹 + 프린터 대분류 매핑
- 폴리시(선택): 사양 아이콘 스타일·사양 우측 빈 컬럼·영문 태그라인 고정 문구
- 해시 실측 3종(Elementor 무변경 저장·타 플러그인 meta·revision) — 운영 중 관찰
- 이월: #245 AS 히스토리 Part 4, 가비아 호스팅 이전 검토(연 ~260만), /map 갱신
