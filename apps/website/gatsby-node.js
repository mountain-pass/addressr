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

exports.onCreateWebpackConfig = ({ stage, loaders, actions }) => {
  if (stage === 'build-html') {
    /*
     * `swagger-ui` relies on browser-only APIs and must be null-loaded during
     * the SSR (build-html) pass or the build fails.
     *
     * THIS RULE IS LOAD-BEARING, despite api-docs.js having its `swagger-ui`
     * import commented out at :5 — that page still reaches `window.SwaggerUI`
     * at :10, and /api-docs/ serves 200 on the evaluation path (JTBD-004).
     * Dropping it because the import "looks unused" breaks a live page.
     * Pinned by test/js/__tests__/gatsby-node.test.mjs.
     *
     * An `auth0-js` rule sat above this one until 2026-08-23, removed with the
     * other Auth0 remnants at the ADR-053 import: `auth0-js` is not a
     * dependency, nothing under src/ references it, and the comment it carried
     * pointed at `src/utils/auth.js`, a file that does not exist. It stubbed
     * out a package that was never there.
     */
    actions.setWebpackConfig({
      module: {
        rules: [
          {
            test: /swagger-ui/,
            use: loaders.null(),
          },
        ],
      },
    });
  }
};
