"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CategoryTreeNode, CategoryNode } from "@/lib/equipment/category-tree";
import {
  createCategory,
  renameCategory,
  deleteCategory,
  setCategoryLogoKind,
  setCategoryWpId,
} from "@/lib/categories/actions";

// action 결과 타입 — null이면 성공, { error } 이면 실패.
type ActionResult = { error: string } | null;

// WP 카테고리 후보(홈페이지 공개 API에서 fetch). null = 목록을 불러오지 못함.
export interface WpCategoryOption {
  id: number;
  name: string;
}

// 분류 트리 클라이언트 컴포넌트 — 대분류·소분류 추가·수정·삭제 인터랙션 처리.
export function CategoryTree({
  tree,
  wpCategories,
}: {
  tree: CategoryTreeNode[];
  wpCategories: WpCategoryOption[] | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [newTop, setNewTop] = useState("");

  // 서버 액션 실행 후 성공이면 refresh, 실패면 에러 표시.
  function run(fn: () => Promise<ActionResult>) {
    setErr(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setErr(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex max-w-[640px] flex-col gap-4">
      {err ? <p className="text-small text-danger">{err}</p> : null}

      {/* 대분류 추가 입력행 */}
      <div className="flex gap-2">
        <input
          value={newTop}
          onChange={(e) => setNewTop(e.target.value)}
          placeholder="새 대분류명(예: 프린터)"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-body text-text"
        />
        <button
          type="button"
          disabled={pending || !newTop.trim()}
          onClick={() => {
            const name = newTop;
            setNewTop("");
            run(() => createCategory(name, null));
          }}
          className="rounded-md bg-accent px-4 py-2 text-body font-medium text-white disabled:opacity-60"
        >
          + 대분류
        </button>
      </div>

      {/* WP 카테고리 목록 fetch 실패 안내 — 숫자 입력 폴백 없이 재시도만(#253 결정 17) */}
      {wpCategories === null ? (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-small text-muted">
          홈페이지 WP 카테고리 목록을 불러오지 못했습니다.{" "}
          <button type="button" onClick={() => router.refresh()} className="text-accent underline">
            다시 시도
          </button>
        </p>
      ) : null}

      {/* 대분류 목록 */}
      <ul className="flex flex-col gap-3">
        {tree.map((top) => (
          <TopNode key={top.id} node={top} pending={pending} run={run} wpCategories={wpCategories} />
        ))}
      </ul>
    </div>
  );
}

// WP 카테고리 드롭다운 — 직접값 또는 상속 안내. "이름 (id)" 표기.
function WpCategorySelect({
  node,
  inheritedFrom,
  pending,
  run,
  wpCategories,
}: {
  node: CategoryNode;
  inheritedFrom: CategoryNode | null; // 소분류 미설정 시 값을 물려주는 대분류(표시용)
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
  wpCategories: WpCategoryOption[] | null;
}) {
  if (wpCategories === null) return null; // fetch 실패 시 상단 재시도 안내로 갈음
  const current = node.wp_category_id ?? null;
  const inheritedValue = inheritedFrom?.wp_category_id ?? null;
  const inheritedName =
    inheritedValue != null
      ? (wpCategories.find((c) => c.id === inheritedValue)?.name ?? String(inheritedValue))
      : null;
  return (
    <label className="flex items-center gap-1 text-micro text-muted">
      WP 카테고리
      <select
        value={current ?? ""}
        disabled={pending}
        aria-label={`${node.name} WP 카테고리`}
        onChange={(e) =>
          run(() => setCategoryWpId(node.id, e.target.value === "" ? null : Number(e.target.value)))
        }
        className="rounded-sm border border-border bg-surface px-2 py-1 text-micro text-text"
      >
        <option value="">미지정</option>
        {wpCategories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.id})
          </option>
        ))}
      </select>
      {/* 상속 실효값 — 미설정 소분류가 '매핑필요'인지 '상속 OK'인지 화면에서 구분(#253 결정 17) */}
      {current == null && inheritedName ? (
        <span className="text-micro text-muted/70">↑ {inheritedName} 상속</span>
      ) : null}
    </label>
  );
}

// 대분류 한 항목 — 내부에 소분류 목록 + 소분류 추가 입력행.
function TopNode({
  node,
  pending,
  run,
  wpCategories,
}: {
  node: CategoryTreeNode;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
  wpCategories: WpCategoryOption[] | null;
}) {
  const [child, setChild] = useState("");

  return (
    <li className="rounded-md border border-border bg-surface p-3">
      {/* 대분류 행 */}
      <div className="flex items-center gap-2">
        <span className="font-medium text-text">{node.name}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const n = prompt("대분류 이름 변경", node.name);
            if (n) run(() => renameCategory(node.id, n));
          }}
          className="text-micro text-muted hover:text-text"
        >
          수정
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm(`'${node.name}' 삭제?`)) run(() => deleteCategory(node.id));
          }}
          className="text-micro text-danger hover:underline"
        >
          삭제
        </button>

        {/* 견적서 좌상단 회사로고 종류 — 대분류에만 노출. 미지정이면 기본 로고. */}
        <label className="ml-auto flex items-center gap-1 text-micro text-muted">
          견적 로고
          <select
            value={node.quote_logo_kind ?? ""}
            disabled={pending}
            onChange={(e) =>
              run(() => setCategoryLogoKind(node.id, e.target.value as "cutter" | "printer" | ""))
            }
            className="rounded-sm border border-border bg-surface px-2 py-1 text-micro text-text"
          >
            <option value="">미지정</option>
            <option value="cutter">커팅기</option>
            <option value="printer">프린터</option>
          </select>
        </label>
        <WpCategorySelect
          node={node}
          inheritedFrom={null}
          pending={pending}
          run={run}
          wpCategories={wpCategories}
        />
      </div>

      {/* 소분류 목록 + 추가 입력행 */}
      <ul className="mt-2 flex flex-col gap-1 pl-4">
        {node.children.map((c: CategoryNode) => (
          <li key={c.id} className="flex items-center gap-2 text-body text-text">
            <span>– {c.name}</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const n = prompt("소분류 이름 변경", c.name);
                if (n) run(() => renameCategory(c.id, n));
              }}
              className="text-micro text-muted hover:text-text"
            >
              수정
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm(`'${c.name}' 삭제?`)) run(() => deleteCategory(c.id));
              }}
              className="text-micro text-danger hover:underline"
            >
              삭제
            </button>
            <span className="ml-auto">
              <WpCategorySelect
                node={c}
                inheritedFrom={node}
                pending={pending}
                run={run}
                wpCategories={wpCategories}
              />
            </span>
          </li>
        ))}

        {/* 소분류 추가 입력행 */}
        <li className="flex gap-2 pt-1">
          <input
            value={child}
            onChange={(e) => setChild(e.target.value)}
            placeholder="새 소분류명"
            className="flex-1 rounded-sm border border-border bg-surface px-2 py-1 text-small text-text"
          />
          <button
            type="button"
            disabled={pending || !child.trim()}
            onClick={() => {
              const name = child;
              setChild("");
              run(() => createCategory(name, node.id));
            }}
            className="text-small font-medium text-accent hover:underline"
          >
            + 소분류
          </button>
        </li>
      </ul>
    </li>
  );
}
