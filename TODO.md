# To Do

- [ ] switch to waycharter
- [ ] switch to github actions
- [ ] auto deploy server to GCP
- [ ] setup automatic job to load gnaf
- [ ] fix code coverage
- [ ] HEAD handler
- [ ] Switch to GDA2020 - https://www.icsm.gov.au/gda2020/what-changing-and-why
- [ ] etags

Option A

- Public website - Netlify
- API Key provider/proxy - CORS to only allow from addressr site - Nginx? - Cloudflare Worker
- API Key validator/proxy - Nginx? - Cloudflare Worker
- Backend - GCP
- Elastic Search

vs

Option B

- Public website - Netlify
- Backend - GCP
- Elastic Search

vs

Option C

- Public website with API key - Netlify
- API Key validator/proxy - Nginx?
- Backend - GCP
- Elastic Search

Comparison

Option C can have the API key stolen very easily - would need to change frequently
Option B we have no view of who's using what
Option A is expensive