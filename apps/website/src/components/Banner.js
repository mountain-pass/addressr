import PropTypes from 'prop-types';
import React from 'react';

const Banner = props => {
  const { children, className } = props;
  return (
    <section id="banner" className={className}>
      <div className="inner">{children}</div>
    </section>
  );
};

Banner.propTypes = {
  className: PropTypes.string,
  children: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.node),
    PropTypes.node,
  ]).isRequired,
};

Banner.defaultProps = {
  className: undefined,
};

export default Banner;
