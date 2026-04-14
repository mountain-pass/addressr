---
'@mountainpass/addressr': patch
---

Add postcode and state detail endpoints, make q optional on search

- Add /postcodes/{postcode} detail endpoint with associated localities
- Add /states/{abbreviation} detail endpoint with localities and postcodes
- Make q parameter optional on /postcodes and /states (omit to list all)
- Allow 0+ characters for q on postcode and state search
