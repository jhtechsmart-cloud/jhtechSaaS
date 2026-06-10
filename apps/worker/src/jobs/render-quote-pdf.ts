import { getBrowser } from "./browser";
import { renderQuoteHtml, type QuoteHtmlData } from "./quote-html";

// 견적 HTML(renderQuoteHtml) → 크롬 print-to-PDF. 상주 크롬 재사용, 페이지는 잡마다 생성·close.
export async function buildQuotePdf(data: QuoteHtmlData): Promise<Uint8Array> {
  const html = renderQuoteHtml(data);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // setContent는 인메모리 HTML(폰트·이미지 모두 data URI 인라인)이라 네트워크 요청이 없음.
    // puppeteer 25.x 타입상 setContent의 waitUntil은 networkidle0를 제외 → "load"로 모든 인라인 리소스 로드까지 대기.
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return pdf;
  } finally {
    await page.close();
  }
}
