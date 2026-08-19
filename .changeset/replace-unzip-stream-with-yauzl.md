---
'@mountainpass/addressr': patch
---

Replace `unzip-stream` with `yauzl` for G-NAF archive extraction, and stop crashing on a corrupt archive.

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
