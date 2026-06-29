# 사진/파일 첨부 UI 통일 — 드롭존 카드

**한 문장 요약**: 사진 첨부를 "보이지 않는 회색 파일선택 버튼"에서 → 누르는 곳이 한눈에 보이는 **점선 드롭존 카드**로 전부 통일한다.

**왜 필요한지**: 지금은 브라우저 기본 `파일 선택` 버튼이라 작고 밋밋해서 "여기가 사진 넣는 곳"이 안 보인다. 장비 카탈로그 이미지 업로더처럼 큰 점선 박스 + 아이콘 + 안내문구로 바꾸면 누구나 첨부 위치를 즉시 안다.

## 현황 (조사 결과)

`apps/web` 안에서 `input type=file`을 쓰는 곳은 6곳. UI 방식이 3종으로 혼재:

| 방식 | 컴포넌트 | 비고 |
|---|---|---|
| ✅ 드롭존(기준) | `ImageUploader` (장비 카탈로그 이미지, 복수) | 그대로 둠(기준) |
| ❌ 브라우저 기본 input | `SitePhotoUploader`·`AsPhotoUploader`·`BannerUploader` | **변경 대상** |
| △ 버튼식 | `CatalogUploader`(PDF), `AvatarUpload`(프로필) | 카탈로그=변경 대상 / 프로필=제외 |

## 결정사항

1. **슬롯 유지** — 견적 현장사진(4)·AS 증상사진(3)의 의미 있는 슬롯(외부진입로/건물외관/내부입구/설치위치 등)을 없애지 않고, **각 슬롯을 드롭존 카드로** 만든다. 자유 복수 첨부로 바꾸면 "어느 사진이 어느 위치인지" 정보가 사라지므로 채택하지 않음.
2. **범위 4곳** — 견적 현장사진 · AS 증상사진 · 견적서 로고/이미지 · 제품 카탈로그(PDF).
3. **프로필 사진 제외** — 이미 "사진 업로드" 버튼 + 아바타 미리보기로 비교적 명확. YAGNI.
4. **기준 UI = 장비 카탈로그 이미지(ImageUploader)** 의 점선 드롭존 톤을 따른다(`border-dashed border-border bg-surface-2`, 카드 radius — DESIGN.md 토큰 준수, 새 색 0).

## 공통 컴포넌트 — `FileDropCard`

위치: `apps/web/src/components/ui/FileDropCard.tsx`. **순수 UI 셸**(업로드/네트워크 로직 없음). 4곳이 공유한다.

### Props
| prop | 타입 | 설명 |
|---|---|---|
| `label` | `string` | 슬롯/필드 이름(예: "외부진입로", "장비 네임 로고") |
| `accept` | `string` | input accept (이미지 MIME 또는 `application/pdf`) |
| `capture?` | `"environment"` | 모바일 카메라 직행(AS 증상사진에만) |
| `preview` | `{ kind: "image"; url: string } \| { kind: "file"; name: string } \| null` | 채운 상태 렌더(없으면 빈 상태) |
| `onPick` | `(file: File) => void` | 파일 선택/드롭 시 — 부모가 검증·업로드·미리보기 처리 |
| `onClear?` | `() => void` | 삭제 버튼(없으면 삭제 버튼 미표시) |
| `busy?` | `boolean` | 업로드 중(클릭/드롭 차단 + 표시) |
| `disabled?` | `boolean` | 비활성 |
| `hint?` | `string` | 형식/크기 안내(예: "jpg · png · webp") |
| `icon?` | `ReactNode` | 빈 상태 아이콘(기본 카메라, PDF는 문서 아이콘) |

### 상태/동작
- **빈 상태**: 점선 박스. 클릭 → 숨김 input 트리거. 드래그오버 → 테두리 강조. 드롭 → `onPick(file)`. 박스 안에 아이콘 + `label` + "클릭·끌어다 놓기" + `hint`.
- **채운 상태**: 박스 안에 미리보기(이미지=썸네일 `object-cover`, PDF=문서 아이콘 + 파일명) + `label` + 우상단 ✕(`onClear`) + 다시 클릭하면 교체(새 `onPick`).
- **busy**: `pointer-events-none opacity-60` + "업로드 중…".
- 접근성: 숨김 input에 `aria-label={label}`, 박스는 `role="button"` + 키보드(Enter/Space) 트리거.

> `FileDropCard`는 파일 **검증을 하지 않는다**. 검증(형식·크기)은 각 부모가 기존 헬퍼(`validateImageFile` 등)로 그대로 수행하고, 통과분만 미리보기/업로드한다. 셸은 "고르기 UX"만 담당.

## 4곳 적용 — 데이터 흐름은 그대로

각 컴포넌트의 **기존 업로드 로직·시점·Storage 경로·검증을 손대지 않고**, 안쪽 `input`/버튼 마크업만 `FileDropCard`로 교체한다.

| 대상 | 파일 | 배치 | 업로드 방식(유지) | preview |
|---|---|---|---|---|
| 견적 현장사진 | `(portal)/request/_components/SitePhotoUploader.tsx` | 슬롯 카드 4개(외부 2 + 내부 2 그룹 유지) | 제출 시 업로드(로컬 objectURL 미리보기) | image |
| AS 증상사진 | `(portal)/support/_components/AsPhotoUploader.tsx` | 슬롯 카드 3개, `capture="environment"` 유지 | 제출 시 업로드 | image |
| 견적서 로고/이미지 | `admin/equipment/_components/BannerUploader.tsx` | 카드 1개(slot당) | 즉시 업로드(upsert) | image(`publicImageUrl(value)`) |
| 제품 카탈로그(PDF) | `admin/equipment/_components/CatalogUploader.tsx` | 카드 1개(문서 아이콘) | 즉시 업로드(upsert) | file(`catalog.pdf`) |

## 무변경 보장

- DB 스키마·마이그레이션 **없음**.
- RPC·서버 액션·Storage 버킷·경로 정규식·anon INSERT 정책 **무변경**.
- 검증 헬퍼(`validateImageFile`, `IMAGE_ACCEPT`, 슬롯 라벨 등) **재사용**.
- → 워커·DB·`db push` 불필요. 변경은 `apps/web` UI 한정.

## 테스트 · 게이트

- **단위 테스트**(`FileDropCard`): 빈 상태 렌더(label/hint), 클릭 시 input 트리거, 드롭 시 `onPick` 호출, 채운 상태 미리보기(image/file), ✕ 시 `onClear` 호출.
- **회귀(e2e)**: 견적신청·AS·release 등 파일 첨부 e2e가 통과해야 함.
  - ⚠️ **리스크**: input을 hidden으로 바꾸면 e2e 셀렉터가 깨질 수 있음. Playwright `setInputFiles`는 hidden input에도 동작하므로, 기존 셀렉터가 `input[type=file]`을 직접 잡으면 통과한다. 구현 시 기존 e2e 실행으로 확인하고, 필요하면 셀렉터/`label` 연결을 보정.
- **게이트**: `web test` · `web test:e2e` · `web typecheck` · `lint` · `build` · `as any` 0. DB 무변경이라 db-tests·db push 불필요.

## 비목표 (YAGNI)

- 프로필 아바타 변경.
- 슬롯을 자유 복수 첨부로 전환.
- 이미지 자동 압축/리사이즈, 진행률 바.
- `ImageUploader`(기준) 리팩터링 — 동작이 이미 좋으므로 건드리지 않음(원하면 후속으로 `FileDropCard` 기반 통합 가능, 이번 범위 밖).
