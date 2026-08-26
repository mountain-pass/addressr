import { Link } from 'gatsby';
import {
  AddressAutocomplete,
  LocalityAutocomplete,
  PostcodeAutocomplete,
  StateAutocomplete,
} from '@mountainpass/addressr-react';
import '@mountainpass/addressr-react/style.css';
import React, { useState } from 'react';
import pic01 from '../assets/images/pic01.jpg';
import pic02 from '../assets/images/pic02.jpg';
import pic03 from '../assets/images/pic03.jpg';
import pic04 from '../assets/images/pic04.jpg';
import pic05 from '../assets/images/pic05.jpg';
import pic06 from '../assets/images/pic06.jpg';
import pic10 from '../assets/images/pic10.jpg';
import pic11 from '../assets/images/pic11.jpg';
import Banner from '../components/Banner';
import Layout from '../components/layout';
import dataGovLogo from './Data-gov-au.jpg';

const apiUrl = 'https://api.addressr.io/';

const HomeIndex = () => {
  const [selectedAddress, setSelectedAddress] = useState();
  const [selectedLocality, setSelectedLocality] = useState();
  const [selectedPostcode, setSelectedPostcode] = useState();
  const [selectedState, setSelectedState] = useState();
  const [selectedMessage, setSelectedMessage] = useState('');

  return (
    <Layout>

      <Banner className="major">
        <header className="major">
          <h1>Addressr</h1>
        </header>
        <div className="content">
          <p>Australian Address Validation, Search and Autocomplete</p>
          <ul className="actions">
            <li>
              <Link to="/pricing/" className="button next">
                Get Started Free
              </Link>
            </li>
          </ul>
        </div>
      </Banner>

      <div>
        <section id="zero" style={{ padding: '2em 3em 2em 3em' }}>
          <header className="major">
            <h2>Try Addressr autocomplete</h2>
          </header>
          <div className="autocomplete-examples">
            <div className="autocomplete-example">
              <h3>Address search</h3>
              <AddressAutocomplete
                apiUrl={apiUrl}
                onSelect={(address) => {
                  setSelectedAddress(address);
                  setSelectedMessage(`Selected address: ${address.sla}`);
                }}
              />
              {selectedAddress && (
                <p className="autocomplete-selection">
                  <strong>Selected:</strong> {selectedAddress.sla}
                </p>
              )}
            </div>
            <div className="autocomplete-example">
              <h3>Suburb and town search</h3>
              <LocalityAutocomplete
                apiUrl={apiUrl}
                onSelect={(locality) => {
                  setSelectedLocality(locality);
                  setSelectedMessage(
                    `Selected suburb or town: ${locality.name}, ${locality.state.abbreviation} ${locality.postcode}`,
                  );
                }}
              />
              {selectedLocality && (
                <p className="autocomplete-selection">
                  <strong>Selected:</strong> {selectedLocality.name},{' '}
                  {selectedLocality.state.abbreviation}{' '}
                  {selectedLocality.postcode}
                </p>
              )}
            </div>
            <div className="autocomplete-example">
              <h3>Postcode search</h3>
              <PostcodeAutocomplete
                apiUrl={apiUrl}
                onSelect={(postcode) => {
                  setSelectedPostcode(postcode);
                  setSelectedMessage(`Selected postcode: ${postcode.postcode}`);
                }}
              />
              {selectedPostcode && (
                <p className="autocomplete-selection">
                  <strong>Selected:</strong> {selectedPostcode.postcode}
                  {selectedPostcode.localities.length > 0 &&
                    ` — ${selectedPostcode.localities
                      .map((locality) => locality.name)
                      .join(', ')}`}
                </p>
              )}
            </div>
            <div className="autocomplete-example">
              <h3>State and territory search</h3>
              <StateAutocomplete
                apiUrl={apiUrl}
                onSelect={(state) => {
                  setSelectedState(state);
                  setSelectedMessage(
                    `Selected state or territory: ${state.name} (${state.abbreviation})`,
                  );
                }}
              />
              {selectedState && (
                <p className="autocomplete-selection">
                  <strong>Selected:</strong>{' '}
                  {`${selectedState.name} (${selectedState.abbreviation})`}
                </p>
              )}
            </div>
          </div>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {selectedMessage}
          </p>
        </section>
      </div>

      <div id="main">
        <section id="one" className="tiles">
          <article style={{ backgroundImage: `url(${pic01})` }}>
            <header className="major">
              <h3 id="australian-data-source-title">Australian Data Source</h3>

              <p>
                Addresses validated against the Geocoded National Address File
                (referred to as G-NAF), Australia’s{' '}
                <strong>authoritative</strong>{' '}
                address file.
              </p>
              <span
                className="image fit"
                style={{
                  display: 'block',
                  background: '#f2f2f2',
                  width: '100%',
                  padding: '0.5em 0em',
                  marginTop: '0.6em',
                }}
              >
                <img
                  src={dataGovLogo}
                  alt="data.gov.au logo"
                  style={{
                    width: '20%',
                    margin: 'auto',
                  }}
                />
              </span>
            </header>
            <a
              href="https://data.gov.au/dataset/ds-dga-19432f89-dc3a-4ef3-b943-5326ef1dbecc/details"
              className="link primary"
              aria-labelledby="australian-data-source-title"
            >
              <span className="sr-only">Australian Data Source</span>
            </a>
          </article>
          <article style={{ backgroundImage: `url(${pic02})` }}>
            <header className="major">
              <h3>
                Software As or{' '}
                <strong>NOT</strong>{' '}
                As A Service
              </h3>
              <p>
                We love{' '}
                <a href="https://rapidapi.com/addressr-addressr-default/api/addressr/">
                  SaaS
                </a>
                , but we know its not for everyone.
              </p>
              <p>
                <a href="https://rapidapi.com/addressr-addressr-default/api/addressr/">
                  SaaS
                </a>{' '}
                or <Link to="quick-start/#self-hosted">self hosted</Link>,
                we&apos;ve got you covered.
              </p>
            </header>
          </article>
          <article style={{ backgroundImage: `url(${pic11})` }}>
            <header className="major">
              <h3>Always Up-To-Date</h3>
              <p>
                Addressr automatically updates with the latest data, so
                you&apos;re never out-of-date.
              </p>
            </header>
          </article>
          <article style={{ backgroundImage: `url(${pic03})` }}>
            <header className="major">
              <h3>Real-time Address Validation</h3>
              <p>
                Add address autocomplete, search and validation to your forms.
              </p>
            </header>
          </article>
          <article style={{ backgroundImage: `url(${pic04})` }}>
            <header className="major">
              <h3 id="easy-to-use-api-title">Easy To Use API</h3>
              <p>Build your solution quickly, with our straightforward API.</p>
            </header>
            <Link
              to="/api-docs/"
              className="link primary"
              aria-labelledby="easy-to-use-api-title"
            >
              <span className="sr-only">Easy To Use API</span>
            </Link>
          </article>
          <article style={{ backgroundImage: `url(${pic05})` }}>
            <header className="major">
              <h3>Run On Your Own Infrastructure or Use Ours</h3>
              <p>
                On-premise or in the cloud, run Addressr on your own
                infrastructure, or leave all the hard work to us.
              </p>
            </header>
          </article>
          <article style={{ backgroundImage: `url(${pic06})` }}>
            <header className="major">
              <h3>Completely Free or Pay for Support</h3>
              <p>
                That&apos;s right, Addressr is completely free.{' '}
                <strong>Forever.</strong>
                &nbsp;
                <br />
                Or for peace of mind for your mission critical solutions, get
                commercial support you can truly rely on.
              </p>
            </header>
          </article>
          <article style={{ backgroundImage: `url(${pic10})` }}>
            <header className="major" />
          </article>
        </section>
        <section id="two">
          <div className="inner">
            <header className="major">
              <h2>
                Begin Validating
                <br />
                Australian Addresses
              </h2>
            </header>
            <p>
              Get Addressr. Start validating addresses and adding address
              autocomplete to your forms <strong>today</strong>.
            </p>
            <ul className="actions">
              <li>
                <Link to="/pricing/" className="button next">
                  Get Started Free
                </Link>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </Layout>
  );
};
// The <title> half of P125; <html lang> is in gatsby-ssr.js, because Gatsby's
// Head API emits children of <head> and cannot set attributes on <html>.
//
// THE UNIQUE PART LEADS, and that is the whole change. The previous title was
// `Addressr by Mountain Pass - Free Australian Address Validation, ...` — 87
// characters, brand first. A browser tab shows roughly the first 25, so every
// tab of this site read "Addressr by Mountain Pas" and none was distinguishable
// from another. The other four pages already led with their unique part; this
// page was the only outlier, so the reorder is a consistency gain.
//
// `by Mountain Pass` is KEPT. Dropping it would save 17 characters that sit past
// the truncation point and buy nothing, while breaking a compound used as the
// API title in three swagger documents and as the manifest name. The
// reviewed-title regression pin is in test/__tests__/index.test.mjs.
//
// `keywords` is NOT carried across. Search engines have ignored it for over a
// decade, and P125 explicitly declines to claim search discovery as
// justification for any of this work.
export const Head = () => (
  <>
    <title>
      Free Australian Address Validation, Search and Autocomplete - Addressr by
      Mountain Pass
    </title>
    <meta
      name="description"
      content="Free Australian Address Validation, Search and Autocomplete"
    />
  </>
);

export default HomeIndex;
