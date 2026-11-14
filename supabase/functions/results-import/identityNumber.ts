/** Spaces, dots and hyphens dropped, letters upper-cased, 20 alphanumerics at most: values are not always digits only. */
export function normalizeNumber(raw: string): string {
  const key = raw.replace(/[\s.-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{1,20}$/.test(key)) throw new Error('Unexpected number');
  return key;
}

/**
 * Whether a result key would carry the identity number: some `|` segment of the key, normalized, is the number. A number inside
 * a longer id is fine; a segment that does not normalize is not a match. A number that does not normalize cannot be checked, so
 * it fails closed.
 */
export function keyHasNumber(sourceResultKey: string, identityNumber: string): boolean {
  let wanted: string;
  try {
    wanted = normalizeNumber(identityNumber);
  } catch {
    return true;
  }
  return sourceResultKey.split('|').some((segment) => {
    try {
      return normalizeNumber(segment) === wanted;
    } catch {
      return false;
    }
  });
}
