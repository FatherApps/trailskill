// The line under the profile's title (category, then school); a part the device does not know is left out.
export const profileLine = (category: string, schoolName?: string) => [category, schoolName].filter(Boolean).join(' · ');

// The line each athlete showed the last time their profile was read on this device, in memory only. It lets the band show the line
// (or know there is none) from the first frame when the profile opens again. Empty string = the athlete has no category or school.
const lines = new Map<string, string>();

export const rememberedProfileLine = (athleteId: string): string | undefined => lines.get(athleteId);
export const rememberProfileLine = (athleteId: string, line: string) => void lines.set(athleteId, line);
export const forgetProfileLines = () => lines.clear();
