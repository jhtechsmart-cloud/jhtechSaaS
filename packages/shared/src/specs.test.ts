import { describe, expect, test } from "vitest";
import {
  parseSpecs,
  serializeSpecs,
  selectPdfSpecItems,
  defaultSpecSelection,
  SPEC_ICONS,
} from "./specs";

describe("parseSpecs (그룹형 + 하위호환)", () => {
  test("그룹형 입력은 그대로 정규화한다(id 없으면 빈 문자열)", () => {
    const raw = [{ group: "성능", icon: "gauge", items: [{ label: "속도", value: "10" }] }];
    expect(parseSpecs(raw)).toEqual([
      { group: "성능", icon: "gauge", items: [{ id: "", label: "속도", value: "10" }] },
    ]);
  });

  test("그룹형 항목의 id·pdf를 그대로 읽는다", () => {
    const raw = [{ group: "성능", icon: "gauge", items: [{ id: "a1", label: "속도", value: "30", pdf: true }] }];
    expect(parseSpecs(raw)).toEqual([
      { group: "성능", icon: "gauge", items: [{ id: "a1", label: "속도", value: "30", pdf: true }] },
    ]);
  });

  test("평면 [{label,value}] 레거시는 단일 기본그룹으로 래핑한다(id 빈 문자열)", () => {
    const raw = [{ label: "전압", value: "220V" }];
    expect(parseSpecs(raw)).toEqual([
      { group: "", icon: "settings", items: [{ id: "", label: "전압", value: "220V" }] },
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
      { group: " 성능 ", icon: "gauge" as const, items: [{ id: "keep", label: " 속도 ", value: " 10 " }, { id: "", label: "", value: "" }] },
      { group: "빈그룹", icon: "box" as const, items: [{ id: "", label: "", value: "" }] },
    ];
    expect(serializeSpecs(input)).toEqual([
      { group: "성능", icon: "gauge", items: [{ id: "keep", label: "속도", value: "10" }] },
    ]);
  });

  test("id 없는 항목에 새 id를 부여한다(pdf 보존)", () => {
    const out = serializeSpecs([{ group: "성능", icon: "gauge", items: [{ id: "", label: "속도", value: "30", pdf: true }] }]);
    expect(out[0]!.items[0]!.id).toMatch(/.+/);
    expect(out[0]!.items[0]!.pdf).toBe(true);
  });

  test("기존 id는 유지한다(연결 보존)", () => {
    const out = serializeSpecs([{ group: "성능", icon: "gauge", items: [{ id: "keep-1", label: "속도", value: "30" }] }]);
    expect(out[0]!.items[0]!.id).toBe("keep-1");
  });

  test("pdf=false는 보존, pdf 미지정은 미포함", () => {
    const out = serializeSpecs([{ group: "G", icon: "settings" as const, items: [
      { id: "x", label: "a", value: "1", pdf: false },
      { id: "y", label: "b", value: "2" },
    ] }]);
    expect(out[0]!.items[0]!.pdf).toBe(false);
    expect(out[0]!.items[1]!.pdf).toBeUndefined();
  });
});

const G = [
  { group: "성능", icon: "gauge" as const, items: [
    { id: "a", label: "속도", value: "30", pdf: true },
    { id: "b", label: "해상도", value: "1200" },
  ] },
  { group: "크기", icon: "ruler" as const, items: [
    { id: "c", label: "무게", value: "85", pdf: true },
  ] },
];

describe("selectPdfSpecItems — 3단 폴백", () => {
  test("배열이면 그 id만 남긴다(빈 그룹 제거)", () => {
    const out = selectPdfSpecItems(G, ["a"]);
    expect(out).toEqual([{ group: "성능", icon: "gauge", items: [{ id: "a", label: "속도", value: "30", pdf: true }] }]);
  });

  test("빈 배열이면 아무 항목도 남기지 않는다", () => {
    expect(selectPdfSpecItems(G, [])).toEqual([]);
  });

  test("null이면 pdf:true 항목만(구 견적 폴백)", () => {
    const out = selectPdfSpecItems(G, null);
    expect(out.flatMap((g) => g.items.map((i) => i.id))).toEqual(["a", "c"]);
  });

  test("null이고 pdf:true가 하나도 없으면 전체(현 동작)", () => {
    const none = [{ group: "G", icon: "settings" as const, items: [{ id: "x", label: "a", value: "1" }, { id: "y", label: "b", value: "2" }] }];
    expect(selectPdfSpecItems(none, null).flatMap((g) => g.items.map((i) => i.id))).toEqual(["x", "y"]);
  });
});

describe("defaultSpecSelection — 폼 기본 선택", () => {
  test("pdf:true 항목 id들을 반환", () => {
    expect(defaultSpecSelection(G)).toEqual(["a", "c"]);
  });

  test("flagged 항목 없으면 전체 id(미설정 장비도 현 동작 유지)", () => {
    const none = [{ group: "G", icon: "settings" as const, items: [{ id: "x", label: "a", value: "1" }, { id: "y", label: "b", value: "2" }] }];
    expect(defaultSpecSelection(none)).toEqual(["x", "y"]);
  });
});

test("SPEC_ICONS는 9종 고정 enum", () => {
  expect(SPEC_ICONS).toEqual([
    "gauge", "ruler", "droplet", "power", "wind", "thermometer", "weight", "box", "settings",
  ]);
});
