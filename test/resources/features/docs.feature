Feature: Docs

    @not-nodejs
    Scenario: HTML Docs
        When the root api is requested
        And the "describedby" link is followed for "text/html"
        Then the html docs will be returned


    Scenario: Swagger Docs
        When the root api is requested
        And the "describedby" link is followed for "application/json"
        Then the swagger json docs will be returned
