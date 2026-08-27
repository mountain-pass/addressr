import { Link } from 'gatsby';
import React from 'react';
import Banner from '../components/Banner';
import Layout from '../components/layout';

/* eslint-disable jsx-a11y-x/no-noninteractive-tabindex -- labelled code regions must be keyboard-scrollable. */

const hostedRequest = String.raw`curl "https://addressr.p.rapidapi.com/addresses?q=300+Barangaroo+Ave" \
  -H "x-rapidapi-key: $RAPIDAPI_KEY" \
  -H "x-rapidapi-host: addressr.p.rapidapi.com"`;

const openSearch = String.raw`docker run --name addressr-opensearch \
  -p 9200:9200 -p 9300:9300 \
  -e "discovery.type=single-node" \
  -e "plugins.security.disabled=true" \
  opensearchproject/opensearch:3.5.0`;

const QuickStart = () => (
  <Layout>
    <Banner>
      <header className="major">
        <h1>Make your first Addressr request</h1>
      </header>
      <div className="content">
        <p>
          The hosted API is the shortest path. Self-hosting is available when
          your team needs to own the service and data pipeline.
        </p>
      </div>
    </Banner>

    <div id="main" className="alt docs-page">
      <section id="hosted" aria-labelledby="hosted-title">
        <div className="inner">
          <header className="major">
            <h2 id="hosted-title">Hosted API: make a request</h2>
          </header>
          <p>
            Addressr documents the request and response. RapidAPI handles your
            hosted account, API key, billing and plan changes.
          </p>
          <ol className="setup-steps">
            <li>
              <strong>Start an Addressr plan on RapidAPI.</strong>{' '}
              <a href="https://rapidapi.com/addressr-addressr-default/api/addressr/pricing">
                Compare and select an Addressr plan on RapidAPI
              </a>. RapidAPI is the authoritative source for current prices and
              request limits.
            </li>
            <li>
              <strong>Copy the API key from RapidAPI.</strong> Store it in the
              <code> RAPIDAPI_KEY</code> environment variable; do not put it in
              browser code or commit it to source control.
            </li>
            <li>
              <strong>Search for an address.</strong>
              <pre role="region" aria-label="Hosted address search command" tabIndex="0" className="code-example"><code>{hostedRequest}</code></pre>
            </li>
            <li>
              <strong>Use the result.</strong> Each match includes a
              human-readable address in <code>sla</code> and a stable address
              identifier in <code>pid</code>. Follow the response links or use
              the identifier with the address-detail endpoint for structured
              fields and geocoding.
            </li>
          </ol>
          <ul className="actions">
            <li><Link to="/api-docs/" className="button next">Read the Addressr API guide</Link></li>
            <li><Link to="/pricing/" className="button">Compare pricing</Link></li>
          </ul>
        </div>
      </section>

      <section id="self-hosted" aria-labelledby="self-hosted-title">
        <div className="inner">
          <header className="major">
            <h2 id="self-hosted-title">Self-hosted: run the service</h2>
          </header>
          <p>
            Choose this path when your team can operate Node.js, OpenSearch and
            quarterly G-NAF updates. Allow about an hour for the first full
            download and index; timing depends on your machine and options.
          </p>
          <p>
            Addressr requires Node.js 22 or newer. Continuous integration tests
            the current release with OpenSearch 2.19.5 and 3.5.0.
          </p>
          <ol className="setup-steps">
            <li>
              <strong>Install Addressr.</strong>
              <pre role="region" aria-label="Addressr installation command" tabIndex="0" className="code-example"><code>npm install --global @mountainpass/addressr</code></pre>
            </li>
            <li>
              <strong>Start OpenSearch for local evaluation.</strong>
              <pre role="region" aria-label="Local OpenSearch command" tabIndex="0" className="code-example"><code>{openSearch}</code></pre>
              <p>
                This example disables OpenSearch security and is for a local
                machine only. Do not expose it to a network or use it as a
                production security configuration.
              </p>
            </li>
            <li>
              <strong>Start the API in a second terminal.</strong>
              <pre role="region" aria-label="Addressr API server commands" tabIndex="0" className="code-example"><code>{`export ELASTIC_HOST=localhost
export ELASTIC_PORT=9200
addressr-server-2`}</code></pre>
            </li>
            <li>
              <strong>Load G-NAF in a third terminal.</strong>
              <pre role="region" aria-label="G-NAF loader commands" tabIndex="0" className="code-example"><code>{`export ELASTIC_HOST=localhost
export ELASTIC_PORT=9200
addressr-loader`}</code></pre>
              <p>
                The loader downloads and indexes the Australian address data.
                Keep this terminal open until it completes.
              </p>
            </li>
            <li>
              <strong>Check the local API.</strong>
              <pre role="region" aria-label="Local address search command" tabIndex="0" className="code-example"><code>{`curl "http://localhost:8080/addresses?q=300+Barangaroo+Ave"`}</code></pre>
            </li>
          </ol>
          <p>
            For geocoding, state filters, cached data and scheduled updates,
            use the maintained{' '}
            <a href="https://github.com/mountain-pass/addressr#self-hosted">
              self-hosting reference in the Addressr repository
            </a>.
          </p>
        </div>
      </section>
    </div>
  </Layout>
);

/* eslint-enable jsx-a11y-x/no-noninteractive-tabindex */

export const Head = () => (
  <>
    <title>Make your first Addressr API request</title>
    <meta name="description" content="Make a hosted Addressr request through RapidAPI or deploy Addressr with Node.js and OpenSearch." />
    <link rel="canonical" href="https://addressr.io/quick-start/" />
    <meta property="og:title" content="Make your first Addressr API request" />
    <meta property="og:description" content="Start with the hosted API or follow the self-hosted deployment path." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://addressr.io/quick-start/" />
  </>
);

export default QuickStart;
