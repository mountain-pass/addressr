@rest2 @not-rest @not-nodejs @not-cli
Feature: Addresses v2


    Scenario: Root API
        When the root api is requested
        Then the response will contain the following links:
            | rel                                      | uri              |
            | self                                     | /                |
            | https://addressr.io/rels/address-search  | /addresses{?q}   |
            | https://addressr.io/rels/locality-search | /localities{?q}  |
            | https://addressr.io/rels/postcode-search | /postcodes{?q}   |
            | https://addressr.io/rels/state-search    | /states{?q}      |
            | https://addressr.io/rels/api-docs        | /api-docs        |
            | https://addressr.io/rels/health          | /health          |
        Then the response will contain the following headers:
            | cache-control | public, max-age=604800 |


    Scenario: Health Check
        When the root api is requested
        And the "https://addressr.io/rels/health" link is followed
        Then the response will contain the following headers:
            | cache-control | no-cache |


    Scenario: Search
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | MURRAY RD, CHRISTMAS ISLAND ISLAND |
        Then the returned address list will contain many addresses
        And the returned address list will include:
            """
            {
                "sla": "1 MURRAY RD, CHRISTMAS ISLAND OT 6798",
                "pid": "GAOT_717321356"
            }
            """
        And the response will contain the following links:
            | rel                                     | uri                                                       |
            | self                                    | /addresses?q=MURRAY%20RD%2C%20CHRISTMAS%20ISLAND%20ISLAND |
            | first                                   | /addresses?q=MURRAY+RD%2C+CHRISTMAS+ISLAND+ISLAND         |
            | next                                    | /addresses?page=1&q=MURRAY+RD%2C+CHRISTMAS+ISLAND+ISLAND  |
            | https://addressr.io/rels/address-search | /addresses{?q}                                            |
        Then the response will contain the following headers:
            | cache-control | public, max-age=604800 |

    Scenario: Search and next
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | MURRAY RD, CHRISTMAS ISLAND ISLAND |
        And the "next" link is followed
        Then the returned address list will contain many addresses
        And the returned address list will include:
            """
            {
                "sla": "19 MURRAY RD, CHRISTMAS ISLAND OT 6798",
                "pid": "GAOT_717321355"
            }
            """
        And the response will contain the following links:
            | rel                                     | uri                                                      |
            | self                                    | /addresses?page=1&q=MURRAY+RD%2C+CHRISTMAS+ISLAND+ISLAND |
            | first                                   | /addresses?q=MURRAY+RD%2C+CHRISTMAS+ISLAND+ISLAND        |
            | prev                                    | /addresses?q=MURRAY+RD%2C+CHRISTMAS+ISLAND+ISLAND        |
            | next                                    | /addresses?page=2&q=MURRAY+RD%2C+CHRISTMAS+ISLAND+ISLAND |
            | https://addressr.io/rels/address-search | /addresses{?q}                                           |
        Then the response will contain the following headers:
            | cache-control | public, max-age=604800 |


    Scenario: Search and search
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | MURRAY RD, CHRISTMAS ISLAND ISLAND |
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | GAZE RD, CHRISTMAS ISLAND |
        Then the returned address list will contain many addresses
        And the returned address list will include:
            """
            {
                "sla": "101 GAZE RD, CHRISTMAS ISLAND OT 6798",
                "pid": "GAOT_717321170"
            }
            """
        And the response will contain the following links:
            | rel                                     | uri                                             |
            | self                                    | /addresses?q=GAZE%20RD%2C%20CHRISTMAS%20ISLAND  |
            | first                                   | /addresses?q=GAZE+RD%2C+CHRISTMAS+ISLAND        |
            | next                                    | /addresses?page=1&q=GAZE+RD%2C+CHRISTMAS+ISLAND |
            | https://addressr.io/rels/address-search | /addresses{?q}                                  |
        Then the response will contain the following headers:
            | cache-control | public, max-age=604800 |

    Scenario: P007 Exact street address ranks first over sub-unit variants
        # Regression guard for P007 / issue #375 — see ADR 025 for the fix rationale.
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | 19 MURRAY RD, CHRISTMAS ISLAND |
        And the 1st "item" link is followed
        Then the returned address summary will be:
            """
            {
                "sla": "19 MURRAY RD, CHRISTMAS ISLAND OT 6798",
                "pid": "GAOT_717321355"
            }
            """

    Scenario: P007 Exact street address ranks first over sub-unit variants (GAZE RD)
        # Second topology regression guard for P007 / issue #375 — see ADR 025.
        # 16 GAZE RD coexists with UNIT 1/2/3/6, 16 GAZE RD on street locality OT677705.
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | 16 GAZE RD, CHRISTMAS ISLAND |
        And the 1st "item" link is followed
        Then the returned address summary will be:
            """
            {
                "sla": "16 GAZE RD, CHRISTMAS ISLAND OT 6798",
                "pid": "GAOT_718447105"
            }
            """

    Scenario: P015 Range-number address findable by first-endpoint number (ADR 028)
        # ADR 028 (supersedes ADR 026) / issue #367 — endpoint recall.
        # Base number 103 equals NUMBER_FIRST of the 103-107 GAZE RD range
        # record GAOT_717321171. Before v2.3.0, 103 was a token in the range
        # doc's sla but phrase "103 GAZE RD" did not match cleanly (sla
        # sequence is "103 107 GAZE RD"). After ADR 028, sla_range_expanded
        # contains exactly two endpoint aliases — alias[0] = "103 GAZE RD, …"
        # and alias[1] = "107 GAZE RD, …" — so the phrase matches alias[0]
        # cleanly. The non-range docs at 103 GAZE RD still rank above; this
        # scenario asserts recall — that the range doc appears in the list.
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | 103 GAZE RD, CHRISTMAS ISLAND |
        Then the returned address list will include:
            """
            {
                "sla": "103-107 GAZE RD, CHRISTMAS ISLAND OT 6798",
                "pid": "GAOT_717321171"
            }
            """

    Scenario: P015 Range-number address findable by last-endpoint number (ADR 028)
        # ADR 028 (supersedes ADR 026) — endpoint-only recall. Last endpoint 107
        # is NUMBER_LAST of the 103-107 GAZE RD range record GAOT_717321171.
        # Both endpoints (103 and 107) resolve to the range doc via whitecomma
        # tokenisation of sla (which splits `103-107` into [103, 107]) and via
        # sla_range_expanded which under ADR 028 contains exactly those two
        # endpoint aliases. Mid-range numbers do NOT resolve — see the next
        # scenario.
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | 107 GAZE RD, CHRISTMAS ISLAND |
        Then the returned address list will include:
            """
            {
                "sla": "103-107 GAZE RD, CHRISTMAS ISLAND OT 6798",
                "pid": "GAOT_717321171"
            }
            """

    Scenario: P015 Mid-range number does NOT return range doc (ADR 028 endpoint-only)
        # ADR 028 load-bearing correctness invariant — superseding ADR 026.
        # Under the earlier ADR 026 full-interpolation shipped in v2.3.0, a
        # query for `"106 GAZE RD CHRISTMAS ISLAND"` returned the 103-107
        # range doc via sla_range_expanded[3] = "106 GAZE RD, ...". That was
        # a false positive: `106` is on the opposite side of the street under
        # Australian addressing convention, not part of the 103-107 property.
        # Under ADR 028, the range doc only emits endpoint aliases (103, 107);
        # 106 queries must NOT return the range. The 106 query IS expected to
        # return the non-range `106 GAZE RD` record (GAOT_718446688) — but
        # the 103-107 range doc must be absent.
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | 106 GAZE RD, CHRISTMAS ISLAND |
        Then the returned address list will NOT include:
            """
            {
                "sla": "103-107 GAZE RD, CHRISTMAS ISLAND OT 6798",
                "links": {
                    "self": {
                        "href": "/addresses/GAOT_717321171"
                    }
                }
            }
            """

    Scenario: P015 Canonical hyphenated range form still ranks first (ADR 028 non-regression)
        # Canonical range query must still work. The range doc has both 103 and
        # 107 as tokens in sla (whitecomma splits on `-`), so bool_prefix AND
        # matches; and phrase_prefix matches the positional sequence in sla. No
        # other doc in the OT fixture has both 103 AND 107 in its sla, so the
        # range doc is the unique bool_prefix-AND-passing hit. sla_range_expanded
        # contributes zero on this query (no single alias contains both 103
        # and 107 in sequence), so ranking behaviour matches pre-v2.4.0.
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | 103-107 GAZE RD, CHRISTMAS ISLAND |
        And the 1st "item" link is followed
        Then the returned address summary will be:
            """
            {
                "sla": "103-107 GAZE RD, CHRISTMAS ISLAND OT 6798",
                "pid": "GAOT_717321171"
            }
            """

    Scenario: P026 5-char typo on street name still fuzz-matches (AUTO:5,8 preserves this)
        # ADR 027 tunes fuzziness from `AUTO` (= AUTO:3,6) to `AUTO:5,8`. Under
        # AUTO:5,8, 5-char tokens still get 1 edit of fuzziness. A user typing
        # `Muray` (5 chars) for `MURRAY` (6 chars) must continue to match — the
        # v2.3.0 baseline confirms this query currently works, and ADR 027's
        # load-bearing claim is that typo tolerance on 5+ char names is kept.
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | 19 Muray Rd, CHRISTMAS ISLAND |
        And the 1st "item" link is followed
        Then the returned address summary will be:
            """
            {
                "sla": "19 MURRAY RD, CHRISTMAS ISLAND OT 6798",
                "pid": "GAOT_717321355"
            }
            """

    Scenario: Joint ADR 027 + ADR 028 integration — endpoint recall AND fuzzy exclusion
        # Integration test that binds BOTH ADRs together. Query `107 GAZE RD
        # CHRISTMAS ISLAND` where 107 is the LAST endpoint of the 103-107 range:
        # - ADR 028 endpoint recall: range doc GAOT_717321171 must be in the list
        #   (via alias[1] = "107 GAZE RD, ..." and via the 107 token in sla).
        # - ADR 027 fuzz exclusion: adjacent 109 GAZE RD (GAOT_717321172) must
        #   NOT be in the list. Under the pre-v2.4.0 AUTO fuzziness, 109 was a
        #   1-edit neighbour of 107 and appeared as noise. Under AUTO:5,8 it
        #   is excluded because 107 requires an exact match.
        # This scenario fails under v2.3.0 (109 would appear via fuzz) and
        # passes under v2.4.0 (both ADRs working together).
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | 107 GAZE RD, CHRISTMAS ISLAND |
        Then the returned address list will include:
            """
            {
                "sla": "103-107 GAZE RD, CHRISTMAS ISLAND OT 6798",
                "pid": "GAOT_717321171"
            }
            """
        And the returned address list will NOT include:
            """
            {
                "sla": "109 GAZE RD, CHRISTMAS ISLAND OT 6798",
                "links": {
                    "self": {
                        "href": "/addresses/GAOT_717321172"
                    }
                }
            }
            """

    Scenario: P026 Exact street number excludes fuzzy-adjacent numbers (ADR 027)
        # ADR 027 tightens fuzziness so 3-char numeric tokens require exact
        # match. Query `101 GAZE RD CHRISTMAS ISLAND` must return the exact
        # non-range 101 doc first. Under the old AUTO fuzziness, 101 would
        # fuzzy-match 100, 103, 105, 107, 109 (each 1 edit) and those noise
        # hits would compete for ranking. Post-ADR-027, 101 matches only 101.
        # The 103-107 range doc does NOT appear because 101 is outside the
        # range and not in any sla_range_expanded alias.
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | 101 GAZE RD, CHRISTMAS ISLAND |
        And the 1st "item" link is followed
        Then the returned address summary will be:
            """
            {
                "sla": "101 GAZE RD, CHRISTMAS ISLAND OT 6798",
                "pid": "GAOT_717321170"
            }
            """


    Scenario: Search and item
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND |
        And the 1st "item" link is followed
        And the returned address summary will be:
            """
            {
                "sla": "UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND OT 6798",
                "score": 5.4303637,
                "pid": "GAOT_717882967"
            }
            """
        And the response will contain the following links:
            | rel       | uri                       |
            | canonical | /addresses/GAOT_717882967 |
        Then the response will contain the following headers:
            | cache-control | public, max-age=604800 |


    @geo
    Scenario: Search and item and canonical
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND |
        And the 1st "item" link is followed
        And the "canonical" link is followed
        Then the returned address will be:
            """
            {
                "geocoding": {
                    "geocodes": [
                        {
                            "default": true,
                            "latitude": -10.42554715,
                            "longitude": 105.67950505,
                            "reliability": {
                                "code": "2",
                                "name": "WITHIN ADDRESS SITE BOUNDARY OR ACCESS POINT"
                            },
                            "type": {
                                "code": "PC",
                                "name": "PROPERTY CENTROID"
                            }
                        }
                    ],
                    "level": {
                        "code": "7",
                        "name": "LOCALITY,STREET, ADDRESS"
                    }
                },
                "mla": [
                    "UNIT 1",
                    "19 MURRAY RD",
                    "CHRISTMAS ISLAND OT 6798"
                ],
                "pid": "GAOT_717882967",
                "precedence": "secondary",
                "sla": "UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND OT 6798",
                "smla": [
                    "1/19 MURRAY RD",
                    "CHRISTMAS ISLAND OT 6798"
                ],
                "structured": {
                    "confidence": 2,
                    "flat": {
                        "number": 1,
                        "type": {
                            "code": "UNIT",
                            "name": "UNIT"
                        }
                    },
                    "locality": {
                        "class": {
                            "code": "U",
                            "name": "UNOFFICIAL SUBURB"
                        },
                        "name": "CHRISTMAS ISLAND"
                    },
                    "number": {
                        "number": 19
                    },
                    "postcode": "6798",
                    "state": {
                        "abbreviation": "OT",
                        "name": "OTHER TERRITORIES"
                    },
                    "street": {
                        "class": {
                            "code": "C",
                            "name": "CONFIRMED"
                        },
                        "name": "MURRAY",
                        "type": {
                            "code": "ROAD",
                            "name": "RD"
                        }
                    }
                }
            }
            """
        And the response will contain the following links:
            | rel  | uri                       |
            | self | /addresses/GAOT_717882967 |
        Then the response will contain the following headers:
            | cache-control | public, max-age=604800 |


    Scenario: Address detail has related links to locality, postcode, and state
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | UNIT 1, 19 MURRAY RD, CHRISTMAS ISLAND |
        And the 1st "item" link is followed
        And the "canonical" link is followed
        Then the response will contain the following related links:
            | uri                         |
            | /localities/loc9984d8beb142 |
            | /postcodes/6798             |
            | /states/OT                  |

