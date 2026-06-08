# 의뢰관리 2분할 셸 + 확장형 목록 — 설계 (2단계 / 슬라이스 1)

> **한 문장 요약:** 의뢰 목록과 상세를 한 화면 2분할(왼쪽 목록 고정 + 오른쪽 상세)로 합치고, 목록은 거래처 1,500+에서도 안 늘어나게 "진행중 기본 + 검색 + 더보기 + 날짜그룹"으로 만든다.
>
> **왜 필요한가:** 지금은 의뢰 목록(`/admin/applications`)과 상세(`/admin/applications/[id]`)가 별도 페이지라, 건마다 페이지를 오가야 한다. 레거시 운영툴처럼 한 화면에서 목록↔상세를 보며 일하게 한다. 동시에, 실제 운영(거래처 1,500+·매달 새 견적)에서 "전체를 다 보여주는" 목록은 무너지므로, 기본은 진행 중 건만 보여주고 나머지는 검색으로 찾게 한다.

이 문서는 **2단계(의뢰관리 2분할+인라인 견적)의 슬라이스 1 / 4**다.
- 슬라이스 1 (이 문서) = **2분할 셸 + 확장형 목록**
- 슬라이스 2 = 상단바(담당자·상태) + 배너(합계·유효기간)
- 슬라이스 3 = 우측 sticky 견적 요약 패널(읽기) + [견적작성]·[완료] 버튼
- 슬라이스 4 = 인라인 견적 편집 (데이터 모델 결정 포함)

색·디자인은 1단계에서 적용된 딥네이비+스틸블루 토큰을 그대로 사용한다(`DESIGN.md`).

---

## 범위 (Scope)

**포함:**
- `app/admin/applications/`를 **레이아웃 기반 2분할**로 재구성: 왼쪽 목록 패널은 레이아웃(고정), 오른쪽은 선택한 의뢰 상세.
- 왼쪽 **확장형 목록 패널**(클라 컴포넌트): 검색 + 상태 탭(기본=진행중) + 날짜그룹 + "더 보기"(서버 페이지네이션) + 선택행 강조.
- 백엔드 **페이지네이션 쿼리**(현재 100개 하드캡 대체) + 상태그룹 카운트.
- 오른쪽 상세 = **기존 상세 내용 그대로** 오른쪽 패널에 렌더(내부 재배치는 슬라이스 2~3).

**제외 (이 슬라이스 아님):**
- 상단바·배너·우측 견적 패널 재배치 → 슬라이스 2~3.
- 인라인 견적 편집·데이터 모델 변경 → 슬라이스 4.
- 견적 작성/발행/상태전이/권한/RPC 로직 변경 — 없음.
- 모바일 좁은 화면 최적화 — 콘솔은 desktop-primary(DESIGN.md). 좁은 폭은 후속(기본 동작만 깨지지 않게).
- 다른 콘솔 목록(고객·장비·A/S 등) — 이번엔 의뢰관리만.

---

## 아키텍처 — 레이아웃 기반 마스터-디테일

Next.js App Router의 **세그먼트 레이아웃**을 쓴다. 비유: 왼쪽 목록은 "고정 액자", 오른쪽만 클릭한 의뢰로 교체.

| 파일 | 역할 | 변경 |
|---|---|---|
| `app/admin/applications/layout.tsx` | **신규** — 2분할 프레임: 왼쪽 `<ApplicationListPane>` + 오른쪽 `{children}`. 서버에서 초기 목록 1페이지 + 카운트 fetch해 클라 패널에 전달 | 신규 |
| `app/admin/applications/_components/ApplicationListPane.tsx` | **신규** 클라 컴포넌트 — 검색·탭·더보기·날짜그룹·선택강조 상태 관리 | 신규 |
| `app/admin/applications/page.tsx` | 현재 = 전체 목록 페이지 → **빈 상태**("← 왼쪽 목록에서 의뢰를 선택하세요")로 축소 | 변경(축소) |
| `app/admin/applications/[id]/page.tsx` | 상세 — 오른쪽 패널 안에 렌더되도록 컨테이너 폭/여백 조정, 상단 "← 목록" 링크 제거(목록 항상 보임) | 변경(소폭) |
| `lib/applications/admin-queries.ts` | `listApplicationsPage(opts)` + `countApplicationsByGroup()` 추가, 기존 `listApplications`는 페이지네이션형으로 대체/래핑 | 변경 |
| `lib/applications/admin-actions.ts` (기존 — claimApplication 등이 있는 파일) | 클라가 "더보기/탭/검색" 시 호출할 서버 액션 `fetchApplicationsPage(opts)` 추가 | 변경(추가) |

**핵심 동작:** 행 클릭 → `next/link`로 `/admin/applications/[id]` 이동 → **레이아웃은 리렌더 안 됨**(목록 그대로) → 오른쪽 `{children}`만 상세로 교체. 새로고침·뒤로가기·북마크 모두 정상(URL이 진실). 선택행 강조 = `ApplicationListPane`가 `usePathname()`으로 현재 id를 읽어 표시.

> 레이아웃은 App Router에서 `searchParams`를 못 받으므로, 탭·검색·페이지 상태는 **클라 컴포넌트 로컬 상태 + 서버 액션 fetch**로 처리(URL 쿼리 구동 아님). 초기 1페이지만 레이아웃이 서버 렌더해 빠르게 띄운다.

---

## 왼쪽 목록 패널 설계

### 구성 (위→아래)
1. **헤더**: "신청 목록" + 검색 입력.
2. **검색**: 업체명·접수번호(seq_no)·사업자번호(biz_no) 부분일치. 입력 시 **모든 상태에서** 최신순 검색(탭 무시 — 과거 무엇이든 찾기). 디바운스(약 300ms).
3. **상태 탭 + 카운트**: `[진행중 N] [완료 M] [전체]`. **기본 선택 = 진행중**.
   - 진행중 = `APPLICATION_STATUSES` 중 `closed` 제외 전부(= new·assigned·quoted·quote_sent). 단일 출처 `apps/web/src/lib/application-status.tsx` 사용.
   - 완료 = `closed`. 전체 = 모든 상태.
   - 카운트: 진행중 N·완료 M(서버 count). 전체 = N+M.
4. **날짜 그룹**: 로드된 행을 `created_at`(KST) 기준 **오늘 / 이번 주 / 이전**으로 묶어 소제목 표시(클라에서 버킷팅). 각 그룹 내 최신순.
5. **행**: 업체명(굵게) + 상태 배지(스파인 색) / 접수번호(mono) · 담당자 · 장비요약. 신규(is_new) 점 indicator 유지. 선택행 = 스틸블루 좌측 보더 + `accent-soft` 배경.
6. **"더 보기"**: 현재 탭/검색 기준 다음 페이지(기본 30개)를 append. 마지막이면 숨김. 푸터에 "전체 X건 · 진행중 Y건만 표시" 요약.

### 정렬·페이지네이션
- 정렬: `created_at DESC`(최신순), 동률 시 `seq_no DESC`.
- 페이지네이션: **offset 기반**, 페이지 크기 **30**. "더 보기" = 다음 offset. (진행중 기본셋이 작아 offset로 충분. 검색/완료에서 길어도 더보기로 점증.)
- 검색 활성 시: 탭 무시, 전체 상태에서 동일 정렬·페이지네이션.

---

## 백엔드 쿼리

`lib/applications/admin-queries.ts`:

- `listApplicationsPage(opts: { scope: "active" | "closed" | "all"; q?: string; offset: number; limit: number }): Promise<{ rows: ApplicationListRow[]; hasMore: boolean }>`
  - `scope=active` → status in (new,assigned,quoted,quote_sent); `closed` → status='closed'; `all` → 전부.
  - `q` 있으면 scope 무시하고 전체 상태에서 company/seq_no/biz_no `ilike` OR(기존 `buildSearchOr` 재사용/확장).
  - 정렬 created_at desc, range(offset, offset+limit). `hasMore` = 받은 행이 limit과 같은지(또는 limit+1 fetch 후 자르기).
  - 기존 `ApplicationListRow` shape 재사용(id·seq_no·status·company·summary·assignee_name·is_new·created_at). biz_no 검색 위해 쿼리 컬럼에 biz_no 포함(행 표시엔 불필요).
- `countApplicationsByGroup(): Promise<{ active: number; closed: number }>` — head count 2건(또는 group by). RLS 스코프 그대로 적용됨(영업담당은 본인+미배정만 카운트).

서버 액션 `fetchApplicationsPage(opts)` = 위 `listApplicationsPage`를 클라에서 호출하게 래핑(권한 가드 `requireApplicationsConsole` 통과 후).

> RLS: 기존대로 `assignee_id = me OR applications.view_all`. 카운트·페이지 모두 RLS 적용되므로 영업담당은 자기 스코프만 보고 셈한다(정상).

---

## 오른쪽 상세 (이 슬라이스 변경 최소)

- `[id]/page.tsx` 내용은 **그대로** 두되, 2분할 오른쪽에 맞게:
  - 최상단 "← 목록" 링크 제거(목록 항상 보임). 상태 배지는 유지(슬라이스 2에서 상단바로 이동 예정).
  - 컨테이너 `max-w-2xl` → 오른쪽 패널 폭에 맞춰 조정(예: `max-w-3xl` 또는 패널 풀폭). 스크롤은 오른쪽 패널 내부.
- `/admin/applications`(빈 상태): "왼쪽 목록에서 의뢰를 선택하세요" 안내 카드.

---

## 검증 (Verification)

- 게이트: shared·web test·typecheck·lint·build·e2e·`as any` 0.
- **기존 e2e 영향**: 의뢰 목록→상세 진입 시나리오가 있으면 셀렉터/URL이 바뀔 수 있음 → e2e 갱신 필요(목록 행 클릭으로 `[id]` 진입은 유지). 신규 목록 패널 동작(탭 전환·검색·더보기) e2e 1개 추가 권장.
- 단위: `listApplicationsPage`의 scope/검색/페이지네이션 경계, 날짜 그룹 버킷팅 순수함수(오늘/이번주/이전) Vitest.
- 시각(browse): 2분할 셸 — 왼쪽 목록 고정·선택행 강조·탭 카운트·더보기·날짜그룹, 오른쪽 상세 렌더, 빈 상태. 새 팔레트 유지.
- 스케일 점검(권장): 로컬에 더미 의뢰 다수 시드해 진행중 기본/더보기/카운트가 맞는지(없으면 소규모로 동작만).

---

## 위험 (Risks)

| 위험 | 완화 |
|---|---|
| 레이아웃이 searchParams 못 받음 → 탭/검색을 URL로 못 구동 | 클라 로컬 상태 + 서버 액션 fetch로 처리(명시) |
| offset 페이지네이션의 중복/누락(로드 중 데이터 변경) | 이 규모·용도에선 허용. 정렬 안정화(created_at, seq_no tie-break) |
| 기존 목록 페이지 e2e 깨짐 | e2e를 2분할 흐름으로 갱신, 행클릭→상세 유지 |
| 영업담당 RLS 스코프에서 카운트가 본인 것만 | 정상(의도). 표시 문구가 오해 없게("내 담당 기준") 고려 |
| `closed` 색 `#3a3770`(옛 네이비)이 새 팔레트와 미세 불일치 | 상태 스파인 영역 → 이 슬라이스 밖. 추후 별도 결정(메모만) |

---

## 산출물

- 신규: `applications/layout.tsx`, `_components/ApplicationListPane.tsx`, 목록 페이지네이션 순수 로직/서버 액션.
- 변경: `applications/page.tsx`(빈 상태), `[id]/page.tsx`(오른쪽 패널 적응), `lib/applications/admin-queries.ts`(페이지네이션·카운트), e2e.
- 디자인 토큰·상태 스파인 변경 없음.
