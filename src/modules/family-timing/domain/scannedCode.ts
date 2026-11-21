// What a scanned QR may fill into the share-code field (issue 1322): a swimmer's code, "TS-" and six characters without the ones
// that read alike (0 O 1 I L), as the server makes them. Anything else (a link, a name, a code of another app) is refused here
// and never opened; the server still decides whether the code exists.
const SHARE_CODE = /^TS-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/** The share code in a scanned QR, or null when its content is not the shape of one. */
export function shareCodeFromQr(data: string): string | null {
  const code = data.trim().toUpperCase();
  return SHARE_CODE.test(code) ? code : null;
}
