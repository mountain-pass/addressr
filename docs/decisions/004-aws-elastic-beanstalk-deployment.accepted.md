---
status: accepted
date: 2021-01-01
decision-makers: [Tom Howard]
consulted: []
informed: []
---

# ADR 004: AWS Elastic Beanstalk for Production Deployment

## Context and Problem Statement

Addressr needs a production hosting environment for the Node.js API server in the ap-southeast-2 (Sydney) region, close to the Australian address data it serves.

## Decision Drivers

- Low operational overhead (managed platform)
- Cost efficiency for a revenue-generating side project
- Sydney region availability
- Auto-scaling for variable API traffic

## Considered Options

1. **AWS Elastic Beanstalk** -- managed platform with auto-scaling
2. **AWS ECS/Fargate** -- container orchestration
3. **AWS Lambda** -- serverless functions
4. **Direct EC2** -- self-managed instances

## Decision Outcome

**Option 1: AWS Elastic Beanstalk** with Terraform for infrastructure-as-code. Terraform state managed in Terraform Cloud (`organization: mountainpass`).

Key configuration:
- Instance types: t2.nano / t3.nano (cost-optimized)
- 100% Spot instances (no on-demand base)
- Auto-scaling: min 2, max 4 instances across 3 AZs
- Classic ELB with HTTP health checks
- AllAtOnce deployment policy
- Rolling updates for ASG changes
- Nginx reverse proxy
- Enhanced health reporting

### Consequences

- Good: Low operational overhead, managed platform updates
- Good: Cost-efficient with Spot instances
- Good: Auto-scaling handles traffic spikes
- Neutral: AllAtOnce deploy means brief service disruption during deploys (acceptable given Uptime Robot monitoring detects issues within 5 minutes)
- Bad: 100% Spot means potential interruptions during capacity shortages
- Bad: Classic ELB is legacy (ALB has better features)
- Bad: t2.nano instances have very limited memory (512MB)

### Confirmation

- `deploy/main.tf` defines Elastic Beanstalk resources
- `deploy/provider.tf` targets ap-southeast-2
- `deploy/vars.tf` specifies Node.js 22 on Amazon Linux 2023

### Reassessment Criteria

- Spot instance availability issues in ap-southeast-2
- Memory constraints on nano instances with large G-NAF datasets
- AWS deprecating Classic ELB
- Need for WebSocket support (requires ALB)
