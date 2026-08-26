# RapidAPI key for addressr.io — used for live integration tests (see docs/decisions/005-live-api-integration-testing.proposed.md)
# Store the secret in 1Password at: Private > addressr-rapidapi > credential
# Local dev: hydrate with `op inject -i .env.tpl -o .env`
# CI: this template is not used; CI injects ADDRESSR_RAPIDAPI_KEY directly from GitHub Actions secrets
ADDRESSR_RAPIDAPI_KEY={{ op://Private/addressr-rapidapi/credential }}
