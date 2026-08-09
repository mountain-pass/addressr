---
'@mountainpass/addressr': minor
---

Document the address-detail response, deprecate two fields, and correct two the spec got wrong.

`GET /addresses/{id}` returns `pid` (the address ID), `mla`, `smla`, `geocoding`,
`precedence` and `sla_range_expanded` alongside the documented `sla` and
`structured`. None of the six appeared in the OpenAPI document served at
`/api-docs`. All six are now documented there.

Two are marked deprecated rather than supported, because no published spec ever
offered them:

- `sla_range_expanded` holds the two endpoint forms of a range address. It has
  never been searchable: it was written to a path the index mapping does not
  cover, so no query has ever matched it. Range addresses are already reachable
  by either endpoint without it.
- `precedence` carries G-NAF's primary/secondary flag.

Both remain in the response for now. They are scheduled for removal, and the
notice exists so that removal is announced rather than silent.

Two corrections to the shipped Swagger 2.0 file, where the spec named things the
endpoint does not return. `geo` becomes `geocoding`, which is the key the API
returns. `ssla` is removed from the address-detail schema: it is a real field and
it is correct on the search result, but the loader lifts it out before building
the object this endpoint returns, so it never arrives.

Swagger 2.0 has no `deprecated` keyword for schema properties, so that file
carries the notice in the property descriptions; the OpenAPI 3 document sets
`deprecated: true` and repeats the notice in the description, since renderer
support for the flag varies.
