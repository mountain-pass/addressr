@rest2 @not-rest @not-nodejs @not-cli
Feature: API Docs v2


    Scenario: Root API includes api-docs link
        When the root api is requested
        Then the response will contain the following links:
            | rel                                      | uri               |
            | self                                     | /                 |
            | https://addressr.io/rels/address-search  | /addresses{?q}    |
            | https://addressr.io/rels/locality-search | /localities{?q}   |
            | https://addressr.io/rels/postcode-search | /postcodes{?q}    |
            | https://addressr.io/rels/state-search    | /states{?q}       |
            | https://addressr.io/rels/api-docs        | /api-docs         |
            | https://addressr.io/rels/health          | /health           |


    Scenario: API docs returns valid OpenAPI spec
        When the root api is requested
        And the "https://addressr.io/rels/api-docs" link is followed
        Then the returned OpenAPI spec will be valid
        And the returned OpenAPI spec will contain paths:
            | path                    |
            | /addresses              |
            | /addresses/{pid}        |
            | /localities             |
            | /localities/{pid}       |
            | /postcodes              |
            | /postcodes/{postcode}   |
            | /states                 |
            | /states/{abbreviation}  |
