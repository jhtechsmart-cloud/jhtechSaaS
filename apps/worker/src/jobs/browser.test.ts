import { describe, expect, test, vi } from "vitest";
import type { Browser } from "puppeteer-core";
import { createBrowserManager } from "./browser";

// 실제 크롬 대신 connected/close만 흉내내는 가짜 Browser.
function fakeBrowser(connected = true): Browser {
  return { connected, close: vi.fn().mockResolvedValue(undefined) } as unknown as Browser;
}

describe("createBrowserManager — 크롬 싱글턴 복구", () => {
  test("기동 실패가 박제되지 않는다 — 다음 호출에서 재기동", async () => {
    const b = fakeBrowser();
    const launch = vi
      .fn()
      .mockRejectedValueOnce(new Error("launch fail"))
      .mockResolvedValueOnce(b);
    const m = createBrowserManager(launch);
    await expect(m.get()).rejects.toThrow("launch fail");
    await expect(m.get()).resolves.toBe(b);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  test("살아있는 크롬은 재사용한다(기동 1회)", async () => {
    const b = fakeBrowser();
    const launch = vi.fn().mockResolvedValue(b);
    const m = createBrowserManager(launch);
    await expect(m.get()).resolves.toBe(b);
    await expect(m.get()).resolves.toBe(b);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  test("크롬이 도중에 죽었으면(disconnected) 새로 기동한다", async () => {
    const dead = fakeBrowser(false);
    const alive = fakeBrowser(true);
    const launch = vi.fn().mockResolvedValueOnce(dead).mockResolvedValueOnce(alive);
    const m = createBrowserManager(launch);
    await m.get(); // 첫 기동(이후 죽었다고 가정 = connected false)
    await expect(m.get()).resolves.toBe(alive);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  test("close 후 get은 새로 기동한다", async () => {
    const first = fakeBrowser();
    const second = fakeBrowser();
    const launch = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const m = createBrowserManager(launch);
    await m.get();
    await m.close();
    expect(first.close).toHaveBeenCalledOnce();
    await expect(m.get()).resolves.toBe(second);
  });
});
