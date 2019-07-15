Feature: Root API


    Scenario: Root API
        When the root api is requested
        Then the response will contain the following links:
            | rel                                                       | uri         | title                 | type             |
            | describedby                                               | /docs/      | API Docs              | text/html        |
            | describedby                                               | /api-docs   | API Docs              | application/json |
            | self                                                      | /           | API Root              |                  |
            | https://addressr.mountain-pass.com.au/rels/address-search | /addresses/ | Get List of Addresses |                  |
