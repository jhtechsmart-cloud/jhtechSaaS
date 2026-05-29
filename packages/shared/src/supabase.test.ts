import { describe, expect, test } from "vitest";
import { createAnonClient, createServiceClient } from "./supabase";

const URL = "https://example.supabase.co";

describe("createAnonClient — 공개(anon) 클라이언트", () => {
  test("쿼리 빌더(from)를 제공하는 클라이언트를 만든다", () => {
    const c = createAnonClient(URL, "anon-key");
    expect(typeof c.from).toBe("function");
  });

  test("빈 url이면 즉시 throw (fail fast)", () => {
    expect(() => createAnonClient("", "anon-key")).toThrow();
  });

  test("빈 key이면 즉시 throw", () => {
    expect(() => createAnonClient(URL, "")).toThrow();
  });
});

describe("createServiceClient — service_role(서버·워커 전용)", () => {
  test("쿼리 빌더(from)를 제공하는 클라이언트를 만든다", () => {
    const c = createServiceClient(URL, "service-key");
    expect(typeof c.from).toBe("function");
  });

  test("빈 url 또는 key이면 즉시 throw", () => {
    expect(() => createServiceClient("", "service-key")).toThrow();
    expect(() => createServiceClient(URL, "")).toThrow();
  });
});
