output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.site.domain_name
}
