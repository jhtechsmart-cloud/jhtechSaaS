"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DURATION_OPTIONS,
  type DurationOption,
} from "@/lib/demo-reservations/constants";
import { computeSelection } from "@/lib/demo-reservations/slots";
import { createReservationSchema } from "@/lib/demo-reservations/schema";
import {
  createDemoReservation,
  updateDemoReservation,
} from "@/lib/demo-reservations/actions";
import { groupDemoEquipment } from "@/lib/demo-reservations/equipment-grouping";
import type {
  DemoReservationRow,
  DemoStaffRow,
  EquipmentOptionRow,
} from "@/lib/demo-reservations/queries";
import type { CategoryNode } from "@/lib/equipment/category-tree";
import { maskPhoneTyping } from "@/lib/customers/input-mask";
import { CustomerCombobox } from "./CustomerCombobox";
import { TimeSlotPicker } from "./TimeSlotPicker";

// 예약 등록 폼 — 슬롯 선택·소요시간·충돌 판정은 순수 로직(slots.ts) 재사용.
// 장비는 복수 선택(체크박스, 대분류 프린터/커팅기 그룹), 같은 장비만 시간 겹침 차단.
// 충돌/운영시간 초과 시 경고 배너 + 저장 비활성(1차), 서버 zod(2차), DB EXCLUDE(3차).

const INPUT_CLS =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text placeholder:text-muted/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-small font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

// 대분류 그룹별 장비 체크박스. 빈 그룹은 안내 문구로 자리 유지(좌 프린터/우 커팅기 레이아웃 고정).
function EquipmentGroup({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: EquipmentOptionRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3">
      <legend className="px-1 text-small font-semibold text-muted">{title}</legend>
      {items.length === 0 ? (
        <p className="px-1 py-1.5 text-small text-faint">해당 장비 없음</p>
      ) : (
        items.map((eq) => {
          const checked = selected.has(eq.id);
          return (
            <label
              key={eq.id}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-body transition-colors ${
                checked
                  ? "border-accent bg-mint text-accent"
                  : "border-border bg-surface text-text hover:bg-mint-hover"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(eq.id)}
                className="size-4 accent-accent"
              />
              <span>
                {eq.name}
                {eq.model ? ` (${eq.model})` : ""}
              </span>
            </label>
          );
        })
      )}
    </fieldset>
  );
}

// 수정 모드 프리필 값(등록 모드면 undefined). date는 상위(셸)가 보유.
export interface ReservationFormInitial {
  companyId: string | null;
  customerName: string;
  equipmentIds: string[];
  assigneeId: string | null;
  visitorPhone: string;
  startTime: string;
  durationMin: DurationOption;
  memo: string;
}

export function NewReservationForm({
  date,
  onDateChange,
  equipmentOptions,
  staff,
  categories,
  reservations,
  loading,
  onSaved,
  initial,
  editingId,
}: {
  date: string;
  onDateChange: (date: string) => void;
  equipmentOptions: EquipmentOptionRow[];
  staff: DemoStaffRow[];
  categories: CategoryNode[];
  reservations: DemoReservationRow[];
  loading: boolean;
  onSaved: () => void;
  initial?: ReservationFormInitial; // 수정 모드 프리필
  editingId?: string; // 있으면 수정 모드(updateDemoReservation 호출)
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customer, setCustomer] = useState({
    companyId: initial?.companyId ?? null,
    customerName: initial?.customerName ?? "",
  });
  const [equipmentIds, setEquipmentIds] = useState<string[]>(initial?.equipmentIds ?? []);
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? "");
  // 저장된 값도 하이픈 마스킹해 표시(수정 모드 프리필)
  const [visitorPhone, setVisitorPhone] = useState(
    initial?.visitorPhone ? maskPhoneTyping(initial.visitorPhone) : "",
  );
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [durationMin, setDurationMin] = useState<DurationOption>(initial?.durationMin ?? 60);
  const [startTime, setStartTime] = useState<string | null>(initial?.startTime ?? null);
  const [banner, setBanner] = useState<string | null>(null);

  const grouped = useMemo(
    () => groupDemoEquipment(equipmentOptions, categories),
    [equipmentOptions, categories],
  );
  const selectedSet = useMemo(() => new Set(equipmentIds), [equipmentIds]);

  // 점유 슬롯 = 선택한 장비 중 하나라도 포함한 기존 예약만(같은 장비 겹침 차단, 다른 장비는 허용).
  const existing = useMemo(
    () =>
      reservations
        .filter((r) => r.equipmentIds.some((id) => selectedSet.has(id)))
        .map((r) => ({ start: r.start, end: r.end })),
    [reservations, selectedSet],
  );
  const selection = useMemo(
    () => (startTime ? computeSelection(startTime, durationMin, existing) : null),
    [startTime, durationMin, existing],
  );

  function toggleEquipment(id: string) {
    setEquipmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const conflictMessage = selection?.conflict
    ? "선택한 시간이 같은 장비의 기존 예약과 겹칩니다. 다른 시간을 선택해주세요."
    : selection?.exceedsClose
      ? "종료 시간이 운영 종료(18:00)를 넘습니다. 시작 시간이나 소요 시간을 조정해주세요."
      : null;

  const canSave =
    !pending &&
    !loading &&
    startTime != null &&
    !selection?.conflict &&
    !selection?.exceedsClose &&
    customer.customerName.trim().length > 0 &&
    equipmentIds.length > 0;

  function submit() {
    if (!startTime) return;
    setBanner(null);
    const values = {
      companyId: customer.companyId,
      customerName: customer.customerName,
      equipmentIds,
      assigneeId: assigneeId || null,
      visitorPhone,
      date,
      startTime,
      durationMin,
      memo,
    };
    // 클라 측 동일 스키마 사전 검증(서버 왕복 전 빠른 피드백)
    const parsed = createReservationSchema.safeParse(values);
    if (!parsed.success) {
      setBanner(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");
      return;
    }
    startTransition(async () => {
      const result = editingId
        ? await updateDemoReservation(editingId, parsed.data)
        : await createDemoReservation(parsed.data);
      if (result.status === "ok") {
        sessionStorage.setItem("jh-demo-saved", "1");
        router.push(`/admin/demo-reservations?date=${result.date}`);
        return;
      }
      setBanner(result.message);
      if (result.status === "conflict") {
        setStartTime(null);
        onSaved(); // 점유 슬롯 최신화(방금 들어온 예약 반영)
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="고객 *">
          <CustomerCombobox value={customer} onChange={setCustomer} />
        </Field>
        <Field label="연락처">
          <input
            value={visitorPhone}
            onChange={(e) => setVisitorPhone(maskPhoneTyping(e.target.value))}
            inputMode="numeric"
            placeholder="010-0000-0000"
            className={`${INPUT_CLS} tabular-nums`}
          />
        </Field>
        <Field label="영업담당자">
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className={INPUT_CLS}
          >
            <option value="">담당자 미지정</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="날짜 *">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) {
                onDateChange(e.target.value);
                setStartTime(null); // 날짜 바뀌면 슬롯 선택 초기화(다른 날 점유 기준)
              }
            }}
            className={`${INPUT_CLS} tabular-nums`}
          />
        </Field>
        {/* 버튼 그룹은 label로 감싸지 않는다(버튼 접근성 이름에 라벨 텍스트가 섞임) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-muted">소요 시간 *</span>
          <div className="flex gap-1.5" role="group" aria-label="소요 시간">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDurationMin(d)}
                aria-pressed={durationMin === d}
                className={`flex-1 rounded-full border px-2 py-2 text-small tabular-nums transition-colors ${
                  durationMin === d
                    ? "border-accent bg-accent font-semibold text-white"
                    : "border-border bg-surface text-text hover:bg-mint-hover"
                }`}
              >
                {d}분
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-small font-medium text-muted">
          데모 장비 *{" "}
          <span className="font-normal text-faint">
            — 여러 대 선택 가능, 같은 장비만 시간 중복 차단
          </span>
        </p>
        {equipmentOptions.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-small text-faint">
            데모 가능한 장비가 없습니다. 장비 관리에서 &lsquo;데모 가능&rsquo;을 체크하세요.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <EquipmentGroup
                title="프린터"
                items={grouped.printer}
                selected={selectedSet}
                onToggle={toggleEquipment}
              />
              <EquipmentGroup
                title="커팅기"
                items={grouped.cutter}
                selected={selectedSet}
                onToggle={toggleEquipment}
              />
            </div>
            {grouped.etc.length > 0 && (
              <EquipmentGroup
                title="기타"
                items={grouped.etc}
                selected={selectedSet}
                onToggle={toggleEquipment}
              />
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-small font-medium text-muted">
          시작 시간 * <span className="font-normal text-faint">— 15분 단위, 점유 시간은 선택 불가</span>
        </p>
        {loading ? (
          <p className="py-6 text-center text-small text-faint">예약 현황 불러오는 중…</p>
        ) : (
          <TimeSlotPicker
            existing={existing}
            selectedStart={startTime}
            durationMin={durationMin}
            onSelect={setStartTime}
          />
        )}
      </div>

      <Field label="메모">
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          placeholder="요청 사항·준비물 등"
          className={`${INPUT_CLS} resize-y rounded-md`}
        />
      </Field>

      {(conflictMessage ?? banner) && (
        <div
          role="alert"
          className="rounded-lg border border-coral bg-coral-soft px-4 py-3 text-small font-medium text-coral-text"
        >
          {conflictMessage ?? banner}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-row-line pt-4">
        <p className="text-small text-muted tabular-nums">
          {startTime && selection && !selection.exceedsClose
            ? `${date} · ${startTime}부터 ${durationMin}분`
            : "시작 시간을 선택하세요"}
        </p>
        <Button type="submit" disabled={!canSave}>
          {pending ? "저장 중…" : editingId ? "수정 저장" : "예약 저장"}
        </Button>
      </div>
    </form>
  );
}
