import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { failJob, type Job } from "./queue";

// 외부 의존(Supabase)은 스텁으로 격리 — update 결과만 제어한다.
function stubSupabase(error: { message: string } | null) {
  const eq = vi.fn().mockResolvedValue({ error });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { client: { from } as unknown as SupabaseClient, update };
}

function makeJob(attempts: number): Job {
  return { id: "j1", type: "quote_pdf", payload: {}, attempts, status: "processing" };
}

describe("failJob — 실패 기록", () => {
  test("기록 update가 에러면 throw한다(조용히 삼키면 잡이 processing으로 고착)", async () => {
    const { client } = stubSupabase({ message: "network down" });
    await expect(failJob(client, makeJob(1), "boom")).rejects.toThrow(/잡 실패 기록 실패/);
  });

  test("한도 미만이면 queued로 되돌린다", async () => {
    const { client, update } = stubSupabase(null);
    await failJob(client, makeJob(1), "boom");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "queued" }));
  });

  test("한도(3회) 도달이면 failed로 확정한다", async () => {
    const { client, update } = stubSupabase(null);
    await failJob(client, makeJob(3), "boom");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});
