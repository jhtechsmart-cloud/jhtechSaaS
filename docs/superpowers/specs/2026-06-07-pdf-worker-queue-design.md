# 통합 PDF 워커 골격 + jobs 큐 (E5 백엔드 #3) — 설계

> **한 문장 요약**: 견적을 발행하면 DB 트리거가 `jobs` 큐에 PDF 잡을 넣고, Railway 워커가 `FOR UPDATE SKIP LOCKED`로 잡을 집어 최소 placeholder PDF를 생성→`quote-pdfs` 버킷 업로드→`quotes.pdf_url` 기록한다.
> **왜 필요한가**: 견적서 PDF는 무겁고 비동기 → Railway 워커 + 큐(webhook/Realtime 회피, CLAUDE.md). 견적서 양식(의뢰사 대기)이 없어도 큐·워커·스토리지 파이프라인은 지금 완성하고, 레이아웃만 후속 교체.

## 결정 (2026-06-07)

- **PDF 스텁 = 최소 실 placeholder PDF**(pdf-lib, 견적번호·금액만). 파이프라인 전체 증명(발행→잡→워커→스토리지→pdf_url). 레이아웃만 후속.
- **enqueue = quotes AFTER 트리거**(발행 전환 시). 서버액션 enqueue 대신 — DB레벨이 견고·모든 발행 경로 포착.
- **pdf_url = 스토리지 객체 경로 저장**(`{quote_id}.pdf`). 고객 노출용 서명URL은 E6.

## 1. `jobs` 큐 테이블 (마이그레이션 `20260607140000_jobs_queue.sql`)

```
id uuid pk default gen_random_uuid()
type text not null            -- 'quote_pdf' (향후 'email' 등)
payload jsonb not null default '{}'
status text not null default 'queued' check (status in ('queued','processing','done','failed'))
attempts int not null default 0
last_error text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```
- index `(status, created_at)`. RLS enable + **정책 0**(anon/authenticated 차단). 워커=service_role(우회), claim=DEFINER RPC.

## 2. enqueue 트리거 (quotes AFTER INSERT OR UPDATE)

`quotes_enqueue_pdf()` — `status='issued'`로 **전환될 때만** jobs insert:
- INSERT 시 `new.status='issued'`, 또는 UPDATE 시 `new.status='issued' AND old.status<>'issued'`.
- `insert into jobs(type,payload) values('quote_pdf', jsonb_build_object('quote_id', new.id))`.
- pdf_url 갱신(old=issued→issued)은 조건 불충족 → 재enqueue 안 함. 기존 BEFORE 트리거와 분리된 AFTER 트리거.

## 3. `claim_next_job()` RPC (SECURITY DEFINER)

```
select … where status='queued' order by created_at for update skip locked limit 1
→ update status='processing', attempts=attempts+1, updated_at=now() → return row(jsonb)
```
- 동시 워커 레이스 0. `revoke from public, anon, authenticated` + `grant execute to service_role`.

## 4. 워커 (apps/worker)

- `jobs/render-quote-pdf.ts` — `buildQuotePdf(quote): Promise<Uint8Array>` 순수(pdf-lib, 견적번호·공급가/세액/합계 텍스트). **Vitest 단위.**
- `jobs/quote-pdf.ts` — `processQuotePdfJob(supabase, payload)`: 견적 로드 → `buildQuotePdf` → `quote-pdfs/{quote_id}.pdf` 업로드(upsert) → `quotes.pdf_url` 기록(issued행 pdf_url 예외 경로).
- `jobs/queue.ts` — `claimNextJob`/`completeJob`/`failJob`(실패 시 attempts≥3 'failed' 아니면 'queued' 재시도).
- `index.ts` — 폴링 루프: loadEnv → service client → `runOnce()` 반복 + sleep. `runOnce(supabase)` 분리(잡 1건 claim→process→complete/fail, 테스트용).
- `env.ts` — GMAIL_* **optional 완화**(PDF엔 불필요, E6에서 필수화).
- 의존성 `pdf-lib` 추가(순수 JS).

## 데이터 흐름

발행 → BEFORE(채번·issued_at) → AFTER(jobs enqueue) → 워커 claim(SKIP LOCKED) → PDF 생성·업로드 → pdf_url 기록 → (E6) 고객 서명URL.

## 테스트

- **db-tests**: enqueue 트리거(issued→잡 생성·draft→없음·pdf_url갱신→재enqueue 안 함) + `claim_next_job`(클레임·processing 전이·재클레임 null) + RLS(anon select 차단).
- **worker Vitest**: `buildQuotePdf`(유효 PDF 바이트 `%PDF` 헤더) + 통합 `runOnce`(로컬 supabase: 발행→잡→runOnce→pdf_url 기록·스토리지 객체 확인).

## 롤백

`supabase/rollback/20260607140000_jobs_queue_down.sql` — 트리거·RPC·jobs 테이블 drop.

## 범위 밖 (후속)

실제 견적서 레이아웃(양식 대기)·장비 사양서 통합·카탈로그 PDF 첨부·메일 발송(E6).
