import { Client } from "pg";

// RLS 통합 테스트 하니스 — 로컬 Supabase Postgres(54322)에 직접 접속해
// PostgREST와 동일하게 `set local role` + `request.jwt.claims`로 역할/JWT를 시뮬레이트한다.
// 모든 테스트는 트랜잭션 안에서 돌고 끝에 무조건 ROLLBACK → 서로 격리.

export const DB_URL =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export async function makeClient(): Promise<Client> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

/** 슈퍼유저(postgres)로 복귀 — fixture 삽입 등 RLS 우회용. */
export async function asPostgres(c: Client): Promise<void> {
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claims', '', true)");
}

/** 비로그인(anon) 컨텍스트. */
export async function asAnon(c: Client): Promise<void> {
  await c.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: "anon" }),
  ]);
  await c.query("set local role anon");
}

/** 로그인 사용자(authenticated) — auth.uid() = uid. */
export async function asUser(c: Client, uid: string): Promise<void> {
  await c.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: "authenticated", sub: uid }),
  ]);
  await c.query("set local role authenticated");
}

/** service_role(RLS 우회) — 워커/서버. */
export async function asService(c: Client): Promise<void> {
  await c.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: "service_role" }),
  ]);
  await c.query("set local role service_role");
}

/** 트랜잭션으로 감싸고 끝에 ROLLBACK. fixture+단언을 한 txn에서 격리 실행. */
export async function inRollbackTx<T>(
  c: Client,
  fn: () => Promise<T>,
): Promise<T> {
  await c.query("begin");
  try {
    return await fn();
  } finally {
    await c.query("rollback");
  }
}

/** auth.users 한 행 생성(트리거가 profiles 자동 생성). uid 반환. */
export async function seedAuthUser(
  c: Client,
  uid: string,
  email: string,
): Promise<void> {
  await c.query("insert into auth.users (id, email) values ($1, $2)", [
    uid,
    email,
  ]);
}

/** 테스트용 고정 UUID (가독성). */
export const UID = {
  admin: "00000000-0000-0000-0000-0000000000a1",
  sales1: "00000000-0000-0000-0000-0000000000b1",
  sales2: "00000000-0000-0000-0000-0000000000b2",
} as const;
