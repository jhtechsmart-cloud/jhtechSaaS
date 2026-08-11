import { writeFile } from "node:fs/promises";
import { getBrowser, closeBrowser } from "./browser";
import { getFontDataUri, getModelFontDataUri } from "./assets";
import { renderWpCardHtml, WP_CARD_SIZE } from "./wp-card-image";

// 로컬 시각 검증 전용 — 홈페이지 카드 대표 이미지 합성 샘플(XTRA 3300S 실데이터).
// 실행: pnpm --filter worker exec tsx src/jobs/_render-card-check.ts <출력경로.png> [사진URL] [로고URL]

async function fetchDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch 실패 ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") ?? "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function main(): Promise<void> {
  const out = process.argv[2] ?? "/tmp/wp-card-sample.png";
  const photoUrl =
    process.argv[3] ??
    "https://jhtech.co.kr/wp-content/uploads/2026/08/14824849-f671-4f7d-83b5-7a5e57749a26.png";
  const logoUrl = process.argv[4] ?? null;

  const html = renderWpCardHtml({
    title: "XTRA 3300S",
    subtitle: "대형 롤투롤 UV 프린터",
    sideText: "ROLL TO ROLL UV PRINTER",
    photoDataUri: await fetchDataUri(photoUrl),
    logoDataUri: logoUrl ? await fetchDataUri(logoUrl) : null,
    fontDataUri: await getFontDataUri(),
    latinFontDataUri: await getModelFontDataUri(),
  });

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: WP_CARD_SIZE, height: WP_CARD_SIZE });
    await page.setContent(html, { waitUntil: "load" });
    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: WP_CARD_SIZE, height: WP_CARD_SIZE },
    });
    await writeFile(out, png);
    console.log(`saved: ${out}`);
  } finally {
    await page.close();
    await closeBrowser();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
