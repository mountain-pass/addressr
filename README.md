# Addressr

![Addressr](https://addressr.mountain-pass.com.au/icons/icon-144x144.png 'Addressr')

[Australian Address Validation, Search and Autocomplete](https://addressr.mountain-pass.com.au) - [addressr.mountain-pass.com.au](https://addressr.mountain-pass.com.au)

[![GitHub license](https://img.shields.io/github/license/mountain-pass/addressr)](https://github.com/mountain-pass/addressr/blob/master/LICENSE) [![npm](https://img.shields.io/npm/v/@mountainpass/addressr)](https://www.npmjs.com/package/@mountainpass/addressr) [![npm downloads](https://img.shields.io/npm/dm/@mountainpass/addressr)](https://www.npmjs.com/package/@mountainpass/addressr) [![Docker Image Version (latest by date)](https://img.shields.io/docker/v/mountainpass/addressr?label=image%20version)](https://hub.docker.com/r/mountainpass/addressr) [![Docker Pulls](https://img.shields.io/docker/pulls/mountainpass/addressr)](https://hub.docker.com/r/mountainpass/addressr)

[![Addressr Build Status](https://circleci.com/gh/mountain-pass/addressr.svg?style=shield)](https://circleci.com/gh/mountain-pass/addressr) [![Maintainability](https://api.codeclimate.com/v1/badges/e5117809cacb7e32eb5c/maintainability)](https://codeclimate.com/github/mountain-pass/addressr/maintainability) [![Test Coverage](https://api.codeclimate.com/v1/badges/e5117809cacb7e32eb5c/test_coverage)](https://codeclimate.com/github/mountain-pass/addressr/test_coverage)

[![GitHub issues](https://img.shields.io/github/issues/mountain-pass/addressr)](https://github.com/mountain-pass/addressr/issues) [![GitHub pull requests](https://img.shields.io/github/issues-pr/mountain-pass/addressr)](https://github.com/mountain-pass/addressr/pulls) [![Libraries.io dependency status for latest release](https://img.shields.io/librariesio/release/npm/@mountainpass/addressr)](https://libraries.io/npm/@mountainpass%2Faddressr) [![Join the chat at https://gitter.im/mountainpass-addressr/community](https://badges.gitter.im/mountainpass-addressr/community.svg)](https://gitter.im/mountainpass-addressr/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

# ToC

- [Addressr](#addressr)
- [ToC](#toc)
- [Quick Start](#quick-start)
  - [Self Hosted](#self-hosted)
  - [How it Works](#how-it-works)
  - [Additional Settings](#additional-settings)
  - [System requirements](#system-requirements)
    - [Elastic Search:](#elastic-search)
    - [Addressr Loader](#addressr-loader)
      - [Default](#default)
      - [With Geocoding enabled](#with-geocoding-enabled)
    - [Addressr Server](#addressr-server)

# Quick Start

## Self Hosted

1. Install addressr
   ```
   npm install @mountainpass/addressr -g
   ```
   NOTE: If you are running windows, you'll need to use [wsl](https://docs.microsoft.com/en-us/windows/wsl/install-win10)
2. Start elastic search. For example run
   ```
   docker pull docker.elastic.co/elasticsearch/elasticsearch:7.9.2
   docker run -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" docker.elastic.co/elasticsearch/elasticsearch:7.9.2
   ```
3. Start API server. In a second window run:
   ```
   export ELASTIC_PORT=9200
   export ELASTIC_HOST=localhost
   addressr-server-2
   ```
4. Setup the env vars for the data loader. In a third window run:

   ```
   export ELASTIC_PORT=9200
   export ELASTIC_HOST=localhost
   export ADDRESSR_INDEX_TIMEOUT=30s
   export ADDRESSR_INDEX_BACKOFF=1000
   export ADDRESSR_INDEX_BACKOFF_INCREMENT=1000
   export ADDRESSR_INDEX_BACKOFF_MAX=10000
   ```

   1. Optional - enable geocodes by setting the following env vars for the data loader. In the third window run:
      **NOTE:** with geocodes enabled, indexing takes much longer and needs much more memory. Only use turn them on if you need them. You can always add them later.

   ```
   export ADDRESSR_ENABLE_GEO=1
   export NODE_OPTIONS=--max_old_space_size=8196
   ```

   2. Optional - limit the addresses to a single state by setting the `COVERED_STATES` env var for the data loader.
      This dramatically speeds up indexing. For example, in the third window run:

   ```
   export COVERED_STATES=VIC,SA
   ```

   Valid values are:

   - ACT
   - NSW
   - NT
   - OT
   - QLD
   - SA
   - TAS
   - VIC
   - WA

5. Run data Loader. In the third window run:
   ```
   addressr-loader
   ```
6. OK, so we stretched the truth a bit with the "Quick Start" heading. The truth is that it takes quite a while to download, store and index the 13+ million addresses from data.gov.au. So make a coffee, or tea, or find something else to do and come back in about an hour when it's done.
7. Search for an address using the command line
   ```
   curl -i http://localhost:8080/addresses?q=LEVEL+25,+TOWER+3
   ```
8. An updated G-NAF is released every 3 months. Put `addressr-loader` in a cron job or similar to keep addressr regularly updated
9. Wire you address form up to the address-server api. The easiest way to do this is by using the [waychaser](https://waychaser.io) library as follows

## How it Works

![How it works](https://addressr.mountain-pass.com.au/static/addressr-43fb89f43718b9b9d05becd4cb045672.svg 'How it works')

## Additional Settings

| Environment Variable | Value       | Description                                           | Default |
| -------------------- | ----------- | ----------------------------------------------------- | ------- |
| ELASTIC_PROTOCOL     | http        | Connect to elastic search over http                   | ✅      |
| ELASTIC_PROTOCOL     | https       | Connect to elastic search over https                  |         |
| ELASTIC_USERNAME     | _blank_     | Connect to elastic search without authentication      | ✅      |
| ELASTIC_USERNAME     | _non-blank_ | Connect to elastic search with the specified username |         |
| ELASTIC_PASSWORD     | _blank_     | Connect to elastic search without authentication      | ✅      |
| ELASTIC_PASSWORD     | _non-blank_ | Connect to elastic search with the specified password |         |
| ELASTIC_PASSWORD     | _non-blank_ | Connect to elastic search with the specified password |         |
| PAGE_SIZE            | 8           | Number or records to return in a search               | ✅      |

NOTE: When adjusting PAGE_SIZE, you should take into account how quickly you want the initial results returned
to the user. In many use cases, you want this to be as fast as possible. If you need show more results to the
user, you are often better off leaving it a 8 and using the paging links to get more results while you are
displaying the first 8.

Why is the default 8 and not 10? [Mechanical Sympathy](https://dzone.com/articles/mechanical-sympathy)

## System requirements

### Elastic Search:

elasticsearch-oss >= 7.9.2 with 1.4GiB of memory

### Addressr Loader

#### Default

Node JS >= 11.14.0 with 1GiB of memory

#### With Geocoding enabled

Node JS >= 11.14.0 with 8GiB of memory

### Addressr Server

Node JS >= 11.14.0 with 64MiB of memory
