# Addressr

![alt text](https://addressr.mountain-pass.com.au/icons/icon-144x144.png 'Addressr')

[Free Australian Address Validation, Search and Autocomplete](https://addressr.mountain-pass.com.au)

## Quick Start

1. Sign up at https://addressr.mountain-pass.com.au/signup/ and get your username and password
2. Install addressr
   ```
   npm install addressr -g
   ```
3. Start elastic search. For example
   ```
   docker pull docker.elastic.co/elasticsearch/elasticsearch:7.2.0
   docker run -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" docker.elastic.co/elasticsearch/elasticsearch:7.2.0
   ```
4. Start mongodb. For example
   ```
   docker pull mongo:4.0.11
   mkdir ~/data
   docker run -d -p 27017:27017 -v ~/data:/data/db MONGO_INITDB_ROOT_USERNAME=root MONGO_INITDB_ROOT_PASSWORD=example mongo:4.0.11
   ```
5. Start API server
   ```
   export ADDRESSR_USERNAME=<username>
   export ADDRESSR_PASSWORD=<password>
   export ELASTIC_PORT=9200
   export ELASTIC_HOST=localhost
   export MONGO_USERNAME=root
   export MONGO_PASSWORD=example
   export MONGO_URL=mongodb://localhost:27017
   addressr-server
   ```
6. Run data Loader
   ```
   export ADDRESSR_USERNAME=<username>
   export ADDRESSR_PASSWORD=<password>
   export ELASTIC_PORT=9200
   export ELASTIC_HOST=localhost
   export MONGO_USERNAME=root
   export MONGO_PASSWORD=example
   export MONGO_URL=mongodb://localhost:27017
   addressr-loader
   ```
7. OK, so we streched the truth a bit with the "Quick Start" heading. The truth is that it takes quite a while to download, store and index the 13+ million addresses from data.gov.au. So make a coffee, or tea, or find something else to do and come back in about an hour when it's done.
8. Search for an address
   ```
   curl -i http://localhost:8080/addresses?q=LEVEL+25,+TOWER+3
   ```
9. Wire you address form up to the address-server api.

## How it Works

```

                             ┌──────────────────┐
                1. Get       │                  │
          ┌──────G-NAF──────▶│   data.gov.au    │
          │                  │                  │
          │                  └──────────────────┘
          │                       .─────────.
          │                      (           )
 ┌────────────────┐              │`─────────'│
 │................│ 2. Save and  │           │
 │.address-loader.│───extract───▶│filesystem │
 │................│    G-NAF     │           │
 └────────────────┘              └           ┘
          │                       `─────────'
          │                       .─────────.
          │                      (           )
          │                      │`─────────'│              ┌───────────────────────┐
          │      3a. Index       │  elastic  │     Search   │.......................│
          ├────────G-NAF────────▶│  search   │◀──Addresses──│◀───────────────────┐..│
          │       records        │           │              │....................│..│
          │                      └           ┘              │....................│..│
          │                       `─────────'               │....................│..│
          │                       .─────────.               │....addressr-server.│..│
          │                      (           )              │....................│..│
          │                      │`─────────'│              │....................│..│
          │      3b. Store       │           │      Get     │....................│..│
          └────────G-NAF────────▶│  mongodb  │◀───Address───│◀──┐................│..│
                  Records        │           │    Details   │...│................│..│
                                 └           ┘              └───┴────────────────┴──┘
                                  `─────────'                   ▲                ▲
                                                                │                │
                                                               GET               │
                                                         /addresses/{ID}         │
                                                                │               GET
                                                                │        /addresses?q=...
                                                                │                │
                                                             ┌──────────────────────┐
                                                             │                      │
                                                             │                      │
                                                             │        client        │
                                                             │                      │
                                                             │                      │
                                                             └──────────────────────┘
```

## System requirements

### Elastic Search:

elasticsearch-oss >= 7.2.0 with 1.4GiB mem

### Mongo DB

mongo >= 4.0.11 with 3.4GiB mem

Mongo's memory usage is complicated and the amount it uses depends on how much is available. In our expereince, the more memory it had available the laster the data load would run.

### Addressr Loader

Node JS >= 11.14.0 with 1GiB of memory

### Addressr Server

Node JS >= 11.14.0 with 64MiB of memory
