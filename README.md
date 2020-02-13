# Addressr

![Addressr](https://addressr.mountain-pass.com.au/icons/icon-144x144.png 'Addressr')

[Free Australian Address Validation, Search and Autocomplete](https://addressr.mountain-pass.com.au)

## Quick Start

1. Install addressr
   ```
   npm install @mountainpass/addressr -g
   ```
   NOTE: If you are running windows, you'll need to use [wsl](https://docs.microsoft.com/en-us/windows/wsl/install-win10)
2. Start elastic search. For example
   ```
   docker pull docker.elastic.co/elasticsearch/elasticsearch:7.2.0
   docker run -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" docker.elastic.co/elasticsearch/elasticsearch:7.2.0
   ```
3. Start API server
   ```
   export ELASTIC_PORT=9200
   export ELASTIC_HOST=localhost
   addressr-server
   ```
4. Run data Loader
   ```
   export ELASTIC_PORT=9200
   export ELASTIC_HOST=localhost
   export ADDRESSR_INDEX_TIMEOUT=30s
   export ADDRESSR_INDEX_BACKOFF=1000
   export ADDRESSR_INDEX_BACKOFF_INCREMENT=1000
   export ADDRESSR_INDEX_BACKOFF_MAX=10000
   addressr-loader
   ```
5. OK, so we stretched the truth a bit with the "Quick Start" heading. The truth is that it takes quite a while to download, store and index the 13+ million addresses from data.gov.au. So make a coffee, or tea, or find something else to do and come back in about an hour when it's done.
6. Search for an address
   ```
   curl -i http://localhost:8080/addresses?q=LEVEL+25,+TOWER+3
   ```
7. Wire you address form up to the address-server api.
8. An updated G-NAF is released every 3 months. Put `addressr-loader` in a cron job or similar to keep addressr regularly updated

## How it Works

![How it works](./addressr.svg 'How it works')

## System requirements

### Elastic Search:

elasticsearch-oss >= 7.2.0 with 1.4GiB of memory

### Addressr Loader

Node JS >= 11.14.0 with 1GiB of memory

### Addressr Server

Node JS >= 11.14.0 with 64MiB of memory
