# Addressr Web Site

## Local development

From the repository root:

```sh
npm ci
npm run start -w @mountainpass/website
```

Production deploys are direct uploads to Cloudflare Pages from the changesets
release workflow. A website changeset updates the release PR; merging that PR
builds and deploys the site and verifies the exact merged revision at
`https://addressr.io/revision.txt`.
