import type { OptionDraft } from "./schema";

// 옵션 직렬화 — name 트림 + 빈 name 행 제거(specs와 동일 정책). 순서 보존.
export function serializeOptions(options: OptionDraft[]): OptionDraft[] {
  return options
    .map((o) => ({ kind: o.kind, name: o.name.trim(), price: o.price }))
    .filter((o) => o.name !== "");
}
