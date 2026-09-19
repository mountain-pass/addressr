# Problem 152: The gateway cannot authenticate any managed session

**Status**: Open
**Reported**: 2026-09-19
**Priority**: 20 (Very High) — Impact: 5 × Likelihood: 4 — derived at capture from the description per Step 4a
**Origin**: internal
**Effort**: S — derived at capture per Step 4a
**JTBD**: JTBD-005
**Persona**: web-app-developer

## Description

Every authenticated managed route returns `401 invalid_session`, regardless of how
valid the session token is. The managed channel would be dead on arrival for sign-in,
organisation selection, checkout, the billing portal and API-key management.

`managed-account.mjs` builds its Clerk client as
`createClerkClient({ publishableKey, jwtKey })`. At `@clerk/backend` 3.16.12, which is
what the bundle ships, `authenticateRequest` on a client constructed without a
`secretKey` throws `Missing Clerk Secret Key`. That call sits inside the `try` in
`authorizeSession`, whose `catch` returns `rejected(401, 'invalid_session')`. So the
throw is swallowed and presents as an ordinary authentication failure.

No Clerk secret key is bound. The worker module declares `CLERK_PUBLISHABLE_KEY` and
`CLERK_JWT_KEY` and nothing else Clerk-shaped.

## Symptoms

1. **A correctly signed token from an allowed origin is refused.** Measured in workerd
   at the compatibility date Terraform pins, against a bundle built from current
   source: `GET /managed/account` with a `Bearer` token whose signature verifies
   against the configured `CLERK_JWT_KEY` returns `401 {"error":"invalid_session"}`.
2. **The failure is indistinguishable from a genuinely bad token.** The error code is
   the same one a forged or expired token produces, so the first person to hit this
   would reasonably look at the token rather than the configuration.
3. **It is invisible to every existing test.** The unit suites call `authorizeSession`
   with an injected `clerk` stub, so the real `createClerkClient` path never executes.
   The dependency is injectable precisely so tests can avoid it, and that is what hid
   this.

## Workaround

None. There is no configuration that makes the current code path work: adding a
`CLERK_SECRET_KEY` binding does not help, because the code never reads one. Measured —
the binding was added to a probe and the result was unchanged at `401`.

## Impact Assessment

- **Who is affected**: every managed-channel customer, on every authenticated route,
  from the moment the channel is activated. Nobody today, because it is not activated.
- **Frequency**: total. Not intermittent and not load-dependent.
- **Severity**: the paid channel cannot be used at all. This is the failure the launch
  gates exist to catch before a customer meets it.
- **NOT AFFECTED, and worth stating so the blast radius is not over-read**: RapidAPI
  subscribers and API-key customer traffic. Those authenticate with
  `authorizeCustomer` against D1 and never construct a Clerk client. The Stripe
  webhook route also returns before the session check.
- **Analytics**: not applicable.

## Root Cause Analysis

Measured in three steps, each narrowing the attribution:

1. In Node, the Worker's exact call shape throws `Missing Clerk Secret Key`; adding
   `secretKey` to the constructor makes `isAuthenticated` true.
2. In workerd, against the real bundle, the same request returns `401
invalid_session` — which is what `authorizeSession`'s catch produces on a throw.
3. In workerd, a throwaway probe worker calling `createClerkClient` both ways
   confirmed it directly: the Worker's shape throws `Missing Clerk Secret Key`, and
   the same call with a `secretKey` authenticates. That third step exists because the
   first two together were still an inference.

**One thing that looked like a second defect and was not.** The probe initially
reported `orgId: null` on an authenticated token carrying `org_id` and `org_role`,
which would have produced `403 active_organization_required` behind the first fault.
It was an artefact of the hand-minted token: it set `v: 2` while carrying v1 claims,
and at `v: 2` the library reads the `o` object instead. Both a no-`v` token with
`org_id`/`org_role` and a `v: 2` token with `o` resolve the organisation correctly.
Recorded because a malformed fixture nearly became a reported defect.

### Investigation Tasks

- [ ] **Choose the fix direction, which is a decision and not a detail.** Either bind a
      Clerk secret key and pass it to `createClerkClient`, or move to a networkless
      verification path that needs no secret. The second is worth real weight: it
      introduces no new stored credential, and credential-free operation is the
      ground ADR-089 chose its notification path on. The first is the smaller diff.
- [ ] Whichever is chosen, add a test that exercises the REAL `createClerkClient`
      path. The existing suites inject a stub, which is why this was invisible.
- [ ] Sweep for the same shape: any other construction of a provider client whose
      required arguments are only checked at call time, inside a `catch` that
      flattens the error into a domain code.
- [ ] Reconsider whether `authorizeSession`'s bare `catch` should distinguish a
      configuration fault from a rejected token. A 401 for a misconfigured gateway
      sent the diagnosis in the wrong direction and would have again.

## Dependencies

- **Blocks**: managed-channel activation, and every authenticated journey the launch
  ledger lists as requiring activation.
- **Blocked by**: (none — the fix is available, the direction needs deciding)
- **Composes with**: (none)

## Related

Found by the local dress rehearsal harness, `managed-channel-rehearsal.test.mjs`,
which was built the same day for exactly this purpose: booting the real bundle in
workerd rather than calling modules in Node. The harness itself does not yet drive an
authenticated journey — this was found while probing whether it could.

That is the point worth keeping. The maintainer made a local rehearsal the condition
of accepting the activation-blocked gates, and the first serious probe of an
authenticated path found a total outage of the paid channel that every existing test
was structurally unable to see.

Duplicate grep on `clerk|session|identity` matched one ticket, P062, which is about
AFK subprocess briefing content and unrelated.
