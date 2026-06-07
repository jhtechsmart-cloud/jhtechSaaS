# 의뢰 상태 5단계 — 견적발송 추가 (E5 후속) — 설계

> **한 문장 요약**: 의뢰 상태에 **`quote_sent`(견적발송)** 를 추가해 5단계(접수→배정→견적중→견적발송→완료)로 만들고, 견적 저장이 의뢰 상태를 자동 전진시킨다.
> **왜 필요한가**: 실사용에서 발견 — 견적을 발행해도 목록이 '견적중'(작성중처럼 읽힘)으로 남거나, 의뢰에서 작성한 경우 상태가 아예 안 바뀜(수기와 불일치). 발행=발송됨을 상태로 드러낸다.

## 확정 모델 (Seonje 결정)

```
접수(new) → 배정(assigned) → 견적중(quoted) → 견적발송(quote_sent) → 완료(closed)
 미배정      담당배정        견적 작성중        발행됨               건 종결(수동)
                            (draft 존재)       (issued)
```

- **견적중** = 견적 작성 중(발행 직전까지, draft 존재).
- **견적발송** = 견적 발행(issued)됨. **신규 상태.**
- **완료** = 영업이 직접 표시(시스템은 고객 수주 여부 모름). 자동 아님.

### 자동 전이 (앞으로만, closed/quote_sent 보존)
| 동작 | 전이 |
|---|---|
| draft 견적 저장 | `new/assigned` → **quoted** |
| 견적 **발행**(issued) | `new/assigned/quoted` → **quote_sent** |
| 재발행(V2 issued) | quote_sent 유지(변화 없음) |
| draft on quote_sent | 유지(다운그레이드 안 함) |
| closed | 항상 보존(재오픈 안 함) |
| 완료 | StatusControl로 영업 수동 |

### 색
- 견적발송 = 초록 `#16A34A`(발송 성공, DESIGN.md 스파인의 발송완료).
- **완료 = 네이비 `#3a3770`**(Seonje 지정, 종결).
- 나머지: 접수 파랑·배정 보라·견적중 앰버 (불변).

## 바뀌는 것

- **마이그레이션** `20260608120000_quote_sent_status.sql`:
  - `applications` CHECK 제약에 `quote_sent` 추가.
  - `_quote_insert`에 상태 자동 전이 추가(draft→quoted, issued→quote_sent, 위 규칙).
  - 백필: 기존 `quoted`인데 발행 견적 있는 의뢰 → `quote_sent`로 보정.
- **타입/스키마**: `ApplicationStatus`(history.ts)·`applicationStatusSchema`(status-schema.ts)에 `quote_sent`.
- **메타**: `application-status.tsx` APPLICATION_STATUSES + META(견적발송 초록·완료 네이비).
- **대시보드**: `aggregates.ts` APP_OPEN(미완료)에 `quote_sent` 추가(견적발송도 진행중).
- 자동 반영: StatusControl(드롭다운)·목록 필터·전체현황 도넛 = APPLICATION_STATUSES 단일출처.

## 테스트
- **db-tests**: draft→견적중, issued→견적발송, 재발행 유지, closed 보존, draft-on-quote_sent 유지, 수기 issued→견적발송.
- **web**: applicationStatusSchema가 quote_sent 통과, META 라벨·색.
- **e2e**: 견적 발행 후 의뢰 상세/목록 상태 배지 = 견적발송.

## 범위 밖
'취소/거절' 종결 상태(스파인의 실패 red) — 지금은 완료만. 후속.
