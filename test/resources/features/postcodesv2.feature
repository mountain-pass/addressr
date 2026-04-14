@rest2 @not-rest @not-nodejs @not-cli
Feature: Postcodes v2


    Scenario: Root API includes postcode search link
        When the root api is requested
        Then the response will contain the following links:
            | rel                                      | uri               |
            | self                                     | /                 |
            | https://addressr.io/rels/address-search  | /addresses{?q}    |
            | https://addressr.io/rels/locality-search | /localities{?q}   |
            | https://addressr.io/rels/postcode-search | /postcodes{?q}    |
            | https://addressr.io/rels/api-docs        | /api-docs         |
            | https://addressr.io/rels/health          | /health           |


    Scenario: Search postcodes
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.io/rels/postcode-search" link template is followed with:
            | q | 679 |
        Then the returned postcode list will include:
            """
            {
                "postcode": "6798",
                "localities": [
                    {
                        "name": "CHRISTMAS ISLAND"
                    }
                ]
            }
            """
        And the response will contain the following headers:
            | cache-control | public, max-age=604800 |


    Scenario: List all postcodes - no query
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.io/rels/postcode-search" link template is followed with:
            | q |  |
        Then the returned postcode list will include:
            """
            {
                "postcode": "6798",
                "localities": [
                    {
                        "name": "CHRISTMAS ISLAND"
                    }
                ]
            }
            """


    Scenario: Search postcodes - no results
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.io/rels/postcode-search" link template is followed with:
            | q | 9999 |
        Then the returned postcode list will be empty


    Scenario: Get postcode detail with locality links
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.io/rels/postcode-search" link template is followed with:
            | q | 6798 |
        And the 1st "item" link is followed
        And the "canonical" link is followed
        Then the returned postcode detail will have localities with links
        And the response will contain the following headers:
            | cache-control | public, max-age=604800 |
