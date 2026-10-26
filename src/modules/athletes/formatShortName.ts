// The single way to show an athlete's name on a pool screen: "Lucía R.". A missing last name leaves the first name alone.
export function formatShortName(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const surname = lastName.trim().split(/\s+/)[0] ?? '';
  return surname ? `${first} ${surname.charAt(0).toUpperCase()}.` : first;
}
