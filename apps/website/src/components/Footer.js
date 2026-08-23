import {
  faDocker,
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
              <a href="https://rapidapi.com/addressr-addressr-default/api/addressr/pricing">
                Sign up
              </a>
            </li>
            <li>
              <a to="https://rapidapi.com/addressr-addressr-default/api/addressr/">
                API Docs
              </a>
            </li>
            <li>
              <Link to="/download/">Download</Link>
            </li>
            <li>
              <Link to="/quick-start/">Quick Start</Link>
            </li>
            <li>
              <Link to="/community-support/">
                Community Support <FontAwesomeIcon icon={faGitter} />
              </Link>
            </li>
          </ul>
        </div>
        <div className="col-3">
          <ul className="links">
            <li>
              <a to="https://rapidapi.com/addressr-addressr-default/api/addressr/">
                RapidAPI
              </a>
            </li>
            <li>
              <a href="https://github.com/mountain-pass/addressr">
                Code <FontAwesomeIcon icon={faGithub} />
              </a>
            </li>
            <li>
              <a href="https://www.npmjs.com/package/@mountainpass/addressr">
                NPM <FontAwesomeIcon icon={faNpm} />
              </a>
            </li>
            <li>
              <a href="https://hub.docker.com/r/mountainpass/addressr">
                Docker Hub <FontAwesomeIcon icon={faDocker} />
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
