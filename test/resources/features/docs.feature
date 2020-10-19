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

    @not-nodejs @not-cli
    Scenario: Swagger Docs CORS
        When CORS is set to "*"
        When the root api is requested
        And the "describedby" link is followed for "application/json"
        Then the reponse will have a "access-control-allow-origin" of "*"

    @not-nodejs @not-cli
    Scenario: Swagger Docs No CORS
        When CORS is not set
        When the root api is requested
        And the "describedby" link is followed for "application/json"
        Then the reponse will not have a "access-control-allow-origin" header
