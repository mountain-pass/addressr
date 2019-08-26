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
7. Make a coffee and wait for `addressr-loader` to download the 13 million addresses from data.gov.au
8. Search for and address
   ```
   curl -i http://localhost:8080/addresses?q=LEVEL+25,+TOWER+3
   ```

### Docker-compose

TODO: Docker compose instructions

### Sign Up

TODO

## How it Works

TODO

## Loading the Addresses

TODO

## Running the API server

TODO

## System requirements

### Elastic Search:

elasticsearch-oss >= 7.2.0 with 1.4GiB mem

### Mongo DB

mongo >= 4.0.11 with 1.4GiB mem (very slow load time and very slow responses times while loading)

### Loader

Node JS >= 11.14.0 with 1GiB of memory

### API Server

Node JS >= 11.14.0 with 64MiB of memory
