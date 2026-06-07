import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createServiceClient } from "@jhtechsaas/shared";
import { runOnce } from "./runner";

// 통합 테스트 — 로컬 Supabase(54321)에 직접. 발행→트리거 enqueue→runOnce→PDF 업로드→pdf_url.
// 로컬 데모 service_role 키(비밀 아님, playwright.config와 동일). 로컬 Supabase가 떠 있어야 한다(db-tests와 동일 전제).
const URL = "http://127.0.0.1:54321";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const supabase = createServiceClient(URL, KEY);
const CO = "WORKER_E2E_견적사";

async function cleanup(): Promise<void> {
  const { data: apps } = await supabase.from("applications").select("id").eq("company", CO);
  for (const a of apps ?? []) {
    const { data: qs } = await supabase.from("quotes").select("id").eq("application_id", a.id as string);
    for (const q of qs ?? []) {
      await supabase.storage.from("quote-pdfs").remove([`${q.id as string}.pdf`]);
    }
  }
  await supabase.from("applications").delete().eq("company", CO); // cascade quotes
  await supabase.from("jobs").delete().eq("status", "queued"); // 스테일 잡 정리(결정성)
}

describe("PDF 워커 파이프라인(통합) — 발행→잡→runOnce→pdf_url", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  test("issued 견적의 PDF가 생성·업로드되고 pdf_url이 기록된다", async () => {
    const { data: app, error: aErr } = await supabase
      .from("applications")
      .insert({ company: CO })
      .select("id")
      .single();
    expect(aErr).toBeNull();
    const { data: quote, error: qErr } = await supabase
      .from("quotes")
      .insert({ application_id: app!.id as string, status: "issued" })
      .select("id")
      .single();
    expect(qErr).toBeNull();
    const qid = quote!.id as string;

    // 큐를 빌 때까지 처리(내 잡 포함). 트리거가 enqueue한 quote_pdf 잡을 runOnce가 소진.
    for (let i = 0; i < 10; i++) {
      if (!(await runOnce(supabase))) break;
    }

    // pdf_url 기록(= 스토리지 경로)
    const { data: after } = await supabase.from("quotes").select("pdf_url").eq("id", qid).single();
    expect(after!.pdf_url).toBe(`${qid}.pdf`);

    // 스토리지에 실제 객체 존재
    const dl = await supabase.storage.from("quote-pdfs").download(`${qid}.pdf`);
    expect(dl.error).toBeNull();
    expect(dl.data).toBeTruthy();
  });
});
