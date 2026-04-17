output "ecr_repository_url" {
  value = module.ecr.repository_url
}

output "alb_dns_name" {
  value = module.alb.alb_dns_name
}


output "api_url" {
  value = "http://${module.alb.alb_dns_name}"
}

output "frontend_url" {
  value = "https://${module.frontend_static.cloudfront_domain_name}"
}

output "redis_primary_endpoint" {
  value = module.redis.primary_endpoint_address
}

output "location_tracker_name" {
  value = module.location.tracker_name
}
