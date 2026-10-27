// How the history tests find a row and what is around it. They live here, not in __tests__, so Jest does not run them.
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The accessibility label of the row titled `title`: the title, then whatever separates it from the next part of the
// label. "Libre 50 m" does not take a row titled "Libre 50 m espalda", whatever the separator is: after the title come
// a punctuation mark, or a space and then a punctuation mark. A label with nothing after the title is not a row's (the
// event selector's "Libre 50 m" chip is one).
// shortcut: a separator that is only a space, or a letter or a digit, is not told apart from a longer title; the
// builder joins with a comma, so upgrade this if it ever does.
export const rowLabel = (title: string) => new RegExp(`^${escapeRegExp(title)}(?=[^\\p{L}\\p{N}\\s]|\\s+[^\\p{L}\\p{N}\\s])`, 'u');

// The label of any row whose title starts with `title`, a longer title that extends it included. For asserting that
// no such row is shown: `rowLabel` would let a row titled "Libre 50 m espalda" through.
export const rowTitleStartingWith = (title: string) => new RegExp(`^${escapeRegExp(title)}`);

// The node or its nearest ancestor that satisfies `matches`, however deep it is nested.
export const closest = <T extends { parent: T | null }>(node: T, matches: (node: T) => boolean): T | undefined => {
  for (let current: T | null = node; current; current = current.parent) {
    if (matches(current)) return current;
  }
  return undefined;
};

type Styled = { props: { style?: StyleProp<ViewStyle> }; parent: Styled | null };

// The horizontal margin of the card around a row: the row's nearest ancestor drawn as a card, which is the one with a
// background. Not the nearest ancestor with a margin, which could be a wrapper that is not the card. Undefined when
// there is no card or it has no margin, so the assertion that reads it fails on its own value.
export const marginOfCard = (row: Styled) =>
  StyleSheet.flatten(closest(row, (node) => StyleSheet.flatten(node.props.style)?.backgroundColor !== undefined)?.props.style)
    ?.marginHorizontal;
