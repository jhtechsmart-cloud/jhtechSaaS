// 장비를 분류명별로 그룹화(순수). 미분류는 맨 뒤, 분류명은 ko 정렬. 그룹 내 순서는 입력 순서 보존.
// 관리자 목록·공개 카탈로그가 공용(둘 다 category: string | null 보유).

export interface CategoryGroup<T> {
  category: string; // 표시용 분류명(없으면 "미분류")
  items: T[];
}

export function groupByCategory<T extends { category: string | null }>(
  items: T[],
): CategoryGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const key = it.category?.trim() ? it.category.trim() : "미분류";
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return [...map.entries()]
    .map(([category, groupItems]) => ({ category, items: groupItems }))
    .sort((a, b) => {
      if (a.category === "미분류") return 1; // 미분류는 항상 뒤
      if (b.category === "미분류") return -1;
      return a.category.localeCompare(b.category, "ko");
    });
}
