/**
 * Implement Gatsby's Browser APIs in this file.
 *
 * See: https://www.gatsbyjs.org/docs/browser-apis/
 */

import PropTypes from 'prop-types';
import React from 'react';
import SwaggerUI from 'swagger-ui';
window.SwaggerUI = SwaggerUI;

// class SessionCheck extends React.Component {
//   constructor(props) {
//     super(props);
//     this.state = {
//       loading: true,
//     };
//   }
//   componentDidMount() {
//   }

//   handleCheckSession = () => {
//     this.setState({ loading: false });
//   };

//   render() {
//     const { loading } = this.state;
//     const { children } = this.props;
//     return loading === false && <React.Fragment>{children}</React.Fragment>;
//   }
// }

// SessionCheck.propTypes = {
//   children: PropTypes.oneOfType([
//     PropTypes.arrayOf(PropTypes.node),
//     PropTypes.node,
//   ]).isRequired,
// };

// const wrapRootElement = ({ element }) => {
//   return <SessionCheck>{element}</SessionCheck>;
// };

// wrapRootElement.propTypes = {
//   element: PropTypes.node.isRequired,
// };

// export default wrapRootElement;
