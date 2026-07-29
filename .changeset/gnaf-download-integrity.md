---
'@mountainpass/addressr': patch
---

Loader now fails loudly instead of caching failed and partial G-NAF downloads.

Both hops to data.gov.au ignored the HTTP status. A refused request streamed the error page to disk and reported success, and the loader then promoted that body into the cache it reuses on the next run, so a self-hosted install on a persistent `target` directory got stuck until the file was deleted by hand, chasing an unzip error that named the wrong subsystem.

Every path that could promote an unverified archive now aborts naming the failing URL and status: refused requests, redirects, truncated downloads, request errors and write errors. The archive is only moved into place once the response has been verified as complete, and a failed attempt cleans up after itself. The dataset listing request no longer caches an error page as though it were a valid response.

The G-NAF distribution is also now selected by geodetic datum rather than by the order data.gov.au happens to list it in. Both GDA94 and GDA2020 are published for every release, and the previous selection would have silently switched datum, moving every coordinate about 1.8 metres, if that order ever changed. The datum is unchanged by default and configurable with `GNAF_DATUM`.

The README now documents what the loader caches and when a quarterly refresh needs a manual step.
