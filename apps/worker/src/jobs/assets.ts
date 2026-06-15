import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// 워커 번들 자산(폰트·도장·배경·회사로고)을 base64 data-URI로 1회 로드해 캐시.
let fontUri: string | null = null;
let stampUri: string | null = null;
let bgUri: string | null = null;
let logoUri: string | null = null;

async function toDataUri(relPath: string, mime: string): Promise<string> {
  const abs = fileURLToPath(new URL(`../../assets/${relPath}`, import.meta.url));
  const buf = await readFile(abs);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export async function getFontDataUri(): Promise<string> {
  if (!fontUri) fontUri = await toDataUri("NotoSansKR-Regular.otf", "font/otf");
  return fontUri;
}
export async function getStampDataUri(): Promise<string> {
  if (!stampUri) stampUri = await toDataUri("stamp.png", "image/png");
  return stampUri;
}
export async function getQuoteBgDataUri(): Promise<string> {
  if (!bgUri) bgUri = await toDataUri("quote-bg.jpg", "image/jpeg");
  return bgUri;
}
export async function getCompanyLogoDataUri(): Promise<string> {
  if (!logoUri) logoUri = await toDataUri("company-logo.png", "image/png");
  return logoUri;
}
