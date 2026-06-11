#!/usr/bin/env python3
"""거래처 엑셀(.xls, 회계 프로그램 내보내기) → JSON 변환기.

임포트 스크립트(apps/worker/src/import-customers.ts)의 입력을 만든다.
구형 .xls(코드페이지 949)는 npm 쪽 파서가 취약점 이슈가 있어 파이썬 xlrd로 1회 변환한다.

사용법:
  python3 scripts/xls-to-json.py "<엑셀경로.xls>" /tmp/customers.json
필요: pip install xlrd (이 머신엔 설치돼 있음)
⚠️ 출력 JSON은 고객 개인정보 — repo에 커밋 금지(/tmp 등 외부 경로 사용).
"""
import json
import sys

import xlrd


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    wb = xlrd.open_workbook(src)
    sh = wb.sheet_by_index(0)
    hdr = [str(sh.cell_value(0, c)).strip() for c in range(sh.ncols)]
    rows = [
        {hdr[c]: str(sh.cell_value(r, c)) for c in range(sh.ncols)}
        for r in range(1, sh.nrows)
    ]
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False)
    print(f"{len(rows)}행 → {dst}")


if __name__ == "__main__":
    main()
