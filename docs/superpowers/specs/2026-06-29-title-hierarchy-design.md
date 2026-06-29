# 제목 위계(메인/서브 타이틀) 구분 + 드롭존 아이콘 제거

**한 문장 요약**: 상위 제목(메인 타이틀)과 하위 라벨(서브 타이틀)이 같은 크기·색이라 구분이 안 되는 곳을 찾아 위계를 주고, 메인 타이틀 스타일을 통일한다. 더불어 드롭존 카드의 아이콘(📷·📄)을 제거한다.

**왜 필요한지**: 견적/AS 신청 폼의 사진 섹션에서 "외부 전경"(그룹)과 "외부 출입구"(개별 슬롯)가 똑같은 회색 작은 글씨라 무엇이 상위 제목인지 안 보인다. 같은 문제가 다른 폼에도 있어 한꺼번에 정리한다.

## 타이포 위계 표준 (DESIGN.md 토큰 기반)

DESIGN.md 스케일: display 28 / h1 22 / h2 18 / body 14 / small 12 / micro 11. 색: `text-text`(진함) / `text-muted`(연함).

| 단계 | 용도 | 스타일 |
|---|---|---|
| 대섹션 | 폼 큰 구역("현장 사진", "신청 정보") | `text-h2 font-medium text-text` (18px) — **기존 표준, 유지** |
| **메인 타이틀** | 그룹/서브섹션 제목("외부 전경", "조회") | **`text-body font-semibold text-text`** (14px·굵게·진함) — Seonje님 선택 |
| **서브 타이틀** | 개별 항목 라벨("외부 출입구", "회사명") | **`text-small text-muted`** (12px·보통·연함) |

→ 메인 vs 서브가 크기(14↔12) + 굵기(semibold↔normal) + 색(진함↔연함)으로 모두 달라 한눈에 구분된다.

## 변경 1: 드롭존 아이콘 제거

`apps/web/src/components/ui/FileDropCard.tsx`
- 빈 상태 카메라 아이콘(`📷`/`icon`) span 제거 → "클릭 · 끌어다 놓기" + `hint`만.
- PDF 상태 문서 아이콘(`📄`) span 제거 → 파일명만.
- `icon` prop은 더 이상 렌더하지 않으므로 제거(타입·CatalogUploader의 `icon="📄"` 전달도 함께 정리).
- label className은 **서브 타이틀**로: `text-small font-medium text-muted` → `text-small text-muted`.

## 변경 2: 위계 무너진 4곳에 메인 타이틀 적용

| # | 파일 | 대상 | 현재 | 변경 |
|---|---|---|---|---|
| 1 | `(portal)/request/_components/SitePhotoUploader.tsx` | 그룹 `<legend>` ("외부 전경(선택)" 등) | `text-small font-medium text-muted` | `text-body font-semibold text-text` |
| 2 | `(portal)/support/_components/AsPhotoUploader.tsx` | 그룹 `<legend>` ("증상 사진 …") | `text-small font-medium text-muted` | `text-body font-semibold text-text` |
| 3 | `(portal)/support/_components/ServiceRequestForm.tsx` | 조회 섹션 `<label>` ("사업자등록번호로 조회") | `text-small text-muted` | `text-body font-semibold text-text` |
| 4 | `(portal)/supply/_components/SupplyRequestForm.tsx` | 카테고리 헤더 `<div>` ("설치용 부품" 등) | `text-small font-medium text-muted` | `text-body font-semibold text-text` |

→ ④는 카테고리 헤더(상위)가 그 아래 제품명(`text-body text-text`)보다 약했던 **위계 역전**도 함께 해소된다.

서브 타이틀(슬롯/필드 라벨)은 SitePhoto/AsPhoto의 경우 FileDropCard `label`이 담당 → 변경 1에서 `text-small text-muted`로 이미 처리됨.

## 제외 (위계 문제 아님 — 검토 결과)

| 곳 | 이유 |
|---|---|
| `NewReservationForm.tsx` | 라벨이 전부 동급 입력 필드("고객"·"데모 장비"·"소요 시간"). 그룹 vs 항목 위계가 아니라 다 같은 레벨 → 위계가 없는 게 정상. |
| `CompanyForm.tsx` | 페이지 제목 `text-h1`만 있고 그룹/필드 위계 충돌 없음. (조사가 말한 14.5px 헤더는 실제로 없음.) |
| `EditUserClient.tsx` | 섹션 제목 `text-small font-medium text-text`(12px 진함) vs 필드 `text-micro text-muted`(11px 연함)로 **이미 구분됨**. 좁은 패널 맥락이라 현행 유지. |

> Seonje님이 이 3곳도 통일을 원하면 메인 타이틀 표준(`text-body font-semibold text-text`)으로 추가 적용 가능.

## 무변경 보장

- DB·RPC·Storage·서버 로직 전부 무변경. `apps/web` UI(className·아이콘 마크업) 한정.
- FileDropCard 접근명(`aria-label="${label} 첨부"`)은 그대로 → equipment e2e 단언 영향 없음.

## 테스트 · 게이트

- web 단위테스트(node env)는 className 무관 → 회귀만 확인.
- e2e: equipment(드롭존 접근명 단언)·request·support 등 회귀.
- **시각 검증**(browse → Read): 견적신청·AS 폼에서 메인("외부 전경")과 서브("외부 출입구")가 크기·색으로 구분되는지, 아이콘이 사라졌는지 확인.
- 게이트: web test · e2e · typecheck · lint · build.

## 비목표 (YAGNI)

- 폼 전체 타이포 리디자인 · 색 토큰 변경 · 대섹션(text-h2) 제목 변경 · 제외 3곳.
