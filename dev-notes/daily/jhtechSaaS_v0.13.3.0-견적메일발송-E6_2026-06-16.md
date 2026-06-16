# 견적서 메일 발송 (E6, 하이웍스 Office Token) — v0.13.3.0

- 날짜: 2026-06-16
- 버전: v0.13.3.0 (PR #124, main `ffa904c`)
- 이슈: #123 (Closes)
- 배포: db push(마이그 `20260616170000`) · Vercel 자동(home 200 / admin 307) · Railway 워커 자동

## 한 줄 요약
발행된 견적서를 영업담당자 명의로 고객에게 하이웍스 REST API로 메일 발송하고 담당자 보낸편지함에 기록하는 기능을 풀스택으로 구현·배포. 실발송은 토큰 발급(미팅) 후 활성화.

## 무엇을 / 왜
- **무엇**: 견적 상세 '메일 발송' 버튼 → 확인 모달 → 워커가 30일 서명URL 다운로드 링크를 본문에 담아 하이웍스 `sendMail`로 발송. 발송 상태 배지, `/admin/users` 담당자별 하이웍스 ID.
- **왜**: 영업이 견적을 보낸 기록을 자기 하이웍스 메일함(보낸편지함)에서 확인해야 함 → 외부 SMTP 불가, REST API의 `save_sent_mail=Y`가 유일한 방법.

## 흐름(Phase Gate 전 과정)
하이웍스 API 스펙 확정(스크린샷) → /spec(#123) → /autoplan(CEO·Eng 듀얼보이스) → TDD 4슬라이스(DB·shared·worker·web) → /review(3 리뷰어) → /ship(PR #124) → 머지 → db push.

## 슬라이스
1. **DB**: `profiles.hiworks_user_id`, `email_log` 상태기계(`sending` 추가)·부분 유니크 인덱스, `enqueue_quote_email` SECURITY DEFINER RPC(+롤백).
2. **shared** `mail.ts`: `MailSender` 인터페이스 + `HiworksMailSender`(form-data·`save_sent_mail=Y`·`SUC`/successList·실패분류) / `FakeMailSender` + 템플릿.
3. **worker** `email.ts`: `processEmailJob`(CAS 멱등·30일 서명URL·실패 분류·종단 failed) + runner email 분기 + env `GMAIL_*`→`HIWORKS_OFFICE_TOKEN`.
4. **web**: 발송 모달 + 서버액션 + 상태 배지 + `/admin/users` hiworks_user_id 입력.

## 결정 (ADR)
- **채널 = 하이웍스 Office Token REST** (SMTP·Resend 대안 기각). 이유: POP-only라 SMTP는 보낸편지함 미적재, `save_sent_mail`이 핵심 요구를 충족. /autoplan User Challenge(Resend+BCC)에도 "개인명의+보낸편지함 확정 요구"로 하이웍스 유지.
- **인증 = Office Token** (self-service, 오피스 관리서 발급). OAuth/AccessToken은 deprecated·메일 미지원.
- **v1 = 본문 PDF 다운로드 링크** (첨부 파라미터가 문서에 없음 → 인터페이스만 첨부 확장형으로 준비).
- **토큰 미설정 시 FakeMailSender** → 실발송 OFF로 안전하게 머지.

## 학습 (재사용 가치)
- **메일은 PDF 잡과 달리 멱등성이 없다** → 재시도·스테일 회수가 곧 중복 발송. `email_log` 상태기계(pending→sending→sent/failed) + 발송 직전 CAS 잠금 + 견적당 활성 1건 부분 유니크로 차단. 재시도 한도 도달 시 `failed` 종단(이전 `pending` 고착 = 리뷰가 잡은 실버그).
- **발송자 = `auth.uid()` 서버 강제** (클라 `user_id` 미신뢰) → 타인 명의 발송 차단.
- **Office Token은 Railway 워커 env에** 둔다: 발송 코드가 워커에서 돌고, 하이웍스 허용 IP가 워커 고정 IP만 받으므로 발송은 워커 경유가 강제됨. 시크릿이라 코드 아닌 env.
- **하이웍스 응답 스키마는 추정값** → 라이브 1건 캡처로 확정 전엔 도박. Fake 기본 + 토큰 후 스모크테스트가 안전망.

## 게이트
shared 107 · db-tests 15(+회귀) · worker 통합 10/단위 38 · web 단위 310 · e2e(quote-email) · typecheck · lint(신규 0) · build · `as any` 0 — 전부 GREEN. CI gates 통과.

## 다음 (실발송 활성화)
1. 내일 미팅: ① PDF 첨부 가능 여부 ② Office Token self-service 발급 확인.
2. 고객사 관리자가 토큰 발급(Scope '이메일 보내기' + 워커 고정 IP 3개를 허용 IP에 등록).
3. Railway env `HIWORKS_OFFICE_TOKEN` 주입 + `/admin/users` 담당자별 hiworks_user_id 입력.
4. **라이브 스모크테스트**: 실발송 + 보낸편지함 적재 + content HTML 렌더 확인.

후속 백로그: PDF 첨부(하이웍스 확인 후) · `email_log_insert` RLS 강화(신뢰 내부자 DoS 여지, P2) · 3b 특기사항 · 3c 영업일지.
