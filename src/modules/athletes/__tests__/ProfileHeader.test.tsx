import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { colors, radius, size, space } from '../../../core/theme';
import { profileFixture as p } from '../__fixtures__/profile';
import { ProfileHeader, profileHeaderColors, type ProfileHeaderProps } from '../components/ProfileHeader';

const base: ProfileHeaderProps = {
  name: p.name,
  category: p.category,
  schools: p.schools.slice(0, 1),
  schoolId: 'delfines',
  authorization: 'valid',
  updatedMinutesAgo: 5,
  onBack: jest.fn(),
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

  it("paints the band with the athlete's colour", async () => {
    await render(<ProfileHeader {...base} color="athlete-2" />);

    const band = screen.getByRole('header', { name: 'Lucía R.' }).parent!;
    expect(StyleSheet.flatten(band.props.style).backgroundColor).toBe(colors.light['athlete-2']);
  });

  it('has a round back button named "Volver" that calls onBack', async () => {
    const onBack = jest.fn();
    await render(<ProfileHeader {...base} onBack={onBack} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('cannot show a back button without a destination: onBack is required', () => {
    const { onBack, ...withoutBack } = base;
    // @ts-expect-error a header without onBack would show a "Volver" that does nothing
    const element = <ProfileHeader {...withoutBack} />;

    expect(onBack).toBeDefined();
    expect(element).toBeDefined();
  });

  it('says the authorization is valid or pending, in text', async () => {
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
  ])('says %s minutes ago as "%s" in a sync tag', async (minutes, text) => {
    await render(<ProfileHeader {...base} updatedMinutesAgo={minutes} />);

    expect(screen.getByLabelText(text)).toBeOnTheScreen();
  });

  it('says nothing about the update when it is unknown', async () => {
    await render(<ProfileHeader {...base} updatedMinutesAgo={null} />);

    expect(screen.queryByLabelText(/Actualizado/)).toBeNull();
  });

  it('draws the decorative ring with the nearest opaque token, hidden from screen readers', async () => {
    await render(<ProfileHeader {...base} />);

    const hidden = { includeHiddenElements: true };
    const clip = screen.getByTestId('profile-ring-clip', hidden);
    const ring = screen.getByTestId('profile-ring', hidden);
    expect(profileHeaderColors.ring).toBe('surface-1');
    expect(StyleSheet.flatten(ring.props.style)).toMatchObject({
      borderColor: colors.light['surface-1'],
      borderWidth: space[5],
      borderRadius: radius.full,
      width: 170,
      height: 170,
    });
    expect(clip.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(clip.props.accessibilityElementsHidden).toBe(true);
    expect(clip.props.pointerEvents).toBe('none');
  });

  it('clips the ring to the top strip of the band, so it never takes layout nor covers the name', async () => {
    await render(<ProfileHeader {...base} />);

    const clip = StyleSheet.flatten(screen.getByTestId('profile-ring-clip', { includeHiddenElements: true }).props.style);
    // Absolute, hiding what falls outside, and no taller than the back-button row (the title starts below it).
    expect(clip).toMatchObject({ position: 'absolute', overflow: 'hidden', top: 0, right: 0 });
    expect(clip.height).toBeLessThanOrEqual(space[4] + size['target-min'] + space[3]);
  });

  it('shows what the screen puts in the band, such as the event chips', async () => {
    await render(
      <ProfileHeader {...base}>
        <Text>Selector de prueba</Text>
      </ProfileHeader>,
    );

    expect(screen.getByText('Selector de prueba')).toBeOnTheScreen();
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
});
