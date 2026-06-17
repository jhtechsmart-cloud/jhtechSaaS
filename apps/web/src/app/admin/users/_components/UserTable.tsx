"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPhone } from "@jhtechsaas/shared";
import type { UserListRow } from "@/lib/users/queries";

function permissionSummary(row: UserListRow): string {
  if (row.permissions.includes("users.manage")) return "관리자";
  if (row.permissions.length === 0) return "권한 없음";
  return `${row.permissions.length}개 권한`;
}

export function UserTable({ users }: { users: UserListRow[] }) {
  const router = useRouter();

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface p-10">
        <p className="text-body font-medium text-text">등록된 사용자가 없습니다</p>
        <Link
          href="/admin/users/new"
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
        >
          + 새 계정
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body">
        <thead>
          <tr className="border-b border-border text-left text-small text-muted">
            <th className="py-2 pr-4 font-medium">이름</th>
            <th className="py-2 pr-4 font-medium">직책</th>
            <th className="py-2 pr-4 font-medium">이메일</th>
            <th className="py-2 pr-4 font-medium">연락처</th>
            <th className="py-2 pr-4 font-medium">권한</th>
            <th className="py-2 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr
              key={u.id}
              className="cursor-pointer border-b border-border hover:bg-surface-2"
              onClick={() => router.push(`/admin/users/${u.id}`)}
            >
              <td className="py-2 pr-4">
                <Link
                  href={`/admin/users/${u.id}`}
                  className="font-medium text-text hover:text-accent"
                >
                  {u.name}
                </Link>
              </td>
              <td className="py-2 pr-4 text-text">{u.position ?? <span className="text-muted">-</span>}</td>
              <td className="py-2 pr-4">
                {u.email ? (
                  <span className="font-mono text-small text-text">{u.email}</span>
                ) : (
                  <span className="text-muted">-</span>
                )}
              </td>
              <td className="py-2 pr-4 text-text">
                {u.phone ? formatPhone(u.phone) || u.phone : <span className="text-muted">-</span>}
              </td>
              <td className="py-2 pr-4 text-text">{permissionSummary(u)}</td>
              <td className="py-2">
                {u.is_active ? (
                  <span className="rounded-sm bg-active/10 px-2 py-0.5 text-small font-medium text-active">
                    활성
                  </span>
                ) : (
                  <span className="rounded-sm bg-surface-2 px-2 py-0.5 text-small font-medium text-muted">
                    비활성
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
