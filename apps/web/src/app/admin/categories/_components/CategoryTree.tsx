"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CategoryTreeNode, CategoryNode } from "@/lib/equipment/category-tree";
import {
  createCategory,
  renameCategory,
  deleteCategory,
  setCategoryLogoKind,
  setCategoryWpId,
  setCategoryCardLabel,
} from "@/lib/categories/actions";

// action 결과 타입 — null이면 성공, { error } 이면 실패.
type ActionResult = { error: string } | null;

// WP 카테고리 후보(홈페이지 공개 API에서 fetch). null = 목록을 불러오지 못함.
export interface WpCategoryOption {
  id: number;
  name: string;
}

// 재고현황 강조 배경 톤과 동일 계열 — 대분류 행(민트 틴트) 구분.
const TOP_ROW_BG = "#F3FBF7";

// 분류 트리 클라이언트 컴포넌트 — 재고현황 페이지와 같은 섹션 카드 + 테이블 레이아웃.
export function CategoryTree({
  tree,
  wpCategories,
}: {
  tree: CategoryTreeNode[];
  wpCategories: WpCategoryOption[] | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newTop, setNewTop] = useState("");

  // 서버 액션 실행 — 성공 refresh(+선택 토스트), 실패 토스트.
  function run(fn: () => Promise<ActionResult>, okMsg?: string) {
    startTransition(async () => {
      const r = await fn();
      if (r?.error) toast.error(r.error);
      else {
        if (okMsg) toast.success(okMsg);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex max-w-[980px] flex-col gap-6">
      {/* 새 대분류 추가 */}
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface p-3">
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
            run(() => createCategory(name, null), `'${name.trim()}' 대분류 추가됨`);
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

      {tree.map((top) => (
        <TopSection key={top.id} node={top} pending={pending} run={run} wpCategories={wpCategories} />
      ))}
    </div>
  );
}

// 이름 인라인 편집 — 수정 클릭 시 입력으로 전환(Enter 저장·Esc 취소).
function InlineName({
  node,
  bold,
  pending,
  run,
}: {
  node: CategoryNode;
  bold?: boolean;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>, okMsg?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(node.name);

  if (!editing) {
    return (
      <span className="flex items-center gap-2">
        <span className={bold ? "font-semibold text-text" : "text-text"}>{node.name}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setValue(node.name);
            setEditing(true);
          }}
          className="text-micro text-muted hover:text-text"
          aria-label={`${node.name} 이름 수정`}
        >
          수정
        </button>
      </span>
    );
  }
  const commit = () => {
    setEditing(false);
    const v = value.trim();
    if (v && v !== node.name) run(() => renameCategory(node.id, v), "이름 변경됨");
  };
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      aria-label={`${node.name} 이름 입력`}
      className="w-40 rounded-md border border-border bg-surface px-2 py-1 text-body text-text"
    />
  );
}

// 카드 영문 라벨 입력 — blur/Enter 시 저장, 변경 없으면 무시. 미설정 소분류는 상속 안내.
function CardLabelInput({
  node,
  inheritedFrom,
  pending,
  run,
}: {
  node: CategoryNode;
  inheritedFrom: CategoryNode | null;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>, okMsg?: string) => void;
}) {
  const saved = node.card_label_en ?? "";
  const [value, setValue] = useState(saved);
  // 서버값이 바뀌면(다른 관리자 편집·저장 후 refresh) 로컬 상태 동기화 — stale 재저장 방지.
  // effect 대신 렌더 중 파생 상태 보정(React 공식 패턴, setState-in-effect 캐스케이드 회피).
  const [lastSaved, setLastSaved] = useState(saved);
  if (saved !== lastSaved) {
    setLastSaved(saved);
    setValue(saved);
  }
  const inherited = inheritedFrom?.card_label_en ?? null;
  const commit = () => {
    if (value.trim() === saved) return;
    run(() => setCategoryCardLabel(node.id, value), "영문 라벨 저장됨");
  };
  return (
    <div className="flex flex-col gap-0.5">
      <input
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        placeholder={inherited ? `↑ ${inherited}` : "예: ROLL TO ROLL UV PRINTER"}
        aria-label={`${node.name} 카드 영문 라벨`}
        className="w-full rounded-md border border-border bg-surface px-2 py-1 font-mono text-small uppercase text-text placeholder:normal-case"
      />
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
  inheritedFrom: CategoryNode | null;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>, okMsg?: string) => void;
  wpCategories: WpCategoryOption[] | null;
}) {
  if (wpCategories === null) return <span className="text-micro text-muted">—</span>;
  const current = node.wp_category_id ?? null;
  const inheritedValue = inheritedFrom?.wp_category_id ?? null;
  const inheritedName =
    inheritedValue != null
      ? (wpCategories.find((c) => c.id === inheritedValue)?.name ?? String(inheritedValue))
      : null;
  return (
    <div className="flex items-center gap-2">
      <select
        value={current ?? ""}
        disabled={pending}
        aria-label={`${node.name} WP 카테고리`}
        onChange={(e) =>
          run(() => setCategoryWpId(node.id, e.target.value === "" ? null : Number(e.target.value)))
        }
        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-small text-text"
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
        <span className="whitespace-nowrap text-micro text-muted">↑ {inheritedName}</span>
      ) : null}
    </div>
  );
}

// 소분류 행 — 이름(인라인 편집)·라벨·WP 매핑 + 행 우측 끝 작업(수정/삭제) 컬럼.
function ChildRow({
  node,
  parent,
  pending,
  run,
  wpCategories,
}: {
  node: CategoryNode;
  parent: CategoryTreeNode;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>, okMsg?: string) => void;
  wpCategories: WpCategoryOption[] | null;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(node.name);
  const commit = () => {
    setEditing(false);
    const v = value.trim();
    if (v && v !== node.name) run(() => renameCategory(node.id, v), "이름 변경됨");
  };
  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-surface-2">
      <td className="px-4 py-2">
        {editing ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            aria-label={`${node.name} 이름 입력`}
            className="w-40 rounded-md border border-border bg-surface px-2 py-1 text-body text-text"
          />
        ) : (
          <span className="text-text">{node.name}</span>
        )}
      </td>
      <td className="px-4 py-2">
        <CardLabelInput node={node} inheritedFrom={parent} pending={pending} run={run} />
      </td>
      <td className="px-4 py-2">
        <WpCategorySelect
          node={node}
          inheritedFrom={parent}
          pending={pending}
          run={run}
          wpCategories={wpCategories}
        />
      </td>
      <td className="px-4 py-2">
        <span className="flex items-center justify-end gap-2 whitespace-nowrap">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setValue(node.name);
              setEditing(true);
            }}
            aria-label={`${node.name} 이름 수정`}
            className="text-micro text-muted hover:text-text"
          >
            수정
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(`'${node.name}' 삭제?`)) run(() => deleteCategory(node.id), "삭제됨");
            }}
            className="text-micro text-danger hover:underline"
          >
            삭제
          </button>
        </span>
      </td>
    </tr>
  );
}

// 대분류 섹션 카드 — 헤더(이름·견적 로고·삭제) + 소분류 테이블(재고현황 레이아웃).
function TopSection({
  node,
  pending,
  run,
  wpCategories,
}: {
  node: CategoryTreeNode;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>, okMsg?: string) => void;
  wpCategories: WpCategoryOption[] | null;
}) {
  const [child, setChild] = useState("");

  return (
    <section className="rounded-md border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <h2 className="text-h2 font-medium text-text">
          <InlineName node={node} bold pending={pending} run={run} />
        </h2>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-muted">
          소분류 {node.children.length}
        </span>

        {/* 견적서 좌상단 회사로고 종류 — 대분류에만 노출. 미지정이면 기본 로고. */}
        <label className="ml-auto flex items-center gap-1 text-micro text-muted">
          견적 로고
          <select
            value={node.quote_logo_kind ?? ""}
            disabled={pending}
            aria-label={`${node.name} 견적 로고`}
            onChange={(e) =>
              run(() => setCategoryLogoKind(node.id, e.target.value as "cutter" | "printer" | ""))
            }
            className="rounded-md border border-border bg-surface px-2 py-1 text-micro text-text"
          >
            <option value="">미지정</option>
            <option value="cutter">커팅기</option>
            <option value="printer">프린터</option>
          </select>
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm(`'${node.name}' 삭제?`)) run(() => deleteCategory(node.id), "삭제됨");
          }}
          className="text-small text-danger hover:underline"
        >
          삭제
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-small">
          <colgroup>
            <col className="w-56" />
            <col className="w-72" />
            <col className="w-72" />
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-2 font-medium">분류</th>
              <th className="px-4 py-2 font-medium">카드 영문 라벨 (홈페이지 대표 이미지)</th>
              <th className="px-4 py-2 font-medium">WP 카테고리 (홈페이지 글 분류)</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {/* 대분류 자체 행 — 민트 틴트로 구분, 소분류가 상속받는 기준값 */}
            <tr className="border-b border-border" style={{ backgroundColor: TOP_ROW_BG }}>
              <td className="px-4 py-2">
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-mint px-2 py-0.5 text-micro font-semibold text-accent">
                    대분류
                  </span>
                  <span className="font-medium text-text">{node.name}</span>
                </span>
              </td>
              <td className="px-4 py-2">
                <CardLabelInput node={node} inheritedFrom={null} pending={pending} run={run} />
              </td>
              <td className="px-4 py-2">
                <WpCategorySelect
                  node={node}
                  inheritedFrom={null}
                  pending={pending}
                  run={run}
                  wpCategories={wpCategories}
                />
              </td>
              <td className="px-4 py-2" />
            </tr>

            {node.children.map((c: CategoryNode) => (
              <ChildRow
                key={c.id}
                node={c}
                parent={node}
                pending={pending}
                run={run}
                wpCategories={wpCategories}
              />
            ))}

            {/* 소분류 추가 행 */}
            <tr>
              <td className="px-4 py-2" colSpan={4}>
                <div className="flex items-center gap-2">
                  <input
                    value={child}
                    onChange={(e) => setChild(e.target.value)}
                    placeholder="새 소분류명"
                    className="w-56 rounded-md border border-border bg-surface px-2 py-1 text-small text-text"
                  />
                  <button
                    type="button"
                    disabled={pending || !child.trim()}
                    onClick={() => {
                      const name = child;
                      setChild("");
                      run(() => createCategory(name, node.id), `'${name.trim()}' 소분류 추가됨`);
                    }}
                    className="text-small font-medium text-accent hover:underline"
                  >
                    + 소분류
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
