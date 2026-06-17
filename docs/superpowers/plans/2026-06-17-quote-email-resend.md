# 견적 메일 재발송 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 발송한 견적도 올바른/다른 주소로 다시 보낼 수 있게, 멱등 잠금을 "발송 진행 중"으로만 좁히고 재발송 UI를 추가한다.

**Architecture:** 부분 유니크 인덱스·RPC 중복검사의 술어를 `(pending,sending,sent)` → `(pending,sending)` 으로 좁혀 완료/실패 후 재발송을 허용. 발송 행은 누적되어 이력이 된다. UI는 `sent`에서 죽은 배지 대신 재발송 버튼 + 직전 발송 정보를 보여준다.

**Tech Stack:** Supabase(Postgres/RLS), Next.js App Router(서버 컴포넌트), Vitest, pg(db-tests), `@jhtechsaas/shared`(KST 포맷).

## Global Constraints
- 마이그레이션 = 한 의도만 + 롤백 별도(`supabase/rollback/` **단수**).
- `as any` 금지. 컴포넌트 비즈니스 로직 직접 작성 금지 — 순수 로직은 `lib/`.
- db-test 전 `supabase db reset` + `bash supabase/seed/seed-local.sh`.
- RPC 시그니처 불변(`enqueue_quote_email(uuid,text,text,text,text,text)`), DEFINER·`search_path=''` 유지.
- 게이트: `@jhtechsaas/db-tests test:rls` · web `typecheck`·`lint`·`build` · `as any` 0.

---

### Task 1: DB — 멱등 잠금을 진행 중(pending·sending)으로 좁힘 + db-test

**Files:**
- Create: `supabase/migrations/20260617120000_quote_email_resend.sql`
- Create: `supabase/rollback/20260617120000_quote_email_resend_down.sql`
- Modify: `packages/db-tests/src/quote_email_enqueue.test.ts` (기존 "부분 유니크" 테스트 갱신 + 재발송 테스트 추가)

**Interfaces:**
- Produces: 변경된 `email_log_active_quote` 인덱스(술어 `status in ('pending','sending')`)와 `enqueue_quote_email` RPC(중복검사 동일 술어, 메시지 "이미 발송 진행 중인 견적입니다").

- [ ] **Step 1: 기존 db-test 갱신 + 재발송 테스트 추가 (RED)**

`packages/db-tests/src/quote_email_enqueue.test.ts` 의 `describe("enqueue_quote_email — 정상 + 멱등")` 안에서 기존 테스트 **"부분 유니크 인덱스: 같은 견적 활성 발송 2건 동시 불가(중복 INSERT 차단)"** 를 아래로 교체하고, 그 뒤에 재발송 테스트 2개를 추가한다.

```ts
    test("부분 유니크 인덱스: 진행 중(pending) 2건 동시 불가 — 단, sent는 차단 안 함", async () => {
      await inRollbackTx(c, async () => {
        const qid = await seedIssuedQuote(UID.sales1);
        await asService(c);
        // 진행 중 1건 → 두 번째 진행 중 INSERT는 차단
        await c.query("insert into public.email_log (quote_id, to_email, status) values ($1,'a@b.com','pending')", [qid]);
        await expect(
          c.query("insert into public.email_log (quote_id, to_email, status) values ($1,'a@b.com','sending')", [qid]),
        ).rejects.toThrow();
      });
    });

    test("재발송 허용: sent 행이 있어도 새 발송 enqueue 가능", async () => {
      await inRollbackTx(c, async () => {
        const qid = await seedIssuedQuote(UID.sales1);
        await asService(c);
        await c.query("insert into public.email_log (quote_id, to_email, status) values ($1,'old@x.com','sent')", [qid]);
        await asUser(c, UID.sales1);
        const out = (await enqueue(qid, "new@x.com")) as { email_log_id: string };
        expect(out.email_log_id).toBeTruthy();
        await asPostgres(c);
        // 같은 견적에 sent + pending 공존
        const rows = await c.query("select status from public.email_log where quote_id=$1 order by created_at", [qid]);
        expect(rows.rows.map((r) => r.status).sort()).toEqual(["pending", "sent"]);
      });
    });

    test("재발송 차단: 진행 중(pending)이면 새 enqueue 거부", async () => {
      await inRollbackTx(c, async () => {
        const qid = await seedIssuedQuote(UID.sales1);
        await asUser(c, UID.sales1);
        await enqueue(qid); // pending 1건
        await expect(enqueue(qid, "x@y.com")).rejects.toThrow(/발송 진행 중/);
      });
    });
```

- [ ] **Step 2: db-test 실행 → 실패 확인 (RED)**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS && supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter @jhtechsaas/db-tests test:rls`
Expected: "재발송 허용" 테스트 FAIL — 현재 인덱스가 `sent` 포함이라 sent 후 pending INSERT가 23505로 거부됨(enqueue가 예외). "부분 유니크" 갱신 테스트는 PASS.

- [ ] **Step 3: 마이그레이션 작성 (GREEN)**

`supabase/migrations/20260617120000_quote_email_resend.sql`:

```sql
-- E6 후속 — 견적 메일 재발송 허용. 멱등 잠금을 '발송 진행 중'(pending·sending)으로만 좁힌다.
-- 기존(20260616170000)은 sent까지 차단 → 의도적 재발송(오타·반송·다른 주소) 불가가 과했음.
-- 완료(sent)·실패(failed)면 새 발송 허용. 진행 중 1건만 유지 → 더블클릭·재시도 중복은 그대로 차단.

-- 1. 부분 유니크 인덱스: 'sent' 제거.
drop index if exists public.email_log_active_quote;
create unique index email_log_active_quote
  on public.email_log (quote_id)
  where status in ('pending', 'sending');

-- 2. RPC 중복검사도 진행 중만 차단 + 문구 갱신(그 외 로직·시그니처 불변).
create or replace function public.enqueue_quote_email(
  p_quote_id uuid,
  p_to text,
  p_cc text default null,
  p_bcc text default null,
  p_subject text default null,
  p_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_quote public.quotes;
  v_hiworks text;
  v_to text := btrim(coalesce(p_to, ''));
  v_cc text := nullif(btrim(coalesce(p_cc, '')), '');
  v_bcc text := nullif(btrim(coalesce(p_bcc, '')), '');
  v_subject text := nullif(regexp_replace(coalesce(p_subject, ''), '[\r\n]+', ' ', 'g'), '');
  v_email_re text := '^[^@[:space:],]+@[^@[:space:],]+\.[^@[:space:],]+$';
  v_log_id uuid;
begin
  if not public.has_permission(v_uid, 'email.send') then
    raise exception '메일 발송 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;

  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then
    raise exception '존재하지 않는 견적입니다: %', p_quote_id;
  end if;
  if not (v_quote.assignee_id = v_uid
          or public.has_permission(v_uid, 'applications.view_all')) then
    raise exception '이 견적에 접근 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;

  if v_quote.status <> 'issued' then
    raise exception '발행된 견적만 발송할 수 있습니다';
  end if;
  if v_quote.pdf_url is null then
    raise exception '견적서 PDF가 아직 생성되지 않았습니다';
  end if;

  select hiworks_user_id into v_hiworks from public.profiles where id = v_uid;
  v_hiworks := nullif(btrim(coalesce(v_hiworks, '')), '');
  if v_hiworks is null then
    raise exception '담당자 하이웍스 ID가 설정되지 않았습니다(관리자에서 설정 필요)';
  end if;

  if v_to !~ v_email_re then
    raise exception '받는 사람 이메일 형식이 올바르지 않습니다: %', v_to;
  end if;
  if v_cc is not null and v_cc !~ v_email_re then
    raise exception '참조(cc) 이메일 형식이 올바르지 않습니다';
  end if;
  if v_bcc is not null and v_bcc !~ v_email_re then
    raise exception '숨은참조(bcc) 이메일 형식이 올바르지 않습니다';
  end if;

  if char_length(coalesce(v_subject, '')) > 200 then
    raise exception '제목이 너무 깁니다(최대 200자)';
  end if;
  if char_length(coalesce(p_body, '')) > 5000 then
    raise exception '본문이 너무 깁니다(최대 5000자)';
  end if;

  -- 중복 발송 거부 — 진행 중(pending·sending)만. 완료/실패면 재발송 허용.
  if exists (
    select 1 from public.email_log
    where quote_id = p_quote_id and status in ('pending', 'sending')
  ) then
    raise exception '이미 발송 진행 중인 견적입니다';
  end if;

  insert into public.email_log (application_id, quote_id, to_email, from_user_id, subject, status)
  values (v_quote.application_id, p_quote_id, v_to, v_uid, v_subject, 'pending')
  returning id into v_log_id;

  insert into public.jobs (type, payload)
  values ('email', jsonb_build_object(
    'email_log_id', v_log_id,
    'quote_id', p_quote_id,
    'from_user_id', v_uid,
    'hiworks_user_id', v_hiworks,
    'to', v_to,
    'cc', v_cc,
    'bcc', v_bcc,
    'subject', v_subject,
    'body', coalesce(p_body, '')
  ));

  return jsonb_build_object('email_log_id', v_log_id);
end;
$$;
revoke all on function public.enqueue_quote_email(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.enqueue_quote_email(uuid, text, text, text, text, text) to authenticated;
```

- [ ] **Step 4: 롤백 스크립트 작성**

`supabase/rollback/20260617120000_quote_email_resend_down.sql`:

```sql
-- 롤백 — 멱등 잠금을 다시 sent 포함으로 복원(20260616170000 상태).
drop index if exists public.email_log_active_quote;
create unique index email_log_active_quote
  on public.email_log (quote_id)
  where status in ('pending', 'sending', 'sent');

-- RPC 중복검사 술어·문구를 이전으로 되돌린다. (전체 본문 재정의는 20260616170000 참조 —
-- 여기선 술어 2줄만 다른 동일 함수를 재생성)
create or replace function public.enqueue_quote_email(
  p_quote_id uuid, p_to text, p_cc text default null, p_bcc text default null,
  p_subject text default null, p_body text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_quote public.quotes;
  v_hiworks text;
  v_to text := btrim(coalesce(p_to, ''));
  v_cc text := nullif(btrim(coalesce(p_cc, '')), '');
  v_bcc text := nullif(btrim(coalesce(p_bcc, '')), '');
  v_subject text := nullif(regexp_replace(coalesce(p_subject, ''), '[\r\n]+', ' ', 'g'), '');
  v_email_re text := '^[^@[:space:],]+@[^@[:space:],]+\.[^@[:space:],]+$';
  v_log_id uuid;
begin
  if not public.has_permission(v_uid, 'email.send') then
    raise exception '메일 발송 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then raise exception '존재하지 않는 견적입니다: %', p_quote_id; end if;
  if not (v_quote.assignee_id = v_uid or public.has_permission(v_uid, 'applications.view_all')) then
    raise exception '이 견적에 접근 권한이 없습니다' using errcode = 'insufficient_privilege'; end if;
  if v_quote.status <> 'issued' then raise exception '발행된 견적만 발송할 수 있습니다'; end if;
  if v_quote.pdf_url is null then raise exception '견적서 PDF가 아직 생성되지 않았습니다'; end if;
  select hiworks_user_id into v_hiworks from public.profiles where id = v_uid;
  v_hiworks := nullif(btrim(coalesce(v_hiworks, '')), '');
  if v_hiworks is null then raise exception '담당자 하이웍스 ID가 설정되지 않았습니다(관리자에서 설정 필요)'; end if;
  if v_to !~ v_email_re then raise exception '받는 사람 이메일 형식이 올바르지 않습니다: %', v_to; end if;
  if v_cc is not null and v_cc !~ v_email_re then raise exception '참조(cc) 이메일 형식이 올바르지 않습니다'; end if;
  if v_bcc is not null and v_bcc !~ v_email_re then raise exception '숨은참조(bcc) 이메일 형식이 올바르지 않습니다'; end if;
  if char_length(coalesce(v_subject, '')) > 200 then raise exception '제목이 너무 깁니다(최대 200자)'; end if;
  if char_length(coalesce(p_body, '')) > 5000 then raise exception '본문이 너무 깁니다(최대 5000자)'; end if;
  if exists (select 1 from public.email_log where quote_id = p_quote_id and status in ('pending','sending','sent')) then
    raise exception '이미 발송했거나 발송 대기 중인 견적입니다'; end if;
  insert into public.email_log (application_id, quote_id, to_email, from_user_id, subject, status)
  values (v_quote.application_id, p_quote_id, v_to, v_uid, v_subject, 'pending') returning id into v_log_id;
  insert into public.jobs (type, payload) values ('email', jsonb_build_object(
    'email_log_id', v_log_id, 'quote_id', p_quote_id, 'from_user_id', v_uid, 'hiworks_user_id', v_hiworks,
    'to', v_to, 'cc', v_cc, 'bcc', v_bcc, 'subject', v_subject, 'body', coalesce(p_body, '')));
  return jsonb_build_object('email_log_id', v_log_id);
end; $$;
revoke all on function public.enqueue_quote_email(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.enqueue_quote_email(uuid, text, text, text, text, text) to authenticated;
```

- [ ] **Step 5: 리셋 + db-test → 통과 확인 (GREEN)**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS && supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter @jhtechsaas/db-tests test:rls`
Expected: 전체 PASS (재발송 허용·진행중 차단·부분유니크 갱신 포함).

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260617120000_quote_email_resend.sql supabase/rollback/20260617120000_quote_email_resend_down.sql packages/db-tests/src/quote_email_enqueue.test.ts
git commit -m "feat: 견적 메일 멱등 잠금을 진행 중으로 좁힘(재발송 허용)"
```

---

### Task 2: 직전 발송 정보 포맷 순수 함수 + 백엔드 쿼리 확장

**Files:**
- Create: `apps/web/src/lib/quotes/last-send.ts`
- Create: `apps/web/src/lib/quotes/last-send.test.ts`
- Modify: `apps/web/src/app/admin/applications/[id]/page.tsx:164-175` (email_log select 확장 + lastSend 구성)

**Interfaces:**
- Produces: `type LastSend = { to: string; status: string; at: string }` 와 `formatLastSendLine(lastSend: LastSend | null): string | null`.
- Produces: page.tsx가 `lastSend: LastSend | null` 를 `QuoteSummaryPanel`로 전달.

- [ ] **Step 1: 순수 함수 테스트 (RED)**

`apps/web/src/lib/quotes/last-send.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatLastSendLine } from "./last-send";

describe("formatLastSendLine", () => {
  it("성공 발송 → 주소·성공·KST 시각", () => {
    const line = formatLastSendLine({ to: "a@b.com", status: "sent", at: "2026-06-17T05:24:24.000Z" });
    expect(line).toContain("a@b.com");
    expect(line).toContain("성공");
    expect(line).toContain("2026.06.17"); // KST(+9) 같은 날
  });
  it("실패 발송 → 실패 표기", () => {
    const line = formatLastSendLine({ to: "a@b.com", status: "failed", at: "2026-06-17T05:24:24.000Z" });
    expect(line).toContain("실패");
  });
  it("발송 이력 없으면 null", () => {
    expect(formatLastSendLine(null)).toBeNull();
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인 (RED)**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS/apps/web && pnpm exec vitest run src/lib/quotes/last-send.test.ts`
Expected: FAIL — `Cannot find module './last-send'`.

- [ ] **Step 3: 순수 함수 구현 (GREEN)**

`apps/web/src/lib/quotes/last-send.ts`:

```ts
import { formatKstDateTime } from "@jhtechsaas/shared";

// 모달의 "직전 발송" 한 줄 — 마지막 발송 행(수신자·상태·시각)을 사람이 읽기 좋게.
export type LastSend = { to: string; status: string; at: string };

export function formatLastSendLine(lastSend: LastSend | null): string | null {
  if (!lastSend) return null;
  const when = formatKstDateTime(lastSend.at);
  const statusLabel =
    lastSend.status === "sent" ? "성공" : lastSend.status === "failed" ? "실패" : lastSend.status;
  return `직전 발송: ${lastSend.to} (${statusLabel}${when ? `, ${when}` : ""})`;
}
```

- [ ] **Step 4: 실행 → 통과 (GREEN)**

Run: `pnpm exec vitest run src/lib/quotes/last-send.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: page.tsx 쿼리 확장**

`apps/web/src/app/admin/applications/[id]/page.tsx` 의 email_log 블록(현재 164-175)을 아래로 교체. `LastSend` import 추가.

```ts
  // 현재 견적의 최신 메일 발송 상태/대상(배지·재발송 모달용). 발행본만 의미 있음.
  let emailStatus: string | null = null;
  let lastSend: import("@/lib/quotes/last-send").LastSend | null = null;
  if (selected) {
    const { data: el } = await supabase
      .from("email_log")
      .select("status, to_email, created_at")
      .eq("quote_id", selected.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = el as { status?: string; to_email?: string; created_at?: string } | null;
    emailStatus = row?.status ?? null;
    lastSend = row?.to_email && row?.created_at
      ? { to: row.to_email, status: row.status ?? "", at: row.created_at }
      : null;
  }
```

그리고 `QuoteSummaryPanel` 렌더(현재 345 부근 `emailStatus={emailStatus}`) 바로 아래에 `lastSend={lastSend}` 추가.

- [ ] **Step 6: typecheck**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS/apps/web && pnpm run typecheck`
Expected: 통과(아직 QuoteSummaryPanel가 lastSend prop을 안 받으면 에러 → Task 3에서 prop 추가하므로, 이 Step에선 prop을 옵셔널로 받도록 Task 3와 함께 진행. 임시로 typecheck 에러가 나면 Task 3 Step 1을 먼저 적용).

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/lib/quotes/last-send.ts apps/web/src/lib/quotes/last-send.test.ts apps/web/src/app/admin/applications/[id]/page.tsx
git commit -m "feat: 직전 발송 정보 포맷 + 견적 상세 쿼리 확장"
```

---

### Task 3: UI — 재발송 버튼 + 직전 발송 안내 (SendQuoteEmailModal)

**Files:**
- Modify: `apps/web/src/app/admin/applications/[id]/_components/quote-frame/QuoteSummaryPanel.tsx:12-30,74-80` (lastSend prop 추가·전달)
- Modify: `apps/web/src/app/admin/applications/[id]/_components/quote-frame/SendQuoteEmailModal.tsx`

**Interfaces:**
- Consumes: `LastSend` from `@/lib/quotes/last-send`, `formatLastSendLine`.
- Consumes: page.tsx가 내려준 `lastSend`.

- [ ] **Step 1: QuoteSummaryPanel에 lastSend prop 추가·전달**

props 타입(28-29 부근)에 추가:
```ts
  emailStatus?: string | null;
  lastSend?: import("@/lib/quotes/last-send").LastSend | null; // 직전 발송 정보(재발송 모달용)
  companyName?: string | null;
```
구조분해(15행)에 `lastSend` 추가. `SendQuoteEmailModal` 렌더(74-80)에 `lastSend={lastSend ?? null}` 추가.

- [ ] **Step 2: SendQuoteEmailModal — 재발송 허용 + 안내**

`SendQuoteEmailModal.tsx` 를 아래 핵심 변경으로 수정:
1. props에 `lastSend?: LastSend | null` 추가(+ import `formatLastSendLine, type LastSend`).
2. `sent` 분기(현재 58-62)를 죽은 배지 대신 **확인 배지 + "다른 주소로 재발송" 버튼**으로:
```tsx
  const sent = emailStatus === "sent";
  const inFlight = emailStatus === "pending" || emailStatus === "sending";
  const failed = emailStatus === "failed";
  const lastLine = formatLastSendLine(lastSend ?? null);

  if (inFlight) {
    return (
      <span className="rounded-md bg-surface-2 py-2 text-center text-small font-medium text-muted">메일 발송 중…</span>
    );
  }
```
(즉 기존 `if (sent) return 배지` 블록을 제거하고 inFlight만 조기 반환.)
3. 버튼 영역(현재 69-78)을 상태별 라벨로:
```tsx
  return (
    <>
      {sent && (
        <span className="rounded-md bg-mint py-1.5 text-center text-micro font-medium text-accent-2">✓ 메일 발송됨</span>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-accent py-2 text-center text-small font-medium text-white hover:opacity-90"
      >
        {sent ? "다른 주소로 재발송" : failed ? "메일 재발송" : "메일 발송"}
      </button>
      {failed && <span className="text-micro text-danger">직전 발송이 실패했습니다 — 다시 시도하세요.</span>}
```
4. 모달 제목 아래(현재 89 `<h3>` 다음)에 재발송 안내 + 직전 발송 줄:
```tsx
            <h3 className="mb-3 text-body font-semibold text-text">견적서 메일 발송</h3>
            {(sent || failed) && (
              <div className="mb-3 rounded-md bg-surface-2 px-3 py-2 text-micro text-muted">
                {sent && <p>이미 발송된 견적입니다 — 다른 주소로 다시 보낼 수 있습니다.</p>}
                {lastLine && <p className="mt-0.5">{lastLine}</p>}
              </div>
            )}
```

- [ ] **Step 3: typecheck + lint + build**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS/apps/web && pnpm run typecheck && pnpm run lint && pnpm run build`
Expected: 통과, `as any` 0.

- [ ] **Step 4: 전체 web 단위 테스트(회귀)**

Run: `pnpm exec vitest run`
Expected: 전체 PASS(신규 last-send 포함).

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app/admin/applications/[id]/_components/quote-frame/QuoteSummaryPanel.tsx apps/web/src/app/admin/applications/[id]/_components/quote-frame/SendQuoteEmailModal.tsx
git commit -m "feat: 견적 메일 재발송 버튼 + 직전 발송 안내"
```

---

### Task 4: 게이트 마감 + 시각 확인

- [ ] **Step 1: e2e 회귀(클린 reset+seed)**

Run: `cd /Users/seonjecho/Projects/jhtechSaaS && supabase db reset && bash supabase/seed/seed-local.sh && pnpm --filter web test:e2e`
Expected: 기존 시나리오 PASS(메일 모달은 발송 버튼 라벨만 바뀜 — 단언 충돌 시 e2e 갱신).

- [ ] **Step 2: dev에서 재발송 모달 시각 확인**

발행 견적 상세에서 `sent` 상태 견적의 "다른 주소로 재발송" 버튼·모달 안내·직전 발송 줄을 dev(또는 playwright 스크린샷)로 확인 → Read 도구로 대조.

- [ ] **Step 3: PR 생성 → 머지 → `supabase db push`(원격) → 프로덕션 200 확인**

## Self-Review
- **Spec coverage:** ①DB 술어 축소=Task1, ②백엔드 쿼리 확장=Task2, ③UI 재발송+직전발송=Task3, 게이트/시각=Task4. 누락 없음.
- **Placeholder scan:** 모든 SQL·TS·명령 실제 내용 포함. `<ts>`는 실제 `20260617120000`로 확정됨.
- **Type consistency:** `LastSend{to,status,at}` 가 last-send.ts·page.tsx·QuoteSummaryPanel·SendQuoteEmailModal에서 동일. `formatLastSendLine` 시그니처 일관.
