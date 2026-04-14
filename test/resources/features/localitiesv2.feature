@rest2 @not-rest @not-nodejs @not-cli
Feature: Localities v2


    Scenario: Root API includes locality search link
        When the root api is requested
        Then the response will contain the following links:
            | rel                                      | uri               |
            | self                                     | /                 |
            | https://addressr.io/rels/address-search  | /addresses{?q}    |
            | https://addressr.io/rels/locality-search | /localities{?q}   |
            | https://addressr.io/rels/api-docs        | /api-docs         |
            | https://addressr.io/rels/health          | /health           |


    Scenario: Search localities
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.io/rels/locality-search" link template is followed with:
            | q | ISLAND |
        Then the returned locality list will contain many localities
        And the returned locality list will include:
            """
            {
                "name": "CHRISTMAS ISLAND",
                "state": {
                    "name": "OTHER TERRITORIES",
                    "abbreviation": "OT"
                },
                "class": {
                    "code": "U",
                    "name": "UNOFFICIAL SUBURB"
                }
            }
            """
        And the response will contain the following headers:
            | cache-control | public, max-age=604800 |


    Scenario: Search localities - short query
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.io/rels/locality-search" link template is followed with:
            | q | DR |
        Then the returned locality list will include:
            """
            {
                "name": "DRUMSITE",
                "state": {
                    "name": "OTHER TERRITORIES",
                    "abbreviation": "OT"
                },
                "class": {
                    "code": "T",
                    "name": "TOPOGRAPHIC LOCALITY"
                }
            }
            """


    Scenario: Search localities - no results
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.io/rels/locality-search" link template is followed with:
            | q | ZZZZNOTAPLACE |
        Then the returned locality list will be empty
