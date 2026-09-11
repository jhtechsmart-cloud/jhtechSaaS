import { deflateSync } from "node:zlib";

// e2e용 최소 PNG 인코더 — 직인 업로드는 서버가 헤더를 읽어 형식·픽셀 크기를 검증하므로(#285 #C)
// 1×1 더미로는 통과하지 못한다. 단색 정사각 PNG를 즉석에서 만든다.
function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** size×size 단색(회색) PNG. 기본 320px = 직인 최소 크기(100px) 통과. */
export function makePng(size = 320): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  const raw = Buffer.concat(
    Array.from({ length: size }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(size, 0x40)])),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
