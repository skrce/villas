output "setup" {
  value = {
    service           = try(google_cloud_run_v2_service.web[0].name, null)
    uri               = try(google_cloud_run_v2_service.web[0].uri, null)
    configured_origin = var.business.public_origin
    jobs              = { for key, job in google_cloud_run_v2_job.operation : key => job.name }
    secrets           = { for key, secret in google_secret_manager_secret.setting : key => secret.secret_id }
    backup_repository = local.backup_environment.VILLAS_BACKUP_REPOSITORY
    identities        = { for key, identity in google_service_account.identity : key => identity.email }
    public_access     = var.business.public_access
    schedules_enabled = var.business.schedules_enabled
  }
}
