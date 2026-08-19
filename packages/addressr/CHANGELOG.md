# @mountainpass/addressr

## 3.3.1

### Patch Changes

- 33d06d5: Remove three dependencies that were declared as production but never used by the shipped package.

  `@changesets/cli`, `node-machine-id` and `uri-template-lite` were listed under `dependencies` and so
  installed by every consumer, but nothing in the published files imports or invokes them. They arrived
  there when the workspace restructure moved dependencies out of the repository root; the release tooling
  they belong to stayed at the root, and the declarations came along by mistake.

  Installing this package now resolves 101 fewer transitive packages — the production dependency tree
  goes from 234 to 133.
