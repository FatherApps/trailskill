// How the history tests find a row and what is around it. They live here, not in __tests__, so Jest does not run them.

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The accessibility label of the row titled `title`: the title, then a comma. "Libre 50 m" does not take a row
// titled "Libre 50 m espalda".
export const rowLabel = (title: string) => new RegExp(`^${escapeRegExp(title)}, `);

// The node or its nearest ancestor that satisfies `matches`, however deep it is nested.
export const closest = <T extends { parent: T | null }>(node: T, matches: (node: T) => boolean): T | undefined => {
  for (let current: T | null = node; current; current = current.parent) {
    if (matches(current)) return current;
  }
  return undefined;
};
