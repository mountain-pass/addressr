import React from 'react';
import Helmet from 'react-helmet';
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
        <Helmet>
          <title>API Docs - Addressr by Mountain Pass</title>
          <meta
            name="description"
            content="API Docs for Addressr by Mountain Pass"
          />
        </Helmet>
        <div className="swagger-wrapper">
          <div id="swagger" />
        </div>
      </Layout>
    )
  }
}

export default ApiDocs;
