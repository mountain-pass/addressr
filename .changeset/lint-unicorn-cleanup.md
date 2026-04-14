---
'@mountainpass/addressr': patch
---

Enable eslint-plugin-unicorn recommended rules and resolve all ESLint issues

- Enable unicorn/prefer-global-this, prevent-abbreviations, filename-case, no-null, no-process-exit, prefer-spread, prefer-string-raw, require-module-specifiers, no-anonymous-default-export rules
- Rename files to kebab-case (printVersion, setLinkOptions, waycharterServer)
- Replace deprecated url.parse() with new URL()
- Refactor nested promise chains to async/await in server entry points
- Add .catch() handlers to controller promise chains
- Add max-lines-per-function, max-depth, max-params lint rules
- Resolve all ESLint errors and warnings (zero remaining, excluding intentional size guardrails)
