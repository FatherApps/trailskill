import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

import { useTheme } from '../../../core/theme';
import { ConsoleLayout } from '../components/ConsoleLayout';
import type { ConsoleDestinationId } from '../components/ConsoleNav';
import { useAdminSchool } from '../data/useAdminSchool';
import type { StaffSchoolRepository } from '../data/staffSchools';

export type ConsoleFrameProps = {
  schools: StaffSchoolRepository;
  userId: string | undefined;
  // The console destination the wrapped screens belong to, shown as active.
  activeId: ConsoleDestinationId;
  onNavigate: (id: ConsoleDestinationId) => void;
  // The screens of a route that lives outside the console sections: they scroll on their own.
  children: ReactNode;
};

// Keeps the console navigation around the screens of a route that is not a console section (the plans), so an admin on a tablet
// can still move to the other sections. Everyone else (a coach, a guardian, an admin on a phone) gets the screens as they are.
export function ConsoleFrame({ schools, userId, activeId, onNavigate, children }: ConsoleFrameProps) {
  const { width } = useWindowDimensions();
  const { breakpoint } = useTheme();
  const access = useAdminSchool(schools, userId);

  // Nothing is drawn until the lookup answers, so the screens do not mount bare and again inside the layout.
  if (access.status === 'loading') return null;
  if (access.status !== 'admin' || width < breakpoint['bp-medium']) return <>{children}</>;
  return (
    <ConsoleLayout width={width} schoolName={access.school.name} activeId={activeId} onSelect={onNavigate} childrenScroll>
      {children}
    </ConsoleLayout>
  );
}
