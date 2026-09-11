import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { PNG, ServiceReportSeed } from "./_service-report-test-seed";

// 통합 테스트 — 로컬 Supabase + 크롬 없이(렌더 스텁) PDF 잡의 세대 가드·직인 원본 읽기·불변 경로·CAS 기록(#285 D-C8).
vi.mock("./render-service-report-pdf", () => ({
  buildServiceReportPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));
vi.mock("./assets", () => ({ getFontDataUri: vi.fn(async () => "data:font/otf;base64,FONT") }));

import { buildServiceReportPdf } from "./render-service-report-pdf";
import { processServiceReportPdfJob } from "./service-report-pdf";

const seed = new ServiceReportSeed("PDF_WORKER_E2E_결재상사", 8000000000);
const { supabase } = seed;
const EMAILS = ["pdf-eng@jhtech.test", "pdf-dir@jhtech.test"];
let ENG = "";
let DIR = "";
let STAMP = "";

const lastRender = () => vi.mocked(buildServiceReportPdf).mock.calls.at(-1)?.[0];
const renderCount = () => vi.mocked(buildServiceReportPdf).mock.calls.length;
const job = (id: string, revision: number, expected: string) =>
  processServiceReportPdfJob(supabase, { service_report_id: id, revision, expected_status: expected });

describe("service_report_pdf 잡(통합) — 세대 가드·직인·CAS", () => {
  beforeAll(async () => {
    await seed.connect();
    await seed.purgeUsers(EMAILS);
    await seed.cleanup();
    ENG = await seed.createUser(EMAILS[0]!);
    DIR = await seed.createUser(EMAILS[1]!);
    STAMP = `${DIR}/stamp-1757400000.png`;
    await seed.pg.query("update public.profiles set name='홍기사' where id=$1", [ENG]);
    await seed.pg.query("update public.profiles set name='배이사', position='영업부 이사', approval_stamp_path=$2 where id=$1", [DIR, STAMP]);
    const up = await supabase.storage.from("approval-stamps").upload(STAMP, PNG, { contentType: "image/png", upsert: true });
    if (up.error) throw new Error(up.error.message);
  });
  afterAll(async () => {
    await supabase.storage.from("approval-stamps").remove([STAMP]);
    await seed.cleanup();
    await seed.end();
  });

  test("issued r1: 기사 서명 인라인·직인 없음 → report-r1.pdf 업로드 + pdf_url CAS 기록", async () => {
    const id = await seed.seedIssued({ createdBy: ENG });
    await job(id, 1, "issued");
    expect((await seed.row(id)).pdf_url).toBe(`${id}/report-r1.pdf`);
    expect(await seed.objectExists(`${id}/report-r1.pdf`)).toBe(true);
    const data = lastRender()!;
    expect(data.engineerSignatureDataUri).toMatch(/^data:image\/png;base64,/);
    expect(data.approval).toBeUndefined();
  });

  test("승인 후 r2: 직인은 approval-stamps 원본을 직접 읽어 인라인(리포트 폴더에 복사본 없음), report-r2.pdf, r1 파일은 그대로", async () => {
    const id = await seed.seedIssued({ createdBy: ENG });
    await job(id, 1, "issued");
    await seed.approve(id, DIR, STAMP);
    expect((await seed.row(id)).pdf_url).toBeNull(); // 트리거가 승인 전이 시 리셋
    await job(id, 2, "approved");
    expect(await seed.row(id)).toEqual({ status: "approved", pdf_revision: 2, pdf_url: `${id}/report-r2.pdf` });
    expect(await seed.objectExists(`${id}/report-r1.pdf`)).toBe(true);
    // 직인 원본은 일반 열람자에게 노출되면 안 되므로 리포트 폴더로 복사하지 않는다(리뷰 3소스 공통 지적)
    const { data: objs } = await supabase.storage.from("service-reports").list(id);
    expect((objs ?? []).map((o) => o.name).filter((n) => n.startsWith("approval-stamp"))).toEqual([]);
    const data = lastRender()!;
    expect(data.approval?.name).toBe("배이사");
    expect(data.approval?.title).toBe("영업부 이사");
    expect(data.approval?.stampDataUri).toMatch(/^data:image\/png;base64,/);
  });

  test("stale 잡(r1)이 승인(r2) 뒤에 돌면 렌더 없이 폐기 — 최신본을 덮지 않는다", async () => {
    const id = await seed.seedIssued({ createdBy: ENG });
    await seed.approve(id, DIR, STAMP);
    const before = renderCount();
    await job(id, 1, "issued");
    expect(renderCount()).toBe(before);
    expect((await seed.row(id)).pdf_url).toBeNull();
    expect(await seed.objectExists(`${id}/report-r1.pdf`)).toBe(false);
  });

  test("렌더 도중 전이(무효화)되면 CAS 0행 → pdf_url 미기록 + 올린 PDF 삭제(고아 파일 없음)", async () => {
    const id = await seed.seedIssued({ createdBy: ENG });
    vi.mocked(buildServiceReportPdf).mockImplementationOnce(async () => {
      await seed.void(id, DIR);
      return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    });
    await job(id, 1, "issued");
    expect(await seed.row(id)).toMatchObject({ status: "voided", pdf_url: null });
    expect(await seed.objectExists(`${id}/report-r1.pdf`)).toBe(false);
  });

  test("같은 잡 2회(중복) — 두 번째는 pdf_url 있음으로 폐기, 렌더 1회", async () => {
    const id = await seed.seedIssued({ createdBy: ENG });
    await job(id, 1, "issued");
    const before = renderCount();
    await job(id, 1, "issued");
    expect(renderCount()).toBe(before);
  });

  test("기사 서명 없는 기존 발행본: engineerSignatureDataUri 없이 렌더(이름 폴백)", async () => {
    const id = await seed.seedIssued({ createdBy: ENG, engineerSig: false });
    await job(id, 1, "issued");
    expect(lastRender()!.engineerSignatureDataUri).toBeUndefined();
    expect((await seed.row(id)).pdf_url).toBe(`${id}/report-r1.pdf`);
  });

  test("승인본인데 직인 원본이 스토리지에 없으면 throw(재시도 → failed 표면화), pdf_url 미기록", async () => {
    const id = await seed.seedIssued({ createdBy: ENG });
    await seed.approve(id, DIR, `${DIR}/stamp-9999.png`);
    await expect(job(id, 2, "approved")).rejects.toThrow(/approval-stamps/);
    expect((await seed.row(id)).pdf_url).toBeNull();
  });

  test("과거 이력 표: 같은 장비의 approved 리포트는 포함, voided는 제외", async () => {
    // 보유장비 1대에 리포트 3건: 승인본(이력 O)·무효본(이력 X)·본 건
    const eqId = await seed.createEquipment();
    const prevOk = await seed.seedIssued({ createdBy: ENG, companyEquipmentId: eqId });
    const prevVoid = await seed.seedIssued({ createdBy: ENG, companyEquipmentId: eqId });
    const cur = await seed.seedIssued({ createdBy: ENG, companyEquipmentId: eqId });
    await seed.approve(prevOk, DIR, STAMP);
    await seed.void(prevVoid, DIR);
    await job(cur, 1, "issued");
    expect(lastRender()!.history).toHaveLength(1);
  });
});
