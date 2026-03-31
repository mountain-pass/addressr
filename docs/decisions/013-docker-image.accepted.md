---
status: accepted
date: 2020-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 013: Docker Image with Alpine and dumb-init

## Context and Problem Statement

Self-hosted consumers need a containerized deployment option for addressr.

## Decision Drivers

- Small image size (Alpine base)
- Proper signal handling in containers (PID 1)
- Security (non-root user)
- Easy deployment via Docker Hub

## Considered Options

1. **Alpine-based image with dumb-init** -- minimal footprint, proper signal handling
2. **Debian/Ubuntu-based image** -- larger but more compatible
3. **Distroless** -- minimal attack surface, no shell

## Decision Outcome

**Option 1: Alpine with dumb-init.** Published to Docker Hub as `mountainpass/addressr`. Runs as `node` user, installs package globally via npm.

**STATUS: STALE.** The Dockerfile currently references `node:16.3.0-alpine3.13` while the project requires Node >= 22. The CMD runs `addressr-server` (v1) while production deploys `addressr-server-2` (v2). This Dockerfile needs updating.

### Consequences

- Good: Small image size
- Good: dumb-init handles zombie processes and signal forwarding
- Good: Non-root execution
- Bad: **Dockerfile is out of sync** -- wrong Node version, wrong server binary
- Bad: Alpine can have compatibility issues with native modules

### Confirmation

- `Dockerfile` exists at project root
- Docker Hub: `mountainpass/addressr`
- `package.json` has `build:docker` and `start:server:docker` scripts

### Reassessment Criteria

- **Immediate**: Update to Node 22 and addressr-server-2
- Alpine compatibility with native dependencies
- Distroless for reduced attack surface
