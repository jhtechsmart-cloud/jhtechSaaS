// 사업자등록번호 체크섬 — 국세청 공식 가중치 알고리즘. 클라(zod refine)·서버(RPC)가 공유하는 순수함수.
// 알고리즘: 가중치 [1,3,7,1,3,7,1,3,5]를 앞 9자리에 곱해 합 → + floor(d9*5/10) →
// (10 - (합 % 10)) % 10 == d10 이면 유효.
const WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5];

export function validateBizNo(input: string): boolean {
  const d = input.replace(/-/g, "");
  if (!/^\d{10}$/.test(d)) return false;
  const digits = d.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * WEIGHTS[i];
  sum += Math.floor((digits[8] * 5) / 10);
  const check = (10 - (sum % 10)) % 10;
  return check === digits[9];
}
