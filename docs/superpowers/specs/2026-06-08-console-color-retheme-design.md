# 콘솔 색 재단장 (Color Re-theme) — 설계

> **한 문장 요약:** 콘솔 전체의 색을 v3 소프트 인디고에서 **딥 네이비 + 스틸블루 모노톤 + 쿨그레이/차콜** 팔레트로 바꾼다.
>
> **왜 필요한가:** Seonje님이 새 5색 팔레트로 콘솔 톤을 다시 잡고 싶어함. 색만 바꾸는 작업이라 화면 구조·기능은 그대로 두고, 디자인 토큰(색 변수) 값과 다크로 뒤집히는 사이드바만 손본다. 무채색 네이비/그레이 베이스라 차분한 "엔터프라이즈 업무도구" 느낌이 되고, 상태 색(주문 흐름)은 그 위에서 더 또렷해진다.

이 문서는 **3단계 정비 중 1단계**다. (2단계=의뢰관리 2분할+인라인 견적 편집, 3단계=특기사항·영업일지. 각각 별도 스펙.)

---

## 범위 (Scope)

**포함:**
- `apps/web/src/app/globals.css` 의 `@theme` 디자인 토큰 **값 교체** (이름은 유지).
- 사이드바 **라이트→다크 반전**에 따른 `apps/web/src/app/admin/layout.tsx` 사이드바 영역 클래스 조정(글자·hover·프로필 블록).
- `DESIGN.md` 갱신(단일 출처) — Color/Layout 섹션 + Decisions Log.
- 콘솔 전 페이지 시각 회귀 검증(대비·깨짐 없음).

**제외 (이번 아님):**
- 공개 고객 포털(`app/(portal)/` 홈·카탈로그·상세·신청·A/S·소모품) — **현행 색 유지**. (포털 포함은 후속, Seonje님 추가 지시 시.)
- 레이아웃·기능 변경 일체(2·3단계에서).
- 상태 색 스파인 변경 — **불변**(의미색).

---

## 새 팔레트 → 토큰 매핑

원본 5색: `#0B1F3A`(딥네이비) · `#1F3B5C`(스틸블루) · `#A7B1BE`(쿨그레이) · `#E6E9EF`(라이트그레이) · `#2B2F36`(차콜).

| 토큰(globals.css) | 현재 v3 값 | **새 값** | 역할 |
|---|---|---|---|
| `--color-navy` | `#3a3770` | `#0B1F3A` | 사이드바·배너 진한 표면 |
| `--color-navy-2` | `#47447f` | `#1F3B5C` | 네이비 위 hover/raised |
| `--color-navy-3` | `#56539a` | `#2E4E73` | 네이비 위 active (파생) |
| `--color-accent` | `#6360c4` | `#1F3B5C` | 버튼·active·아이콘칩·강조 |
| `--color-accent-2` | `#8f8ce0` | `#2E4E73` | 보조 하이라이트(파생) |
| `--color-accent-soft` | `#f0f0fc` | `#E2E8F1` | active 배경 틴트(파생) |
| `--color-accent-ring` | `#dbdaf4` | `#C3CEDC` | 링/테두리(파생) |
| `--color-bg` | `#f4f5fb` | `#E6E9EF` | 앱 배경 |
| `--color-sidebar` | `#e7e9f3` | `#0B1F3A` | **사이드바(다크 반전)** |
| `--color-sidebar-text` | `#565b7d` | `#A7B1BE` | 사이드바 nav 라벨(다크 위 라이트) |
| `--color-surface` | `#ffffff` | `#ffffff` | 카드(유지) |
| `--color-surface-2` | `#f1f2f9` | `#EEF1F6` | 트랙·hover(파생) |
| `--color-border` | `#e7e8f3` | `#D6DBE4` | 테두리(파생) |
| `--color-text` | `#2a2840` | `#2B2F36` | 본문 글자(차콜) |
| `--color-muted` | `#7b7fa0` | `#667285` | 흐린 글자(AA 충족 파생) |
| `--shadow-card` | navy `42 40 64` 틴트 | navy `11 31 58` 틴트 | 그림자 톤 |
| `--shadow-card-hover` | 〃 | 〃 | 〃 |

**파생값 메모:** `#A7B1BE`는 흰 배경 위 본문 글자로는 대비 부족(AA 미달) → 테두리/비활성에만, 흐린 본문 글자는 `#667285`로 별도. accent-soft/ring/surface-2/border는 팔레트에서 톤 맞춰 파생.

**상태 스파인(불변, 참고):** 신규 `#2563EB` · 배정 `#7C3AED` · 견적중 `#D97706` · 발송완료 `#16A34A` · 실패 `#DC2626`. accent(스틸블루)와 신규(밝은 블루)는 채도·명도가 달라 구분되지만, 검증에서 인접 노출 시 혼동 없는지 확인.

---

## 사이드바 다크 반전 (값 교체만으론 부족한 부분)

현재 `admin/layout.tsx` 사이드바는 라이트 전제 클래스를 씀:
- `<aside class="... bg-sidebar text-text">` — `text-text`(차콜)가 다크 네이비 위에서 안 보임.
- nav: `text-sidebar-text hover:bg-accent-soft hover:text-accent`, 아이콘 `text-muted group-hover:text-accent`.
- 브랜드/프로필: `text-text`·`text-muted`, 프로필 블록 `bg-surface border-border`(라이트 카드).
- 로고/프로필 아바타: `bg-accent text-white`.

**필요 변경(클래스 조정):**
- 브랜드 워드마크·프로필 이름 `text-text` → 라이트(예: `text-white`/`text-[#E6E9EF]`).
- nav 라벨: `text-sidebar-text`(=`#A7B1BE`)는 그대로 OK. hover는 다크 위에서 `hover:bg-navy-2 hover:text-white` 로(현재 `hover:bg-accent-soft`는 라이트 틴트라 다크에서 안 맞음).
- 아이콘 `text-muted` → 다크 위 가독 톤(예: `text-[#7d8aa0]`, hover `group-hover:text-white`).
- 프로필 블록 `bg-surface`(흰 카드) → 다크 위 분리되는 톤(예: `bg-navy-2` 또는 상단 보더만). 로그아웃 hover 색 조정.
- active 표시(현재 hover만 있음): 선택된 nav를 `bg-navy-2 text-white`로(목업의 활성 항목 = 스틸블루 배경).

> 상단바(header)·본문은 라이트 유지(흰 topbar, 라이트그레이 본문). 토큰 값 교체로 자동 반영.

---

## 상태 스파인·하드코딩 색 점검

- 상태 색은 토큰이 아니라 컴포넌트에서 정의됨(예: `application-status`, 각 `StatusControl`, 도넛 파스텔). **변경 안 함** — 위치만 확인하고 그대로 둔다.
- 토큰 기반 유틸(`bg-accent`·`text-accent`·`bg-bg`·`text-muted` 등)은 값 교체로 **자동 반영**.
- ⚠️ **하드코딩 Tailwind 팔레트 색**(예: 의뢰상세 "미등록 고객" `bg-amber-100 text-amber-700`, 일부 `slate-*`)은 토큰과 무관 → 새 팔레트와 어긋나는지 **콘솔 전 페이지 시각 점검**에서 확인, 거슬리면 최소 수정. (이번 범위에선 토큰 교체가 우선, 하드코딩은 눈에 띄는 것만.)

---

## 검증 (Verification)

- 게이트(CLAUDE.md): `shared test`·`web test`·`db-tests test:rls`·`web typecheck`·`lint`·`build`·`web test:e2e`·`as any` 0. (색 변경이라 로직 영향 없어야 함 → 기존 테스트 그대로 통과해야 정상.)
- **시각 회귀(핵심)**: 콘솔 전 페이지를 새 색으로 직접 확인 — 대시보드·의뢰관리(목록/상세)·견적(목록/상세/작성)·고객·장비·소모품·A/S·KPI·사용자·로그인. 체크: ①다크 사이드바 글자 가독 ②라이트 위 글자 대비(AA) ③상태 배지가 스파인 색 유지 ④accent vs 신규블루 혼동 없음 ⑤하드코딩 색 튐 없음.
- 브라우저(browse 스킬)로 로컬 prod build 또는 dev 캡처해 페이지별 스크린샷 점검.

---

## 위험 (Risks)

| 위험 | 완화 |
|---|---|
| 사이드바 반전 시 라이트 전제 클래스가 다크 위에서 안 보임 | 위 "사이드바 반전" 클래스 변경 명시, 시각 점검에서 확인 |
| accent 스틸블루 ↔ 상태 신규블루 혼동 | 명도·채도 차이로 구분, 인접 노출 페이지에서 확인 |
| 하드코딩 색이 새 톤과 충돌 | 전 페이지 시각 점검, 눈에 띄는 것만 최소 수정 |
| `#A7B1BE`를 본문 글자로 쓰면 AA 미달 | 테두리/비활성에만, 흐린 글자는 `#667285` |

---

## 산출물

- `apps/web/src/app/globals.css` — 토큰 값 교체.
- `apps/web/src/app/admin/layout.tsx` — 사이드바 다크 반전 클래스.
- `DESIGN.md` — Color/Layout 섹션 + Decisions Log(2026-06-08 색 재단장).
- (필요 시) 눈에 띄는 하드코딩 색 최소 수정.
