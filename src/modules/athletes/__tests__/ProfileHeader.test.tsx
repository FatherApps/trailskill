import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, type ThemeName } from '../../../core/theme';
import { profileFixture as p } from '../__fixtures__/profile';
import { ProfileHeader, profileHeaderColors, type ProfileHeaderProps } from '../components/ProfileHeader';

const themes: ThemeName[] = ['light', 'dark'];

const base: ProfileHeaderProps = {
  name: p.name,
  category: p.category,
  schools: p.schools.slice(0, 1),
  schoolId: 'delfines',
  authorization: 'valid',
  updatedMinutesAgo: 5,
};

describe('ProfileHeader', () => {
  it('shows the name as a header and the category with the school', async () => {
    await render(<ProfileHeader {...base} />);

    expect(screen.getByRole('header', { name: 'Lucía R.' })).toBeOnTheScreen();
    expect(screen.getByText('Infantil B · Escuela Delfines')).toBeOnTheScreen();
  });

  it('shows the category alone when the school is not in the list', async () => {
    await render(<ProfileHeader {...base} schoolId="other" />);

    expect(screen.getByText('Infantil B')).toBeOnTheScreen();
  });

  it('says the authorization is valid or pending', async () => {
    await render(<ProfileHeader {...base} />);
    expect(screen.getByLabelText('Autorización vigente')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Autorización pendiente')).toBeNull();

    await render(<ProfileHeader {...base} authorization="pending" />);
    expect(screen.getByLabelText('Autorización pendiente')).toBeOnTheScreen();
  });

  it.each([
    [5, 'Actualizado hace 5 min'],
    [1, 'Actualizado hace 1 min'],
    [0, 'Actualizado hace un momento'],
  ])('says %s minutes ago as "%s"', async (minutes, text) => {
    await render(<ProfileHeader {...base} updatedMinutesAgo={minutes} />);

    expect(screen.getByText(text)).toBeOnTheScreen();
  });

  it('says nothing about the update when it is unknown', async () => {
    await render(<ProfileHeader {...base} updatedMinutesAgo={null} />);

    expect(screen.queryByText(/Actualizado/)).toBeNull();
  });

  it('lays the tag and the update time out in a wrapping row', async () => {
    await render(<ProfileHeader {...base} />);

    const row = screen.getByText('Actualizado hace 5 min').parent!;
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
    });
  });

  it('has no school selector with a single school', async () => {
    await render(<ProfileHeader {...base} />);

    expect(screen.queryByLabelText('Escuela')).toBeNull();
  });

  it('chooses the school with a selector when there are several', async () => {
    const onSchoolChange = jest.fn();
    await render(<ProfileHeader {...base} schools={p.schools} onSchoolChange={onSchoolChange} />);

    expect(screen.getByLabelText('Escuela')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Escuela Delfines' })).toBeChecked();

    await fireEvent.press(screen.getByRole('radio', { name: 'Club Acuático Norte' }));

    expect(onSchoolChange).toHaveBeenCalledWith('norte');
  });

  it('does not fail when a school is chosen without a handler', async () => {
    await render(<ProfileHeader {...base} schools={p.schools} />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Club Acuático Norte' }));
  });

  it('shows the subtitle of the current school', async () => {
    await render(<ProfileHeader {...base} schools={p.schools} schoolId="norte" />);

    expect(screen.getByText('Infantil B · Club Acuático Norte')).toBeOnTheScreen();
  });

  it('shows no document number or birth date', async () => {
    await render(<ProfileHeader {...base} schools={p.schools} />);

    const rendered = screen
      .queryAllByText(/./, { includeHiddenElements: true })
      .map((node) => node.props.children)
      .join(' ');
    expect(rendered).not.toMatch(/\d{6,}/);
    expect(rendered).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it.each([
      [profileHeaderColors.title, profileHeaderColors.background],
      [profileHeaderColors.subtitle, profileHeaderColors.background],
      [profileHeaderColors.updated, profileHeaderColors.background],
    ] as const)('%s on %s is at least 4.5:1', (text, background) => {
      expect(contrastRatio(c[text], c[background])).toBeGreaterThanOrEqual(4.5);
    });
  });
});
