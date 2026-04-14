locals {
  name_prefix = "${var.project_name}-${var.environment}"
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

data "aws_route53_zone" "primary" {
  name         = var.route53_zone_name
  private_zone = false
}

module "network" {
  source = "../../modules/network"

  name_prefix        = local.name_prefix
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}

module "ecr" {
  source = "../../modules/ecr"

  name_prefix = local.name_prefix
}

module "alb" {
  source = "../../modules/alb"

  name_prefix        = local.name_prefix
  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnet_ids
  alb_security_group = module.network.alb_security_group_id
  target_port        = var.container_port
  certificate_arn    = var.acm_certificate_arn
  api_domain_name    = var.api_domain_name
  zone_id            = data.aws_route53_zone.primary.zone_id
}

module "ecs_service" {
  source = "../../modules/ecs_service"

  name_prefix               = local.name_prefix
  aws_region                = var.aws_region
  private_subnet_ids        = module.network.private_subnet_ids
  service_security_group_id = module.network.ecs_security_group_id
  execution_role_arn        = module.network.ecs_task_execution_role_arn
  task_role_arn             = module.network.ecs_task_role_arn
  target_group_arn          = module.alb.target_group_arn
  container_image           = var.container_image
  container_port            = var.container_port
  cpu                       = var.ecs_cpu
  memory                    = var.ecs_memory
  desired_count             = var.desired_count
  min_capacity              = var.min_capacity
  max_capacity              = var.max_capacity
}

module "redis" {
  source = "../../modules/redis"

  name_prefix       = local.name_prefix
  subnet_ids        = module.network.private_subnet_ids
  security_group_id = module.network.redis_security_group_id
  node_type         = var.redis_node_type
}

module "frontend_static" {
  source = "../../modules/frontend_static"

  name_prefix                    = local.name_prefix
  frontend_domain_name           = var.frontend_domain_name
  zone_id                        = data.aws_route53_zone.primary.zone_id
  cloudfront_acm_certificate_arn = var.cloudfront_acm_certificate_arn
}

module "location" {
  source = "../../modules/location"

  tracker_name = var.location_tracker_name
}
