Feature: Address


    Scenario: Address Details Mapping - Lot Numbes
        Given the following address detail:
            """
            {
                "ADDRESS_DETAIL_PID": "GAQLD163157353",
                "DATE_CREATED": "2010-04-21",
                "DATE_LAST_MODIFIED": "2018-08-03",
                "DATE_RETIRED": "",
                "BUILDING_NAME": "",
                "LOT_NUMBER_PREFIX": "",
                "LOT_NUMBER": "16",
                "LOT_NUMBER_SUFFIX": "",
                "FLAT_TYPE_CODE": "",
                "FLAT_NUMBER_PREFIX": "",
                "FLAT_NUMBER": "",
                "FLAT_NUMBER_SUFFIX": "",
                "LEVEL_TYPE_CODE": "",
                "LEVEL_NUMBER_PREFIX": "",
                "LEVEL_NUMBER": "",
                "LEVEL_NUMBER_SUFFIX": "",
                "NUMBER_FIRST_PREFIX": "",
                "NUMBER_FIRST": "",
                "NUMBER_FIRST_SUFFIX": "",
                "NUMBER_LAST_PREFIX": "",
                "NUMBER_LAST": "",
                "NUMBER_LAST_SUFFIX": "",
                "STREET_LOCALITY_PID": "QLD180101",
                "LOCATION_DESCRIPTION": "",
                "LOCALITY_PID": "QLD69",
                "ALIAS_PRINCIPAL": "P",
                "POSTCODE": "4378",
                "PRIVATE_STREET": "",
                "LEGAL_PARCEL_ID": "16/SP210455",
                "CONFIDENCE": "0",
                "ADDRESS_SITE_PID": "162994566",
                "LEVEL_GEOCODED_CODE": "7",
                "PROPERTY_PID": "",
                "GNAF_PROPERTY_PID": "40894620",
                "PRIMARY_SECONDARY": ""
            }
            """
        And the following context:
            """
            {
                "Authority_Code_LOCALITY_CLASS_AUT_psv": [
                    {
                        "CODE": "G",
                        "NAME": "GAZETTED LOCALITY"
                    }
                ],
                "Authority_Code_STREET_CLASS_AUT_psv": [
                    {
                        "CODE": "C",
                        "NAME": "CONFIRMED"
                    }
                ],
                "Authority_Code_STREET_TYPE_AUT_psv": [
                    {
                        "CODE": "ROAD",
                        "NAME": "RD",
                        "DESCRIPTION": "RD"
                    }
                ],
                "state": "QLD",
                "stateName": "QUEENSLAND"
            }
            """
        And the following street locality:
            """
            {
                "STREET_LOCALITY_PID": "QLD180101",
                "DATE_CREATED": "2017-08-10",
                "DATE_RETIRED": "",
                "STREET_CLASS_CODE": "C",
                "STREET_NAME": "AERODROME",
                "STREET_TYPE_CODE": "ROAD",
                "STREET_SUFFIX_CODE": "",
                "LOCALITY_PID": "QLD69",
                "GNAF_STREET_PID": "3169537",
                "GNAF_STREET_CONFIDENCE": "2",
                "GNAF_RELIABILITY_CODE": "4"
            }
            """
        And the following locality:
            """
            {
                "LOCALITY_PID": "QLD69",
                "DATE_CREATED": "2016-08-10",
                "DATE_RETIRED": "",
                "LOCALITY_NAME": "APPLETHORPE",
                "PRIMARY_POSTCODE": "",
                "LOCALITY_CLASS_CODE": "G",
                "STATE_PID": "3",
                "GNAF_LOCALITY_PID": "198011",
                "GNAF_RELIABILITY_CODE": "5"
            }
            """
        Then the address details will map to the following address:
            """
            {
                "structured": {
                    "street": {
                        "name": "AERODROME",
                        "type": {
                            "code": "ROAD",
                            "name": "RD"
                        },
                        "class": {
                            "code": "C",
                            "name": "CONFIRMED"
                        }
                    },
                    "confidence": 0,
                    "locality": {
                        "name": "APPLETHORPE",
                        "class": {
                            "code": "G",
                            "name": "GAZETTED LOCALITY"
                        }
                    },
                    "postcode": "4378",
                    "lotNumber": {
                        "number": "16"
                    },
                    "state": {
                        "name": "QUEENSLAND",
                        "abbreviation": "QLD"
                    }
                },
                "pid": "GAQLD163157353",
                "_id": "GAQLD163157353",
                "mla": [
                    "LOT 16 AERODROME RD",
                    "APPLETHORPE QLD 4378"
                ],
                "sla": "LOT 16 AERODROME RD, APPLETHORPE QLD 4378"
            }
            """


    Scenario: Searching Address List
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link template is followed with:
            | q | 4 COCONUT GROVE |
        Then the returned address list will contain many addresses
        And the returned address list will include:
            """
            {
                "sla": "4 COCONUT GROVE, CHRISTMAS ISLAND OT 6798",
                "score": 330.40973,
                "links": {
                    "self": {
                        "href": "/addresses/GAOT_718446632"
                    }
                }
            }
            """
        And the response will contain the following links:
            | rel         | uri                                      | title                 | type      |
            | describedby | /docs/#operations-addresses-getAddresses | getAddresses API Docs | text/html |
            | self        | /addresses?q=4+COCONUT+GROVE             |                       |           |
            | first       | /addresses?q=4+COCONUT+GROVE             |                       |           |
            | next        | /addresses?q=4+COCONUT+GROVE&p=2         |                       |           |
        And the response will contain the following link template:
            | rel                                                       | uri              | title                 | type             | var-base                                    |
            | https://addressr.mountain-pass.com.au/rels/address-search | /addresses{?q,p} | Get List of Addresses | application/json | /api-docs#/paths/~1addresses/get/parameters |



    Scenario: Searching Address List - Next Page
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link template is followed with:
            | q | 4 COCONUT GROVE |
        And the "next" link is followed
        Then the returned address list will contain many addresses
        And the returned address list will NOT include:
            """
            {
                "sla": "4 COCONUT GROVE, CHRISTMAS ISLAND OT 6798",
                "score": 330.40973,
                "links": {
                    "self": {
                        "href": "/addresses/GAOT_718446632"
                    }
                }
            }
            """
        And the response will contain the following links:
            | rel         | uri                                      | title                 | type      |
            | describedby | /docs/#operations-addresses-getAddresses | getAddresses API Docs | text/html |
            | self        | /addresses?q=4+COCONUT+GROVE&p=2         |                       |           |
            | first       | /addresses?q=4+COCONUT+GROVE             |                       |           |
            | prev        | /addresses?q=4+COCONUT+GROVE             |                       |           |
            | next        | /addresses?q=4+COCONUT+GROVE&p=3         |                       |           |
        And the response will contain the following link template:
            | rel                                                       | uri              | title                 | type             | var-base                                    |
            | https://addressr.mountain-pass.com.au/rels/address-search | /addresses{?q,p} | Get List of Addresses | application/json | /api-docs#/paths/~1addresses/get/parameters |



    Scenario: Searching Address List - Next Next Page
        Given an address database is loaded from gnaf
        When the root api is requested
        And the "https://addressr.mountain-pass.com.au/rels/address-search" link template is followed with:
            | q | 4 COCONUT GROVE |
        And the "next" link is followed
        And the "next" link is followed
        Then the returned address list will contain many addresses
        And the returned address list will NOT include:
            """
            {
                "sla": "4 COCONUT GROVE, CHRISTMAS ISLAND OT 6798",
                "score": 330.40973,
                "links": {
                    "self": {
                        "href": "/addresses/GAOT_718446632"
                    }
                }
            }
            """
        And the response will contain the following links:
            | rel         | uri                                      | title                 | type      |
            | describedby | /docs/#operations-addresses-getAddresses | getAddresses API Docs | text/html |
            | self        | /addresses?q=4+COCONUT+GROVE&p=3         |                       |           |
            | first       | /addresses?q=4+COCONUT+GROVE             |                       |           |
            | prev        | /addresses?q=4+COCONUT+GROVE&p=2         |                       |           |
            | next        | /addresses?q=4+COCONUT+GROVE&p=4         |                       |           |
        And the response will contain the following link template:
            | rel                                                       | uri              | title                 | type             | var-base                                    |
            | https://addressr.mountain-pass.com.au/rels/address-search | /addresses{?q,p} | Get List of Addresses | application/json | /api-docs#/paths/~1addresses/get/parameters |

