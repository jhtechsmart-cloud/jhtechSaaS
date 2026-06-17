// 경로가 의뢰 "상세"(목록 루트 제외)인지 판정한다.
// /admin/applications/<id> 및 그 하위(예: /release-order)면 상세.
export function isApplicationDetailPath(pathname: string): boolean {
  const m = pathname.match(/^\/admin\/applications\/([^/]+)/);
  return m != null && m[1].length > 0;
}
