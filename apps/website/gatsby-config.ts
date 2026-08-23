import type { GatsbyConfig } from "gatsby";

const config: GatsbyConfig = {
  siteMetadata: {
    title: `addressr.io`,
    author: 'Mountain Pass',
    description: 'Australian Address Validation and Autocomplete',
    siteUrl: `https://addressr.io`
  },
  // More easily incorporate content into your pages through automatic TypeScript type generation and better GraphQL IntelliSense.
  // If you use VSCode you can also use the GraphQL plugin
  // Learn more at: https://gatsby.dev/graphql-typegen
  graphqlTypegen: true,
  plugins: ["gatsby-plugin-sass", "gatsby-plugin-image", "gatsby-plugin-sitemap", {
    resolve: 'gatsby-plugin-manifest',
    options: {
      name: 'Addressr by Mountain Pass',
      short_name: 'addressr',
      start_url: '/',
      background_color: '#242943',
      theme_color: '#242943',
      display: 'minimal-ui',
      icon: 'src/assets/images/addressr-square.png', // This path is relative to the root of the site.
    }
  }, "gatsby-plugin-mdx", "gatsby-plugin-sharp", "gatsby-transformer-sharp", {
      resolve: 'gatsby-source-filesystem',
      options: {
        "name": "images",
        "path": "./src/images/"
      },
      __key: "images"
    }, {
      resolve: 'gatsby-source-filesystem',
      options: {
        "name": "pages",
        "path": "./src/pages/"
      },
      __key: "pages"
    },
    {
      resolve: `gatsby-plugin-force-trailing-slashes`,
      // options: {
      //   excludedPaths: [],
      // },
    }]
};

export default config;
