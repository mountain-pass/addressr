Feature: Docs

    @not-component
    Scenario: HTML Docs
        When the root api is requested
        And the "describedby" link is followed for "text/html"
        Then the html docs will be returned

