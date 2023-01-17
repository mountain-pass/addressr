# Use dagger.io on GitHub Actions for build and deplopment automation

- Status: draft
- Tags: dev-tools, cicd, deployment

## Context and Problem Statement

Addressr currently uses CircleCI for build and deplopment automation, but
- this is hard to test locally  
- it's jarring to go back and forth between GitHub and CircleCI

## Considered Options

- Use CircleCI for build and deplopment automation
- Use GitHub Actions for build and deplopment automation
- Use dagger.io on CircleCI for build and deplopment automation
- Use dagger.io on GitHub Actions for build and deplopment automation

## Decision Outcome

Chosen option: "Use dagger.io on GitHub Actions for build and deplopment automation", because it
allows us to test locally and by moving to GitHub Actions, we avoid the jarring of going back and forth between GitHub and CircleCI

### Negative Consequences <!-- optional -->

- We might face issues not being able to use Actions available in GitHub Actions.
