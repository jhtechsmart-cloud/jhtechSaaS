import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { completeJob, failJob, MAX_ATTEMPTS, type Job } from "./queue";

// 외부 의존(Supabase)은 스텁으로 격리 — update 빌더 체인(.eq().eq().select())을 흉내낸다.
type StubResult = { data: Array<{ id: string }> | null; error: { message: string } | null };

function stubSupabase(result: StubResult) {
  const filters: Array<[string, unknown]> = [];
  const builder = {
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return builder;
    },
    select: vi.fn().mockResolvedValue(result),
  };
  const update = vi.fn().mockReturnValue(builder);
  const from = vi.fn().mockReturnValue({ update });
  return { client: { from } as unknown as SupabaseClient, update, filters };
}

function makeJob(attempts: number): Job {
  return { id: "j1", type: "quote_pdf", payload: {}, attempts, status: "processing" };
}

const ok: StubResult = { data: [{ id: "j1" }], error: null };

describe("completeJob — 완료 기록", () => {
  test("processing 상태일 때만 update하는 펜스를 건다(done 역행 방지)", async () => {
    const { client, filters } = stubSupabase(ok);
    await completeJob(client, "j1");
    expect(filters).toContainEqual(["id", "j1"]);
    expect(filters).toContainEqual(["status", "processing"]);
  });

  test("0행 매칭(다른 워커가 이미 처리)이면 throw하지 않고 경고만 남긴다", async () => {
    const { client } = stubSupabase({ data: [], error: null });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(completeJob(client, "j1")).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("j1"));
    warnSpy.mockRestore();
  });

  test("update 에러면 throw한다", async () => {
    const { client } = stubSupabase({ data: null, error: { message: "down" } });
    await expect(completeJob(client, "j1")).rejects.toThrow(/잡 완료 기록 실패/);
  });
});

describe("failJob — 실패 기록", () => {
  test("기록 update가 에러면 throw한다(조용히 삼키면 잡이 processing으로 고착)", async () => {
    const { client } = stubSupabase({ data: null, error: { message: "network down" } });
    await expect(failJob(client, makeJob(1), "boom")).rejects.toThrow(/잡 실패 기록 실패/);
  });

  test("한도 미만이면 queued로 되돌린다", async () => {
    const { client, update } = stubSupabase(ok);
    await failJob(client, makeJob(1), "boom");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "queued" }));
  });

  test("한도(MAX_ATTEMPTS) 도달이면 failed로 확정한다", async () => {
    const { client, update } = stubSupabase(ok);
    await failJob(client, makeJob(MAX_ATTEMPTS), "boom");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  test("processing 펜스 + 0행이면 throw하지 않고 경고만 남긴다", async () => {
    const { client, filters } = stubSupabase({ data: [], error: null });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(failJob(client, makeJob(1), "boom")).resolves.toBeUndefined();
    expect(filters).toContainEqual(["status", "processing"]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("j1"));
    warnSpy.mockRestore();
  });
});
