Feature: Address

    # It looks like ES completely barfs if there is nothing in the index
    # Scenario: Empty Address List
    #     Given an empty address database
    #     When the root api is requested
    #     And the "https://addressr.mountain-pass.com.au/rels/address-search" link is followed
    #     Then the an empty address list will be returned
    #     And the response will contain the following links:
    #         | rel         | uri                                      | title                 | type      |
    #         | describedby | /docs/#operations-addresses-getAddresses | getAddresses API Docs | text/html |
    #         | self        | /addresses                               |                       |           |
    #         | first       | /addresses                               |                       |           |


    Scenario: Single Address List
        Given an address database with:
            """
            [
                {
                    "sla": "Tower 3, Level 25, 300 Barangaroo Avenue, Sydney NSW 2000",
                    "score": 1,
                    "links": {
                        "self": {
                            "href": "/address/GANT_718592778"
                        }
                    }
                }
            ]
            """
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link is followed
        Then the returned address list will contain:
            """
            [
                {
                    "sla": "Tower 3, Level 25, 300 Barangaroo Avenue, Sydney NSW 2000",
                    "score": 1,
                    "links": {
                        "self": {
                            "href": "/address/GANT_718592778"
                        }
                    }
                }
            ]
            """
        And the response will contain the following links:
            | rel         | uri                                      | title                 | type      |
            | describedby | /docs/#operations-addresses-getAddresses | getAddresses API Docs | text/html |
            | self        | /addresses                               |                       |           |
            | first       | /addresses                               |                       |           |


    Scenario: Two Entries Address List
        Given an address database with:
            """
            [
                {
                    "sla": "Tower 3, Level 25, 300 Barangaroo Avenue, Sydney NSW 2000",
                    "score": 1,
                    "links": {
                        "self": {
                            "href": "/address/GANT_718592778"
                        }
                    }
                },
                {
                    "sla": "109 Kirribilli Ave, Kirribilli NSW 2061",
                    "score": 0.985051936618461,
                    "links": {
                        "self": {
                            "href": "/address/GANT_718592782"
                        }
                    }
                }
            ]
            """
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link is followed
        Then the returned address list will contain:
            """
            [
                {
                    "sla": "Tower 3, Level 25, 300 Barangaroo Avenue, Sydney NSW 2000",
                    "score": 1,
                    "links": {
                        "self": {
                            "href": "/address/GANT_718592778"
                        }
                    }
                },
                {
                    "sla": "109 Kirribilli Ave, Kirribilli NSW 2061",
                    "score": 1,
                    "links": {
                        "self": {
                            "href": "/address/GANT_718592782"
                        }
                    }
                }
            ]
            """
        And the response will contain the following links:
            | rel         | uri                                      | title                 | type      |
            | describedby | /docs/#operations-addresses-getAddresses | getAddresses API Docs | text/html |
            | self        | /addresses                               |                       |           |
            | first       | /addresses                               |                       |           |


    Scenario: Two Entries Address List
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link is followed
        Then the returned address list will contain many addresses
        And the response will contain the following links:
            | rel         | uri                                      | title                 | type      |
            | describedby | /docs/#operations-addresses-getAddresses | getAddresses API Docs | text/html |
            | self        | /addresses                               |                       |           |
            | first       | /addresses                               |                       |           |
            | next        | /addresses?p=2                           |                       |           |
