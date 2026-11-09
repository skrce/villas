locals {
  region       = "europe-west3"
  name         = "villas-${var.business_id}-${var.environment}"
  identities   = toset(["web", "migration", "backup", "observe", "scheduler"])
  secret_names = toset(["db-runtime", "db-migration", "db-backup", "google-client-id", "google-client-secret", "backup-password", "initial-owner"])
  access = {
    web_runtime    = { identity = "web", secret = "db-runtime" }
    web_google_id  = { identity = "web", secret = "google-client-id" }
    web_google_key = { identity = "web", secret = "google-client-secret" }
    migrate_db     = { identity = "migration", secret = "db-migration" }
    migrate_owner  = { identity = "migration", secret = "initial-owner" }
    backup_db      = { identity = "backup", secret = "db-backup" }
    backup_key     = { identity = "backup", secret = "backup-password" }
    observe_key    = { identity = "observe", secret = "backup-password" }
  }
  database_url = "jdbc:postgresql://${var.business.neon_host}/villarosa?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt"
  app_environment = {
    VILLAS_CLOUD_RUN     = "1"
    VILLAS_MODE          = "production"
    VILLAS_AUTH_PROVIDER = "google"
    VILLAS_PORT          = "8080"
    VILLAS_PROPERTY_ID   = var.business_id
    VILLAS_PROPERTY_NAME = var.business.name
    VILLAS_PUBLIC_URL    = var.business.public_origin
    VILLAS_DB_URL        = local.database_url
  }
  backup_environment = {
    VILLAS_CLOUD_RUN              = "1"
    VILLAS_GOOGLE_PROJECT_ID      = var.project_id
    VILLAS_BACKUP_REPOSITORY      = "gs:${google_storage_bucket.backup.name}:/repository"
    VILLAS_BACKUP_HOST            = "villas-${var.environment}-${var.business_id}"
    VILLAS_BACKUP_STATUS_FILE     = "/tmp/backup-status.json"
    VILLAS_KEEP_DAILY             = "7"
    VILLAS_KEEP_HOURLY            = "0"
    VILLAS_BACKUP_MAX_AGE_SECONDS = "86400"
    VILLAS_BACKUP_MAX_JOB_SECONDS = "1800"
  }
  jobs = {
    migrate   = { image = var.business.app_image, identity = "migration", args = ["migrate"], env = merge(local.app_environment, { VILLAS_DB_USERNAME = "villas_migration" }), secrets = { VILLAS_DB_PASSWORD = "db-migration" } }
    schema    = { image = var.business.app_image, identity = "web", args = ["check-schema"], env = merge(local.app_environment, { VILLAS_DB_USERNAME = "villas_runtime" }), secrets = { VILLAS_DB_PASSWORD = "db-runtime" } }
    owner     = { image = var.business.app_image, identity = "migration", args = ["bootstrap-owner"], env = merge(local.app_environment, { VILLAS_DB_USERNAME = "villas_migration" }), secrets = { VILLAS_DB_PASSWORD = "db-migration", VILLAS_INITIAL_OWNER_EMAIL = "initial-owner" } }
    init      = { image = var.business.backup_image, identity = "backup", args = ["init"], env = local.backup_environment, secrets = { VILLAS_BACKUP_PASSWORD = "backup-password" } }
    backup    = { image = var.business.backup_image, identity = "backup", args = ["backup"], env = merge(local.backup_environment, { VILLAS_BACKUP_DB_HOST = var.business.neon_host }), secrets = { VILLAS_BACKUP_PASSWORD = "backup-password", VILLAS_BACKUP_DB_PASSWORD = "db-backup" } }
    verify    = { image = var.business.backup_image, identity = "observe", args = ["verify"], env = merge(local.backup_environment, { VILLAS_BACKUP_READ_ONLY = "1" }), secrets = { VILLAS_BACKUP_PASSWORD = "backup-password" } }
    age       = { image = var.business.backup_image, identity = "observe", args = ["check-age"], env = merge(local.backup_environment, { VILLAS_BACKUP_READ_ONLY = "1" }), secrets = { VILLAS_BACKUP_PASSWORD = "backup-password" } }
    snapshots = { image = var.business.backup_image, identity = "observe", args = ["snapshots"], env = merge(local.backup_environment, { VILLAS_BACKUP_READ_ONLY = "1" }), secrets = { VILLAS_BACKUP_PASSWORD = "backup-password" } }
  }
  web_secrets = {
    VILLAS_DB_PASSWORD          = "db-runtime"
    VILLAS_GOOGLE_CLIENT_ID     = "google-client-id"
    VILLAS_GOOGLE_CLIENT_SECRET = "google-client-secret"
  }
}

resource "google_service_account" "identity" {
  for_each     = local.identities
  account_id   = "v-${var.business_id}-${substr(var.environment, 0, 1)}-${each.key}"
  display_name = "${local.name} ${each.key}"
}

resource "google_secret_manager_secret" "setting" {
  for_each  = local.secret_names
  secret_id = "${local.name}-${each.key}"
  replication {
    user_managed {
      replicas { location = local.region }
    }
  }
  lifecycle { prevent_destroy = true }
}

resource "google_secret_manager_secret_iam_member" "access" {
  for_each  = local.access
  secret_id = google_secret_manager_secret.setting[each.value.secret].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.identity[each.value.identity].email}"
}

resource "google_storage_bucket" "backup" {
  name                        = "${var.project_id}-${var.business_id}-backup"
  location                    = local.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  soft_delete_policy { retention_duration_seconds = 0 }
  lifecycle { prevent_destroy = true }
}

resource "google_storage_bucket_iam_member" "backup" {
  bucket = google_storage_bucket.backup.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.identity["backup"].email}"
}

resource "google_storage_bucket_iam_member" "observe" {
  bucket = google_storage_bucket.backup.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.identity["observe"].email}"
}

resource "google_cloud_run_v2_service" "web" {
  count               = var.business.phase == "service" ? 1 : 0
  name                = local.name
  location            = local.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"
  scaling {
    min_instance_count = 0
    max_instance_count = 1
  }
  template {
    service_account                  = google_service_account.identity["web"].email
    timeout                          = "60s"
    max_instance_request_concurrency = 2
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image   = var.business.maintenance ? var.business.maintenance_image : var.business.app_image
      command = var.business.maintenance ? ["caddy"] : null
      args    = var.business.maintenance ? ["run", "--config", "/etc/caddy/maintenance.Caddyfile", "--adapter", "caddyfile"] : null
      ports { container_port = 8080 }
      resources {
        limits            = { cpu = "1", memory = "1Gi" }
        cpu_idle          = true
        startup_cpu_boost = false
      }
      startup_probe {
        initial_delay_seconds = 5
        period_seconds        = 5
        timeout_seconds       = 3
        failure_threshold     = 40
        http_get { path = "/health" }
      }
      liveness_probe {
        period_seconds    = 60
        timeout_seconds   = 3
        failure_threshold = 3
        http_get { path = "/health" }
      }
      dynamic "env" {
        for_each = var.business.maintenance ? {} : merge(local.app_environment, { VILLAS_DB_USERNAME = "villas_runtime" })
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = var.business.maintenance ? {} : local.web_secrets
        content {
          name  = "${env.key}_FILE"
          value = "/run/secrets/${env.value}/value"
        }
      }
      dynamic "volume_mounts" {
        for_each = var.business.maintenance ? toset([]) : toset(values(local.web_secrets))
        content {
          name       = volume_mounts.value
          mount_path = "/run/secrets/${volume_mounts.value}"
        }
      }
    }
    dynamic "volumes" {
      for_each = var.business.maintenance ? toset([]) : toset(values(local.web_secrets))
      content {
        name = volumes.value
        secret {
          secret = google_secret_manager_secret.setting[volumes.value].secret_id
          items {
            version = var.business.secret_versions[volumes.value]
            path    = "value"
            mode    = 292
          }
        }
      }
    }
  }
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
  depends_on = [google_secret_manager_secret_iam_member.access]
  lifecycle {
    precondition {
      condition     = var.business.public_origin == "https://${local.name}-${var.project_number}.europe-west3.run.app"
      error_message = "The configured origin must be this business's deterministic Frankfurt Cloud Run URL."
    }
  }
}

data "google_iam_policy" "public" {
  dynamic "binding" {
    for_each = var.business.public_access ? [true] : []
    content {
      role    = "roles/run.invoker"
      members = ["allUsers"]
    }
  }
}

resource "google_cloud_run_v2_service_iam_policy" "web" {
  count       = var.business.phase == "service" ? 1 : 0
  location    = local.region
  name        = google_cloud_run_v2_service.web[0].name
  policy_data = data.google_iam_policy.public.policy_data
}

resource "google_cloud_run_v2_job" "operation" {
  for_each            = var.business.phase == "secrets" ? {} : local.jobs
  name                = "${local.name}-${each.key}"
  location            = local.region
  deletion_protection = true
  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account = google_service_account.identity[each.value.identity].email
      timeout         = "1800s"
      max_retries     = 0
      containers {
        image = each.value.image
        args  = each.value.args
        resources { limits = { cpu = "1", memory = "1Gi" } }
        dynamic "env" {
          for_each = each.value.env
          content {
            name  = env.key
            value = env.value
          }
        }
        dynamic "env" {
          for_each = each.value.secrets
          content {
            name  = "${env.key}_FILE"
            value = "/run/secrets/${env.value}/value"
          }
        }
        dynamic "volume_mounts" {
          for_each = toset(values(each.value.secrets))
          content {
            name       = volume_mounts.value
            mount_path = "/run/secrets/${volume_mounts.value}"
          }
        }
      }
      dynamic "volumes" {
        for_each = toset(values(each.value.secrets))
        content {
          name = volumes.value
          secret {
            secret = google_secret_manager_secret.setting[volumes.value].secret_id
            items {
              version = var.business.secret_versions[volumes.value]
              path    = "value"
              mode    = 292
            }
          }
        }
      }
    }
  }
  depends_on = [google_secret_manager_secret_iam_member.access, google_storage_bucket_iam_member.backup, google_storage_bucket_iam_member.observe]
}

data "google_iam_policy" "job" {
  for_each = var.business.phase == "secrets" ? {} : local.jobs
  dynamic "binding" {
    for_each = contains(["backup", "age"], each.key) ? [true] : []
    content {
      role    = "roles/run.invoker"
      members = ["serviceAccount:${google_service_account.identity["scheduler"].email}"]
    }
  }
}

resource "google_cloud_run_v2_job_iam_policy" "operation" {
  for_each    = var.business.phase == "secrets" ? {} : local.jobs
  location    = local.region
  name        = google_cloud_run_v2_job.operation[each.key].name
  policy_data = data.google_iam_policy.job[each.key].policy_data
}

resource "google_cloud_scheduler_job" "backup" {
  for_each         = var.business.phase == "secrets" ? {} : { backup = "every 23 hours", age = "15 */6 * * *" }
  name             = "${local.name}-${each.key}"
  region           = local.region
  schedule         = each.value
  time_zone        = "UTC"
  paused           = !var.business.schedules_enabled
  attempt_deadline = "320s"
  retry_config { retry_count = 0 }
  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${local.region}/jobs/${google_cloud_run_v2_job.operation[each.key].name}:run"
    oauth_token {
      service_account_email = google_service_account.identity["scheduler"].email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }
  depends_on = [google_cloud_run_v2_job_iam_policy.operation]
}
