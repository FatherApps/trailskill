# Release path (maintainer only)

Rulebook: `docs/RELEASING.md`. Before a production release, re-check the official sources it links.

| Situation | Section in `docs/RELEASING.md` |
| --- | --- |
| Planned release, `main` green | Standard release from `main` |
| Fix needed and `git log vX.Y.Z..origin/main` is empty | Standard release, PATCH bump |
| Fix needed and `main` has unreleased commits | Hotfixes, via `release/X.Y` |
| JavaScript or asset fix only, same runtime version | Over-the-air updates |
| `git diff --name-only <last tag>..HEAD` touches native code, native dependencies, permissions, or native app config | Store build; never OTA |

1. Pick the section with the table. Show the maintainer the commit range (`git log <last tag>..<target> --oneline`) and the proposed version.
2. Follow that section step by step. Ask for explicit confirmation before each irreversible step: pushing a tag, `eas build --profile production`, `eas submit`, `eas update`, any Play promotion or rollout change.
3. Build only from a tagged commit on `main` or `release/X.Y`, from a clean tree. Never edit `versionCode`.
4. Before production, walk the Release checklist and report each item as pass or fail.
5. Promote internal → closed → production staged rollout. Raise the rollout only after the maintainer reviews crash and error rates.
6. Publish the GitHub Release: `gh release create vX.Y.Z --notes-file <notes>`.

Closing check: tag, build, and Play track match the reported version; the open decisions in `docs/RELEASING.md` are listed in the report.
