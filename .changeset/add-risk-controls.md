---
"@mountainpass/addressr": patch
---

Add deployment safety controls and v2 API test coverage

- Add `/health` HATEOAS endpoint to v2 API (linked from root, returns status + version)
- Add `test:rest2:nogeo` to CI pipeline (v2 API now tested in CI)
- Enable rolling deployment with automatic rollback
- Add post-deploy smoke tests to release workflow
- Remove broken `ngrok` devDependency
