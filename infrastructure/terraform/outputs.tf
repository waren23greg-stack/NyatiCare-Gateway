output "ecr_repository_urls" {
  value = {
    auth_service      = aws_ecr_repository.auth_service.repository_url
    claims_ingestion  = aws_ecr_repository.claims_ingestion.repository_url
    patient_registry  = aws_ecr_repository.patient_registry.repository_url
  }
}
