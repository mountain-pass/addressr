Feature: Structured Address

    #GAOT_718709561

    @geo
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
                "geocoding": {
                    "geocodes": [
                        {
                            "default": true,
                            "latitude": -10.48549891,
                            "longitude": 105.63584627,
                            "type": {
                                "code": "LOC",
                                "name": "LOCALITY"
                            }
                        }
                    ],
                    "level": {
                        "code": "4",
                        "name": "LOCALITY,NO STREET,NO ADDRESS"
                    }
                },
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


    @not-geo
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


    @not-nodejs @not-cli
    Scenario: Allow CORS for Root
        When CORS is set to "*"
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link template is followed with:
            | q | 4 COCONUT GROVE |
        And the "self" link of the first address in the list is followed
        Then the reponse will have a "access-control-allow-origin" of "*"


    @not-nodejs @not-cli
    Scenario: Swagger Docs No CORS
        When CORS is not set
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link template is followed with:
            | q | 4 COCONUT GROVE |
        And the "self" link of the first address in the list is followed
        Then the reponse will not have a "access-control-allow-origin" header
