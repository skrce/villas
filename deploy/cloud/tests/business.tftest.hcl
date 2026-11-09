mock_provider "google" {
  mock_data "google_iam_policy" {
    defaults = { policy_data = "{\"bindings\":[],\"version\":1}" }
  }
}

variables {
  project_id            = "villas-synthetic-staging"
  project_number        = "123456789012"
  environment           = "staging"
  business_id           = "lake-house"
  notification_channels = []
  business = {
    name              = "Lake House"
    phase             = "service"
    neon_host         = "ep-synthetic-lake.eu-central-1.aws.neon.tech"
    public_origin     = "https://villas-lake-house-staging-123456789012.europe-west3.run.app"
    app_image         = "europe-west3-docker.pkg.dev/villas-synthetic-staging/villas/app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    backup_image      = "europe-west3-docker.pkg.dev/villas-synthetic-staging/villas/backup@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    maintenance_image = "europe-west3-docker.pkg.dev/villas-synthetic-staging/villas/proxy@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    maintenance       = false
    secret_versions   = { db-runtime = "1", db-migration = "1", db-backup = "1", google-client-id = "1", google-client-secret = "1", backup-password = "1", initial-owner = "1" }
    launch_qualified  = false
    public_access     = false
    schedules_enabled = false
  }
}

run "maintenance_has_no_database_or_google_secrets" {
  command = plan
  module { source = "./modules/business" }
  variables {
    business = merge(var.business, { maintenance = true })
  }
  assert {
    condition     = google_cloud_run_v2_service.web[0].template[0].containers[0].image == var.business.maintenance_image && length(google_cloud_run_v2_service.web[0].template[0].containers[0].env) == 0 && length(google_cloud_run_v2_service.web[0].template[0].volumes) == 0
    error_message = "Maintenance traffic must run a static process with no database connection or secret mounts."
  }
}

run "origin_cannot_point_to_another_business" {
  command = plan
  module { source = "./modules/business" }
  variables {
    business = merge(var.business, { public_origin = "https://villas-other-staging-123456789012.europe-west3.run.app" })
  }
  expect_failures = [google_cloud_run_v2_service.web]
}

run "private_service_and_isolated_operations" {
  command = plan
  module { source = "./modules/business" }
  assert {
    condition     = google_cloud_run_v2_service.web[0].scaling[0].min_instance_count == 0 && google_cloud_run_v2_service.web[0].scaling[0].max_instance_count == 1 && google_cloud_run_v2_service.web[0].template[0].containers[0].resources[0].cpu_idle && !google_cloud_run_v2_service.web[0].template[0].containers[0].resources[0].startup_cpu_boost && google_cloud_run_v2_service.web[0].template[0].max_instance_request_concurrency == 2
    error_message = "Keep the free-first service small and able to scale to zero."
  }
  assert {
    condition     = google_cloud_run_v2_service.web[0].template[0].containers[0].startup_probe[0].http_get[0].path == "/health"
    error_message = "Cloud liveness probes must not wake the database."
  }
  assert {
    condition     = google_cloud_scheduler_job.backup["backup"].paused && google_cloud_scheduler_job.backup["age"].paused && google_cloud_scheduler_job.backup["backup"].schedule == "every 23 hours"
    error_message = "Unqualified schedules remain paused; daily protection needs runtime headroom."
  }
  assert {
    condition     = length(data.google_iam_policy.public.binding) == 0 && google_storage_bucket.backup.public_access_prevention == "enforced" && !google_storage_bucket.backup.force_destroy
    error_message = "Do not expose an unqualified app or backup bucket."
  }
  assert {
    condition     = google_cloud_run_v2_job.operation["migrate"].template[0].template[0].max_retries == 0 && google_cloud_run_v2_job.operation["owner"].template[0].template[0].max_retries == 0
    error_message = "Never automatically retry migration or owner-bootstrap jobs."
  }
  assert {
    condition     = alltrue([for grant in values(google_secret_manager_secret_iam_member.access) : grant.role == "roles/secretmanager.secretAccessor"]) && google_storage_bucket_iam_member.observe.role == "roles/storage.objectViewer"
    error_message = "Scope each identity to individual secret containers and read-only freshness access."
  }
  assert {
    condition     = length(google_monitoring_alert_policy.application) == 0 && length(google_monitoring_uptime_check_config.web) == 0
    error_message = "Do not run external probes against an intentionally private service."
  }
}
