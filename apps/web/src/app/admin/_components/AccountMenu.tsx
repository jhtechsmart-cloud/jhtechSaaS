"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { roleLabel } from "@/lib/avatar/avatar";
import { UserAvatar } from "./UserAvatar";

// 우상단 계정 메뉴 — 아바타 클릭 → 구글식 팝오버(사진·이름·이메일·권한 + 계정설정/로그아웃).
// 바깥 클릭·ESC로 닫힘.
export function AccountMenu({
  imageUrl,
  name,
  email,
  isAdmin,
}: {
  imageUrl: string | null;
  name: string | null;
  email: string | null;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="계정 메뉴"
        title="계정"
        className="flex items-center rounded-full ring-offset-2 transition-shadow hover:ring-2 hover:ring-accent/30"
      >
        <UserAvatar imageUrl={imageUrl} name={name} fallback={isAdmin ? "관" : "영"} variant="solid" size={36} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-border bg-surface p-4 shadow-card-hover"
        >
          {email && <p className="mb-3 text-center text-small text-muted">{email}</p>}
          <div className="flex flex-col items-center gap-2">
            <UserAvatar imageUrl={imageUrl} name={name} fallback={isAdmin ? "관" : "영"} variant="soft" size={64} />
            <div className="text-center">
              <p className="text-body font-semibold text-text">{name ?? "사용자"}</p>
              <p className="text-small text-muted">{roleLabel(isAdmin)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href="/admin/account"
              onClick={() => setOpen(false)}
              className="rounded-full border border-border px-4 py-2 text-center text-small font-medium text-accent hover:bg-surface-2"
            >
              계정 설정
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="w-full rounded-full px-4 py-2 text-center text-small text-muted hover:bg-surface-2 hover:text-danger"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
