import { PDFDocument, StandardFonts } from "pdf-lib";

// ⚠️ placeholder 레이아웃 — 의뢰사 견적서 양식 오면 교체. 지금은 견적번호·금액만 든 최소 PDF로
// 파이프라인(발행→잡→워커→스토리지→pdf_url)을 증명한다. Helvetica(ASCII) — 한글 텍스트 미포함.
export type QuoteForPdf = {
  quote_no: string;
  supply_price: string | number;
  tax_price: string | number;
  total: string | number;
};

const won = (v: string | number) => Number(v).toLocaleString("en-US");

export async function buildQuotePdf(q: QuoteForPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 800;
  const line = (text: string, size = 12) => {
    page.drawText(text, { x: 50, y, size, font });
    y -= size + 10;
  };
  line(`Quote ${q.quote_no}`, 18);
  y -= 6;
  line(`Supply  ${won(q.supply_price)} KRW`);
  line(`Tax     ${won(q.tax_price)} KRW`);
  line(`Total   ${won(q.total)} KRW`);
  y -= 12;
  line("(placeholder layout - pending client quote form)", 9);
  return doc.save();
}
