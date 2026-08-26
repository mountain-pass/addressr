# C4 Architecture Model

This repo uses a hybrid C4 approach:

- C1/C2 are curated for intent and business context.
- C3/C4 are hand-curated (the C4 generator supports TypeScript only; addressr is JavaScript).

See ADRs 001-018 in `docs/decisions/` for the full decision context behind this architecture.

## C1: System Context

```mermaid
flowchart LR
  apiconsumer[API Consumer]
  mcpconsumer[AI Assistant / MCP Client]
  uiconsumer[React, Svelte, or Vue Application]
  website[addressr.io]
  uptimerobot[Uptime Robot]
  cfworker[CF Worker]
  rapidapi[RapidAPI]
  addressr[Addressr API]
  opensearch[OpenSearch]
  gnaf[G-NAF]
  selfhosted[Self-hosted]
  selfos[Own OpenSearch]

  apiconsumer -- API calls --> rapidapi
  mcpconsumer -- MCP tools --> addressrMcp[Addressr MCP Server]
  addressrMcp -- HATEOAS API calls --> rapidapi
  uiconsumer -- Addressr UI SDK --> rapidapi
  website -- React autocomplete --> addressrReact[Addressr React Adapter]
  addressrReact --> addressrCore[Addressr Core SDK]
  addressrCore -- Direct API call --> cfworker
  uptimerobot -- 5 min check --> cfworker
  cfworker -- API key --> rapidapi
  rapidapi -- round-robin --> addressr
  addressr -- search --> opensearch
  gnaf -- CSV --> addressr
  gnaf -- CSV --> selfhosted
  selfhosted -- search --> selfos
```

## C2: Container View

```mermaid
flowchart TB
  apiconsumer["API Consumer<br/>(developer application)"]
  mcpconsumer["AI Assistant<br/>(MCP client)"]
  uiconsumer["Web Application<br/>(React, Svelte, or Vue)"]

  subgraph external["External Services"]
    rapidapi["RapidAPI Gateway<br/>(auth, billing, rate limit)"]
    cfworker["Cloudflare Worker<br/>(API key proxy)"]
    uptimerobot["Uptime Robot<br/>(availability monitor)"]
    netlify["addressr.io<br/>(Gatsby on Netlify)"]
    gnaf["G-NAF Dataset<br/>(data.gov.au)"]
  end

  subgraph aws["AWS ap-southeast-2"]
    subgraph eb["Elastic Beanstalk<br/>(2-4x t2/t3.nano, Spot)"]
      v2api["addressr-server-2<br/>(v2 HATEOAS API)<br/>WayCharter + Express"]
      v1api["addressr-server<br/>(v1 Swagger API)<br/>packaged but not deployed"]
    end
    loader_aws["addressr-loader<br/>(G-NAF pipeline)"]
    opensearch["AWS OpenSearch 1.3<br/>(addressr3 domain)<br/>t3.small.search x2"]
  end

  subgraph selfhost["Self-hosted Consumer"]
    npm["npm package<br/>@mountainpass/addressr"]
    docker["Docker image<br/>mountainpass/addressr<br/>(Distroless Node 22, v2)"]
    selfos["Own OpenSearch"]
    loader_self["addressr-loader<br/>(G-NAF pipeline)"]
  end

  subgraph sdk["Published npm Workspaces"]
    mcp["@mountainpass/addressr-mcp<br/>(stdio MCP server)"]
    core["@mountainpass/addressr-core<br/>(HATEOAS client SDK)"]
    adapters["React / Svelte / Vue adapters<br/>(accessible comboboxes)"]
  end

  apiconsumer -- API calls --> rapidapi
  mcpconsumer -- stdio --> mcp
  mcp -- HTTPS --> rapidapi
  uiconsumer --> adapters
  adapters --> core
  core -- RapidAPI clients --> rapidapi
  core -- addressr.io direct API --> cfworker
  netlify -- React autocomplete --> adapters
  uptimerobot -- 5min checks --> cfworker
  cfworker -- x-rapidapi-key --> rapidapi
  rapidapi -- round-robin --> v2api
  v2api -- search, get --> opensearch
  loader_aws -- bulk index --> opensearch
  gnaf -- HTTP download --> loader_aws
  gnaf -- HTTP download --> loader_self
  loader_self -- bulk index --> selfos
  npm -.-> loader_self
  docker -.-> loader_self
```

## C3: Component View

```mermaid
flowchart TB
  subgraph api["v2 API Server (src/)"]
    server2["server2.js<br/>(entry point)"]
    waycharter["waycharterServer.js<br/>(HATEOAS routes)"]
  end

  subgraph service["Service Layer (service/)"]
    addressService["address-service.js<br/>(search, get, load, index)"]
    defaultService["DefaultService.js<br/>(swagger controller)"]
    printVersion["printVersion.js"]
    setLinkOptions["setLinkOptions.js"]
  end

  subgraph client["Client Layer (client/)"]
    esClient["elasticsearch.js<br/>(OpenSearch connection,<br/>custom analyzers,<br/>bulk indexing)"]
  end

  subgraph data["Data Pipeline"]
    loaderBin["bin/addressr-loader.js"]
    streamDown["utils/stream-down.js<br/>(HTTP download)"]
  end

  subgraph swagger["v1 API Server"]
    serverV1["server.js<br/>(entry point)"]
    swaggerDef["swagger.js<br/>(swagger-tools middleware)"]
  end

  opensearch["OpenSearch 1.3"]

  subgraph clients["Imported Client Packages"]
    mcpServer["addressr-mcp/src/server.mjs<br/>(MCP tools + HATEOAS traversal)"]
    coreSdk["addressr-core/src/api.ts<br/>(typed search client)"]
    reactAdapter["addressr-react<br/>(Downshift comboboxes)"]
    svelteAdapter["addressr-svelte<br/>(Svelte comboboxes)"]
    vueAdapter["addressr-vue<br/>(Vue comboboxes)"]
  end

  rapidapi["RapidAPI HATEOAS endpoint"]

  server2 --> waycharter
  waycharter --> addressService
  serverV1 --> swaggerDef
  swaggerDef --> defaultService
  defaultService --> addressService
  addressService --> esClient
  loaderBin --> addressService
  addressService --> streamDown
  esClient --> opensearch
  mcpServer --> rapidapi
  coreSdk --> rapidapi
  reactAdapter --> coreSdk
  svelteAdapter --> coreSdk
  vueAdapter --> coreSdk
```

## C4: Code View

### v2 API (production path)

```mermaid
flowchart LR
  server2["src/server2.js"]
  waycharter["src/waycharterServer.js"]
  addressSvc["service/address-service.js"]
  esClient["client/elasticsearch.js"]
  version["version.js"]

  server2 --> waycharter
  server2 --> esClient
  waycharter --> addressSvc
  waycharter --> version
  addressSvc --> esClient
```

### Data Loader

```mermaid
flowchart LR
  loader["loader.js"]
  addressSvc["service/address-service.js"]
  esClient["client/elasticsearch.js"]
  streamDown["utils/stream-down.js"]

  loader --> addressSvc
  addressSvc --> esClient
  addressSvc --> streamDown
```

### v1 API (packaged, not deployed)

```mermaid
flowchart LR
  server["server.js"]
  swagger["swagger.js"]
  defaultSvc["service/DefaultService.js"]
  addressSvc["service/address-service.js"]
  esClient["client/elasticsearch.js"]

  server --> swagger
  swagger --> defaultSvc
  defaultSvc --> addressSvc
  addressSvc --> esClient
```

### MCP and UI packages

```mermaid
flowchart LR
  mcpBin["addressr-mcp/bin/addressr-mcp.mjs"] --> mcpServer["addressr-mcp/src/server.mjs"]
  mcpServer --> rapidapi["RapidAPI Link-driven API"]

  coreIndex["addressr-core/src/index.ts"] --> coreApi["addressr-core/src/api.ts"]
  coreApi --> rapidapi

  reactHooks["addressr-react/src/hooks/useSearch.ts"] --> coreIndex
  reactComponents["addressr-react/src/components/*Autocomplete.tsx"] --> reactHooks
  svelteStores["addressr-svelte/src/createSearch.ts"] --> coreIndex
  svelteComponents["addressr-svelte/src/*Autocomplete.svelte"] --> svelteStores
  vueComposables["addressr-vue/src/useSearch.ts"] --> coreIndex
  vueComponents["addressr-vue/src/*Autocomplete.vue"] --> vueComposables
```
