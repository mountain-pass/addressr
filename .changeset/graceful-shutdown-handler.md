---
'@mountainpass/addressr': patch
---

Shut the server down gracefully on `SIGTERM` and `SIGINT`.

The server now stops accepting new connections and lets in-flight requests finish before the
process exits, rather than dying mid-request. A restart, a redeploy, a `docker stop`, or a local
`Ctrl-C` no longer turns whatever was being served at that moment into a failed request.

The drain is bounded, so a stuck connection cannot hold the process open past an orchestrator's
stop deadline. The budget defaults to 8000ms, comfortably inside Docker's 10 second default grace
window, and `ADDRESSR_SHUTDOWN_TIMEOUT_MS` overrides it with a positive number of milliseconds. A
value that is not a positive number fails startup, in keeping with how the other `ADDRESSR_*`
settings behave, rather than degrading quietly. When the budget expires the remaining connections
are closed and the process exits non-zero. A second signal during the drain exits immediately, for
an operator who has stopped waiting.

Two exported functions changed shape for anyone embedding the server rather than running the
binary: `stopServer()` now returns a promise that resolves once the server has closed, and
`forceCloseConnections()` is new alongside it. Callers that ignore the return value need no change.
