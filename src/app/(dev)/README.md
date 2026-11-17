# Development gallery

Shows components and screens with synthetic data, in every state, in light and dark theme and at 200 % text size; the theme and size choices apply only to the preview, not to the gallery's own controls. It exists only in development builds: outside `__DEV__` the `(dev)` layout redirects to `/`.

## Open it

1. `npx expo start --dev-client`
2. On the home screen, press "Abrir galería de desarrollo", or go to the path `/gallery`.

## Add an entry

1. Put synthetic fixtures in `src/modules/<module>/__fixtures__/` (or `src/core/ui/__fixtures__/`). Use fictional names such as "Lucía R."; never real names, documents, birth dates, or federation, league or school names. No hex colors: `src/__tests__/fixtures.test.ts` enforces it.
2. Export `galleryEntries: GalleryEntry[]` from the module `index.ts` (the `GalleryEntry` type comes from `src/core/ui`) with the same `__DEV__ ? (require('./gallery') as typeof import('./gallery')).galleryEntries : []` form the other modules use, on one line. Each entry has an `id`, a `title` and `states`, a map from state name to a function that renders it.
3. Add the group to `galleryGroups` in `src/app/(dev)/_layout.tsx`: `{ id, title, entries }`, importing the entries only from the module `index.ts`.

Do not add `.ts` or `.tsx` files other than routes in this folder: Expo Router turns each one into a route.

## Release bundles

`galleryEntries` is exported behind `__DEV__` and is an empty array in release bundles: Metro folds `__DEV__` before collecting dependencies, so the gallery and its fixtures are not bundled. `src/__tests__/release-bundle.test.ts` fails if a gallery or fixture file is imported any other way.
