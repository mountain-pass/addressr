Feature: Root API


    Scenario: Root API
        When the root api is requested
        Then the response will contain the following links:
            | rel                                                       | uri        | title                 | type             |
            | describedby                                               | /docs/     | API Docs              | text/html        |
            | describedby                                               | /api-docs  | API Docs              | application/json |
            | self                                                      | /          | API Root              |                  |
            | https://addressr.mountain-pass.com.au/rels/address-search | /addresses | Get List of Addresses |                  |
        And the response will contain the following link template:
            | rel                                                       | uri              | title                 | type | var-base                                 |
            | https://addressr.mountain-pass.com.au/rels/address-search | /addresses{?q,p} | Get List of Addresses |      | /docs/#operations-addresses-getAddresses |


    Scenario: Root API - Self
        When the root api is requested
        And the "self" link is followed
        Then the response will contain the following links:
            | rel                                                       | uri        | title                 | type             |
            | describedby                                               | /docs/     | API Docs              | text/html        |
            | describedby                                               | /api-docs  | API Docs              | application/json |
            | self                                                      | /          | API Root              |                  |
            | https://addressr.mountain-pass.com.au/rels/address-search | /addresses | Get List of Addresses |                  |
        And the response will contain the following link template:
            | rel                                                       | uri              | title                 | type | var-base                                 |
            | https://addressr.mountain-pass.com.au/rels/address-search | /addresses{?q,p} | Get List of Addresses |      | /docs/#operations-addresses-getAddresses |
