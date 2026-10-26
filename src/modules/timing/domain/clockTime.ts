const pad = (n: number) => String(n).padStart(2, '0');

// The wall-clock time of a series event for display only, for example "7:14:02": 24 h, unpadded hour, to the nearest second.
export function formatClockTime(epochMs: number): string {
  const date = new Date(Math.round(epochMs / 1000) * 1000);
  return `${date.getHours()}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// When an arrival happened: the wall-clock start of the series plus its time on the shared clock (hundredths of a second).
export const arrivalClockTime = (startedAtMs: number, hundredths: number): string => formatClockTime(startedAtMs + hundredths * 10);
