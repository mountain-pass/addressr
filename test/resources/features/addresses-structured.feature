Feature: Structured Address

    Scenario: Getting Structured Address
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link template is followed with:
            | q | 4 COCONUT GROVE |
        And the "self" link of the first address in the list is followed
        Then the response will contain:
            """
            {
                "structured": {
                    "number": {
                        "number": 4
                    },
                    "street": {
                        "name": "COCONUT GROVE",
                        "class": {
                            "code": "U",
                            "name": "UNCONFIRMED"
                        }
                    },
                    "confidence": -1,
                    "locality": {
                        "name": "CHRISTMAS ISLAND",
                        "class": {
                            "code": "U",
                            "name": "UNOFFICIAL SUBURB"
                        }
                    },
                    "postcode": "6798",
                    "state": {
                        "name": "OTHER TERRITORIES",
                        "abbreviation": "OT"
                    }
                },
                "pid": "GAOT_718446632",
                "mla": [
                    "4 COCONUT GROVE",
                    "CHRISTMAS ISLAND OT 6798"
                ],
                "sla": "4 COCONUT GROVE, CHRISTMAS ISLAND OT 6798"
            }
            """
        And the response will contain the following links:
            | rel  | uri                       | title | type |
            | self | /addresses/GAOT_718446632 |       |      |
