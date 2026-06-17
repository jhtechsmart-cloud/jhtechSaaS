import { getBrowser } from "./browser";
import { renderReleaseHtml, type ReleaseHtmlData } from "./release-html";

// 출고의뢰서 HTML → 크롬 print-to-PDF. 견적 PDF와 동일 인프라(상주 크롬·인메모리 인라인 자산).
export async function buildReleasePdf(data: ReleaseHtmlData): Promise<Uint8Array> {
  const html = renderReleaseHtml(data);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
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
