import { test, expect, type Page } from "@playwright/test";

// #1 프로필 사진 + 계정 메뉴 / #2 사이드바 고정 E2E.
const SB = "http://127.0.0.1:54321";
const KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";

// 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

test.afterAll(async () => {
  // admin avatar_url 초기화(테스트 간 격리). 스토리지 객체는 로컬이라 방치.
  await rest(`profiles?avatar_url=not.is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ avatar_url: null }),
  }).catch(() => {});
});

test.describe.serial("프로필 사진 · 계정 메뉴 · 사이드바 고정", () => {
  test("계정설정에서 사진 업로드 → 아바타 이미지 반영", async ({ page }) => {
    await login(page);
    await page.goto("/admin/account");
    await page.setInputFiles('input[type="file"]', { name: "me.png", mimeType: "image/png", buffer: PNG });
    // 업로드 후 프로필 사진 영역에 <img>(avatars 경로) 등장.
    await expect(page.locator('img[src*="/avatars/"]').first()).toBeVisible({ timeout: 20_000 });
  });

  test("우상단 계정 메뉴 팝오버 — 이메일 + 계정 설정 버튼", async ({ page }) => {
    await login(page);
    await page.goto("/admin/dashboard");
    await page.getByRole("button", { name: "계정 메뉴" }).click();
    await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
    await expect(page.getByRole("link", { name: "계정 설정" })).toBeVisible();
  });

  test("사이드바 고정 — 긴 페이지 스크롤 후에도 하단 프로필 박스 보임", async ({ page }) => {
    await login(page);
    await page.goto("/admin/dashboard");
    const profile = page.getByTestId("sidebar-profile");
    await expect(profile).toBeVisible();
    // 페이지를 끝까지 스크롤.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    // 고정이면 스크롤 후에도 프로필 박스가 뷰포트 안에 있다.
    const box = await profile.boundingBox();
    const vh = page.viewportSize()!.height;
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeLessThanOrEqual(vh);
  });
});
