---
'@mountainpass/addressr': patch
---

Removed the `glob` production dependency, clearing the last known vulnerability in the shipped dependency tree as of this release.

`glob` reached `minimatch` and then `brace-expansion`, which carries a high-severity denial-of-service advisory (GHSA-mh99-v99m-4gvg, unbounded expansion causing an out-of-memory crash). It was the only advisory left in the production tree, and it had no upgrade path: the published fix route is a parent bump that does not exist, because the parent in question is already on its newest release.

Node has provided the same globbing built in since 22.0.0, and this project already requires Node 22 or newer. The package was used at exactly one place: finding the `G-NAF` directory inside an unzipped extract. That discovery has moved to its own module and now runs on the built-in. `npm audit --omit=dev` reports no vulnerabilities.

Two behavioural details were pinned rather than assumed, because the two implementations are not documented as equivalent. The npm package treated a trailing slash as meaning directories only, and the built-in makes no such promise, so a file named `G-NAF` sitting alongside a real extract would previously have been ignored and could now have been selected. It is still ignored. Separately, when more than one extract is present the loader takes the first match, and neither implementation ordered those. That is now sorted, so which extract wins no longer depends on filesystem iteration order.

The discovery also had no automated test in either implementation, because continuous integration points the loader at a prepared fixture and skips the download and unzip entirely. It is now covered.
