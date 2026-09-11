import { describe, expect, it } from "vitest";
import { readImageMeta } from "./image-meta";

// #285 #C — 직인 파일 서버 검증(매직 바이트 + 크기). 클라가 보낸 MIME만 믿으면 이름만 바꾼 파일이
// 승인 RPC의 "size>0" 검사를 통과해 결재 PDF에 깨진 이미지가 박힌다.
function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

describe("readImageMeta", () => {
  it("PNG: 시그니처와 IHDR 크기를 읽는다", () => {
    expect(readImageMeta(png(400, 300))).toEqual({ type: "png", width: 400, height: 300 });
  });

  it("JPEG: SOF0 세그먼트에서 크기를 읽는다", () => {
    const b = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      Buffer.from("JFIF\0"),
      Buffer.alloc(9),
      Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0x90]), // h=300, w=400
    ]);
    expect(readImageMeta(b)).toEqual({ type: "jpeg", width: 400, height: 300 });
  });

  it("WEBP(VP8X): 시그니처와 크기를 읽는다", () => {
    const b = Buffer.alloc(30);
    b.write("RIFF", 0, "ascii");
    b.write("WEBP", 8, "ascii");
    b.write("VP8X", 12, "ascii");
    b.writeUIntLE(399, 24, 3); // width-1
    b.writeUIntLE(299, 27, 3); // height-1
    expect(readImageMeta(b)).toEqual({ type: "webp", width: 400, height: 300 });
  });

  it("이미지가 아니면 null — 이름만 .png로 바꾼 텍스트 파일 차단", () => {
    expect(readImageMeta(Buffer.from("not an image at all, just text"))).toBeNull();
    expect(readImageMeta(Buffer.alloc(0))).toBeNull();
    expect(readImageMeta(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // 시그니처만 있고 IHDR 없음
  });
});
