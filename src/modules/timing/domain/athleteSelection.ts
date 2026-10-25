// The athletes of a session are chosen one by one: the order of choosing is the order of timing.
export const toggleAthlete = (selectedIds: string[], id: string) =>
  selectedIds.includes(id) ? selectedIds.filter((selected) => selected !== id) : [...selectedIds, id];

// The athletes of the list in the order they were chosen; an id that is not in the list is ignored.
export const orderedSelection = <T extends { id: string }>(athletes: T[], selectedIds: string[]) =>
  selectedIds.flatMap((id) => athletes.find((athlete) => athlete.id === id) ?? []);
