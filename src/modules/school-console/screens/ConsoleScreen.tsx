import { useState, type ReactNode } from 'react';

import { consoleDestinations, type ConsoleDestinationId } from '../components/ConsoleNav';
import { EmptySectionScreen } from './EmptySectionScreen';

export type ConsoleSectionProps = {
  width: number;
  schoolName: string;
  onNavigate: (id: ConsoleDestinationId) => void;
};

export type ConsoleScreenProps = {
  // The width available to the console in dp: the caller measures it (window or preview).
  width: number;
  schoolName: string;
  // The screen of each destination; one without an entry shows its title only.
  sections?: Partial<Record<ConsoleDestinationId, (props: ConsoleSectionProps) => ReactNode>>;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
  // "Planes" is not a section: it opens the plan routes that already exist and leaves the active section as it is.
  onOpenPlans?: () => void;
  // The section to open first, as a plan route asks for it in the URL. Anything that is not a destination is ignored.
  initialSection?: string;
};

// Holds the active section above the layout, so it survives a change of width (rotation, split screen).
const isSection = (id: string | undefined): id is ConsoleDestinationId =>
  id !== undefined && id !== 'plans' && consoleDestinations.some((destination) => destination.id === id);

export function ConsoleScreen({ width, schoolName, sections, scrollEnabled, onOpenPlans, initialSection }: ConsoleScreenProps) {
  const [activeId, setActiveId] = useState<ConsoleDestinationId>(isSection(initialSection) ? initialSection : 'athletes');
  const navigate = (id: ConsoleDestinationId) => (id === 'plans' ? onOpenPlans?.() : setActiveId(id));
  const render = sections?.[activeId];
  return render ? (
    render({ width, schoolName, onNavigate: navigate })
  ) : (
    <EmptySectionScreen
      width={width}
      schoolName={schoolName}
      sectionId={activeId}
      onNavigate={navigate}
      scrollEnabled={scrollEnabled}
    />
  );
}
