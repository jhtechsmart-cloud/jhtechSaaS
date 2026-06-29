import { test, expect } from "@playwright/test";
import path from "node:path";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@jhtech.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "jhtech-admin-dev";
const FIXTURE = path.join(__dirname, "fixtures", "sample.png");

// 로컬 Supabase 서비스롤 — 이전 실행 잔여 E2E 데이터 정리용.
// 이 값은 표준 로컬 Supabase 데모 키(비밀 아님, 공개 표준 값).
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const E2E_EQUIPMENT_NAME = "E2E 포장기";

// beforeAll: 이전 실행에서 남은 E2E 장비 레코드를 삭제해 strict mode 충돌 방지
test.beforeAll(async () => {
  try {
    const res = await fetch(
      `${LOCAL_SUPABASE_URL}/rest/v1/equipment?name=eq.${encodeURIComponent(E2E_EQUIPMENT_NAME)}`,
      {
        method: "DELETE",
        headers: {
          apikey: LOCAL_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${LOCAL_SERVICE_ROLE_KEY}`,
          Prefer: "return=minimal",
        },
      },
    );
    if (!res.ok) {
      console.warn("E2E cleanup warning:", res.status, await res.text());
    }
  } catch (e) {
    // 로컬 Supabase가 꺼져있거나 AC1 전용 실행 시 무시
    console.warn("E2E cleanup skipped (local Supabase unavailable):", e);
  }
});

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
  await page.waitForURL(/\/admin\//, { timeout: 20_000 });
}

// ──────────────────────────────────────────────────────────────────────────────
// AC1: 미인증 접근 → /login 리다이렉트
// ──────────────────────────────────────────────────────────────────────────────
test("AC1: 미인증 → /admin/equipment 접근 시 /login 리다이렉트", async ({ page }) => {
  await page.goto("/admin/equipment");
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
});

// ──────────────────────────────────────────────────────────────────────────────
// AC3·4·6·7 → AC5 순서 의존: describe.serial로 실행 순서를 명시 보장
// (--grep 또는 파일 재정렬 시에도 AC5가 AC3 이후에 실행됨)
// ──────────────────────────────────────────────────────────────────────────────
test.describe.serial("E2E 장비 생성·토글 플로우", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // AC3·4·6·7: 로그인 → 생성(사양 2행·옵션 1개·사진 1장) → 목록 노출
  // SpecEditor(P-A1 그룹형): 생성 시 기본 = 그룹 1개 + 항목 1행
  //   [{group:"", icon:"settings", items:[{label:"",value:""}]}]
  // 항목 행 placeholder = "항목 (예: 속도)" / "값 (예: 1200매/h)"
  // "+ 항목" 클릭 시 2번째 항목 행 추가 → nth(0), nth(1) 채움
  // ──────────────────────────────────────────────────────────────────────────
  test("AC3·4·6·7: 로그인→생성(사양2·옵션1·사진1)→목록 노출", async ({ page }) => {
    await login(page);
    await page.goto("/admin/equipment/new");

    // §1 기본 정보 — Field 컴포넌트: <label><span>장비명</span><input /></label>
    await page.getByLabel("장비명").fill(E2E_EQUIPMENT_NAME);
    await page.getByLabel("기본가(₩)").fill("1500000");

    // §2 사양 — SpecEditor(그룹형): 기본 그룹 1개·항목 1행 → "+ 항목"으로 2행
    // React 19 / Next.js 16 dev: 클라이언트 핸들러 부착 완료를 보장하기 위해
    // 첫 번째 항목 input이 인터랙터블(enabled)임을 확인 후 클릭.
    // allowedDevOrigins: ["127.0.0.1"] 필수 — HMR WebSocket 차단 시 React 이벤트 미동작
    const specLabels = page.getByPlaceholder("항목 (예: 속도)");
    const specValues = page.getByPlaceholder("값 (예: 1200매/h)");
    await expect(specLabels.first()).toBeEnabled(); // hydration 완료 대기
    await page.getByRole("button", { name: "+ 항목" }).click();
    await expect(specLabels).toHaveCount(2, { timeout: 10_000 }); // 2행 렌더 완료 대기
    await specLabels.nth(0).fill("전압");
    await specValues.nth(0).fill("220V");
    await specLabels.nth(1).fill("출력");
    await specValues.nth(1).fill("3kW");

    // §3 이미지 — ImageUploader: file input은 hidden + multiple(복수 첨부). 견적서 자산·카탈로그도
    // 이제 공통 드롭존 카드(FileDropCard)라 input.hidden이 여럿 → multiple 속성으로 카탈로그 이미지만 특정.
    await page.locator('input[type="file"][multiple]').setInputFiles(FIXTURE);
    // 업로드 완료 → "대표" 뱃지 표시 대기 (최대 15초)
    await expect(page.getByText("대표")).toBeVisible({ timeout: 15_000 });

    // 견적서 로고/이미지·제품 카탈로그가 공통 드롭존 카드(접근명 "… 첨부")로 렌더되는지 회귀
    await expect(
      page.getByRole("button", { name: "장비 네임 로고 (견적서 좌하단) 첨부" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "장비 이미지 (견적서 우하단) 첨부" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "제품 카탈로그 (PDF) 첨부" })).toBeVisible();

    // §4 옵션 — OptionEditor: "+ 옵션 추가" → placeholder="옵션명"
    await page.getByRole("button", { name: "+ 옵션 추가" }).click();
    await page.getByPlaceholder("옵션명").fill("받침대");

    // 저장 버튼 — "저장" (업로드 완료 후이므로 "업로드 완료 후 저장" 아님)
    await page.getByRole("button", { name: "저장" }).click();
    // 저장 성공 → /admin/equipment 목록으로 리다이렉트
    await page.waitForURL(/\/admin\/equipment$/, { timeout: 20_000 });
    // 최소 1건 이상 목록에 노출되면 통과(복수 레코드에도 안전)
    await expect(
      page.getByRole("link", { name: E2E_EQUIPMENT_NAME }).first(),
    ).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AC5: inactive 토글 → "비활성" 필터에 노출
  // EquipmentTable: 행 클릭 → /admin/equipment/${id}/edit
  // 상태 select: <option value="inactive">비활성</option>
  // 필터 버튼: "비활성" (status === "inactive" → EquipmentTable)
  // ──────────────────────────────────────────────────────────────────────────
  test("AC5: inactive 토글 → 비활성 필터에 노출", async ({ page }) => {
    await login(page);
    await page.goto("/admin/equipment"); // E5a: 랜딩이 /admin/applications라 목록으로 명시 이동
    // 목록에서 E2E 포장기 행 클릭 → edit 페이지
    // .first()로 strict mode 위반 방지(beforeAll cleanup 후 정확히 1건이지만 안전망)
    await page.getByRole("link", { name: E2E_EQUIPMENT_NAME }).first().click();
    await page.waitForURL(/\/edit$/, { timeout: 10_000 });

    // 상태 select → "비활성" 옵션 선택
    await page.getByLabel("상태").selectOption("inactive");
    await page.getByRole("button", { name: "저장" }).click();
    await page.waitForURL(/\/admin\/equipment$/, { timeout: 20_000 });

    // 기본 필터는 "전체"라 아직 보임. "비활성" 버튼 클릭
    await page.getByRole("button", { name: "비활성" }).click();
    await expect(
      page.getByRole("link", { name: E2E_EQUIPMENT_NAME }).first(),
    ).toBeVisible();
  });
});
