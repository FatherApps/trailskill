import { useCategories } from '../data/useCategories';
import type { CategoriesRepository } from '../data/categories';
import { CategoriesScreen } from './CategoriesScreen';
import type { ConsoleSectionProps } from './ConsoleScreen';

export type CategoriesSectionProps = ConsoleSectionProps & {
  repository: CategoriesRepository;
  schoolId: string;
  // Changes when a sync completes, so the list looks again.
  refreshKey?: unknown;
  // Set to false when a parent ScrollView scrolls instead (the development gallery).
  scrollEnabled?: boolean;
};

// The categories section of the console: the screen over the repository of the school.
export function CategoriesSection({ repository, schoolId, refreshKey, ...section }: CategoriesSectionProps) {
  const { content, reload, create, rename, move, setActive } = useCategories(repository, schoolId, refreshKey);
  return (
    <CategoriesScreen
      {...section}
      content={content}
      onRetry={reload}
      onCreate={create}
      onRename={rename}
      onMove={move}
      onSetActive={setActive}
    />
  );
}
