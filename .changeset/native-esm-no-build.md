---
'@mountainpass/addressr': minor
---

Runs on native ESM; the Babel build step is gone.

The package now declares `"type": "module"` and ships its source directly instead of a transpiled `lib/`. Node 22 or newer was already required and still is.

**The commands are unchanged.** `addressr-loader` and `addressr-server-2` work exactly as before, so `npx` usage, the Docker image, and anything invoking them by name needs no change.

Two things matter only if you reach past those command names:

- **Paths inside the installed package lost their `lib/` segment.** Anything referencing `lib/bin/...` or `lib/src/...` should drop it. The Docker image's own default `CMD` is updated in the same release, which is the clearest sign this is worth checking: if you override `CMD`, or invoke the loader by its resolved path, see the before/after table in [the image changelog](https://github.com/mountain-pass/addressr/blob/master/docs/DOCKER-IMAGE-CHANGELOG.md).
- **`require()` into the package no longer works.** As an ES module it must be imported. The package declares no `main` and no `exports`, so it has never had a supported import surface and is meant to be used through its commands. Without an `exports` map, though, nothing prevented a deep `require()` into an internal file, and those paths both moved and stopped being CommonJS.
