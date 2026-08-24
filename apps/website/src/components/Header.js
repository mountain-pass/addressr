import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Link } from 'gatsby';
import PropTypes from 'prop-types';
import React from 'react';

const Header = ({ onToggleMenu, isMenuVisible, openerRef }) => (
  <>
    <h4 className="ribbon">
      <a href="https://github.com/mountain-pass/addressr">
        Find us on GitHub <FontAwesomeIcon icon={faGithub} />
      </a>
    </h4>
    <header id="header" className="alt">
      <Link to="/" className="logo">
        <strong style={{ marginRight: '0' }}>Addressr</strong>
      </Link>
      <span id="by">
        by <a href="https://mountain-pass.com.au">Mountain Pass</a>
      </span>

      {/* A BUTTON, not an anchor — this is the whole of P131's first half.
          `<a onClick>` with no href is not focusable, exposes no role, and
          ignores Enter and Space, so the menu opened by mouse and by nothing
          else on every page of the site.

          THE <nav> STAYS, and an earlier draft of this fix wrongly replaced it
          with `<div className="nav">`. The accessibility review's argument for
          deleting it is sound — a navigation landmark whose only child is a
          disclosure button is incoherent, and it competes with the real menu
          landmark. The cost is what that draft got wrong. `_header.scss` nests
          the flex layout AND four breakpoint blocks under a bare `nav`
          selector, and the draft widened only the base one, so every
          responsive rule for this control silently died — including the xsmall
          block that hides the label behind `text-indent: 5em`. On mobile the
          button would have rendered the literal word "Menu" at the wrong
          width. An architecture review caught it; none of the 25 built-output
          assertions could see it, because they read HTML shape and this is a
          CSS-reachability failure.

          So the landmark defect is real and is NOT fixed here. It is a
          different concern from keyboard operability, it costs a stylesheet
          refactor on a live marketing site, and bundling it into a Level A
          keyboard fix is how that fix acquires a visual regression.

          `aria-controls` is the hook the built-output tests key on, so they
          assert "the thing that controls the menu" rather than "the second
          anchor in the header". `aria-expanded` was a pre-existing 4.1.2 gap;
          it is fixed here as opportunistic remediation, not because this
          commit caused it — but the affected population goes from nobody to
          everybody the moment the control works. */}
      <nav>
        <button
          type="button"
          className="menu-link"
          onClick={onToggleMenu}
          aria-expanded={isMenuVisible}
          aria-controls="menu"
          ref={openerRef}
        >
          Menu
        </button>
      </nav>
    </header>
    {/* STILL A SECOND <header id="header">, and still a defect: two elements
        share that id and both expose role="banner". An earlier draft of this
        fix made it a `<div>` on the stated grounds that "`.status-header` is
        already the styling hook, so nothing visual depends on the tag or the
        id". That was false, and checkable — `_header.scss:20` reads
        `#header.status-header`, id-qualified. Dropping the id was the
        element's ONLY stylesheet reachability: it would have lost the whole
        `#header` block (fixed positioning, height, background, shadow), its
        four breakpoint `top` offsets, `#header.alt`, `#header .logo` for the
        badge below, and the load fade — turning an out-of-flow element into an
        in-flow one at the top of a wrapper whose `padding-top` is sized for
        exactly one fixed header. A layout shift on all six pages, from a claim
        one grep would have falsified.

        Left as found, with the defect recorded rather than half-fixed. */}
    <header id="header" className="alt status-header">
      <a
        className="logo"
        style={{ border: 'none' }}
        href="https://stats.uptimerobot.com/PK1GwT4YmX"
      >
        <img
          alt="Uptime Robot ratio (30 days)"
          src="https://img.shields.io/uptimerobot/ratio/m788652244-3e35661f9886333310f4dc2f?color=9bf1ff&amp;labelColor=242943&amp;style=for-the-badge&amp;logo=data:image/png;base64,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"
        />
      </a>
    </header>
  </>
);

Header.propTypes = {
  onToggleMenu: PropTypes.func.isRequired,
  isMenuVisible: PropTypes.bool.isRequired,
  openerRef: // `current: any`, NOT instanceOf(Element): Element is a browser global and
  // is undefined during Gatsby's static render, so instanceOf(Element) throws
  // ReferenceError at build time. The build caught it; nothing else would have.
  PropTypes.shape({ current: PropTypes.any }).isRequired,
};

export default Header;

