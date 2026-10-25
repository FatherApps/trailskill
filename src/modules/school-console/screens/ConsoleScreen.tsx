import { useState, type ReactNode } from 'react';

import type { ConsoleDestinationId } from '../components/ConsoleNav';
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
};

// Holds the active section above the layout, so it survives a change of width (rotation, split screen).
export function ConsoleScreen({ width, schoolName, sections, scrollEnabled }: ConsoleScreenProps) {
  const [activeId, setActiveId] = useState<ConsoleDestinationId>('athletes');
  const render = sections?.[activeId];
  return render ? (
    render({ width, schoolName, onNavigate: setActiveId })
  ) : (
    <EmptySectionScreen
      width={width}
      schoolName={schoolName}
      sectionId={activeId}
      onNavigate={setActiveId}
      scrollEnabled={scrollEnabled}
    />
  );
}
