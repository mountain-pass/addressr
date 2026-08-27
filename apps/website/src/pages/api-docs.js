import { Link } from 'gatsby';
import PropTypes from 'prop-types';
import React from 'react';
import Banner from '../components/Banner';
import Layout from '../components/layout';

/* eslint-disable jsx-a11y-x/no-noninteractive-tabindex -- labelled code regions must be keyboard-scrollable. */

const rapidHeaders = String.raw`-H "x-rapidapi-key: $RAPIDAPI_KEY" \
  -H "x-rapidapi-host: addressr.p.rapidapi.com"`;

const Endpoint = ({ id, title, path, children }) => (
  <section className="endpoint" aria-labelledby={id}>
    <h3 id={id}>{title}</h3>
    <p><code>GET {path}</code></p>
    {children}
  </section>
);

Endpoint.propTypes = {
  children: PropTypes.node.isRequired,
  id: PropTypes.string.isRequired,
  path: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
};

const ApiDocumentation = () => (
  <Layout>
    <Banner>
      <header className="major"><h1>Addressr API guide</h1></header>
      <div className="content">
        <p>
          Search official Australian address data, then retrieve structured
          details by stable identifier.
        </p>
      </div>
    </Banner>

    <div id="main" className="alt docs-page">
      <section aria-labelledby="bases-title">
        <div className="inner">
          <header className="major"><h2 id="bases-title">Base URL and authentication</h2></header>
          <p>Hosted requests use <code>https://addressr.p.rapidapi.com</code>.</p>
          <p>
            Send the API key and host headers supplied by RapidAPI. Keep the key
            on your server, never in public browser code. A self-hosted default
            installation uses <code>http://localhost:8080</code> and its
            authentication depends on your deployment.
          </p>
          <pre role="region" aria-label="Hosted authentication example" tabIndex="0" className="code-example"><code>{String.raw`curl "https://addressr.p.rapidapi.com/addresses?q=300+Barangaroo+Ave" \
  ${rapidHeaders}`}</code></pre>
          <p>
            Need a key?{' '}
            <a href="https://rapidapi.com/addressr-addressr-default/api/addressr/pricing">
              Select an Addressr plan on RapidAPI
            </a>.
          </p>
        </div>
      </section>

      <section aria-labelledby="endpoints-title">
        <div className="inner">
          <header className="major"><h2 id="endpoints-title">Common tasks</h2></header>
          <Endpoint id="search-addresses-title" title="Search addresses" path="/addresses?q={query}">
            <p>
              Search by any known component, such as street, suburb, postcode
              or state. Results include <code>sla</code>, <code>pid</code> and
              links to related resources.
            </p>
            <pre role="region" aria-label="Address search example" tabIndex="0" className="code-example"><code>{String.raw`curl "https://addressr.p.rapidapi.com/addresses?q=1+George+St+Sydney" \
  ${rapidHeaders}`}</code></pre>
          </Endpoint>
          <Endpoint id="address-details-title" title="Get structured address details" path="/addresses/{pid}">
            <p>
              Use the <code>pid</code> returned by search to retrieve structured
              address fields and available geocoding. Follow the response Link
              headers to related locality, postcode and state resources.
            </p>
          </Endpoint>
          <Endpoint id="localities-title" title="Search suburbs and towns" path="/localities?q={query}">
            <p>Search locality names and receive state, postcode and classification details.</p>
          </Endpoint>
          <Endpoint id="postcodes-title" title="Search postcodes" path="/postcodes?q={prefix}">
            <p>Search by postcode prefix and receive associated suburbs and towns.</p>
          </Endpoint>
          <Endpoint id="states-title" title="Search states and territories" path="/states?q={query}">
            <p>Search by state or territory name or abbreviation.</p>
          </Endpoint>
        </div>
      </section>

      <section aria-labelledby="contract-title">
        <div className="inner">
          <header className="major"><h2 id="contract-title">Runtime contract and errors</h2></header>
          <p>
            This page is a task guide, not the authoritative API contract. A
            running Addressr service publishes supplementary OpenAPI at
            <code> /api-docs</code>; response links are the authoritative way
            to navigate available resources.
          </p>
          <ul>
            <li><strong>400:</strong> correct the query or path parameter.</li>
            <li><strong>401 or 403:</strong> check the hosted API key and plan.</li>
            <li><strong>404:</strong> the requested identifier was not found.</li>
            <li><strong>429:</strong> the RapidAPI plan limit or rate limit was reached.</li>
            <li><strong>5xx:</strong> retry with backoff and check the <a href="https://stats.uptimerobot.com/PK1GwT4YmX">Addressr service status</a>.</li>
          </ul>
          <p>
            For a complete first request, see the <Link to="/quick-start/#hosted">hosted API quick start</Link>.
          </p>
        </div>
      </section>
    </div>
  </Layout>
);

/* eslint-enable jsx-a11y-x/no-noninteractive-tabindex */

export const Head = () => (
  <>
    <title>Addressr API guide</title>
    <meta name="description" content="Use Addressr to search Australian addresses, suburbs, postcodes, states and territories." />
    <link rel="canonical" href="https://addressr.io/api-docs/" />
    <meta property="og:title" content="Addressr API guide" />
    <meta property="og:description" content="Requests, authentication and endpoints for the Addressr Australian address API." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://addressr.io/api-docs/" />
  </>
);

export default ApiDocumentation;
