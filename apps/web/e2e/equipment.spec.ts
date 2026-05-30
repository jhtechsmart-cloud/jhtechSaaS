import { test, expect } from "@playwright/test";
import path from "node:path";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

// 로그인 헬퍼 — LoginForm.tsx 확인:
//   <label>이메일 <input name="email" type="email" /></label>
//   <label>비밀번호 <input name="password" type="password" /></label>
//   <button type="submit">로그인</button>
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(ADMIN_EMAIL);
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  // 로그인 성공 시 /admin/equipment 목록으로 리다이렉트
  await page.waitForURL(/\/admin\/equipment/, { timeout: 20_000 });
}

// ──────────────────────────────────────────────────────────────────────────────
// AC1: 미인증 접근 → /login 리다이렉트
// ──────────────────────────────────────────────────────────────────────────────
test("AC1: 미인증 → /admin/equipment 접근 시 /login 리다이렉트", async ({ page }) => {
  await page.goto("/admin/equipment");
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
});

// ──────────────────────────────────────────────────────────────────────────────
// AC3·4·6·7: 로그인 → 생성(사양 2행·옵션 1개·사진 1장) → 목록 노출
// EquipmentForm defaultValues: specs = [{label:"",value:""}] (1 빈 행 기본)
// "+ 항목 추가" 클릭 시 2번째 행 추가 → nth(0), nth(1) 채움
// ──────────────────────────────────────────────────────────────────────────────
test("AC3·4·6·7: 로그인→생성(사양2·옵션1·사진1)→목록 노출", async ({ page }) => {
  await login(page);
  await page.goto("/admin/equipment/new");

  // §1 기본 정보 — Field 컴포넌트: <label><span>장비명</span><input /></label>
  await page.getByLabel("장비명").fill("E2E 포장기");
  await page.getByLabel("기본가(₩)").fill("1500000");

  // §2 사양 — SpecEditor: 생성 시 1행 기본 → "+ 항목 추가" 클릭 후 2행
  // React 19 / Next.js 16 dev: 클라이언트 핸들러 부착 완료를 보장하기 위해
  // 첫 번째 spec input이 인터랙터블(enabled, visible)임을 확인 후 클릭
  const specLabels = page.getByPlaceholder("항목 (예: 전압)");
  const specValues = page.getByPlaceholder("값 (예: 220V)");
  await expect(specLabels.first()).toBeEnabled(); // hydration 완료 대기
  await page.getByRole("button", { name: "+ 항목 추가" }).click();
  await expect(specLabels).toHaveCount(2, { timeout: 10_000 }); // 2행 렌더 완료 대기
  await specLabels.nth(0).fill("전압");
  await specValues.nth(0).fill("220V");
  await specLabels.nth(1).fill("출력");
  await specValues.nth(1).fill("3kW");

  // §3 이미지 — ImageUploader: file input은 hidden(className="hidden"), setInputFiles로 직접 주입
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  // 업로드 완료 → "대표" 뱃지 표시 대기 (최대 15초)
  await expect(page.getByText("대표")).toBeVisible({ timeout: 15_000 });

  // §4 옵션 — OptionEditor: "+ 옵션 추가" → placeholder="옵션명"
  await page.getByRole("button", { name: "+ 옵션 추가" }).click();
  await page.getByPlaceholder("옵션명").fill("받침대");

  // 저장 버튼 — "저장" (업로드 완료 후이므로 "업로드 완료 후 저장" 아님)
  await page.getByRole("button", { name: "저장" }).click();
  // 저장 성공 → /admin/equipment 목록으로 리다이렉트
  await page.waitForURL(/\/admin\/equipment$/, { timeout: 20_000 });
  await expect(page.getByText("E2E 포장기")).toBeVisible();
});

// ──────────────────────────────────────────────────────────────────────────────
// AC5: inactive 토글 → "비활성" 필터에 노출
// EquipmentTable: 행 클릭 → /admin/equipment/${id}/edit
// 상태 select: <option value="inactive">비활성</option>
// 필터 버튼: "비활성" (status === "inactive" → EquipmentTable)
// ──────────────────────────────────────────────────────────────────────────────
test("AC5: inactive 토글 → 비활성 필터에 노출", async ({ page }) => {
  await login(page);
  // 목록에서 E2E 포장기 행 클릭 → edit 페이지
  await page.getByRole("link", { name: "E2E 포장기" }).click();
  await page.waitForURL(/\/edit$/, { timeout: 10_000 });

  // 상태 select → "비활성" 옵션 선택
  await page.getByLabel("상태").selectOption("inactive");
  await page.getByRole("button", { name: "저장" }).click();
  await page.waitForURL(/\/admin\/equipment$/, { timeout: 20_000 });

  // 기본 필터는 "전체"라 아직 보임. "비활성" 버튼 클릭
  await page.getByRole("button", { name: "비활성" }).click();
  await expect(page.getByText("E2E 포장기")).toBeVisible();
});
