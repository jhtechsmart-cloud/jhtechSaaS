// 전화번호 표시용 포맷 — 한국 번호 규칙. 저장은 자유 텍스트(정규화 안 함), 표시만 대시 삽입.
// 인식 못 하는 형태는 원본 그대로 반환(강제 변형 안 함). biz_no formatBizNo와 동일 UX.
export function formatPhone(input: string): string {
  const d = input.replace(/\D/g, "");
  if (d.length === 0) return input;
  // 서울 02 (지역번호 2자리)
  if (d.startsWith("02")) {
    if (d.length === 10) return `02-${d.slice(2, 6)}-${d.slice(6)}`; // 02-XXXX-XXXX
    if (d.length === 9) return `02-${d.slice(2, 5)}-${d.slice(5)}`; // 02-XXX-XXXX
    return input;
  }
  // 대표번호 15xx/16xx/18xx (8자리): 1588-1234
  if (/^1[5-9]\d{2}$/.test(d.slice(0, 4)) && d.length === 8) {
    return `${d.slice(0, 4)}-${d.slice(4)}`;
  }
  // 휴대폰(010 등) 11자리: 010-XXXX-XXXX
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  // 휴대폰 구번호/지역번호(0XX) 10자리: 0XX-XXX-XXXX
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return input;
}
