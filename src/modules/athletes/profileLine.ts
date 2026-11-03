// The line under the profile's title (category, then school); a part the device does not know is left out.
export const profileLine = (category: string, schoolName?: string) => [category, schoolName].filter(Boolean).join(' · ');

// The line each account saw the last time it read an athlete's profile on this device, in memory only. It lets the band show the line
// (or know there is none) from the first frame when the profile opens again. Empty string = the athlete has no category or school.
// Keyed by account and athlete: on a shared phone another account opening the same athlete id must not see what the first one read.
const lines = new Map<string, string>();
const keyOf = (userId: string, athleteId: string) => `${userId}|${athleteId}`;

export const rememberedProfileLine = (userId: string, athleteId: string): string | undefined => lines.get(keyOf(userId, athleteId));
export const rememberProfileLine = (userId: string, athleteId: string, line: string) => void lines.set(keyOf(userId, athleteId), line);
export const forgetProfileLines = () => lines.clear();
