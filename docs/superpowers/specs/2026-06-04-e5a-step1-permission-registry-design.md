# E5a step 1 — 권한 registry 필수 키화 (설계)

> 상위 스펙: 이슈 #38 (E5a 권한 모델, A 다운스코프). 이 문서는 6단계 중 **step 1** 구현 설계.
> brainstorming 승인: 2026-06-04 (Seonje님).

## 한 문장 요약

권한 키 목록을 "키 + 한글 메타를 한 곳에 담은 객체 배열"로 바꾸고, 영업담당용 신규 9키와 프리셋(권한 묶음 상수)을 추가한다. 기존 코드가 하나도 안 깨지는 **순수 추가** — 키 교체·RLS·UI는 step 2~6.

## 왜 필요한가

영업담당 role을 켜려면 굵게 묶인 권한 키(`customers.manage`=생성+수정+삭제 등)를 액션 단위로 잘게 쪼개야 한다. 이 단계는 그 "키 사전"을 먼저 만든다. 키를 데이터(배열)로 두면 새 권한이 관리 UI 체크박스에 자동 노출되고 스키마 변경이 0이다.

## 자료 구조 (결정: 단일 객체 배열)

```
PERMISSION_REGISTRY = [{ key, label, description, group, deprecated? }] as const
  ↓ 파생 (기존 export 호환 유지 — 다른 파일 import 안 깨짐)
PERMISSIONS (키 배열) · PermissionKey (타입) · SUPER_PERMISSION · can()  ← 시그니처 그대로
```

키와 메타가 한 객체라 **메타 누락이 구조적으로 불가능**(타입 강제). 대안(키 배열 + 메타맵 분리)은 변경이 적지만 둘이 어긋날 수 있어 기각.

## 키 변화 (registry 총 21키 = 기존 12 + 신규 9)

| 구분 | 키 | 처리 |
|---|---|---|
| 신규 9 | `applications.status`·`.claim`, `customers.edit`·`.delete`·`.view_all`, `service_requests.status`·`.claim`, `supply_requests.status`·`.claim` | 즉시 추가 |
| 은퇴 3 | `customers.manage`, `service_requests.manage`, `supply_requests.manage` | **`deprecated:true` 달고 유지** (TS/SQL/db-tests/e2e 참조가 살아있음 → step 6에서 참조 제거 후 삭제) |
| 유지 | `applications.assign`(설명=재배정 전용으로 갱신), `applications.view_all`, `quotes.write`, `equipment.manage`, `consumables.manage`, `*_requests.view_all`, `email.send`, `users.manage` | 그대로 |

A 다운스코프이므로 예약 키(`*.delete` 미존재 기능, service/supply `*.assign`), `equipment.delete`·`consumables.delete`는 **만들지 않는다**.

## 그룹 (한글, UI 그룹핑용)

견적(applications.*) / 고객(customers.*) / A·S(service_requests.*) / 소모품신청(supply_requests.*) / 견적·메일(quotes.write·email.send) / 카탈로그(equipment.manage·consumables.manage) / 사용자(users.manage). 은퇴 3키는 그룹 분류하되 `deprecated`라 step 4 UI에서 그리드 미노출.

## 프리셋 상수 (seed + 관리 UI 공용)

```
SALES_PRESET: PermissionKey[] = [
  "applications.status","applications.claim","quotes.write","customers.edit",
  "email.send","service_requests.status","service_requests.claim",
  "supply_requests.status","supply_requests.claim"]   // 9키 — view_all/assign/delete 없음
ADMIN_PRESET: PermissionKey[] = ["users.manage"]        // super (전체 통과)
```

## 테스트 먼저 (TDD, `permissions.test.ts`)

- 기존 "12개" 단언 → registry 21키 구성으로 갱신 + 은퇴 3키 `deprecated:true` 단언
- 신규 9키 각각: `can()` 통과 + `users.manage` 우회
- `SALES_PRESET` 정확한 9키 + `applications.view_all`/`*.assign`/`customers.delete` **미포함** 단언 (영업이 못 하는 것 고정)
- `ADMIN_PRESET = ["users.manage"]`
- 모든 키가 label/description/group 보유 + label 한글(비-ASCII)
- `PERMISSIONS`가 registry에서 파생(키 집합 불일치 0)

## 범위 밖 (step 2~6)

guard.ts 헬퍼 추가, actions/RLS 키 교체, claim 액션, 관리 UI, seed 프리셋 교체, `*.manage` grep 재배선. step 1은 `permissions.ts` + `permissions.test.ts`만 건드린다.

## 검증 게이트

`pnpm --filter @jhtechsaas/shared test` + `typecheck` GREEN. `as any` 0. (이 단계는 web/db-tests/e2e 영향 없음 — 순수 추가라 기존 전부 GREEN 유지.)
