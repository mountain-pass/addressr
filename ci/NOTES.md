# CI/CD

During the CI run, we want to

1. Do the test runs
2. Do other QA
3. If that passes, then
4. bump the version & commit
5. package the release
6. upload the release
7. create the deployable
8. run terraform to do the deploy

## The prototype scripts are gone (2026-08-08)

`build.js` and `pipeline.mjs` were removed. They were never wired to anything —
no npm script, no workflow, no reference anywhere in the tree — and neither
could run: `@dagger.io/dagger` and `env-paths` are in neither dependency list.
`pipeline.mjs` also ended by invoking `npm run build`, a script ADR-044 retired
along with the Babel step.

They are removed rather than repaired by the same test that removed
`utils/writer.js` in that change: code
with no caller and undeclared dependencies is a note about an idea, not an
implementation, and this file is the better place for the idea. The design
sketch above is preserved.

`deploy/create-deployment-archive.js` failed the same test and was removed in
its own commit on 2026-08-08, for exactly the reason it was held back: any
change under `deploy/` arms the push-tier production terraform apply. It went
alone, and a baseline `terraform-plan` dispatch against master returned an empty
change set first, so the apply it armed had nothing to apply.
