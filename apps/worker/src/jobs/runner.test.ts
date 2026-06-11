import { beforeEach, describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job } from "./queue";

// 외부 의존(큐·PDF 처리)은 vi.mock으로 격리 — runner의 분기만 검증.
vi.mock("./queue", () => ({
  claimNextJob: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
}));
vi.mock("./quote-pdf", () => ({
  processQuotePdfJob: vi.fn(),
}));

import { claimNextJob, completeJob, failJob } from "./queue";
import { processQuotePdfJob } from "./quote-pdf";
import { runOnce } from "./runner";

const supabase = {} as unknown as SupabaseClient;
const job: Job = { id: "j1", type: "quote_pdf", payload: {}, attempts: 1, status: "processing" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runOnce — 잡 1건 처리", () => {
  test("처리 실패 시 원래 에러를 잡 id와 함께 로그한 뒤 failJob한다(원인 소실 방지)", async () => {
    vi.mocked(claimNextJob).mockResolvedValue(job);
    const cause = new Error("렌더 실패");
    vi.mocked(processQuotePdfJob).mockRejectedValue(cause);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runOnce(supabase);

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("j1"), cause);
    expect(failJob).toHaveBeenCalledWith(supabase, job, "렌더 실패");
    errSpy.mockRestore();
  });

  test("failJob 기록까지 실패하면 throw가 루프(onError)로 전파된다 — 잡은 스테일 회수가 되살림", async () => {
    vi.mocked(claimNextJob).mockResolvedValue(job);
    vi.mocked(processQuotePdfJob).mockRejectedValue(new Error("렌더 실패"));
    vi.mocked(failJob).mockRejectedValue(new Error("잡 실패 기록 실패: down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runOnce(supabase)).rejects.toThrow("잡 실패 기록 실패");
    errSpy.mockRestore();
  });

  test("정상 처리면 completeJob까지 호출하고 true", async () => {
    vi.mocked(claimNextJob).mockResolvedValue(job);
    vi.mocked(processQuotePdfJob).mockResolvedValue(undefined);

    await expect(runOnce(supabase)).resolves.toBe(true);
    expect(completeJob).toHaveBeenCalledWith(supabase, "j1");
  });

  test("잡이 없으면 false", async () => {
    vi.mocked(claimNextJob).mockResolvedValue(null);
    await expect(runOnce(supabase)).resolves.toBe(false);
  });
});
