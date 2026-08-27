import { Link } from 'gatsby';
import React from 'react';
import Banner from '../components/Banner';
import Layout from '../components/layout';

/* eslint-disable jsx-a11y-x/no-noninteractive-tabindex -- labelled overflow regions must be keyboard-scrollable. */

const rapidApiPricing =
  'https://rapidapi.com/addressr-addressr-default/api/addressr/pricing';

const Pricing = () => (
  <Layout>
    <Banner>
      <header className="major">
        <h1>Pricing</h1>
      </header>
      <div className="content">
        <p>
          Start with the hosted API when you want address quality without
          operating G-NAF infrastructure. Self-host when your team needs to run
          the data and service itself.
        </p>
      </div>
    </Banner>

    <div id="main" className="alt docs-page">
      <section aria-labelledby="hosted-pricing-title">
        <div className="inner">
          <header className="major">
            <h2 id="hosted-pricing-title">Hosted API plans</h2>
          </header>
          <p>
            Addressr provides the API and updates the address data. RapidAPI
            handles signup, API keys, billing and plan changes. Its plan page
            is the authoritative source for current prices and request limits.
          </p>
          <div
            className="pricing-table-wrapper"
            role="region"
            aria-label="Addressr delivery option comparison"
            tabIndex="0"
          >
            <table className="pricing-table">
              <caption>Addressr delivery options</caption>
              <thead>
                <tr>
                  <th scope="col">Option</th>
                  <th scope="col">Who operates it</th>
                  <th scope="col">Best for</th>
                  <th scope="col">Current terms</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Hosted API</th>
                  <td>Addressr</td>
                  <td>Teams that do not want to operate G-NAF infrastructure</td>
                  <td><a href={rapidApiPricing}>Review plans on RapidAPI</a></td>
                </tr>
                <tr>
                  <th scope="row">Self-hosted</th>
                  <td>Your team</td>
                  <td>Teams that need infrastructure and data-update control</td>
                  <td>Apache-2.0 licence; your infrastructure costs apply</td>
                </tr>
                <tr>
                  <th scope="row">Commercial support</th>
                  <td>Mountain Pass with your team</td>
                  <td>Self-hosted teams that want implementation or operations help</td>
                  <td>Contact Mountain Pass for a quote</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            <a href={rapidApiPricing} className="button cta-primary next">
              Compare and select Addressr plans on RapidAPI
            </a>
          </p>
        </div>
      </section>

      <section aria-labelledby="self-hosted-pricing-title">
        <div className="inner">
          <header className="major">
            <h2 id="self-hosted-pricing-title">Self-hosted options</h2>
          </header>
          <div className="path-grid">
            <article className="path">
              <h3>Open-source software</h3>
              <p>
                Run Addressr and OpenSearch in your infrastructure under the
                Apache-2.0 licence. Your team owns hosting, monitoring and data
                updates.
              </p>
              <Link to="/quick-start/#self-hosted" className="button next">
                Review self-host deployment
              </Link>
            </article>
            <article className="path">
              <h3>Commercial support</h3>
              <p><strong>Contact Mountain Pass for a quote</strong></p>
              <p>
                Discuss implementation or operational support for a
                self-hosted deployment.
              </p>
              <a
                href="mailto:addressr@mountain-pass.com.au?subject=Addressr%20support%20quote"
                className="button next"
              >
                Email Mountain Pass about Addressr support
              </a>
              <p className="contact-fallback">
                If the email app does not open, write to{' '}
                <a href="mailto:addressr@mountain-pass.com.au">
                  addressr@mountain-pass.com.au
                </a>.
              </p>
            </article>
          </div>
        </div>
      </section>
    </div>
  </Layout>
);

/* eslint-enable jsx-a11y-x/no-noninteractive-tabindex */

export const Head = () => (
  <>
    <title>Hosted and self-hosted pricing - Addressr</title>
    <meta
      name="description"
      content="Compare Addressr hosted API plans on RapidAPI with Apache-licensed self-hosted deployment and commercial support."
    />
    <link rel="canonical" href="https://addressr.io/pricing/" />
    <meta property="og:title" content="Hosted and self-hosted pricing - Addressr" />
    <meta property="og:description" content="Compare hosted Addressr API plans with self-hosted deployment." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://addressr.io/pricing/" />
  </>
);

export default Pricing;
