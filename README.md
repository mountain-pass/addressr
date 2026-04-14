# Addressr

![Addressr](https://addressr.io/icons/icon-144x144.png 'Addressr')

**The only open-source, free self-hosted Australian address validation API.**

[Australian Address Validation, Search and Autocomplete](https://addressr.io) — [addressr.io](https://addressr.io)

[![GitHub license](https://img.shields.io/github/license/mountain-pass/addressr)](https://github.com/mountain-pass/addressr/blob/master/LICENSE) [![npm](https://img.shields.io/npm/v/@mountainpass/addressr)](https://www.npmjs.com/package/@mountainpass/addressr) [![npm downloads](https://img.shields.io/npm/dm/@mountainpass/addressr)](https://www.npmjs.com/package/@mountainpass/addressr)

[![GitHub issues](https://img.shields.io/github/issues/mountain-pass/addressr)](https://github.com/mountain-pass/addressr/issues) [![GitHub pull requests](https://img.shields.io/github/issues-pr/mountain-pass/addressr)](https://github.com/mountain-pass/addressr/pulls)

# About

Australian Address Validation, Search and Autocomplete powered by the Geocoded National Address File (G-NAF), Australia's **authoritative** address database with 15+ million addresses.

- **Validated addresses** from the official G-NAF source
- **Real-time autocomplete** with fuzzy matching
- **Locality, postcode, and state search** for area pickers
- **Geocoding** to latitude/longitude (optional)
- **Self-hosted or SaaS** — your choice, your data
- **Open source** — audit the code, customize as needed

# Why Addressr

|                                    | Addressr | [Addressify](https://addressify.com.au/) | [AddressFinder](https://addressfinder.com.au/) | [Geoscape](https://geoscape.com.au/) | Google Maps |
| ---------------------------------- | -------- | ---------------------------------------- | ---------------------------------------------- | ------------------------------------ | ----------- |
| Self-hosted                        | ✅       | ❌                                       | ❌                                             | ❌                                   | ❌          |
| Open source                        | ✅       | ❌                                       | ❌                                             | ❌                                   | ❌          |
| Free tier (unlimited, self-hosted) | ✅       | ❌                                       | ❌                                             | ❌                                   | ❌          |
| G-NAF data source                  | ✅       | ✅                                       | ✅                                             | ✅ (creator)                         | ❌          |
| Data sovereignty                   | ✅       | ❌                                       | ❌                                             | ❌                                   | ❌          |
| MCP integration for AI assistants  | ✅       | ❌                                       | ❌                                             | ❌                                   | ❌          |

**Stop paying Google Maps for Australian addresses.** Stop locking your data into third-party SaaS. Addressr gives you unlimited address validation on your own infrastructure, or a cheap hosted API if you prefer.

# Quick Start

## Use the Hosted API

The fastest way to get started. No infrastructure to manage.

1. Get an API key at [RapidAPI](https://rapidapi.com/addressr-addressr-default/api/addressr)
2. Search for an address:

   ```sh
   curl "https://addressr.p.rapidapi.com/addresses?q=1+george+st+sydney" \
     -H "x-rapidapi-key: YOUR_KEY" \
     -H "x-rapidapi-host: addressr.p.rapidapi.com"
   ```

## Use with AI Assistants

Connect Addressr to Claude, Cursor, VS Code Copilot, or any MCP-compatible AI assistant.

```json
{
  "mcpServers": {
    "addressr": {
      "command": "npx",
      "args": ["-y", "@mountainpass/addressr-mcp"],
      "env": { "RAPIDAPI_KEY": "your-key" }
    }
  }
}
```

Three tools available: **search-addresses**, **get-address**, and **health**. See [@mountainpass/addressr-mcp](https://github.com/mountain-pass/addressr-mcp) for full setup instructions.

## Self Hosted

Run Addressr on your own infrastructure for full control over your data.

1. Install addressr

   ```
   npm install @mountainpass/addressr -g
   ```

   NOTE: If you are running windows, you'll need to use [wsl](https://docs.microsoft.com/en-us/windows/wsl/install-win10)

2. Start open search. For example run

   ```
   docker pull opensearchproject/opensearch:1.3.20
   docker run -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" -e "plugins.security.disabled=true" opensearchproject/opensearch:1.3.20
   ```

3. Start API server. In a second window run:

   ```sh
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

   1. Optional — enable geocodes by setting the following env vars for the data loader. In the third window run:
      **NOTE:** with geocodes enabled, indexing takes much longer and needs much more memory. Only turn them on if you need them. You can always add them later.

   ```
   export ADDRESSR_ENABLE_GEO=1
   export NODE_OPTIONS=--max_old_space_size=8196
   ```

   2. Optional — limit the addresses to a single state by setting the `COVERED_STATES` env var for the data loader.
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

6. OK, so we stretched the truth a bit with the "Quick Start" heading. The truth is that it takes quite a while to download, store and index the 15+ million addresses from [data.gov.au](http://data.gov.au/). So make a coffee, or tea, or find something else to do and come back in about an hour when it's done.

7. Search for an address using the command line

   ```
   curl -i http://localhost:8080/addresses?q=LEVEL+25,+TOWER+3
   ```

8. An updated G-NAF is released every 3 months. Put `addressr-loader` in a cron job or similar to keep addressr regularly updated
9. Wire your address form up to the address-server api.

# API Endpoints

Addressr exposes a HATEOAS REST API. Start at the root (`/`) and follow links to discover endpoints. A supplementary OpenAPI 3.x spec is available at `/api-docs`.

| Endpoint                     | Purpose                                                            | Example                           |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------- |
| `GET /addresses?q=`          | Search and autocomplete addresses                                  | `/addresses?q=1+george+st+sydney` |
| `GET /addresses/{pid}`       | Get full address details (with links to locality, postcode, state) | `/addresses/GAOT_717882967`       |
| `GET /localities?q=`         | Search suburbs/localities by name                                  | `/localities?q=lilydale`          |
| `GET /localities/{pid}`      | Get locality details (with links to postcode, state)               | `/localities/loc9984d8beb142`     |
| `GET /postcodes?q=`          | Search postcodes (q optional)                                      | `/postcodes?q=3140`               |
| `GET /postcodes/{postcode}`  | Get postcode with associated localities                            | `/postcodes/6798`                 |
| `GET /states?q=`             | Search states/territories (q optional)                             | `/states?q=New`                   |
| `GET /states/{abbreviation}` | Get state details                                                  | `/states/NSW`                     |
| `GET /api-docs`              | OpenAPI 3.x specification                                          | `/api-docs`                       |
| `GET /health`                | Health check                                                       | `/health`                         |

## How it Works

![How it works](https://addressr.io/static/addressr-fe45ac1ba82b1dd5224f1c7356dfd1ca.svg 'How it works')

## Additional Settings

| Environment Variable                   | Value       | Description                                                                                               | Default |
| -------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- | ------- |
| ELASTIC_PROTOCOL                       | http        | Connect to open search over http                                                                          | ✅      |
| ELASTIC_PROTOCOL                       | https       | Connect to open search over https                                                                         |         |
| ELASTIC_USERNAME                       | _blank_     | Connect to open search without authentication                                                             | ✅      |
| ELASTIC_USERNAME                       | _non-blank_ | Connect to open search with the specified username                                                        |         |
| ELASTIC_PASSWORD                       | _blank_     | Connect to open search without authentication                                                             | ✅      |
| ELASTIC_PASSWORD                       | _non-blank_ | Connect to open search with the specified password                                                        |         |
| PAGE_SIZE                              | 8           | Number or records to return in a search                                                                   | ✅      |
| ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN   | _blank_     | An `Access-Control-Allow-Origin` response header is **not** returned                                      | ✅      |
| ADDRESSR_ACCESS_CONTROL_ALLOW_ORIGIN   | _non-blank_ | An `Access-Control-Allow-Origin` response header is returned with the value in the environment variable   |         |
| ADDRESSR_ACCESS_CONTROL_EXPOSE_HEADERS | _blank_     | An `Access-Control-Expose-Headers` response header is **not** returned                                    | ✅      |
| ADDRESSR_ACCESS_CONTROL_EXPOSE_HEADERS | _non-blank_ | An `Access-Control-Expose-Headers` response header is returned with the value in the environment variable |         |
| ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS  | _blank_     | An `Access-Control-Allow-Headers` response header is **not** returned                                     | ✅      |
| ADDRESSR_ACCESS_CONTROL_ALLOW_HEADERS  | _non-blank_ | An `Access-Control-Allow-Headers` response header is returned with the value in the environment variable  |         |

NOTE: When adjusting PAGE_SIZE, you should take into account how quickly you want the initial results returned to the user. In many use cases, you want this to be as fast as possible. If you need show more results to the user, you are often better off leaving it a 8 and using the paging links to get more results while you are displaying the first 8.

Why is the default 8 and not 10? [Mechanical Sympathy](https://dzone.com/articles/mechanical-sympathy)

## System requirements

### Open Search

opensearch >= 1.2.4 with 1.4GiB of memory

### Addressr Loader

#### Default

Node.js >= 22 with 1GiB of memory

#### With Geocoding enabled

Node.js >= 22 with 8GiB of memory

### Addressr Server

Node.js >= 22 with 64MiB of memory
