# @mountainpass/addressr

## 3.3.2

### Patch Changes

- 635084c: Replace `unzip-stream` with `yauzl` for G-NAF archive extraction, and stop crashing on a corrupt archive.

  `unzip-stream` is the current release and still depends on `binary@0.3.0`, published in 2011, which brings
  `buffers`, `chainsaw` and `traverse`. `buffers` ships with no licence grant of any kind. Upgrading could not
  shed them; only replacing could. `yauzl` brings one dependency in their place.

  Removed from the published package: `unzip-stream`, `binary`, `buffers`, `chainsaw`, `traverse` and `mkdirp`.

  **Bug fix.** A corrupt or truncated archive previously terminated the loader process with an unhandled
  error event, because `.pipe()` does not forward errors and the handler was attached to the wrong end of the
  chain. It now rejects, so callers can handle it, and no partial extract is renamed into place — which
  matters because a partial extract would otherwise be treated as complete on every subsequent start.

  Extraction behaviour is otherwise unchanged: the already-extracted short-circuit, resume-by-size for
  interrupted extracts, and staging under `incomplete/` before renaming into place.

## 3.3.1

### Patch Changes

- 33d06d5: Remove three dependencies that were declared as production but never used by the shipped package.

  `@changesets/cli`, `node-machine-id` and `uri-template-lite` were listed under `dependencies` and so
  installed by every consumer, but nothing in the published files imports or invokes them. They arrived
  there when the workspace restructure moved dependencies out of the repository root; the release tooling
  they belong to stayed at the root, and the declarations came along by mistake.

  Installing this package now resolves 101 fewer transitive packages — the production dependency tree
  goes from 234 to 133.
