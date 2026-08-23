/* eslint-disable jsx-a11y/anchor-is-valid */
import { faGithub, faGitter } from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Link } from 'gatsby';
import PropTypes from 'prop-types';
import React from 'react';

// An Auth0 account affordance lived here until 2026-08-23 — a /r/account/ link
// gated on `user !== undefined`, with layout.js never passing a `user`, so it
// never rendered. Removed with the other Auth0 remnants at the ADR-053 import.
//
// The `user` prop went with it, deliberately. The web-app-developer persona
// amendment justifies its own sufficiency on the account actor being gone; while
// this component still ACCEPTED a user, that held only because a prop was not
// passed, and one wiring change away from false. Pinned by
// test/js/__tests__/Menu.test.mjs.
const Menu = ({ onToggleMenu }) => {
  return (
    <nav id="menu">
      <div className="inner">
        <ul className="links">
          <li>
            <Link onClick={onToggleMenu} to="/">
              Home
            </Link>
          </li>
          <li>
            <Link onClick={onToggleMenu} to="/pricing/">
              Pricing
            </Link>
          </li>
          <li>
            <Link onClick={onToggleMenu} to="/api-docs/">
              API Docs
            </Link>
          </li>
          <li>
            <Link onClick={onToggleMenu} to="/download/">
              Download
            </Link>
          </li>
          <li>
            <a href="https://github.com/mountain-pass/addressr">
              Code <FontAwesomeIcon icon={faGithub} />
            </a>
          </li>
          <li>
            <Link onClick={onToggleMenu} to="/quick-start/">
              Quick Start
            </Link>
          </li>
          <li>
            <a href="https://app.gitter.im/#/room/#mountainpass-addressr_community:gitter.im">
              Community Support <FontAwesomeIcon icon={faGitter} />
            </a>
          </li>
          <li>
            <a href="https://stats.uptimerobot.com/PK1GwT4YmX">
              <img
                alt="Uptime Robot ratio (30 days)"
                src="https://img.shields.io/uptimerobot/ratio/m788652244-3e35661f9886333310f4dc2f?color=9bf1ff&amp;labelColor=242943&amp;style=for-the-badge&amp;logo=data:image/png;base64,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"
              />
            </a>
          </li>
        </ul>{' '}
      </div>
      <a className="close" onClick={onToggleMenu}>
        Close
      </a>
    </nav>
  );
};

Menu.propTypes = {
  onToggleMenu: PropTypes.func.isRequired,
};

export default Menu;
