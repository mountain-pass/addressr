import { Link } from 'gatsby';
import React from 'react';
import Banner from '../components/Banner';
import Layout from '../components/layout';
// import { getProfile } from '../utils/auth';

const Downloads = () => {
  const user = undefined; //getProfile();
  return (
    <Layout user={user}>
      <Banner>
        <header className="major">
          <h1>Download</h1>
        </header>
      </Banner>

      <div id="main" className="alt">
        <section id="one">
          <div className="inner">
            <p>
              Addressr runs in <a href="https://nodejs.org/">Node.js</a> and is
              installed using{' '}
              <a href="https://docs.npmjs.com/about-npm/">npm</a> as follows.
            </p>
            <pre>npm install -g @mountainpass/addressr</pre>
            <p>
              <Link to="/quick-start">Find out more</Link>
            </p>
          </div>
        </section>
      </div>
    </Layout>
  );
};

// The <title> half of P125. A Gatsby `Head` export, NOT react-helmet:
// helmet needed `gatsby-plugin-react-helmet` to reach server-rendered
// output, that plugin was never installed, so the title this page has
// declared since 2019 went into the DOM after hydration and never into
// the document. The <html lang> half cannot live here — Head emits only
// children of <head> — and is in gatsby-ssr.js.
export const Head = () => (
  <>
    <title>Download - Addressr by Mountain Pass</title>
    <meta name="description" content="Download Addressr by Mountain Pass" />
  </>
);

export default Downloads;
