Feature: Root API


    Scenario: Root API
        When the root api is requested
        Then the response will contain the following links:
            | rel         | uri       | title    | type             |
            | describedby | /docs/    | API Docs | text/html        |
            | describedby | /api-docs | API Docs | application/json |
            | self        | /         | API Root |                  |
        And the response will contain the following link template:
            | rel                                                       | uri              | title                 | type             | var-base                                    |
            | https://addressr.mountain-pass.com.au/rels/address-search | /addresses{?q,p} | Get List of Addresses | application/json | /api-docs#/paths/~1addresses/get/parameters |
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link templates var-base will contain
            """
            [
                {
                    "name": "q",
                    "in": "query",
                    "minLength": 3,
                    "description": "search string",
                    "required": true,
                    "type": "string"
                },
                {
                    "name": "p",
                    "in": "query",
                    "minimum": 2,
                    "description": "page number",
                    "required": false,
                    "type": "integer"
                }
            ]
            """


    Scenario: Root API - Self
        When the root api is requested
        And the "self" link is followed
        Then the response will contain the following links:
            | rel         | uri       | title    | type             |
            | describedby | /docs/    | API Docs | text/html        |
            | describedby | /api-docs | API Docs | application/json |
            | self        | /         | API Root |                  |
        And the response will contain the following link template:
            | rel                                                       | uri              | title                 | type             | var-base                                    |
            | https://addressr.mountain-pass.com.au/rels/address-search | /addresses{?q,p} | Get List of Addresses | application/json | /api-docs#/paths/~1addresses/get/parameters |
