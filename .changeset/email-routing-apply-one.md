---
'@mountainpass/addressr-deployment': patch
---

Declare Cloudflare Email Routing and two destination addresses, the first of two
applies for the managed-channel fault notification.

Apply one carries only what has no verification dependency: routing enabled on
the zone, a destination address reusing the mailbox the operations topic already
alerts so the notification has somewhere to send, and a separate address for
inbound mail so that arbitrary mail to the domain does not land in the inbox
carrying the search trip-wire. Both addresses are protected against silent
replacement, because each holds a verification a person performs once.

The catch-all rule and the Worker's send binding follow in a second apply, once
both addresses are verified. A rule pointing at an unverified address is
documented as staying disabled, but that describes the rule's state rather than
whether its create call succeeds, and nothing establishes the second. Attempting
it inside this release risks failing after the packages have published.

Apply one therefore leaves the zone with routing enabled and no rule, for the
interval until apply two. That state is reasoned rather than observed to refuse
inbound mail. It is accepted here because the zone's only mail path is registrar
forwarding that reaches nobody, recorded in the decision this implements, so the
interval is reasoned to cost nothing, and because it is entered knowingly rather than
discovered after a release failed partway.

No routing DNS records are declared, because whether enabling creates them is
unestablished — the provider's DNS piece only reports the required records, and
nothing we have read settles who creates them. Read this release's plan comment
before merging: whether records appear, whether enabling succeeds against the
zone's existing registrar forwarding, and whether a second apex SPF record
appears. The last would be a
silent permanent failure, since the apex already carries one.

No package or API surface changes. The zone's inbound-mail handling does change.
