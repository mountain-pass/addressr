@rest2 @not-rest @not-nodejs @not-cli
Feature: States v2


    Scenario: Root API includes state search link
        When the root api is requested
        Then the response will contain the following links:
            | rel                                      | uri               |
            | self                                     | /                 |
            | https://addressr.io/rels/address-search  | /addresses{?q}    |
            | https://addressr.io/rels/locality-search | /localities{?q}   |
            | https://addressr.io/rels/postcode-search | /postcodes{?q}    |
            | https://addressr.io/rels/state-search    | /states{?q}       |
            | https://addressr.io/rels/health          | /health           |


    Scenario: List all states - no query
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.io/rels/state-search" link template is followed with:
            | q |  |
        Then the returned state list will include:
            """
            {
                "name": "OTHER TERRITORIES",
                "abbreviation": "OT"
            }
            """
        And the response will contain the following headers:
            | cache-control | public, max-age=604800 |


    Scenario: Search states by abbreviation
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.io/rels/state-search" link template is followed with:
            | q | OT |
        Then the returned state list will include:
            """
            {
                "name": "OTHER TERRITORIES",
                "abbreviation": "OT"
            }
            """


    Scenario: Search states by name
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.io/rels/state-search" link template is followed with:
            | q | OTHER |
        Then the returned state list will include:
            """
            {
                "name": "OTHER TERRITORIES",
                "abbreviation": "OT"
            }
            """


    Scenario: Get state detail
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.io/rels/state-search" link template is followed with:
            | q | OT |
        And the 1st "item" link is followed
        Then the response will contain the following headers:
            | cache-control | public, max-age=604800 |
