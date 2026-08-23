import { Link } from 'gatsby';
import React from 'react';
import Helmet from 'react-helmet';
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
import Search from '../components/Search';
import dataGovLogo from './Data-gov-au.jpg';

const HomeIndex = () => {
  return (
    <Layout>
      <Helmet
        title="Addressr by Mountain Pass - Free Australian Address Validation, Search and Autocomplete"
        meta={[
          {
            name: 'description',
            content:
              'Free Australian Address Validation, Search and Autocomplete',
          },
          { name: 'keywords', content: 'address, validation, gnaf, australia' },
        ]}
      />

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
          <article>
            <div className="content">
              <Search />
            </div>
          </article>
        </section>
      </div>

      <div id="main">
        <section id="one" className="tiles">
          <article style={{ backgroundImage: `url(${pic01})` }}>
            <header className="major">
              <h3>Australian Data Source</h3>

              <p>
                Addresses validated against the Geocoded National Address File
                (referred to as G-NAF), Australia’s{' '}
                <strong style={{ color: 'black', fontWeight: '800' }}>
                  authoritative
                </strong>{' '}
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
            >
              {' '}
            </a>
          </article>
          <article style={{ backgroundImage: `url(${pic02})` }}>
            <header className="major">
              <h3>
                Software As or{' '}
                <strong style={{ color: 'black', fontWeight: '800' }}>
                  NOT
                </strong>{' '}
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
            {/* <Link to="/landing" className="link primary" /> */}
          </article>
          <article style={{ backgroundImage: `url(${pic11})` }}>
            <header className="major">
              <h3>Always Up-To-Date</h3>
              <p>
                Addressr automatically updates with the latest data, so
                you&apos;re never out-of-date.
              </p>
            </header>
            {/* <Link to="/landing" className="link primary" /> */}
          </article>
          <article style={{ backgroundImage: `url(${pic03})` }}>
            <header className="major">
              <h3>Real-time Address Validation</h3>
              <p>
                Add address autocomplete, search and validation to your forms.
              </p>
            </header>
            {/* <Link to="/landing" className="link primary" /> */}
          </article>
          <article style={{ backgroundImage: `url(${pic04})` }}>
            <header className="major">
              <h3>Easy To Use API</h3>
              <p>Build your solution quickly, with our straightforward API.</p>
            </header>
            <Link to="/api-docs" className="link primary" />
          </article>
          <article style={{ backgroundImage: `url(${pic05})` }}>
            <header className="major">
              <h3>Run On Your Own Infrastructure or Use Ours</h3>
              <p>
                On-premise or in the cloud, run Addressr on your own
                infrastructure, or leave all the hard work to us.
              </p>
            </header>
            {/* <Link to="/landing" className="link primary" /> */}
          </article>
          <article style={{ backgroundImage: `url(${pic06})` }}>
            <header className="major">
              <h3>Completely Free or Pay for Support</h3>
              <p>
                That&apos;s right, Addressr is completely free.{' '}
                <strong style={{ color: 'black', fontWeight: '800' }}>
                  Forever.
                </strong>
                &nbsp;
                <br />
                Or for peace of mind for your mission critical solutions, get
                commercial support you can truly rely on.
              </p>
            </header>
            {/* <Link to="/landing" className="link primary" /> */}
          </article>
          <article style={{ backgroundImage: `url(${pic10})` }}>
            <header className="major" />
            {/* <Link to="/landing" className="link primary" /> */}
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
export default HomeIndex;
