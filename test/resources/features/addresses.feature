Feature: Address

    Scenario: Swagger Docs
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link is followed
        Then the an address list will be returned
