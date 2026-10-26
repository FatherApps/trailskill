// 2000 -> "2.000", 12.5 -> "12,5" (es-CO). 'always' keeps the separator on four-digit numbers, which Spanish drops by default.
const numberFormat = new Intl.NumberFormat('es-CO', { useGrouping: 'always' } as Intl.NumberFormatOptions);

export const formatNumber = (value: number): string => numberFormat.format(value);
