/**
 * Implement Gatsby's Node APIs in this file.
 *
 * See: https://www.gatsbyjs.org/docs/node-apis/
 */

// You can delete this file if you're not using it

exports.onCreatePage = async ({ actions }) => {
  const { createRedirect } = actions;

  createRedirect({
    fromPath: `/signup`,
    isPermanent: true,
    redirectInBrowser: true,
    toPath: `/quick-start/`,
  });

  createRedirect({
    fromPath: `/community-support`,
    isPermanent: true,
    redirectInBrowser: true,
    toPath: `https://app.gitter.im/#/room/#mountainpass-addressr_community:gitter.im`,
  });

  createRedirect({
    fromPath: `/community-support/`,
    isPermanent: true,
    redirectInBrowser: true,
    toPath: `https://app.gitter.im/#/room/#mountainpass-addressr_community:gitter.im`,
  });

};
