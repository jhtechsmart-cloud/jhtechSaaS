import { getBrowser } from "./browser";
import { renderServiceReportHtml, type ServiceReportHtmlData } from "./service-report-html";

// 서비스 리포트 HTML → 크롬 print-to-PDF. 견적·출고의뢰서와 동일 인프라(상주 크롬·인라인 자산).
export async function buildServiceReportPdf(data: ServiceReportHtmlData): Promise<Uint8Array> {
  const html = renderServiceReportHtml(data);
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
