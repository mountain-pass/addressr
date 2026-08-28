import { Link } from 'gatsby';
import {
  AddressAutocomplete,
  LocalityAutocomplete,
  PostcodeAutocomplete,
  StateAutocomplete,
} from '@mountainpass/addressr-react';
import '@mountainpass/addressr-react/style.css';
import React, { useState } from 'react';
import Banner from '../components/Banner';
import Layout from '../components/layout';

const apiUrl = 'https://api.addressr.io/';

const isPresent = (value) => value !== undefined && value !== null && value !== '';
const joinParts = (...parts) => parts.filter(isPresent).join(' ');
const formatNumber = (number) =>
  number && joinParts(number.prefix, number.number, number.suffix);

const DetailList = ({ items }) => (
  <dl>
    {items.filter(([, value]) => isPresent(value)).map(([label, value]) => (
      <React.Fragment key={label}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </React.Fragment>
    ))}
  </dl>
);

const AddressDetails = ({ address }) => {
  const structured = address.structured;
  const geocode =
    address.geocoding?.geocodes.find((item) => item.default) ??
    address.geocoding?.geocodes[0];
  const latitude = Number(geocode?.latitude);
  const longitude = Number(geocode?.longitude);
  const hasMap = Number.isFinite(latitude) && Number.isFinite(longitude);
  const mapOffset = 0.002;
  const mapQuery = hasMap
    ? new URLSearchParams({
      bbox: [
        longitude - mapOffset,
        latitude - mapOffset,
        longitude + mapOffset,
        latitude + mapOffset,
      ].join(','),
      layer: 'mapnik',
      marker: `${latitude},${longitude}`,
    }).toString()
    : '';
  const mapUrl = hasMap
    ? `https://www.openstreetmap.org/export/embed.html?${mapQuery}`
    : '';
  const mapLink = hasMap
    ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`
    : '';

  return (
    <div className="autocomplete-details">
      <h4>Selected address</h4>
      <div className="address-lines">
        {address.mla.map((line) => <div key={line}>{line}</div>)}
      </div>
      <DetailList
        items={[
          ['Address ID', address.pid],
          ['Building', structured.buildingName],
          ['Lot', formatNumber(structured.lotNumber)],
          ['Flat', structured.flat && joinParts(structured.flat.type?.name, formatNumber(structured.flat))],
          ['Level', structured.level && joinParts(structured.level.type?.name, formatNumber(structured.level))],
          ['Street number', joinParts(formatNumber(structured.number), formatNumber(structured.number?.last))],
          ['Street', structured.street && joinParts(structured.street.name, structured.street.type?.name ?? structured.street.type?.code, structured.street.suffix?.name)],
          ['Suburb or town', structured.locality?.name],
          ['State or territory', joinParts(structured.state?.name, structured.state?.abbreviation && `(${structured.state.abbreviation})`)],
          ['Postcode', structured.postcode],
          ['Geocoding level', address.geocoding?.level?.name],
          ['Latitude', hasMap ? latitude : undefined],
          ['Longitude', hasMap ? longitude : undefined],
          ['Geocode type', geocode?.type?.name],
          ['Geocode reliability', geocode?.reliability?.name],
        ]}
      />
      {hasMap && (
        <figure className="address-map">
          <figcaption>
            <a href={mapLink}>View {address.sla} on OpenStreetMap</a>
          </figcaption>
          <iframe
            title={`Map showing ${address.sla}`}
            loading="lazy"
            src={mapUrl}
            tabIndex="-1"
          />
        </figure>
      )}
    </div>
  );
};

const LocalityDetails = ({ locality }) => (
  <div className="autocomplete-details">
    <h4>Selected suburb or town</h4>
    <DetailList
      items={[
        ['Name', locality.name],
        ['Class', locality.class && joinParts(locality.class.name, `(${locality.class.code})`)],
        ['State or territory', joinParts(locality.state.name, `(${locality.state.abbreviation})`)],
        ['Postcode', locality.postcode],
        ['Locality ID', locality.pid],
      ]}
    />
  </div>
);

const PostcodeDetails = ({ postcode }) => (
  <div className="autocomplete-details">
    <h4>Selected postcode</h4>
    <DetailList items={[["Postcode", postcode.postcode]]} />
    {postcode.localities.length > 0 && (
      <>
        <h5>Suburbs and towns</h5>
        <ul>
          {postcode.localities.map((locality) => (
            <li key={locality.name}>{locality.name}</li>
          ))}
        </ul>
      </>
    )}
  </div>
);

const StateDetails = ({ state }) => (
  <div className="autocomplete-details">
    <h4>Selected state or territory</h4>
    <DetailList items={[["Name", state.name], ["Abbreviation", state.abbreviation]]} />
  </div>
);

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
          <h1>Improve Australian address quality without maintaining G-NAF yourself</h1>
        </header>
        <div className="content">
          <p>
            Addressr gives product and data teams hosted address search,
            autocomplete and validation built from Australia&apos;s official
            Geocoded National Address File.
          </p>
          <ul className="actions">
            <li>
              <Link to="/quick-start/#hosted" className="button cta-primary next">
                Make your first hosted request
              </Link>
            </li>
            <li>
              <a href="#address-demo" className="button">
                Try address search
              </a>
            </li>
          </ul>
        </div>
      </Banner>

      <div id="main" className="marketing-main">
        <section id="address-demo" className="product-demo">
          <div className="inner">
            <header className="major">
              <h2>See the address data your forms can use</h2>
            </header>
            <p className="section-intro">
              Search a real Australian address. Select a result to see its
              structured fields, address ID and available geocode.
            </p>
            <div className="autocomplete-example autocomplete-example--primary">
              <h3>Address search</h3>
              <AddressAutocomplete
                apiUrl={apiUrl}
                onSelect={(address) => {
                  setSelectedAddress(address);
                  setSelectedMessage(`Address details shown for ${address.sla}`);
                }}
              />
              {selectedAddress && <AddressDetails address={selectedAddress} />}
            </div>
          </div>
        </section>

        <section className="evidence-section" aria-labelledby="evidence-title">
          <div className="inner">
            <header className="major">
              <h2 id="evidence-title">Check Addressr before you integrate</h2>
            </header>
            <dl className="evidence-grid">
              <div>
                <dt>30-day uptime</dt>
                <dd>
                  <a href="https://stats.uptimerobot.com/PK1GwT4YmX">
                    100% reported by UptimeRobot
                  </a>
                </dd>
              </div>
              <div>
                <dt>Main npm package</dt>
                <dd>
                  <a href="https://www.npmjs.com/package/@mountainpass/addressr">
                    View current package activity on npm
                  </a>
                </dd>
              </div>
              <div>
                <dt>Open-source adoption</dt>
                <dd>
                  <a href="https://github.com/mountain-pass/addressr">
                    View source, releases and community activity on GitHub
                  </a>
                </dd>
              </div>
            </dl>
            <p className="evidence-note">
              Public package and repository activity are adoption signals. They
              do not establish customer counts or business outcomes.
            </p>
          </div>
        </section>

        <section className="path-section" aria-labelledby="choose-path-title">
          <div className="inner">
            <header className="major">
              <h2 id="choose-path-title">Choose how your team runs Addressr</h2>
            </header>
            <div className="path-grid">
              <article id="hosted-api" className="path path--primary">
                <h3>Hosted API</h3>
                <p>
                  Use Addressr without running an address index or update job.
                  RapidAPI currently handles signup, API keys, billing and plan
                  changes.
                </p>
                <ul>
                  <li>Compare current plan terms on RapidAPI</li>
                  <li>Use hosted address, locality, postcode and state search</li>
                  <li>Move to usage or volume pricing when needed</li>
                </ul>
                <Link to="/quick-start/#hosted" className="button cta-primary next">
                  Make a hosted API request
                </Link>
              </article>
              <article id="self-hosted" className="path">
                <h3>Self-hosted</h3>
                <p>
                  Run the API, OpenSearch and G-NAF updates in infrastructure
                  your team controls. The software is Apache-2.0 licensed.
                </p>
                <ul>
                  <li>No hosted request limit</li>
                  <li>Choose manual or scheduled data updates</li>
                  <li>Use community or commercial support</li>
                </ul>
                <Link to="/quick-start/#self-hosted" className="button next">
                  Review self-host deployment
                </Link>
              </article>
            </div>
          </div>
        </section>

        <section className="supporting-search" aria-labelledby="search-types-title">
          <div className="inner">
          <header className="major">
              <h2 id="search-types-title">Search more than street addresses</h2>
          </header>
            <p className="section-intro">
              The same hosted API can help teams standardise suburbs and towns,
              postcodes, states and territories.
            </p>
            <div className="autocomplete-examples">
            <div className="autocomplete-example">
              <h3>Suburb and town search</h3>
              <LocalityAutocomplete
                apiUrl={apiUrl}
                onSelect={(locality) => {
                  setSelectedLocality(locality);
                  setSelectedMessage(
                    `Suburb or town details shown for ${locality.name}, ${locality.state.abbreviation} ${locality.postcode}`,
                  );
                }}
              />
              {selectedLocality && <LocalityDetails locality={selectedLocality} />}
            </div>
            <div className="autocomplete-example">
              <h3>Postcode search</h3>
              <PostcodeAutocomplete
                apiUrl={apiUrl}
                onSelect={(postcode) => {
                  setSelectedPostcode(postcode);
                  setSelectedMessage(`Postcode details shown for ${postcode.postcode}`);
                }}
              />
              {selectedPostcode && <PostcodeDetails postcode={selectedPostcode} />}
            </div>
            <div className="autocomplete-example">
              <h3>State and territory search</h3>
              <StateAutocomplete
                apiUrl={apiUrl}
                onSelect={(state) => {
                  setSelectedState(state);
                  setSelectedMessage(
                    `State or territory details shown for ${state.name} (${state.abbreviation})`,
                  );
                }}
              />
              {selectedState && <StateDetails state={selectedState} />}
            </div>
          </div>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {selectedMessage}
          </p>
          </div>
        </section>

        <section className="closing-section">
          <div className="inner">
            <header className="major">
              <h2>Start with one hosted request</h2>
            </header>
            <p>
              Addressr explains the request and response here. RapidAPI handles
              the hosted account, API key and plan.
            </p>
            <ul className="actions">
              <li>
                <Link to="/quick-start/#hosted" className="button cta-primary next">
                  Make your first hosted request
                </Link>
              </li>
              <li>
                <Link to="/pricing/" className="button">
                  Compare pricing
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
    <title>Australian address quality API - Addressr by Mountain Pass</title>
    <meta
      name="description"
      content="Improve Australian address quality with hosted address search, autocomplete and validation built from official G-NAF data."
    />
    <link rel="canonical" href="https://addressr.io/" />
    <meta property="og:title" content="Australian address quality API - Addressr" />
    <meta property="og:description" content="Hosted Australian address search, autocomplete and validation built from official G-NAF data." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://addressr.io/" />
  </>
);

export default HomeIndex;
