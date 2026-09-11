// 이미지 헤더 판독(순수) — 직인 업로드 서버 검증용(#285 #C).
// 클라가 보낸 MIME·확장자는 신뢰하지 않는다: 이름만 바꾼 파일도 스토리지 업로드와 승인 RPC의 "size>0"을 통과해
// 결재 PDF에 깨진 이미지가 박힌다. 디코더 없이 헤더만 읽어 형식·픽셀 크기를 확인한다.
export type ImageMeta = { type: "png" | "jpeg" | "webp"; width: number; height: number };

export function readImageMeta(buf: Buffer): ImageMeta | null {
  return readPng(buf) ?? readJpeg(buf) ?? readWebp(buf);
}

function readPng(b: Buffer): ImageMeta | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || sig.some((v, i) => b[i] !== v)) return null;
  if (b.toString("ascii", 12, 16) !== "IHDR") return null;
  return { type: "png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

// JPEG: SOI 뒤 세그먼트를 훑어 SOF(0xC0~0xCF, DHT/DAA/DRI 제외)에서 크기를 읽는다.
function readJpeg(b: Buffer): ImageMeta | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 <= b.length) {
    // SOF 세그먼트는 i..i+8(9바이트) — 마지막 세그먼트가 버퍼 끝에 딱 맞아도 읽어야 한다.
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = b.readUInt16BE(i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { type: "jpeg", height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

// WEBP: RIFF....WEBP + 청크(VP8X/VP8 /VP8L).
function readWebp(b: Buffer): ImageMeta | null {
  if (b.length < 30 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { type: "webp", width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  }
  if (chunk === "VP8 " && b.length >= 30) {
    return { type: "webp", width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L" && b.length >= 25) {
    const bits = b.readUInt32LE(21);
    return { type: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}
