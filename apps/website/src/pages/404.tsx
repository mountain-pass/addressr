import type { HeadFC } from 'gatsby';
import React from 'react';
import Layout from '../components/layout';

const NotFoundPage = () => (
  <Layout>
    <div id="main" className="alt">
      <section id="one">
        <div className="inner">
          <h1>NOT FOUND</h1>
          <p>You just hit a route that doesn&#39;t exist... the sadness.</p>
        </div>
      </section>
    </div>
  </Layout>
);

// The <title> half of P125; <html lang> is in gatsby-ssr.js, because Gatsby's
// Head API emits children of <head> and cannot set attributes on <html>.
//
// This page had NO Helmet block at all, so unlike the other five it was never
// even trying. That matters more here than anywhere else on the site: ADR-053
// deliberately routes traffic to this page — `/enterprise-price-request/` served
// a real form from 2019 until the import deleted it, and it was the target of
// the pricing page's Enterprise call-to-action. Someone following an old link or
// bookmark lands here, and the tab, the history entry and a screen reader's
// first announcement all said nothing.
//
// The title announces the error rather than just naming the site, because that
// is what tells the visitor they did not arrive where they meant to. Terse
// register deliberately, not matching the body copy's joke: a title is read in a
// tab and a history entry, with nothing to set a joke up.
export const Head: HeadFC = () => (
  <>
    <title>Page not found - Addressr by Mountain Pass</title>
    <meta
      name="description"
      content="The page you are looking for does not exist at Addressr."
    />
  </>
);

export default NotFoundPage;
