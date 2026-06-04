import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface UserListRow {
  id: string;
  name: string;
  email: string | null;
  permissions: string[];
  is_active: boolean;
  created_at: string;
}

// 사용자 목록 — profiles + auth.admin.listUsers() email을 id로 매칭.
// email은 auth.users에만 있어 admin(service_role) API로 조회한다. 두 조회 병렬.
export async function listUsers(): Promise<UserListRow[]> {
  const admin = createSupabaseAdminClient();
  const [profilesRes, authRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id,name,permissions,is_active,created_at")
      .order("created_at", { ascending: true }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (profilesRes.error) throw new Error(`사용자 목록 조회 실패: ${profilesRes.error.message}`);
  if (authRes.error) throw new Error(`계정 이메일 조회 실패: ${authRes.error.message}`);
  const emailById = new Map(
    (authRes.data?.users ?? []).map((u) => [u.id, u.email ?? null]),
  );
  return (profilesRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    email: emailById.get(p.id) ?? null,
    permissions: p.permissions ?? [],
    is_active: p.is_active,
    created_at: p.created_at,
  }));
}

// 단건 — 권한 편집 페이지용.
export async function getUser(id: string): Promise<UserListRow | null> {
  const admin = createSupabaseAdminClient();
  const { data: p, error } = await admin
    .from("profiles")
    .select("id,name,permissions,is_active,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`사용자 조회 실패: ${error.message}`);
  if (!p) return null;
  const { data: authUser } = await admin.auth.admin.getUserById(id);
  return {
    id: p.id,
    name: p.name,
    email: authUser?.user?.email ?? null,
    permissions: p.permissions ?? [],
    is_active: p.is_active,
    created_at: p.created_at,
  };
}
