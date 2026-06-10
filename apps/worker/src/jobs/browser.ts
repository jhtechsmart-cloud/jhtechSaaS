import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

// 상주 워커 — 크롬을 1회 기동해 잡마다 재사용(콜드스타트 1회). 페이지는 잡마다 생성·close.
// 크롬 바이너리:
//  - Linux(Railway 컨테이너) = @sparticuz/chromium(시스템 라이브러리 포함 슬림 크롬).
//    빌드 때 크롬 다운로드를 안 하므로 Nixpacks 추출 실패를 피한다.
//  - macOS(로컬 개발/테스트) = 설치된 Google Chrome(channel: "chrome").
let browserPromise: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  if (process.platform === "linux") {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // 로컬(macOS 등) — 설치된 Google Chrome 사용.
  return puppeteer.launch({
    channel: "chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) browserPromise = launch();
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}
