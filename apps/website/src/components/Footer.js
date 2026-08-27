import {
  faGithub,
  faGitter,
  faNpm,
} from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Link } from 'gatsby';
import React from 'react';

React.createContext();

const Footer = () => (
  <footer id="footer">
    <div className="inner">
      <div className="grid-wrapper">
        <div className="col-3">
          <ul className="links">
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <Link to="/pricing/">Pricing</Link>
            </li>
            <li>
              <Link to="/quick-start/#hosted">Hosted API quick start</Link>
            </li>
            <li>
              <Link to="/api-docs/">API Docs</Link>
            </li>
            <li>
              <Link to="/quick-start/#self-hosted">Self-hosted guide</Link>
            </li>
            <li>
              <a href="https://rapidapi.com/addressr-addressr-default/api/addressr/pricing">
                Sign up for Addressr on RapidAPI
              </a>
            </li>
            <li>
              <a href="https://app.gitter.im/#/room/#mountainpass-addressr_community:gitter.im">
                Community support on Gitter <FontAwesomeIcon icon={faGitter} />
              </a>
            </li>
          </ul>
        </div>
        <div className="col-3">
          <ul className="links">
            <li>
              <a href="https://rapidapi.com/addressr-addressr-default/api/addressr/pricing">
                Addressr plans on RapidAPI
              </a>
            </li>
            <li>
              <a href="https://github.com/mountain-pass/addressr">
                Code <FontAwesomeIcon icon={faGithub} />
              </a>
            </li>
            <li>
              <a href="https://www.npmjs.com/package/@mountainpass/addressr">
                Addressr on npm <FontAwesomeIcon icon={faNpm} />
              </a>
            </li>
          </ul>
        </div>
      </div>
      {/* <ul className="icons">
        <li>
          <a href="#" className="icon alt fa-twitter">
            <span className="label">Twitter</span>
          </a>
        </li>
        <li>
          <a href="#" className="icon alt fa-facebook">
            <span className="label">Facebook</span>
          </a>
        </li>
        <li>
          <a href="#" className="icon alt fa-instagram">
            <span className="label">Instagram</span>
          </a>
        </li>
        <li>
          <a href="#" className="icon alt fa-github">
            <span className="label">GitHub</span>
          </a>
        </li>
        <li>
          <a href="#" className="icon alt fa-linkedin">
            <span className="label">LinkedIn</span>
          </a>
        </li>
      </ul> */}
      <ul className="copyright">
        <li>
          &copy;{' '}
          <a href="https://mountain-pass.com.au">Mountain Pass PTY LTD</a>
        </li>
        <li>
          <em>Mountain Pass</em>, <em>Addressr</em> and{' '}
          <em>the Address Logo</em> are trade marks of{' '}
          <a href="https://mountain-pass.com.au">Mountain Pass PTY LTD</a>
        </li>
        <li>
          Base Website Design by <a href="https://html5up.net">HTML5 UP</a>
        </li>
      </ul>
    </div>
  </footer>
);

export default Footer;
