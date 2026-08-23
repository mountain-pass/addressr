import PropTypes from 'prop-types';
import React from 'react';
// import Drift from 'react-driftjs';
import '../assets/scss/main.scss';
import Footer from './Footer';
import Header from './Header';
import Menu from './Menu';

class Layout extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isMenuVisible: false,
      loading: 'is-loading',
    };
    this.handleToggleMenu = this.handleToggleMenu.bind(this);
  }

  componentDidMount() {
    this.timeoutId = setTimeout(() => {
      this.setState({ loading: '' });
    }, 100);

    // window['_fs_debug'] = false;
    // window['_fs_host'] = 'fullstory.com';
    // window['_fs_org'] = 'MTD5F';
    // window['_fs_namespace'] = 'FS';
    // (function(m, n, e, t, l, o, g, y) {
    //   if (e in m) {
    //     if (m.console && m.console.log) {
    //       m.console.log(
    //         'FullStory namespace conflict. Please set window["_fs_namespace"].',
    //       );
    //     }
    //     return;
    //   }
    //   g = m[e] = function(a, b, s) {
    //     g.q ? g.q.push([a, b, s]) : g._api(a, b, s);
    //   };
    //   g.q = [];
    //   o = n.createElement(t);
    //   o.async = 1;
    //   o.crossOrigin = 'anonymous';
    //   o.src = 'https://' + window['_fs_host'] + '/s/fs.js';
    //   y = n.getElementsByTagName(t)[0];
    //   y.parentNode.insertBefore(o, y);
    //   g.identify = function(i, v, s) {
    //     g(l, { uid: i }, s);
    //     if (v) g(l, v, s);
    //   };
    //   g.setUserVars = function(v, s) {
    //     g(l, v, s);
    //   };
    //   g.event = function(i, v, s) {
    //     g('event', { n: i, p: v }, s);
    //   };
    //   g.shutdown = function() {
    //     g('rec', !1);
    //   };
    //   g.restart = function() {
    //     g('rec', !0);
    //   };
    //   g.log = function(a, b) {
    //     g('log', [a, b]);
    //   };
    //   g.consent = function(a) {
    //     g('consent', !arguments.length || a);
    //   };
    //   g.identifyAccount = function(i, v) {
    //     o = 'account';
    //     v = v || {};
    //     v.acctId = i;
    //     g(o, v);
    //   };
    //   g.clearUserCookie = function() {};
    // })(window, document, window['_fs_namespace'], 'script', 'user');
  }

  componentWillUnmount() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  handleToggleMenu() {
    this.setState(prevState => ({
      isMenuVisible: !prevState.isMenuVisible,
    }));
  }

  render() {
    const { children } = this.props;
    const { loading, isMenuVisible } = this.state;
    // const isRestrictedPage =
    //   typeof window !== 'undefined' &&
    //   window.location.pathname.startsWith('/r/');
    // if (isRestrictedPage && !isAuthenticated()) {
    //   login();
    //   return (
    //     <div
    //       className={`body ${loading} ${
    //         isMenuVisible ? 'is-menu-visible' : ''
    //       }`}
    //     >
    //       <div id="wrapper">
    //         <Header onToggleMenu={this.handleToggleMenu} />
    //         <Helmet>
    //           <title>Addressr by Mountain Pass</title>
    //           <meta name="description" content="Addressr by Mountain Pass" />
    //         </Helmet>

    //         <div id="main" className="alt">
    //           <section id="one">
    //             <div className="inner">
    //               <p>Redirecting to login...</p>
    //               {/* TODO: Add spinner */}
    //             </div>
    //           </section>
    //         </div>
    //         <Footer />
    //       </div>
    //       <Menu onToggleMenu={this.handleToggleMenu} />
    //     </div>
    //   );
    // } else {
      // const user = getProfile();
      return (
        <div
          className={`body ${loading} ${
            isMenuVisible ? 'is-menu-visible' : ''
          } `}
        >
          <div id="wrapper">
            <Header onToggleMenu={this.handleToggleMenu} />
            {children}
            {/* <Drift
              appId="8cne7yrgdapx"
              userId={user === undefined ? '' : user.sub}
              attributes={user}
            /> */}
            <Footer />
          </div>
          <Menu onToggleMenu={this.handleToggleMenu} />
        </div>
      );
    // }
  }
}

Layout.propTypes = {
  children: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.node),
    PropTypes.node,
  ]).isRequired,
};

export default Layout;
