// 소속 부서 — DB(profiles.department)에는 키를 저장하고 라벨은 여기서 단일 관리.
// DB CHECK(profiles_department_check)와 키 목록을 반드시 동일하게 유지할 것.
export const DEPARTMENTS = [
  { key: "sales", label: "영업부" },
  { key: "tech", label: "기술부" },
  { key: "management", label: "관리부" },
] as const;

export type DepartmentKey = (typeof DEPARTMENTS)[number]["key"];

export const DEPARTMENT_KEYS = DEPARTMENTS.map((d) => d.key) as DepartmentKey[];

// 키 → 화면 라벨. null(미지정)은 빈 문자열(공란 표시).
export function departmentLabel(key: string | null | undefined): string {
  return DEPARTMENTS.find((d) => d.key === key)?.label ?? "";
}

// 폼 select 값 → DB 값. 빈 문자열/모르는 값은 null(부서 미지정).
export function parseDepartment(value: string | null | undefined): DepartmentKey | null {
  return (DEPARTMENT_KEYS as string[]).includes(value ?? "") ? (value as DepartmentKey) : null;
}
