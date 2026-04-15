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
        Then the address detail will have a related link to its locality
        And the address detail will have a related link to its postcode
        And the address detail will have a related link to its state

