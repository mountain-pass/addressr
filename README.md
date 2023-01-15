# Addressr

![Addressr](https://addressr.io/icons/icon-144x144.png 'Addressr')

[Australian Address Validation, Search and Autocomplete](https://addressr.io) - [addressr.io](https://addressr.io)

[![GitHub license](https://img.shields.io/github/license/mountain-pass/addressr)](https://github.com/mountain-pass/addressr/blob/master/LICENSE) [![npm](https://img.shields.io/npm/v/@mountainpass/addressr)](https://www.npmjs.com/package/@mountainpass/addressr) [![npm downloads](https://img.shields.io/npm/dm/@mountainpass/addressr)](https://www.npmjs.com/package/@mountainpass/addressr) [![Docker Image Version (latest by date)](https://img.shields.io/docker/v/mountainpass/addressr?label=image%20version)](https://hub.docker.com/r/mountainpass/addressr) [![Docker Pulls](https://img.shields.io/docker/pulls/mountainpass/addressr)](https://hub.docker.com/r/mountainpass/addressr)

[![Addressr Build Status](https://circleci.com/gh/mountain-pass/addressr.svg?style=shield)](https://circleci.com/gh/mountain-pass/addressr) [![Maintainability](https://api.codeclimate.com/v1/badges/e5117809cacb7e32eb5c/maintainability)](https://codeclimate.com/github/mountain-pass/addressr/maintainability) [![Test Coverage](https://api.codeclimate.com/v1/badges/e5117809cacb7e32eb5c/test_coverage)](https://codeclimate.com/github/mountain-pass/addressr/test_coverage)

[![GitHub issues](https://img.shields.io/github/issues/mountain-pass/addressr)](https://github.com/mountain-pass/addressr/issues) [![GitHub pull requests](https://img.shields.io/github/issues-pr/mountain-pass/addressr)](https://github.com/mountain-pass/addressr/pulls) [![Libraries.io dependency status for latest release](https://img.shields.io/librariesio/release/npm/@mountainpass/addressr)](https://libraries.io/npm/@mountainpass%2Faddressr) [![Join the chat at https://gitter.im/mountainpass-addressr/community](https://badges.gitter.im/mountainpass-addressr/community.svg)](https://gitter.im/mountainpass-addressr/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

[![Gitter](https://badges.gitter.im/mountainpass-addressr/community.svg)](https://gitter.im/mountainpass-addressr/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge)

![Uptime Robot ratio (30 days)](https://img.shields.io/uptimerobot/ratio/m788652244-3e35661f9886333310f4dc2f?logo=data:image/png;base64,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)


# About

Australian Address Validation, Search and Autocomplete

## Australian Data Source

Addresses validated against the Geocoded National Address File (referred to as G-NAF), Australia’s **authoritative** address file.

## Software As or **NOT** As A Service

We love SaaS, but we know its not for everyone. SaaS or self hosted, we&apos;ve got you covered.

## Always Up-To-Date

Addressr automatically updates with the latest data, so you&apos;re never out-of-date.

## Real-time Address Validation

Add address autocomplete, search and validation to your forms.

## Easy To Use API

Build your solution quickly, with our straightforward API.

## Run On Your Own Infrastructure or Use Ours

On-premise or in the cloud, run Addressr on your own infrastructure, or leave all the hard work to us.

## Completely Free or Pay for Support

That&apos;s right, Addressr is completely free **Forever**.
Or for peace of mind for your mission critical solutions, get commercial support you can truly rely on.

# ToC

- [Addressr](#addressr)
- [About](#about)
  - [Australian Data Source](#australian-data-source)
  - [Software As or **NOT** As A Service](#software-as-or-not-as-a-service)
  - [Always Up-To-Date](#always-up-to-date)
  - [Real-time Address Validation](#real-time-address-validation)
  - [Easy To Use API](#easy-to-use-api)
  - [Run On Your Own Infrastructure or Use Ours](#run-on-your-own-infrastructure-or-use-ours)
  - [Completely Free or Pay for Support](#completely-free-or-pay-for-support)
- [ToC](#toc)
- [Quick Start](#quick-start)
  - [Self Hosted](#self-hosted)
  - [How it Works](#how-it-works)
  - [Additional Settings](#additional-settings)
  - [System requirements](#system-requirements)
    - [Open Search:](#open-search)
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
2. Start open search. For example run
   ```
   docker pull opensearchproject/opensearch:1.2.4
   docker run -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" opensearchproject/opensearch:1.2.4
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
6. OK, so we stretched the truth a bit with the "Quick Start" heading. The truth is that it takes quite a while to download, store and index the 13+ million addresses from [data.gov.au](http://data.gov.au/). So make a coffee, or tea, or find something else to do and come back in about an hour when it's done.
7. Search for an address using the command line
   ```
   curl -i http://localhost:8080/addresses?q=LEVEL+25,+TOWER+3
   ```
8. An updated G-NAF is released every 3 months. Put `addressr-loader` in a cron job or similar to keep addressr regularly updated
9. Wire you address form up to the address-server api.

## How it Works

![How it works](https://addressr.io/static/addressr-43fb89f43718b9b9d05becd4cb045672.svg 'How it works')

## Additional Settings

| Environment Variable | Value       | Description                                           | Default |
| -------------------- | ----------- | ----------------------------------------------------- | ------- |
| ELASTIC_PROTOCOL     | http        | Connect to open search over http                   | ✅      |
| ELASTIC_PROTOCOL     | https       | Connect to open search over https                  |         |
| ELASTIC_USERNAME     | _blank_     | Connect to open search without authentication      | ✅      |
| ELASTIC_USERNAME     | _non-blank_ | Connect to open search with the specified username |         |
| ELASTIC_PASSWORD     | _blank_     | Connect to open search without authentication      | ✅      |
| ELASTIC_PASSWORD     | _non-blank_ | Connect to open search with the specified password |         |
| PAGE_SIZE            | 8           | Number or records to return in a search               | ✅      |

NOTE: When adjusting PAGE_SIZE, you should take into account how quickly you want the initial results returned to the user. In many use cases, you want this to be as fast as possible. If you need show more results to the user, you are often better off leaving it a 8 and using the paging links to get more results while you are displaying the first 8.

Why is the default 8 and not 10? [Mechanical Sympathy](https://dzone.com/articles/mechanical-sympathy)

## System requirements

### Open Search:

opensearch >= 1.2.4 with 1.4GiB of memory

### Addressr Loader

#### Default

Node.js >= 12.11.0 with 1GiB of memory

#### With Geocoding enabled

Node.js >= 12.11.0 with 8GiB of memory

### Addressr Server

Node.js >= 12.11.0 with 64MiB of memory
