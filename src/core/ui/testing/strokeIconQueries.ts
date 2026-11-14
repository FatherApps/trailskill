import { screen } from '@testing-library/react-native';

// Shared by the tests that look for a StrokeIcon in the rendered tree (StrokeIcon, SwimmerRow, RecordTable): one copy, so
// a change to a glyph breaks one place. Test-only: nothing in the app imports this file.
type Node = ReturnType<typeof screen.getByText>;

export const svgs = (): Node[] => screen.container.queryAll((node) => node.type === 'RNSVGSvgView');
export const pathData = () => screen.container.queryAll((node) => node.type === 'RNSVGPath').map((node) => node.props.d as string);

// One path that only that stroke draws.
export const signature: Record<string, string> = {
  FR: 'M12 17c2-7 8-10 13-6',
  BK: 'M20 18.5 17 5',
  BR: 'M13 19c-3-2-6-1.5-8 1M19 19c3-2 6-1.5 8 1',
  FL: 'M13.5 17C10.5 6 4.5 4 3 11M18.5 17C21.5 6 27.5 4 29 11',
};

// The icon's own box is the Svg's parent (hidden from screen readers when decorative).
export const box = (svg: Node): Node => svg.parent!;
// The slot that holds the icon next to the name: the box's parent. Its siblings are the name.
export const slot = (svg: Node): Node => box(svg).parent!;
// The group of the icon slot and the name.
export const group = (svg: Node): Node => slot(svg).parent!;
