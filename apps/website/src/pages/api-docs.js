import React from 'react';
import Layout from '../components/layout';
import spec from '../swagger.yaml';
//import SwaggerUI from 'swagger-ui'
import "swagger-ui-react/swagger-ui.css"

class ApiDocs extends React.Component {
  componentDidMount() {
    window.SwaggerUI({
        dom_id: '#swagger',
        spec,
        docExpansion: "full",
        supportedSubmitMethods: []
    });
  }
  render() {
    return (
      <Layout>
        <div className="swagger-wrapper">
          <div id="swagger" />
        </div>
      </Layout>
    )
  }
}

// The <title> half of P125 — see gatsby-ssr.js for the <html lang> half.
// This page is the one where the missing title bit hardest: its entire body
// is `<div id="swagger" />`, populated client-side, so server-rendered
// output carried no title AND no heading of any level. There was nothing for
// a screen reader or a crawler to read at all.
export const Head = () => (
  <>
    <title>API Docs - Addressr by Mountain Pass</title>
    <meta
      name="description"
      content="API Docs for Addressr by Mountain Pass"
    />
  </>
);

export default ApiDocs;
