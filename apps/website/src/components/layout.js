import PropTypes from 'prop-types';
import React from 'react';
// import Drift from 'react-driftjs';
import '../assets/scss/main.scss';
import Footer from './Footer';
import Header from './Header';
import Menu from './Menu';

class Layout extends React.Component {
  constructor(properties) {
    super(properties);
    this.state = {
      isMenuVisible: false,
      loading: 'is-loading',
    };
    this.handleOpenMenu = this.handleOpenMenu.bind(this);
    this.handleDismissMenu = this.handleDismissMenu.bind(this);
    this.handleNavigateFromMenu = this.handleNavigateFromMenu.bind(this);
    this.handleMenuKeyDown = this.handleMenuKeyDown.bind(this);
    this.handleSkipToContent = this.handleSkipToContent.bind(this);
    this.openerRef = React.createRef();
    this.menuRef = React.createRef();
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

  // SPLIT INTO THREE, and the split is load-bearing rather than tidy (P131).
  //
  // One `handleToggleMenu` used to serve three different intents: open, close
  // by dismissing, and close by navigating — the menu's own links call it so
  // the overlay does not persist across a route change. Focus-return must fire
  // for the second and NOT the third: pulling focus back to the hamburger
  // during a Gatsby route transition fights the navigation and lands the user
  // somewhere they did not ask to be. A handler that cannot tell those apart
  // cannot get that right, which is why this is three methods and not a
  // boolean.
  handleOpenMenu() {
    // setState's CALLBACK, not a bare .focus() after it. The menu is a sibling
    // of #wrapper, and #wrapper becomes `inert` in the same commit — so a focus
    // call issued in the same tick is swallowed by an ancestor that has not
    // finished un-inerting. React guarantees the callback runs after commit.
    this.setState({ isMenuVisible: true }, () => {
      if (this.menuRef.current) this.menuRef.current.focus();
    });
  }

  // Dismissal: the close button or Escape. Focus goes
  // back where it came from, because the user is still on this page.
  handleDismissMenu() {
    this.setState({ isMenuVisible: false }, () => {
      if (this.openerRef.current) this.openerRef.current.focus();
    });
  }

  // Navigation: a menu link was followed. Close, but do NOT restore focus —
  // the page is changing and the destination owns focus from here.
  handleNavigateFromMenu() {
    this.setState({ isMenuVisible: false });
  }

  // THE HANDLER IS NOT BELT-AND-BRACES; without it the skip link does not work.
  //
  // Verified by driving a browser, which is the only thing that caught it: with
  // `href="#content"` and `tabIndex="-1"` on the target, a real Enter updates
  // the URL to #content and scrolls the page — and leaves focus on the link.
  // The next Tab then lands on "Find us on GitHub", the first thing the skip
  // link exists to skip. The bypass looked correct and bypassed nothing.
  //
  // Every static assertion passed while this was broken: the link is present,
  // its fragment resolves to exactly one id, and it is first in the focus
  // order. All true, and none of them is the property that matters.
  //
  // No preventDefault: the hash and the scroll are still wanted, and a no-JS
  // visitor keeps the native behaviour. This only adds the focus move the
  // browser declined to make.
  handleSkipToContent() {
    const target = document.getElementById('content');
    if (target) target.focus();
  }

  handleMenuKeyDown(event) {
    if (event.key === 'Escape') this.handleDismissMenu();
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
          {/* `inert` while the menu is open. Without it Tab walks the whole
              blurred page behind the overlay — every link and the footer —
              before reaching a single menu item, each stop invisible under a
              90%-opaque overlay and unclickable. That exposure is created by
              this commit: nobody could open the menu by keyboard before, so
              nobody was stranded behind it. String form, not boolean, because
              React 18 does not recognise `inert` as a boolean prop; undefined
              omits the attribute, so SSR and hydration agree. */}
          <div id="wrapper" inert={isMenuVisible ? '' : undefined}>
            {/* FIRST FOCUSABLE THING ON THE PAGE, deliberately — before the
                ribbon, before the header. It lives inside the inert wrapper so
                reverse-Tab cannot reach it behind the open menu. WCAG 2.4.1:
                every page repeats a promo ribbon, a header and a status header
                before any content. It targets a real <main> landmark rather
                than the existing `#main`, which is only a styling hook. */}
            <a
              className="skip-link"
              href="#content"
              onClick={this.handleSkipToContent}
            >
              Skip to main content
            </a>
            <Header
              onToggleMenu={this.handleOpenMenu}
              isMenuVisible={isMenuVisible}
              openerRef={this.openerRef}
            />
            <main id="content" tabIndex="-1">
              {children}
            </main>
            {/* <Drift
              appId="8cne7yrgdapx"
              userId={user === undefined ? '' : user.sub}
              attributes={user}
            /> */}
            <Footer />
          </div>
          <Menu
            onDismiss={this.handleDismissMenu}
            onNavigate={this.handleNavigateFromMenu}
            onKeyDown={this.handleMenuKeyDown}
            menuRef={this.menuRef}
          />
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
