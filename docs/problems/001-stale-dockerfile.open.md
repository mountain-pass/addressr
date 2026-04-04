# Problem 001: Stale Dockerfile

**Status**: Open
**Reported**: 2026-04-04
**Priority**: 6 (Medium) — Impact: Moderate (3) x Likelihood: Unlikely (2)

## Description

The Dockerfile still uses Node 16 and runs the v1 API (`addressr-server`). Production runs Node 22 and the v2 API (`addressr-server-2`). The Dockerfile is unusable for current deployments.

## Symptoms

- `docker build` produces an image running the wrong Node version and wrong API version
- Docker image consumers on Docker Hub get a broken/outdated setup

## Workaround

Production deploys via Elastic Beanstalk, not Docker. Docker image consumers are affected but EB deployment works.

## Impact Assessment

- **Who is affected**: Docker image consumers (npm + Docker distribution channel)
- **Frequency**: Every Docker-based deployment
- **Severity**: Medium — one distribution channel is broken, but primary (RapidAPI/EB) works
- **Analytics**: N/A

## Root Cause Analysis

### Investigation Tasks

- [ ] Investigate root cause
- [ ] Create reproduction test
- [ ] Create INVEST story for permanent fix

## Related

- BRIEFING.md notes the Dockerfile is stale
- ADR 004: AWS Elastic Beanstalk Deployment
