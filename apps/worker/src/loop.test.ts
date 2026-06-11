import { describe, expect, test, vi } from "vitest";
import { runLoop } from "./loop";

describe("runLoop — 폴링 루프(종료 신호 인지)", () => {
  test("종료 신호가 오면 진행 중 잡을 마치고 멈춘다", async () => {
    let stopping = false;
    let n = 0;
    const runOnce = vi.fn().mockImplementation(async () => {
      n++;
      if (n === 2) stopping = true; // 두 번째 잡 처리 도중 SIGTERM 도착 시뮬레이션
      return true;
    });
    await runLoop({ runOnce, sleep: async () => {}, isStopping: () => stopping, pollMs: 0 });
    expect(runOnce).toHaveBeenCalledTimes(2); // 2번째까지 완료, 3번째는 집지 않음
  });

  test("runOnce 에러로 루프가 죽지 않는다", async () => {
    let stopping = false;
    let n = 0;
    const runOnce = vi.fn().mockImplementation(async () => {
      n++;
      if (n === 1) throw new Error("boom");
      stopping = true;
      return true;
    });
    const onError = vi.fn();
    await runLoop({ runOnce, sleep: async () => {}, isStopping: () => stopping, onError, pollMs: 0 });
    expect(onError).toHaveBeenCalledOnce();
    expect(runOnce).toHaveBeenCalledTimes(2);
  });

  test("처리할 잡이 없으면 pollMs만큼 쉰다", async () => {
    let stopping = false;
    const sleep = vi.fn().mockImplementation(async () => {
      stopping = true; // 한 번 쉬고 종료(테스트 결정성)
    });
    const runOnce = vi.fn().mockResolvedValue(false);
    await runLoop({ runOnce, sleep, isStopping: () => stopping, pollMs: 2000 });
    expect(sleep).toHaveBeenCalledWith(2000);
  });
});
