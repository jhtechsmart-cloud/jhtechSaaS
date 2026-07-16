import {
  ADMIN_PRESET,
  PERMISSION_REGISTRY,
  SALES_PRESET,
  type PermissionDef,
  type PermissionGroup,
  type PermissionKey,
} from "@jhtechsaas/shared";

export type PermissionMode = "sales" | "admin" | "custom";

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((k) => s.has(k));
}

// 현재 권한 집합이 어느 프리셋과 일치하는지 판별 — 피커의 라디오 하이라이트는
// 로컬 state가 아니라 항상 이 파생값을 쓴다(프리셋은 편집 가능한 시드).
export function detectPermissionMode(value: readonly string[]): PermissionMode {
  if (sameSet(value, SALES_PRESET)) return "sales";
  if (sameSet(value, ADMIN_PRESET)) return "admin";
  return "custom";
}

// 배정 가능한 키 = registry 중 deprecated 아닌 것. (deprecated는 은퇴 예정 → UI·배정 미노출.)
const ASSIGNABLE_KEYS: ReadonlySet<string> = new Set(
  PERMISSION_REGISTRY.filter((p) => !p.deprecated).map((p) => p.key),
);

// 입력 키 배열에서 배정 가능한 유효 키만 남기고 중복 제거(순서 보존).
// 관리 UI/서버 액션이 임의 문자열·deprecated 키를 profiles.permissions에 못 넣게 막는다.
export function sanitizePermissions(input: readonly string[]): PermissionKey[] {
  const seen = new Set<string>();
  const out: PermissionKey[] = [];
  for (const k of input) {
    if (ASSIGNABLE_KEYS.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k as PermissionKey); // ASSIGNABLE_KEYS가 registry 키임을 보장(안전한 좁히기)
    }
  }
  return out;
}

export interface PermissionGroupView {
  group: PermissionGroup;
  items: PermissionDef[];
}

// 권한 그리드용 — deprecated 제외 후 group별로 묶는다(registry 순서 보존).
export function buildPermissionGroups(): PermissionGroupView[] {
  const order: PermissionGroup[] = [];
  const byGroup = new Map<PermissionGroup, PermissionDef[]>();
  for (const def of PERMISSION_REGISTRY) {
    if (def.deprecated) continue;
    let bucket = byGroup.get(def.group);
    if (!bucket) {
      bucket = [];
      byGroup.set(def.group, bucket);
      order.push(def.group);
    }
    bucket.push(def);
  }
  return order.map((group) => ({ group, items: byGroup.get(group) ?? [] }));
}
