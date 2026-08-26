# @mountainpass/addressr-mcp

MCP (Model Context Protocol) server for Australian address search and validation powered by [Addressr](https://addressr.io).

Search, validate, and retrieve detailed Australian address data from the Geocoded National Address File (G-NAF), directly from your AI assistant.

## How It Works

`@mountainpass/addressr-mcp` is a thin proxy. The G-NAF dataset (roughly 13 million Australian addresses, see [Data Source](#data-source) below) stays on the Addressr API. It never enters the MCP server or your AI client's context window.

### What enters context

When your AI client connects:

1. **At session start**: the tool schemas (the `search-*`, `get-*`, and `health` tools) load once, just a few hundred tokens describing what each tool does.
2. **Per tool call**: only the matched results come back. A search returns up to 8 candidates with their canonical URLs; a get fetches one record.

The full dataset never enters context. Each call is scoped to the query.

### Example flow

Ask: _"What's the address ID for 1 George Street, Sydney?"_

1. The AI client picks `search-addresses` and calls it with `q="1 george st sydney"`.
2. The MCP server forwards the query to the Addressr API. The API returns up to 8 ranked matches.
3. The AI client picks the best match and calls `get-address` with that match's canonical URL.
4. The MCP server returns the full record (geocoding, structured components, confidence score).

Context footprint across the whole flow: tool schemas + up to 8 search results + 1 full address record. The dataset stays on the server.

For the response shape and HATEOAS navigation pattern, see [Response Format](#response-format) and [HATEOAS Workflow](#hateoas-workflow) below.

## Quick Start

### 1. Get an API Key

Sign up at [RapidAPI](https://rapidapi.com/addressr-addressr-default/api/addressr) to get your API key.

### 2. Configure Your AI Client

Set `ADDRESSR_RAPIDAPI_KEY` in your environment before starting your AI client. The MCP server inherits it from the parent process.

#### Claude Desktop

Claude Desktop launched from the Dock or Spotlight does not inherit shell environment variables. Set the key directly in the local config file (never committed):

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "addressr": {
      "command": "npx",
      "args": ["-y", "@mountainpass/addressr-mcp"],
      "env": {
        "ADDRESSR_RAPIDAPI_KEY": "your-rapidapi-key"
      }
    }
  }
}
```

#### Claude Code

```bash
export ADDRESSR_RAPIDAPI_KEY=your-rapidapi-key
claude mcp add addressr -- npx -y @mountainpass/addressr-mcp
```

#### Cursor

Add to `.cursor/mcp.json` (local config, never committed):

```json
{
  "mcpServers": {
    "addressr": {
      "command": "npx",
      "args": ["-y", "@mountainpass/addressr-mcp"],
      "env": {
        "ADDRESSR_RAPIDAPI_KEY": "your-rapidapi-key"
      }
    }
  }
}
```

#### VS Code

Add to `.vscode/mcp.json` (local config, never committed):

```json
{
  "servers": {
    "addressr": {
      "command": "npx",
      "args": ["-y", "@mountainpass/addressr-mcp"],
      "env": {
        "ADDRESSR_RAPIDAPI_KEY": "your-rapidapi-key"
      }
    }
  }
}
```

## Key Safety

The setup snippets above paste your RapidAPI key in plaintext. That is the simplest path, but it has real leak vectors:

- **Claude Desktop config** (`~/Library/Application Support/Claude/claude_desktop_config.json`) is user-readable and is typically swept up by OS backups (Time Machine, or iCloud Drive if your Library is synced).
- **`.cursor/mcp.json`** and **`.vscode/mcp.json`** sit inside your project directory and are easy to commit by accident. If you keep the key there, add the file to `.gitignore`.
- **`export ADDRESSR_RAPIDAPI_KEY=...`** is written to `~/.zsh_history` or `~/.bash_history` and survives there until pruned.

Pick whichever mitigation you can live with:

### 1. Skip shell history with a leading space

If your shell ignores space-prefixed commands (`setopt HIST_IGNORE_SPACE` in zsh, `HISTCONTROL=ignorespace` in bash), prefix the `export`:

```bash
 export ADDRESSR_RAPIDAPI_KEY=your-rapidapi-key
claude mcp add addressr -- npx -y @mountainpass/addressr-mcp
```

### 2. macOS Keychain

Store the key once:

```bash
security add-generic-password -s addressr-rapidapi -a "$USER" -w
```

Load it when starting Claude Code:

```bash
export ADDRESSR_RAPIDAPI_KEY=$(security find-generic-password -s addressr-rapidapi -w)
claude mcp add addressr -- npx -y @mountainpass/addressr-mcp
```

### 3. 1Password CLI

If you use 1Password, reference the key from a vault with `op://` syntax in a committed `.env.tpl` (secrets stay in 1Password, the template is safe to commit):

```
ADDRESSR_RAPIDAPI_KEY={{ op://Private/addressr-rapidapi/credential }}
```

Hydrate at runtime without writing the key to disk:

```bash
op run --env-file=.env.tpl -- claude mcp add addressr -- npx -y @mountainpass/addressr-mcp
```

### 4. Wrapper script for Claude Desktop / Cursor / VS Code

Clients that cannot inherit shell environment (Claude Desktop launched from the Dock, for example) can be pointed at a wrapper script that loads the key from Keychain or 1Password at launch time, instead of having the key embedded in the config JSON:

```json
{
  "mcpServers": {
    "addressr": {
      "command": "bash",
      "args": ["/absolute/path/to/run-addressr-mcp.sh"]
    }
  }
}
```

`run-addressr-mcp.sh`:

```bash
#!/usr/bin/env bash
set -e
export ADDRESSR_RAPIDAPI_KEY=$(security find-generic-password -s addressr-rapidapi -w)
exec npx -y @mountainpass/addressr-mcp
```

Then:

```bash
chmod 700 run-addressr-mcp.sh
```

### 5. Restrict permissions on any file that does hold the key

```bash
chmod 600 ~/Library/Application\ Support/Claude/claude_desktop_config.json
chmod 600 .cursor/mcp.json .vscode/mcp.json 2>/dev/null || true
```

### If the key leaks

Rotate it immediately at [RapidAPI → My Apps](https://rapidapi.com/developer/apps). Deleting the key from a committed file does not remove it from git history, and the key remains valid until you revoke it upstream.

## Environment Variables

| Variable                | Description                                                         |
| ----------------------- | ------------------------------------------------------------------- |
| `ADDRESSR_RAPIDAPI_KEY` | Your RapidAPI key (preferred)                                       |
| `RAPIDAPI_KEY`          | Fallback RapidAPI key                                               |
| `ADDRESSR_API_URL`      | Override API base URL (default: `https://addressr.p.rapidapi.com/`) |
| `RAPIDAPI_HOST`         | Override API host (default: `addressr.p.rapidapi.com`)              |

## Available Tools

### Search Tools

Search tools return an envelope with `status`, `headers`, and `body`. The `headers.link` field is a parsed array of HATEOAS links (`{ uri, rel, anchor?, title? }`) that can be followed to retrieve detail resources.

#### search-addresses

Search Australian addresses by street, suburb, or postcode. Returns up to 8 results per page with standard address format, relevance score, and property ID (PID).

**Parameters:**

- `q` (required): Search query, e.g. `"1 george st sydney"`, `"2000"`, `"pyrmont nsw"`
- `page` (optional): Page number for paginated results

#### search-postcodes

Search Australian postcodes by partial text or number. Returns matching postcodes and their associated localities.

**Parameters:**

- `q` (required): Search query, e.g. `"2000"`, `"200"`, `"sydney"`
- `page` (optional): Page number for paginated results

#### search-localities

Search Australian localities (suburbs) by name. Returns matching localities with state and postcode.

**Parameters:**

- `q` (required): Search query, e.g. `"sydney"`, `"melbourne"`, `"pyrmont"`
- `page` (optional): Page number for paginated results

#### search-states

Search Australian states and territories by name or abbreviation. Returns all matching states.

**Parameters:**

- `q` (required): Search query, e.g. `"NSW"`, `"New South Wales"`, `"Victoria"`
- `page` (optional): Page number for paginated results

### Detail Tools

Detail tools accept a canonical `url` from search results and return the full resource.

#### get-address

Get full address details by URL. Follow the canonical link from search results to retrieve geocoding (lat/long), structured components (street, suburb, state, postcode, unit/flat), and confidence score.

**Parameters:**

- `url` (required): Canonical URL from search-addresses results, e.g. `"https://addressr.p.rapidapi.com/addresses/GANSW710280564"`

#### get-locality

Get full locality details by URL. Follow the canonical link from search results to retrieve structured locality data including name, state, postcode, and class.

**Parameters:**

- `url` (required): Canonical URL from search-localities results, e.g. `"https://addressr.p.rapidapi.com/localities/GAUTH-12345"`

#### get-postcode

Get full postcode details by URL. Follow the canonical link from search results to retrieve the postcode and associated localities.

**Parameters:**

- `url` (required): Canonical URL from search-postcodes results, e.g. `"https://addressr.p.rapidapi.com/postcodes/2000"`

#### get-state

Get full state details by URL. Follow the canonical link from search results to retrieve state name and abbreviation.

**Parameters:**

- `url` (required): Canonical URL from search-states results, e.g. `"https://addressr.p.rapidapi.com/states/NSW"`

### Utility Tools

#### health

Check API service status. Returns version, timestamp, and health status.

## HATEOAS Workflow

The MCP server is designed around HATEOAS (Hypermedia as the Engine of Application State):

1. **Search** with a search tool (e.g. `search-addresses q="1 george st sydney"`)
2. **Inspect** the `headers.link` array for `rel="canonical"` links with `anchor` pointing to result items
3. **Follow** the canonical URL with the matching detail tool (e.g. `get-address url="..."`)
4. **Navigate further** using `rel="related"` links in detail responses

## Response Format

All tools return an envelope:

```json
{
  "status": 200,
  "headers": {
    "content-type": "application/json; charset=utf-8",
    "link": [
      { "uri": "/addresses/GANSW710280564", "rel": "canonical", "anchor": "#/0" },
      { "uri": "/addresses?page=1&q=1+george+st+sydney", "rel": "next" }
    ]
  },
  "body": { ... }
}
```

The `body` is the raw JSON from the Addressr API. The `headers.link` array is parsed from the HTTP `Link` header for machine-readable navigation.

## Local Development

Clone the repo and configure Claude Code:

```bash
git clone https://github.com/mountain-pass/addressr.git
cd addressr/packages/addressr-mcp
op inject -i .env.tpl -o .env
```

The `.mcp.json` in the repo root configures the local server. Claude Code will discover it automatically when started in this directory.

## Data Source

Address data is sourced from the [Geocoded National Address File (G-NAF)](https://data.gov.au/dataset/ds-dga-19432f89-dc3a-4ef3-b943-5326ef1dbecc), Australia's authoritative address database maintained by Geoscape Australia.

## License

Apache-2.0
