# Infrastructure

Terraform for the Samether.io AWS baseline.

## Target Architecture

- Frontend: `S3 + CloudFront`
- Backend: `ALB -> ECS on Fargate`
- Image registry: `ECR`
- Shared state: `ElastiCache Redis`
- GPS tracking: `Amazon Location Service Tracker`

## Layout

```text
infra/
  envs/dev/              # deployable environment
  modules/network/       # VPC, subnets, routes
  modules/ecr/           # ECR repositories
  modules/alb/           # ALB, target group, listeners
  modules/ecs_service/   # ECS cluster, task definition, service
  modules/redis/         # ElastiCache Redis
  modules/frontend_static/ # S3 + CloudFront
  modules/location/      # Amazon Location tracker
```

## Step By Step

1. Copy `envs/dev/terraform.tfvars.example` to `envs/dev/terraform.tfvars`.
2. Fill in AWS account, region, domain, certificate, and image settings.
3. Run `terraform init`.
4. Run `terraform plan`.
5. Run `terraform apply`.

## Initial Deployment Order

1. ACM certificate and Route53 zone inputs
2. Network
3. ECR
4. ALB
5. ECS service
6. Redis
7. Frontend static hosting
8. Amazon Location tracker

## Notes

- The ECS service starts with `desired_count = 1`.
- Auto scaling is enabled structurally, but bounded conservatively for PoC.
- WebSocket TLS terminates at the ALB.
- GPS/CP calculation should remain server-authoritative.
