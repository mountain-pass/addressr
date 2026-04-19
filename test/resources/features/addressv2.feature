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

    Scenario: P015 Range-number address findable by base (first) number
        # ADR 026 / issue #367 — mid-range recall. Base number 103 equals
        # NUMBER_FIRST of the 103-107 GAZE RD range record GAOT_717321171.
        # Pre-ADR-026: 103 was a token in the range doc's sla but phrase
        # "103 GAZE RD" did not match cleanly (sla sequence is "103 107
        # GAZE RD"). After ADR 026 the phrase matches sla_range_expanded[0]
        # directly. The non-range docs at 103 GAZE RD still rank above
        # (see ranking-invariant scenario below); this scenario asserts
        # recall — that the range doc appears in the result list.
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

    Scenario: P015 Range-number address findable by mid-range number
        # ADR 026 / issue #367 — the core mid-range recall fix. Before ADR 026
        # the token "106" was absent from both sla and ssla of the range doc
        # (the `whitecomma` tokeniser splits "103-107" into tokens 103 and
        # 107; 106 is neither), so "106 GAZE RD" returned zero for the range
        # doc. After ADR 026, sla_range_expanded[3] = "106 GAZE RD, CHRISTMAS
        # ISLAND OT 6798" matches phrase_prefix cleanly. Mirrors #367 reporter's
        # "225 drummond st, carlton" → "225-245 DRUMMOND ST" case.
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | 106 GAZE RD, CHRISTMAS ISLAND |
        Then the returned address list will include:
            """
            {
                "sla": "103-107 GAZE RD, CHRISTMAS ISLAND OT 6798",
                "pid": "GAOT_717321171"
            }
            """

    Scenario: P015 Non-range exact match outranks range doc for same mid-range number
        # ADR 026 Confirmation — load-bearing ranking invariant. For a street
        # with both a non-range doc (GAOT_718446687 at 104 GAZE RD) AND a range
        # doc that covers the same number (GAOT_717321171 at 103-107 GAZE RD),
        # the non-range doc must rank first. Asserts (non-)regression of
        # tie_breaker = 0.0 on the phrase_prefix clause (also unit-pinned at
        # test/js/__tests__/address-service.test.mjs).
        When the root api is requested
        And the "https://addressr.io/rels/address-search" link template is followed with:
            | q | 104 GAZE RD, CHRISTMAS ISLAND |
        And the 1st "item" link is followed
        Then the returned address summary will be:
            """
            {
                "sla": "104 GAZE RD, CHRISTMAS ISLAND OT 6798",
                "pid": "GAOT_718446687"
            }
            """

    Scenario: P015 Canonical hyphenated range form still ranks first (ADR 026 non-regression)
        # ADR 026 — range-form queries using the canonical hyphenated syntax
        # must not regress. The range doc has both 103 and 107 as tokens in
        # sla (whitecomma splits on `-`), so bool_prefix AND matches; and
        # phrase_prefix matches the positional sequence in sla. No other doc
        # in the OT fixture has both 103 AND 107 in its sla, so the range
        # doc is the unique bool_prefix-AND-passing hit. sla_range_expanded
        # contributes zero on this query (no single alias contains both 103
        # and 107 in sequence), so ranking behaviour matches pre-ADR-026.
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

