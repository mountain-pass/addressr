output "endpoint" {
  value       = aws_opensearch_domain.this.endpoint
  description = "Hostname of the domain, consumed by the EB app as ELASTIC_HOST."
}

output "arn" {
  value       = aws_opensearch_domain.this.arn
  description = "Domain ARN."
}

output "domain_name" {
  value       = aws_opensearch_domain.this.domain_name
  description = "Echoes var.name; convenient for downstream resources that need the logical name."
}
