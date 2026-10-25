// Seconds as m:ss, for example 90 -> "1:30".
export function formatSendOff(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
