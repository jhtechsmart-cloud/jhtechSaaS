"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { z } from "zod";
import { formatBizNo, formatPhone } from "@jhtechsaas/shared";
import { buttonVariants } from "@/components/ui/button";
import {
  companyFormSchema,
  makeCompanyFormSchema,
  type CompanyFormValues,
  type CompanyEquipmentRow,
} from "@/lib/customers/schema";
import { hasAnyContact } from "@/lib/customers/validation";
import { deriveSameAsHq } from "@/lib/customers/install-address";
import { maskBizNoTyping, maskPhoneTyping } from "@/lib/customers/input-mask";
import type { CustomerActionResult, DuplicateHit } from "@/lib/customers/actions";
import type { Equipment } from "@jhtechsaas/shared";
import { CompanyEquipmentEditor } from "./CompanyEquipmentEditor";
import { FormSectionCard } from "./FormSectionCard";
import { StickyFormFooter } from "./StickyFormFooter";

// 담당자 선택용 간소 타입
type StaffItem = { id: string; name: string };
// 카탈로그(active 장비만)
type CatalogItem = Pick<Equipment, "id" | "name" | "model">;

// createCustomer / updateCustomer 액션 타입 호환 시그니처
type CustomerAction = (
  id: string,
  values: CompanyFormValues,
) => Promise<CustomerActionResult>;

type Props =
  | {
      mode: "create";
      id: string;
      onSubmit: CustomerAction;
      staff: StaffItem[];
      catalog: CatalogItem[];
      registered?: never;
      company?: never;
      ledgerNo?: never;
    }
  | {
      mode: "edit";
      id: string;
      onSubmit: CustomerAction;
      staff: StaffItem[];
      catalog: CatalogItem[];
      registered?: "new" | "existing" | null;
      // edit 모드: 초기값 포함
      company: CompanyFormValues;
      ledgerNo?: number | null; // 헤더 서브라인용(구 시스템 장부번호, 편집 불가)
    };

// react-hook-form input 타입(z.input — 미입력 필드 string)
type FormInput = z.input<typeof companyFormSchema>;

// 변경 요약(저장 바)·헤더에 쓰는 필드 라벨.
const FIELD_LABELS: Record<string, string> = {
  name: "업체명", biz_no: "사업자등록번호", ceo: "대표자", manager: "담당자", manager_title: "직책",
  phone: "연락처(대표)", email: "이메일", address: "본사주소", biz_type: "업태",
  biz_item: "업종(종목)", ledger_name: "장부명", phone1: "전화1", phone2: "전화2",
  fax: "팩스", mobile: "휴대폰", address_actual1: "설치주소", address_actual2: "주소2",
  note: "메모", assignee_id: "담당영업", equipment: "보유장비", biz_no_none: "사업자번호 없음",
};

// dirtyFields 깊은 판정(equipment는 중첩 배열).
function isDirtyDeep(v: unknown): boolean {
  if (v === true) return true;
  if (Array.isArray(v)) return v.some(isDirtyDeep);
  if (v && typeof v === "object") return Object.values(v).some(isDirtyDeep);
  return false;
}

const INPUT_BASE =
  "rounded-md border bg-surface px-3 py-2 text-body text-text placeholder:text-muted/50";
function inputCls(dirty: boolean, mono?: boolean): string {
  return [
    INPUT_BASE,
    mono ? "font-mono tabular-nums" : "",
    // 변경된 필드는 틸 톤 하이라이트(저장 전 시각 추적)
    dirty ? "border-accent-ring bg-accent-soft/60" : "border-border",
  ].join(" ");
}

export function CompanyForm(props: Props) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const defaultValues: FormInput =
    props.mode === "edit"
      ? {
          // biz_no_none은 edit/page.tsx가 이미 파생(저장값 biz_no 공란 → true)해 company에 담아
          // 넘긴다 — 여기서 다시 파생하면 이중 계산이라 스프레드 값을 그대로 쓴다.
          ...props.company,
          // biz_no는 표시용 대시 포맷으로 로드(목록·blur와 일관). 저장 시 actions가 normalize.
          biz_no: props.company.biz_no ? formatBizNo(props.company.biz_no) : "",
          // 전화류 전부 표시용 대시 포맷으로 로드 — blur 재포맷과 defaultValues가 일치해야
          // 탭만 지나가도 dirty로 오인하지 않는다(이관 데이터에 비포맷 값 존재 가능).
          phone: props.company.phone ? formatPhone(props.company.phone) : "",
          phone1: props.company.phone1 ? formatPhone(props.company.phone1) : "",
          phone2: props.company.phone2 ? formatPhone(props.company.phone2) : "",
          fax: props.company.fax ? formatPhone(props.company.fax) : "",
          mobile: props.company.mobile ? formatPhone(props.company.mobile) : "",
          // equipment 행 타입 변환(CompanyEquipmentRow → FormInput 호환)
          equipment: props.company.equipment.map((r) => ({
            id: r.id,
            equipment_id: r.equipment_id,
            label: r.label,
            serial_no: r.serial_no,
            purchased_at: r.purchased_at,
            install_address: r.install_address,
          })),
        }
      : {
          name: "", biz_no: "", biz_no_none: false, ceo: "", manager: "", manager_title: "", phone: "", email: "",
          address: "", biz_type: "", biz_item: "", ledger_name: "", phone1: "",
          phone2: "", fax: "", mobile: "", address_actual1: "", address_actual2: "",
          note: "", assignee_id: "", equipment: [],
        };

  // edit 모드: 원본(수정 진입 시점 DB 값) 대비 그런더링 스키마 — 안 바꾼 사업자번호는 체크섬
  // 재검증 생략, 원본이 비어 있던 대표자·주소·연락처는 빈 채로 저장 허용(이관 고객 마찰 완화).
  // create 모드는 항상 엄격(companyFormSchema).
  const resolverSchema =
    props.mode === "edit"
      ? makeCompanyFormSchema({
          bizNo: props.company.biz_no ?? "",
          ceo: props.company.ceo ?? "",
          address: props.company.address ?? "",
          hasContact: hasAnyContact(props.company),
        })
      : companyFormSchema;

  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    reset,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<FormInput, unknown, CompanyFormValues>({
    resolver: zodResolver(resolverSchema),
    defaultValues,
  });

  // '사업자번호 없음' 체크 상태 — biz_no 입력 비활성·필수 표시 전환에 쓰인다.
  const bizNoNone = useWatch({ control, name: "biz_no_none" }) as boolean;

  // 실시간 중복 조회(디바운스 400ms) — 사업자번호 10자리 완성, 또는(없음 모드) 회사명+연락처 입력 시
  // 서버에 자문만 한다(fail-open, 오류·미차단 시 null). 최종 차단은 서버액션의 fail-closed 재검증.
  const [dupHit, setDupHit] = useState<DuplicateHit | null>(null);
  const bizNo = useWatch({ control, name: "biz_no" }) as string;
  const nameVal = useWatch({ control, name: "name" }) as string;
  const mobileVal = useWatch({ control, name: "mobile" }) as string;
  const phone1Val = useWatch({ control, name: "phone1" }) as string;
  const phoneVal = useWatch({ control, name: "phone" }) as string;

  // 설치주소 "본사와 동일" — 체크 중이면 본사주소를 설치주소에 라이브 동기화(설치 입력 비활성).
  const hqAddr = useWatch({ control, name: "address" }) as string;
  const initialSameAsHq =
    props.mode === "edit" ? deriveSameAsHq(props.company.address ?? "", props.company.address_actual1 ?? "") : true;
  const [sameAsHq, setSameAsHq] = useState(initialSameAsHq);
  const mountedRef = useRef(false);
  // 동일 체크 중 본사주소 변경을 설치주소에 라이브 반영. 마운트 직후 1회 동기화는 dirty 제외
  // (이관 고객 열람만으로 '변경됨' 오인 방지) — 이 시점 mountedRef는 아직 false. 이후 사용자의
  // 체크 토글·본사주소 편집으로 인한 동기화는 정상적으로 dirty가 된다(이탈 경고·저장바 반영).
  useEffect(() => {
    if (!sameAsHq) return;
    setValue("address_actual1", hqAddr ?? "", { shouldDirty: mountedRef.current });
  }, [sameAsHq, hqAddr, setValue]);
  // 마운트 완료 표시 — 위 동기화 effect '다음에' 선언해야 마운트 첫 실행이 dirty에서 제외된다
  // (effect는 선언 순서대로 실행: 마운트 시 동기화(false)→여기서 true).
  useEffect(() => {
    mountedRef.current = true;
  }, []);

  useEffect(() => {
    // setState는 effect 본문에서 동기 호출하지 않고(react-hooks/set-state-in-effect) 아래
    // setTimeout 콜백 안에서만 수행 — 초기화·조회 결과 반영 모두 디바운스 뒤에 일어난다.
    // cancelled 플래그: clearTimeout은 아직 발사되지 않은 타이머만 막는다 — 이미 발사돼
    // in-flight인 조회는 취소 못 하므로, 느린 이전 응답이 빠른 최신 응답을 덮어쓰거나
    // 언마운트 후 setState하지 않도록 응답 적용 직전 가드한다.
    let cancelled = false;
    const contact = mobileVal || phone1Val || phoneVal || "";
    const bizDigits = (bizNo ?? "").replace(/\D/g, "");
    // 조회 트리거: 사업자번호 10자리 완성 OR (없음 모드에서 회사명+연락처 채워짐)
    const canQuery =
      (!bizNoNone && bizDigits.length === 10) ||
      (bizNoNone && (nameVal ?? "").trim() !== "" && contact.trim() !== "");
    const t = setTimeout(async () => {
      if (!canQuery) {
        if (!cancelled) setDupHit(null);
        return;
      }
      const { checkCustomerDuplicate } = await import("@/lib/customers/actions");
      const hit = await checkCustomerDuplicate({
        bizNo: bizNoNone ? "" : bizNo,
        name: nameVal,
        phone: contact,
        excludeId: props.mode === "edit" ? props.id : undefined,
      });
      if (!cancelled) setDupHit(hit);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [bizNo, bizNoNone, nameVal, mobileVal, phone1Val, phoneVal, props.mode, props.id]);

  // dirty 상태에서 이탈 시 경고 ① beforeunload(새로고침·창닫기).
  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // ② popstate(브라우저 뒤로가기) — 가드 엔트리는 마운트 시 1회만(재push 누적 금지).
  // dirty 여부는 ref로 읽어 pop 시점 값으로 판단. clean이면 조용히 통과(back 1회 추가).
  const isDirtyRef = useRef(false);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => {
    window.history.pushState(null, "", window.location.href);
    function onPopState() {
      if (isDirtyRef.current && !confirm("저장하지 않은 변경사항이 있습니다. 페이지를 떠날까요?")) {
        window.history.pushState(null, "", window.location.href); // 머무름 — 가드 재설치
        return;
      }
      window.removeEventListener("popstate", onPopState);
      window.history.back(); // 가드 엔트리를 건너 실제 이전 항목으로
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // blur 포맷(기존 UX 유지) — 타이핑 마스킹과 함께 이중 안전망.
  function onBizNoBlur() {
    const raw = getValues("biz_no");
    if (raw) setValue("biz_no", formatBizNo(raw), { shouldDirty: true });
  }
  function onPhoneFieldBlur(name: "phone" | "phone1" | "phone2" | "fax" | "mobile") {
    const raw = getValues(name);
    if (raw) setValue(name, formatPhone(raw), { shouldDirty: true });
  }

  function onSubmit(values: CompanyFormValues) {
    // 실시간 중복 경고가 떠 있으면 저장 자체를 막는다(버튼도 잠기지만 이중 방어).
    if (dupHit) {
      setServerError(`이미 등록된 업체입니다: ${dupHit.name}`);
      return;
    }
    setServerError(null);
    // 저장 성공 시 액션이 상세로 redirect → 도착 화면에서 토스트(세션 플래그).
    if (props.mode === "edit") sessionStorage.setItem("jh-customer-saved", props.id);
    startTransition(async () => {
      const result = await props.onSubmit(props.id, values);
      // 성공 시 액션이 redirect → 여기 도달은 에러
      if (result?.error) {
        sessionStorage.removeItem("jh-customer-saved");
        setServerError(result.error);
      }
    });
  }

  // 보유장비 수: 삭제 confirm 메시지에 사용.
  const currentEquipment = useWatch({ control, name: "equipment" }) as CompanyEquipmentRow[];

  const dirtyLabels = Object.entries(dirtyFields)
    .filter(([, v]) => isDirtyDeep(v))
    .map(([k]) => FIELD_LABELS[k] ?? k);

  const backHref = props.mode === "edit" ? `/admin/customers/${props.id}` : "/admin/customers";

  function guardedNav(e: React.MouseEvent) {
    if (isDirty && !confirm("저장하지 않은 변경사항이 있습니다. 페이지를 떠날까요?")) {
      e.preventDefault();
    }
  }

  // 타이핑 마스킹이 걸린 등록 핸들 — onChange에서 값을 마스킹한 뒤 RHF에 전달.
  function masked(reg: UseFormRegisterReturn, mask: (v: string) => string) {
    return {
      ...reg,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        e.target.value = mask(e.target.value);
        return reg.onChange(e);
      },
    };
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 페이지 헤더 — 어떤 고객을 수정 중인지 + 상세 복귀 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold text-text">
            {props.mode === "edit" ? "고객 수정" : "새 고객 등록"}
          </h1>
          <p className="mt-0.5 text-small text-muted">
            {props.mode === "edit"
              ? `${props.company.name}${props.ledgerNo != null ? ` · 장부번호 ${props.ledgerNo}` : ""}`
              : "새 거래처 정보를 입력하세요"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {props.mode === "edit" && (
            <button
              type="button"
              onClick={() => {
                const eqCount = currentEquipment?.length ?? 0;
                const msg =
                  eqCount > 0
                    ? `보유장비 ${eqCount}대가 함께 삭제됩니다. 계속할까요?`
                    : "이 고객을 삭제할까요?";
                if (!confirm(msg)) return;
                startTransition(async () => {
                  const { deleteCustomer } = await import("@/lib/customers/actions");
                  const result = await deleteCustomer(props.id);
                  if (result?.error) setServerError(result.error);
                });
              }}
              disabled={pending}
              className="px-2 text-small text-danger hover:underline"
            >
              삭제
            </button>
          )}
          <Link href={backHref} onClick={guardedNav} className={buttonVariants({ variant: "outline" })}>
            {props.mode === "edit" ? "상세로 돌아가기" : "목록으로"}
          </Link>
        </div>
      </div>

      {/* 견적 신청 가져오기 등록 배너 */}
      {props.registered === "new" && (
        <div className="rounded-md bg-active/10 p-3 text-small text-active">
          새 고객으로 등록했습니다
        </div>
      )}
      {props.registered === "existing" && (
        <div className="rounded-md bg-surface-2 p-3 text-small text-muted">
          이미 등록된 고객입니다(사업자번호 일치). 기존 정보를 불러왔습니다 — 변경은 직접
          수정하세요.
        </div>
      )}

      {/* 실시간 중복 경고 — 사업자번호 또는 회사명+연락처가 기존 업체와 겹치면 저장 전 안내. */}
      {dupHit && (
        <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-small text-text">
          <b>이미 등록된 업체</b>: {dupHit.name}
          {dupHit.ceo ? ` (대표 ${dupHit.ceo})` : ""} —{" "}
          <Link href={`/admin/customers/${dupHit.company_id}`} className="underline">
            기존 업체 열기
          </Link>
          <div className="mt-0.5 text-micro text-muted">
            {dupHit.match === "biz_no" ? "같은 사업자번호" : "같은 회사명+연락처"}로 등록돼 있어
            저장할 수 없습니다.
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 pb-2">
        {/* 그룹 카드 4종 — 상세 페이지 그룹 구조와 1:1(2열, 860px 이하 1열) */}
        <div className="grid grid-cols-1 gap-4 min-[860px]:grid-cols-2">
          {/* 1) 기본 정보 */}
          <FormSectionCard title="기본 정보" purpose="목록·견적서에 표시">
            <div className="flex flex-col gap-4">
              <Field label="업체명" required error={errors.name?.message} dirty={!!dirtyFields.name}>
                <input {...register("name")} className={inputCls(!!dirtyFields.name)} />
              </Field>
              <Field
                label="사업자등록번호"
                required={!bizNoNone}
                hint="숫자만 입력하면 자동으로 하이픈이 붙습니다"
                error={errors.biz_no?.message}
                dirty={!!dirtyFields.biz_no}
              >
                <input
                  {...masked(register("biz_no"), maskBizNoTyping)}
                  onBlur={onBizNoBlur}
                  disabled={bizNoNone}
                  placeholder="123-45-67890"
                  className={inputCls(!!dirtyFields.biz_no, true)}
                />
              </Field>
              <label className="flex items-center gap-1.5 text-small text-text">
                <input
                  type="checkbox"
                  {...register("biz_no_none")}
                  onChange={(e) => {
                    register("biz_no_none").onChange(e);
                    // 체크 시 기존 입력값을 비워 스키마(사업자번호 공란 요구)와 일치시킨다.
                    if (e.target.checked) {
                      setValue("biz_no", "", { shouldDirty: true, shouldValidate: true });
                    }
                  }}
                  className="h-4 w-4 accent-accent"
                />
                사업자번호 없음(개인·미발급)
              </label>
              <div className="grid grid-cols-1 gap-4 min-[860px]:grid-cols-2">
                <Field label="대표자" required error={errors.ceo?.message} dirty={!!dirtyFields.ceo}>
                  <input {...register("ceo")} className={inputCls(!!dirtyFields.ceo)} />
                </Field>
                <Field label="담당영업" error={errors.assignee_id?.message} dirty={!!dirtyFields.assignee_id}>
                  <select {...register("assignee_id")} className={inputCls(!!dirtyFields.assignee_id)}>
                    <option value="">미배정</option>
                    {props.staff.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </FormSectionCard>

          {/* 2) 연락처 */}
          <FormSectionCard title="연락처" purpose="고객 응대에 사용(하나 이상 필수)">
            <div className="grid grid-cols-1 gap-4 min-[860px]:grid-cols-2">
              <Field label="담당자" error={errors.manager?.message} dirty={!!dirtyFields.manager}>
                <input {...register("manager")} className={inputCls(!!dirtyFields.manager)} />
              </Field>
              <Field label="직책" error={errors.manager_title?.message} dirty={!!dirtyFields.manager_title}>
                <input {...register("manager_title")} placeholder="과장, 대리 등" className={inputCls(!!dirtyFields.manager_title)} />
              </Field>
              <Field label="휴대폰" error={errors.mobile?.message} dirty={!!dirtyFields.mobile}>
                <input
                  {...masked(register("mobile"), maskPhoneTyping)}
                  onBlur={() => onPhoneFieldBlur("mobile")}
                  placeholder="010-1234-5678"
                  className={inputCls(!!dirtyFields.mobile, true)}
                />
              </Field>
              <Field label="전화1" error={errors.phone1?.message} dirty={!!dirtyFields.phone1}>
                <input
                  {...masked(register("phone1"), maskPhoneTyping)}
                  onBlur={() => onPhoneFieldBlur("phone1")}
                  placeholder="02-123-4567"
                  className={inputCls(!!dirtyFields.phone1, true)}
                />
              </Field>
              <Field label="전화2" error={errors.phone2?.message} dirty={!!dirtyFields.phone2}>
                <input
                  {...masked(register("phone2"), maskPhoneTyping)}
                  onBlur={() => onPhoneFieldBlur("phone2")}
                  placeholder="02-123-4567"
                  className={inputCls(!!dirtyFields.phone2, true)}
                />
              </Field>
              <Field label="이메일" error={errors.email?.message} dirty={!!dirtyFields.email}>
                <input {...register("email")} type="email" placeholder="name@company.co.kr" className={inputCls(!!dirtyFields.email)} />
              </Field>
              <Field label="팩스" error={errors.fax?.message} dirty={!!dirtyFields.fax}>
                <input
                  {...masked(register("fax"), maskPhoneTyping)}
                  onBlur={() => onPhoneFieldBlur("fax")}
                  placeholder="02-123-4568"
                  className={inputCls(!!dirtyFields.fax, true)}
                />
              </Field>
              <Field label="연락처(대표)" hint="신청서에서 넘어온 대표 연락처" error={errors.phone?.message} dirty={!!dirtyFields.phone}>
                <input
                  {...masked(register("phone"), maskPhoneTyping)}
                  onBlur={() => onPhoneFieldBlur("phone")}
                  placeholder="010-1234-5678"
                  className={inputCls(!!dirtyFields.phone, true)}
                />
              </Field>
            </div>
          </FormSectionCard>

          {/* 3) 사업장 — 전체 폭 */}
          <FormSectionCard title="사업장" purpose="세금계산서 · 배송에 사용" fullSpan>
            <div className="grid grid-cols-1 gap-4 min-[860px]:grid-cols-2">
              <Field label="본사주소" required error={errors.address?.message} dirty={!!dirtyFields.address}>
                <input {...register("address")} className={inputCls(!!dirtyFields.address)} />
              </Field>
              <div className="flex flex-col gap-1.5">
                <Field
                  label="설치주소"
                  hint="장비를 설치·운영하는 주소(본사와 다르면 입력)"
                  error={errors.address_actual1?.message}
                  dirty={!!dirtyFields.address_actual1}
                >
                  <input
                    {...register("address_actual1")}
                    disabled={sameAsHq}
                    className={`${inputCls(!!dirtyFields.address_actual1)} disabled:opacity-60`}
                  />
                </Field>
                <label className="flex items-center gap-1.5 text-small text-muted">
                  <input
                    type="checkbox"
                    checked={sameAsHq}
                    onChange={(e) => setSameAsHq(e.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  설치주소가 본사주소와 동일
                </label>
              </div>
              <Field label="주소2" error={errors.address_actual2?.message} dirty={!!dirtyFields.address_actual2}>
                <input {...register("address_actual2")} className={inputCls(!!dirtyFields.address_actual2)} />
              </Field>
              <div className="grid grid-cols-1 gap-4 min-[860px]:grid-cols-2">
                <Field
                  label="업태"
                  hint="쉼표로 구분해 여러 개 입력"
                  error={errors.biz_type?.message}
                  dirty={!!dirtyFields.biz_type}
                >
                  <input {...register("biz_type")} placeholder="제조, 도매" className={inputCls(!!dirtyFields.biz_type)} />
                </Field>
                <Field label="업종(종목)" error={errors.biz_item?.message} dirty={!!dirtyFields.biz_item}>
                  <input {...register("biz_item")} className={inputCls(!!dirtyFields.biz_item)} />
                </Field>
              </div>
            </div>
          </FormSectionCard>

          {/* 4) 장부·회계 — 전체 폭 */}
          <FormSectionCard title="장부·회계" purpose="구 시스템(회계 프로그램) 대조" fullSpan>
            <div className="grid grid-cols-1 gap-4 min-[860px]:grid-cols-2">
              <Field label="장부명" error={errors.ledger_name?.message} dirty={!!dirtyFields.ledger_name}>
                <input {...register("ledger_name")} className={inputCls(!!dirtyFields.ledger_name)} />
              </Field>
              {props.mode === "edit" && (
                <Field label="장부번호(구 시스템)" hint="이관 대조키 — 편집 불가">
                  <input
                    value={props.ledgerNo != null ? String(props.ledgerNo) : "미입력"}
                    readOnly
                    disabled
                    className={`${INPUT_BASE} border-border font-mono tabular-nums opacity-60`}
                  />
                </Field>
              )}
            </div>
          </FormSectionCard>

          {/* 메모 — 전체 폭 */}
          <FormSectionCard title="메모" fullSpan>
            <Field label="메모" error={errors.note?.message} dirty={!!dirtyFields.note} hideLabel>
              <textarea {...register("note")} rows={3} className={inputCls(!!dirtyFields.note)} />
            </Field>
          </FormSectionCard>

          {/* 보유장비 — 전체 폭(기존 에디터 유지) */}
          <div className="min-[860px]:col-span-2 rounded-xl border border-border bg-surface p-4 shadow-card">
            <CompanyEquipmentEditor
              control={control}
              register={register}
              setValue={setValue}
              catalog={props.catalog}
            />
          </div>
        </div>

        {serverError ? <p className="text-small text-danger">{serverError}</p> : null}

        <StickyFormFooter
          dirtyLabels={dirtyLabels}
          pending={pending}
          saveLabel={props.mode === "edit" ? "변경사항 저장" : "저장"}
          onCancel={() => { reset(); setSameAsHq(initialSameAsHq); }}
          alwaysEnabled={props.mode === "create"}
          blocked={!!dupHit}
        />
      </form>
    </div>
  );
}

// 필드 한 칸 — label 래핑(암시적 연결), hint, 에러 role=alert, 필수 * 빨강.
function Field({
  label,
  required,
  hint,
  error,
  dirty,
  hideLabel,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  dirty?: boolean;
  hideLabel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={`text-small ${dirty ? "font-bold text-accent-2" : "text-muted"} ${hideLabel ? "sr-only" : ""}`}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {hint && !error ? <span className="text-micro text-muted/80">{hint}</span> : null}
      {error ? (
        <span role="alert" className="text-micro text-danger">
          {error}
        </span>
      ) : null}
    </label>
  );
}
