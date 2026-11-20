// 발송 기록(email_log) → 화면 표시용 상태.
// status='sent'여도 simulated=true면 워커가 가짜 발송기(하이웍스 토큰 미설정)로 처리한 것 → 실제 메일은 나가지 않았다.
// 화면에는 'simulated'로 구분해 "미발송(테스트 모드)"로 보여준다(DB status 상태기계는 그대로).
export function displayMailStatus(status: string, simulated: boolean | null | undefined): string {
  return status === "sent" && simulated === true ? "simulated" : status;
}
