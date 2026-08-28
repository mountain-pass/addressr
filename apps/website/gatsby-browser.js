/**
 * Implement Gatsby's Browser APIs in this file.
 *
 * See: https://www.gatsbyjs.org/docs/browser-apis/
 */

export const onRouteUpdate = ({ location, prevLocation }) => {
  if (!prevLocation || prevLocation.pathname === location.pathname) return;

  // ponytail: 10 frames bounds Gatsby focus recovery; instrument before widening.
  let framesRemaining = 10;
  let focusedFrames = 0;
  const focusContent = () => {
    const content = document.querySelector('#content');
    if (!content || framesRemaining === 0) return;
    framesRemaining -= 1;

    if (
      content.contains(document.activeElement) &&
      document.activeElement !== content
    )
      return;

    if (document.activeElement === content) {
      focusedFrames += 1;
      if (focusedFrames === 2) return;
    } else {
      focusedFrames = 0;
      if (!content.closest('[inert]')) content.focus({ preventScroll: true });
    }

    requestAnimationFrame(focusContent);
  };

  requestAnimationFrame(focusContent);
};

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
