Feature: Structured Address

    #GAOT_718709561

    @geo
    Scenario: Getting Structured Address
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link template is followed with:
            | q | 4 COCONUT GROVE, CHRISTMAS ISLAND |
        And the "self" link of the first address in the list is followed
        Then the response will contain:
            """
            {
                "structured": {
                    "number": {
                        "number": 4
                    },
                    "street": {
                        "name": "COCONUT",
                        "class": {
                            "code": "C",
                            "name": "CONFIRMED"
                        },
                        "type": {
                            "code": "GROVE",
                            "name": "GR"
                        }
                    },
                    "confidence": 2,
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
                "pid": "GAOT_717321166",
                "geocoding": {
                    "geocodes": [
                        {
                            "default": false,
                            "latitude": -10.41686106,
                            "longitude": 105.68090917,
                            "reliability": {
                                "code": "2",
                                "name": "WITHIN ADDRESS SITE BOUNDARY OR ACCESS POINT"
                            },
                            "type": {
                                "code": "PC",
                                "name": "PROPERTY CENTROID"
                            }
                        },
                        {
                            "default": true,
                            "latitude": -10.41686106,
                            "longitude": 105.68090917,
                            "type": {
                                "code": "PC",
                                "name": "PROPERTY CENTROID"
                            }
                        }
                    ],
                    "level": {
                        "code": "7",
                        "name": "LOCALITY,STREET, ADDRESS"
                    }
                },
                "mla": [
                    "4 COCONUT GR",
                    "CHRISTMAS ISLAND OT 6798"
                ],
                "sla": "4 COCONUT GR, CHRISTMAS ISLAND OT 6798"
            }
            """
        And the response will contain the following links:
            | rel  | uri                       | title | type |
            | self | /addresses/GAOT_717321166 |       |      |


    @not-geo
    Scenario: Getting Structured Address
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link template is followed with:
            | q | 4 COCONUT GROVE, CHRISTMAS ISLAND |
        And the "self" link of the first address in the list is followed
        Then the response will contain:
            """
            {
                "structured": {
                    "number": {
                        "number": 4
                    },
                    "street": {
                        "name": "COCONUT",
                        "type": {
                            "code": "GROVE",
                            "name": "GR"
                        },
                        "class": {
                            "code": "C",
                            "name": "CONFIRMED"
                        }
                    },
                    "confidence": 2,
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
                "pid": "GAOT_717321166",
                "mla": [
                    "4 COCONUT GR",
                    "CHRISTMAS ISLAND OT 6798"
                ],
                "sla": "4 COCONUT GR, CHRISTMAS ISLAND OT 6798"
            }
            """
        And the response will contain the following links:
            | rel  | uri                       | title | type |
            | self | /addresses/GAOT_717321166 |       |      |


    @not-nodejs @not-cli @not-cli2
    Scenario: Allow CORS for Root
        When CORS is set to "*"
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link template is followed with:
            | q | 4 COCONUT GROVE, CHRISTMAS ISLAND |
        And the "self" link of the first address in the list is followed
        Then the reponse will have a "access-control-allow-origin" of "*"


    @not-nodejs @not-cli @not-cli2
    Scenario: Swagger Docs No CORS
        When CORS is not set
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link template is followed with:
            | q | 4 COCONUT GROVE, CHRISTMAS ISLAND |
        And the "self" link of the first address in the list is followed
        Then the reponse will not have a "access-control-allow-origin" header
