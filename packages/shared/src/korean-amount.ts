// 숫자 → 한글 금액(예: 75000000 → "칠천오백만"). 견적서 "일금 ○○원정"에 사용.
// 정수만 가정(원 단위). 음수·소수는 호출측에서 정수화.

const DIGITS = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SMALL_UNITS = ["", "십", "백", "천"]; // 4자리 블록 내 자리 단위
const BIG_UNITS = ["", "만", "억", "조", "경"]; // 4자리 블록 단위

// 4자리(0~9999) 블록을 한글로. 0이면 빈 문자열.
function readBlock(n: number): string {
  let out = "";
  for (let pos = 3; pos >= 0; pos--) {
    const d = Math.floor(n / 10 ** pos) % 10;
    if (d === 0) continue;
    // '일십','일백','일천'에서 앞 '일' 생략 관례는 양식 가독상 유지(일천이백…) → 생략 안 함.
    out += DIGITS[d] + SMALL_UNITS[pos];
  }
  return out;
}

export function numberToKoreanAmount(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "영";
  const blocks: string[] = [];
  let rest = n;
  let unitIdx = 0;
  while (rest > 0) {
    const block = rest % 10000;
    if (block > 0) blocks.unshift(readBlock(block) + BIG_UNITS[unitIdx]);
    rest = Math.floor(rest / 10000);
    unitIdx++;
  }
  return blocks.join("");
}
