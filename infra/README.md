# Infrastructure

Terraform for the Samether.io AWS baseline.

## Target Architecture

- Frontend: `S3 + CloudFront`
- Backend: `ALB -> ECS on Fargate`
- Image registry: `ECR`
- Shared state: `ElastiCache Redis`
- GPS tracking: `Amazon Location Service Tracker`

## Room Model

- Each ECS task owns one independent room.
- The ECS service keeps `2` tasks running by default.
- ALB distributes new connections across tasks, so each task becomes a separate room.
- A room stays local to its task memory for the PoC.
- Redis is reserved for session, leaderboard, GPS/CP state, and future room registry use.

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

- The ECS service starts with `desired_count = 2`.
- `min_capacity = 2` keeps two rooms warm by default.
- Auto scaling is enabled structurally, but bounded conservatively for PoC.
- WebSocket TLS terminates at the ALB.
- GPS/CP calculation should remain server-authoritative.
- Each task derives its default room ID from the container hostname unless `ROOM_ID` is set explicitly.
