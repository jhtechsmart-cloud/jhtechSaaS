import { describe, it, expect } from "vitest";
import { serializeOptions } from "./options";

describe("serializeOptions", () => {
  it("name 빈/공백 행 제거", () => {
    expect(
      serializeOptions([
        { kind: "included", name: "받침대", price: 0 },
        { kind: "extra", name: "  ", price: 100 },
      ]),
    ).toEqual([{ kind: "included", name: "받침대", price: 0 }]);
  });
  it("name 트림", () => {
    expect(serializeOptions([{ kind: "extra", name: " 호퍼 ", price: 5 }])).toEqual([
      { kind: "extra", name: "호퍼", price: 5 },
    ]);
  });
  it("kind·price 보존", () => {
    expect(serializeOptions([{ kind: "extra", name: "x", price: 9 }])).toEqual([
      { kind: "extra", name: "x", price: 9 },
    ]);
  });
});
