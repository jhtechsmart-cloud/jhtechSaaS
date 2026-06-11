import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

// 상주 워커 — 크롬을 1회 기동해 잡마다 재사용(콜드스타트 1회). 페이지는 잡마다 생성·close.
// 크롬 바이너리:
//  - Linux(Railway 컨테이너) = @sparticuz/chromium(시스템 라이브러리 포함 슬림 크롬).
//    빌드 때 크롬 다운로드를 안 하므로 Nixpacks 추출 실패를 피한다.
//  - macOS(로컬 개발/테스트) = 설치된 Google Chrome(channel: "chrome").

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

type LaunchFn = () => Promise<Browser>;

// 크롬 싱글턴 관리자 — 기동 실패가 박제되거나(거부된 Promise 재사용)
// 크롬이 도중에 죽은 채(disconnected) 재사용되면 워커가 좀비가 되므로,
// 둘 다 다음 호출에서 재기동한다. 테스트는 launchFn 주입으로 격리.
// ⚠️ get()은 순차 호출 전제(runner가 잡을 직렬 처리). 동시 호출이 생기는
// 잡 타입을 추가하면 재기동 분기에서 크롬 이중 기동·고아가 가능 — 그때 뮤텍스 필요.
export function createBrowserManager(launchFn: LaunchFn): {
  get: () => Promise<Browser>;
  close: () => Promise<void>;
} {
  let browserPromise: Promise<Browser> | null = null;

  async function get(): Promise<Browser> {
    if (browserPromise) {
      try {
        const b = await browserPromise;
        if (b.connected) return b;
        // 크롬 프로세스 사망(OOM 등) — 잔존 프로세스·임시 프로필 best-effort 정리 후 재기동
        await b.close().catch(() => {});
      } catch {
        // 직전 기동 실패 — 아래에서 재기동
      }
      browserPromise = null;
    }
    browserPromise = launchFn();
    try {
      return await browserPromise;
    } catch (e) {
      browserPromise = null;
      throw e;
    }
  }

  async function close(): Promise<void> {
    if (!browserPromise) return;
    const pending = browserPromise;
    browserPromise = null;
    try {
      const b = await pending;
      await b.close();
    } catch {
      // 이미 죽었거나 기동 실패 — 정리할 것 없음
    }
  }

  return { get, close };
}

const manager = createBrowserManager(launch);

export function getBrowser(): Promise<Browser> {
  return manager.get();
}

export function closeBrowser(): Promise<void> {
  return manager.close();
}
