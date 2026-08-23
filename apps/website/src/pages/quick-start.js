import React from 'react';
import Helmet from 'react-helmet';
import howItWorks from '../assets/images/addressr.svg';
import Banner from '../components/Banner';
import Layout from '../components/layout';
// import { getProfile } from '../utils/auth';

const QuickStart = () => {
  const user = undefined; //getProfile();

  return (
    <Layout user={user}>
      <Helmet>
        <title>Quick Start - Addressr by Mountain Pass</title>
        <meta
          name="description"
          content="Quick Start for Addressr by Mountain Pass"
        />
      </Helmet>

      <Banner>
        <header className="major">
          <h1>Quick Start</h1>
        </header>
      </Banner>

      <div id="main" className="alt">
        <section id="two">
          <div className="inner" id="saas">
            <h2>SaaS</h2>
            <div style={{ width: 'fit-content' }}>
              <a
                href="https://rapidapi.com/addressr-addressr-default/api/addressr"
                className="button next"
              >
                Try it now online for free
              </a>
              <p
                style={{
                  marginTop: '0.5em',
                  fontSize: 'smaller',
                  color: '#5393a8',
                  textAlign: 'center',
                }}
              >
                <em>No credit card required</em>
              </p>
            </div>
          </div>
        </section>
        <section id="two">
          <div className="inner" id="self-hosted">
            <h2>Self hosted</h2>
            <ol>
              <li>
                Install addressr
                <pre>
                  <code>npm install @mountainpass/addressr -g</code>
                </pre>
                NOTE: If you are running windows, you&apos;ll need to use{' '}
                <a
                  href="https://docs.microsoft.com/en-us/windows/wsl/install-win10"
                  rel="nofollow"
                >
                  wsl
                </a>
              </li>
              <li>
                Start opensearch. For example run:
                <pre>
                  <code>
                    {
                      'docker pull opensearchproject/opensearch:1.2.4docker pull opensearchproject/opensearch:1.2.4\n'
                    }
                    {
                      'docker run -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" -e "plugins.security.disabled=true" opensearchproject/opensearch:1.2.4'
                    }
                  </code>
                </pre>
              </li>
              <li>
                Start API server. In a second window run:
                <pre>
                  <code>
                    {'export ELASTIC_PORT=9200\n'}
                    {'export ELASTIC_HOST=localhost\n'}
                    {'addressr-server-2\n'}
                  </code>
                </pre>
              </li>
              <li>
                Setup the env vars for the data loader. In a third window run:
                <pre>
                  <code>
                    {'export ELASTIC_PORT=9200\n'}
                    {'export ELASTIC_HOST=localhost\n'}
                    {'export ADDRESSR_INDEX_TIMEOUT=30s\n'}
                    {'export ADDRESSR_INDEX_BACKOFF=1000\n'}
                    {'export ADDRESSR_INDEX_BACKOFF_INCREMENT=1000\n'}
                    {'export ADDRESSR_INDEX_BACKOFF_MAX=10000\n'}
                  </code>
                </pre>
                <ol>
                  <li>
                    Optional - enable geocodes by setting the following env vars
                    for the data loader.
                    <strong> NOTE:</strong> with geocodes enabled, indexing
                    takes much longer and needs much more memory. Only use turn
                    them on if you need them. You can always add them later.
                  </li>
                </ol>
                <pre>
                  <code>
                    {'export ADDRESSR_ENABLE_GEO=1\n'}
                    {'export NODE_OPTIONS=--max_old_space_size=8196'}
                  </code>
                </pre>
                <ol start="2">
                  <li>
                    Optional - limit the addresses to a single state by setting
                    the <code>COVERED_STATES</code> env var for the data loader.
                    This dramatically speeds up indexing. For example:
                  </li>
                </ol>
                <pre>
                  <code>COVERED_STATES=VIC,SA</code>
                </pre>
                Valid values are:
                <ul>
                  <li>ACT</li>
                  <li>NSW</li>
                  <li>NT</li>
                  <li>OT</li>
                  <li>QLD</li>
                  <li>SA</li>
                  <li>TAS</li>
                  <li>VIC</li>
                  <li>WA</li>
                </ul>
              </li>
              <li>
                Run data Loader
                <pre>
                  <code>addressr-loader</code>
                </pre>
              </li>
              <li>
                OK, so we stretched the truth a bit with the &quot;Quick
                Start&quot; heading. The truth is that it takes quite a while to
                download, store and index the 13+ million addresses from
                data.gov.au. So make a coffee, or tea, or find something else to
                do and come back in about an hour when it&apos;s done.
              </li>
              <li>
                Search for an address
                <pre>
                  <code>
                    curl -i http://localhost:8080/addresses?q=LEVEL+25,+TOWER+3
                  </code>
                </pre>
              </li>
              <li>An updated G-NAF is released every 3 months. Put addressr-loader in a cron job or similar to keep addressr regularly updated</li>
              <li>Wire you address form up to the address-server api.</li>
            </ol>

            <h2>How it Works</h2>
            <img src={howItWorks} alt="architectural diagram" />
            <h2>System requirements</h2>
            <h3>Open Search:</h3>
            <p>opensearch ≥ 1.2.4 with 1.4GiB of memory</p>
            <h3>Addressr Loader</h3>
            <h4>Default</h4>
            <p>Node JS &gt;= 12.11.0 with 1GiB of memory</p>
            <h4>With Geocoding enabled</h4>
            <p>Node JS &gt;= 12.11.0 with 8GiB of memory</p>
            <h3>Addressr Server</h3>
            <p>Node JS &gt;= 12.11.0 with 64MiB of memory</p>
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default QuickStart;
