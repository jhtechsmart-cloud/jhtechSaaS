"use client";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Equipment } from "@jhtechsaas/shared";
import { publicImageUrl } from "@/lib/equipment/images";
import { groupByCategory } from "@/lib/equipment/group";

type StatusFilter = "all" | "active" | "inactive";

// 금액 포맷(mono tabular는 클래스로). 천단위 콤마 + ₩.
function formatPrice(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

const STATUS_BADGE: Record<Equipment["status"], { label: string; cls: string }> = {
  active: { label: "판매중", cls: "bg-active/10 text-active" },
  inactive: { label: "비활성", cls: "bg-surface-2 text-muted" },
};

export function EquipmentTable({ items }: { items: Equipment[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  // 사용자가 접은 분류(기본 전부 펼침). 검색 중엔 결과가 항상 보이도록 강제 펼침.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const searching = q.trim() !== "";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      const matchesQ =
        needle === "" ||
        it.name.toLowerCase().includes(needle) ||
        (it.model ?? "").toLowerCase().includes(needle);
      const matchesStatus = status === "all" || it.status === status;
      return matchesQ && matchesStatus;
    });
  }, [items, q, status]);

  const groups = useMemo(() => groupByCategory(filtered), [filtered]);

  function toggle(cat: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  // empty: 카탈로그 자체가 비어있음(첫 사용)
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface p-10">
        <p className="text-body font-medium text-text">등록된 장비가 없습니다</p>
        <p className="text-small text-muted">첫 장비를 추가해 카탈로그를 시작하세요</p>
        <Link
          href="/admin/equipment/new"
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white"
        >
          + 새 장비
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름·모델 검색"
          className="w-60 rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
        <div className="flex gap-1">
          {(["all", "active", "inactive"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-2 text-small font-medium ${
                status === s ? "bg-accent text-white" : "bg-surface-2 text-muted"
              }`}
            >
              {s === "all" ? "전체" : s === "active" ? "판매중" : "비활성"}
            </button>
          ))}
        </div>
      </div>

      {/* partial: 데이터는 있으나 필터 결과 0건 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface p-8">
          <p className="text-body text-text">조건에 맞는 장비가 없습니다</p>
          <button
            onClick={() => {
              setQ("");
              setStatus("all");
            }}
            className="text-small text-accent underline"
          >
            필터 초기화
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <thead>
            <tr className="border-b border-border text-left text-small text-muted">
              <th className="w-12 py-2 pr-3"></th>
              <th className="py-2 pr-4 font-medium">이름</th>
              <th className="py-2 pr-4 font-medium">모델</th>
              <th className="py-2 pr-4 font-medium">분류</th>
              <th className="py-2 pr-4 text-right font-medium">기본가</th>
              <th className="py-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const open = searching || !collapsed.has(g.category);
              return (
                <Fragment key={g.category}>
                  {/* 분류 헤더 행 — 클릭으로 그룹 접기/펴기. 열 정렬 유지 위해 같은 테이블 안에 둠. */}
                  <tr
                    className="cursor-pointer border-b border-border bg-surface-2/60 hover:bg-surface-2"
                    onClick={() => toggle(g.category)}
                  >
                    <td colSpan={6} className="py-2">
                      <span className="flex items-center gap-2 font-medium text-text">
                        <svg
                          viewBox="0 0 16 16"
                          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {g.category}
                        <span className="text-small font-normal text-muted">{g.items.length}</span>
                      </span>
                    </td>
                  </tr>
                  {open &&
                    g.items.map((it) => {
                      const badge = STATUS_BADGE[it.status];
                      return (
                        <tr
                          key={it.id}
                          className="cursor-pointer border-b border-border hover:bg-surface-2"
                          onClick={() => router.push(`/admin/equipment/${it.id}/edit`)}
                        >
                          <td className="py-2 pr-3">
                            {it.photos[0] ? (
                              <Image
                                src={publicImageUrl(it.photos[0])}
                                alt=""
                                width={40}
                                height={40}
                                className="h-10 w-10 rounded-sm object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-sm bg-surface-2" />
                            )}
                          </td>
                          <td className="max-w-xs py-2 pr-4">
                            <Link
                              href={`/admin/equipment/${it.id}/edit`}
                              className="block max-w-xs truncate font-medium text-text hover:text-accent"
                            >
                              {it.name}
                            </Link>
                          </td>
                          <td className="py-2 pr-4 font-mono text-text">{it.model ?? "-"}</td>
                          <td className="py-2 pr-4 text-muted">{it.category ?? "-"}</td>
                          <td className="py-2 pr-4 text-right font-mono tabular-nums text-text">
                            {formatPrice(it.base_price)}
                          </td>
                          <td className="py-2">
                            <span className={`rounded-sm px-2 py-0.5 text-small font-medium ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
