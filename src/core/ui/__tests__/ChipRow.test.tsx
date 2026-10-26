import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../theme';
import { ChipRow } from '../ChipRow';

const options = [
  { value: 'lucia', label: 'Lucía', dot: { initials: 'LR', color: 'athlete-1' as const } },
  { value: 'tomas', label: 'Tomás', dot: { initials: 'TR', color: 'athlete-2' as const } },
  { value: 'sara', label: 'Sara' },
];

async function renderRow(value = 'lucia') {
  const onChange = jest.fn();
  await render(
    <ThemeProvider>
      <ChipRow accessibilityLabel="Deportista" options={options} value={value} onChange={onChange} />
    </ThemeProvider>,
  );
  return onChange;
}

describe('ChipRow', () => {
  it('is a labelled radio group with one radio per option', async () => {
    await renderRow();

    const groups = screen.container.queryAll((node) => node.props.accessibilityRole === 'radiogroup');
    expect(groups).toHaveLength(1);
    expect(groups[0].props.accessibilityLabel).toBe('Deportista');
    expect(groups[0].props.accessible).not.toBe(true);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('marks only the chosen option as selected', async () => {
    await renderRow('tomas');

    expect(screen.getAllByRole('radio', { selected: true })).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Tomás' })).toBeSelected();
  });

  it('calls onChange with the value of the pressed chip', async () => {
    const onChange = await renderRow();

    await fireEvent.press(screen.getByRole('radio', { name: 'Sara' }));

    expect(onChange).toHaveBeenCalledWith('sara');
  });

  it('scrolls horizontally when the chips do not fit', async () => {
    await renderRow();

    const scroller = screen.container.queryAll((node) => node.type === 'RCTScrollView')[0];
    expect(scroller.props.horizontal).toBe(true);
  });
});
