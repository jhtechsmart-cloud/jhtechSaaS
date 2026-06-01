import { describe, expect, test } from "vitest";
import { parseSpecs, serializeSpecs, SPEC_ICONS } from "./specs";

describe("parseSpecs (그룹형 + 하위호환)", () => {
  test("그룹형 입력은 그대로 정규화한다", () => {
    const raw = [{ group: "성능", icon: "gauge", items: [{ label: "속도", value: "10" }] }];
    expect(parseSpecs(raw)).toEqual([
      { group: "성능", icon: "gauge", items: [{ label: "속도", value: "10" }] },
    ]);
  });

  test("평면 [{label,value}] 레거시는 단일 기본그룹으로 래핑한다", () => {
    const raw = [{ label: "전압", value: "220V" }];
    expect(parseSpecs(raw)).toEqual([
      { group: "", icon: "settings", items: [{ label: "전압", value: "220V" }] },
    ]);
  });

  test("아이콘이 enum 밖이면 settings로 강등한다", () => {
    const raw = [{ group: "x", icon: "evil<script>", items: [{ label: "a", value: "b" }] }];
    expect(parseSpecs(raw)[0].icon).toBe("settings");
  });

  test("비배열/빈/비정형은 []", () => {
    expect(parseSpecs({})).toEqual([]);
    expect(parseSpecs(null)).toEqual([]);
    expect(parseSpecs([{ nope: 1 }])).toEqual([]);
  });
});

describe("serializeSpecs", () => {
  test("빈 그룹·빈 아이템 제거 + 트림, 순서 보존", () => {
    const input = [
      { group: " 성능 ", icon: "gauge" as const, items: [{ label: " 속도 ", value: " 10 " }, { label: "", value: "" }] },
      { group: "빈그룹", icon: "box" as const, items: [{ label: "", value: "" }] },
    ];
    expect(serializeSpecs(input)).toEqual([
      { group: "성능", icon: "gauge", items: [{ label: "속도", value: "10" }] },
    ]);
  });
});

test("SPEC_ICONS는 9종 고정 enum", () => {
  expect(SPEC_ICONS).toEqual([
    "gauge", "ruler", "droplet", "power", "wind", "thermometer", "weight", "box", "settings",
  ]);
});
