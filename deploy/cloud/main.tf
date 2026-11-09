locals {
  region            = "europe-west3"
  owns_registry     = var.project_id == var.registry_project_id
  repository_id     = "324284128"
  repository_owner  = "10517359"
  required_services = toset(["run.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com", "cloudscheduler.googleapis.com", "monitoring.googleapis.com", "logging.googleapis.com", "iam.googleapis.com", "iamcredentials.googleapis.com", "sts.googleapis.com", "billingbudgets.googleapis.com"])
}

data "google_project" "current" { project_id = var.project_id }

resource "google_project_service" "required" {
  for_each           = local.required_services
  service            = each.key
  disable_on_destroy = false
}

resource "google_logging_project_exclusion" "request_urls" {
  name        = "villas-request-urls"
  description = "Request URLs can contain OAuth codes and guest search terms."
  filter      = "resource.type=\"cloud_run_revision\" AND log_id(\"run.googleapis.com/requests\")"
  depends_on  = [google_project_service.required]
}

resource "google_artifact_registry_repository" "release" {
  count         = local.owns_registry ? 1 : 0
  location      = local.region
  repository_id = "villas"
  format        = "DOCKER"
  docker_config { immutable_tags = true }
  lifecycle { prevent_destroy = true }
  depends_on = [google_project_service.required]
}

resource "google_artifact_registry_repository_iam_member" "run_reader" {
  project    = var.registry_project_id
  location   = local.region
  repository = "villas"
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:service-${data.google_project.current.number}@serverless-robot-prod.iam.gserviceaccount.com"
  depends_on = [google_project_service.required, google_artifact_registry_repository.release]
}

resource "google_service_account" "publisher" {
  count        = local.owns_registry ? 1 : 0
  account_id   = "villas-publisher"
  display_name = "Villas verified image publisher"
  depends_on   = [google_project_service.required]
}

resource "google_artifact_registry_repository_iam_member" "publisher" {
  count      = local.owns_registry ? 1 : 0
  project    = var.project_id
  location   = local.region
  repository = google_artifact_registry_repository.release[0].repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.publisher[0].email}"
}

resource "google_iam_workload_identity_pool" "github" {
  count                     = local.owns_registry ? 1 : 0
  workload_identity_pool_id = "villas-release"
  depends_on                = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count                              = local.owns_registry ? 1 : 0
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
  }
  attribute_condition = "assertion.repository_id == '${local.repository_id}' && assertion.repository_owner_id == '${local.repository_owner}' && assertion.ref == 'refs/heads/master' && assertion.event_name == 'workflow_dispatch' && assertion.workflow_ref == 'skrce/villas/.github/workflows/release.yml@refs/heads/master' && assertion.environment == 'release'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}

resource "google_service_account_iam_member" "publisher_identity" {
  count              = local.owns_registry ? 1 : 0
  service_account_id = google_service_account.publisher[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository_id/${local.repository_id}"
}

module "business" {
  for_each              = var.businesses
  source                = "./modules/business"
  project_id            = var.project_id
  project_number        = data.google_project.current.number
  environment           = var.environment
  business_id           = each.key
  business              = each.value
  notification_channels = var.notification_channels
  depends_on            = [google_project_service.required, google_artifact_registry_repository_iam_member.run_reader, google_logging_project_exclusion.request_urls]
}

resource "google_billing_budget" "villas" {
  count           = var.billing_account == null ? 0 : 1
  billing_account = var.billing_account
  display_name    = "Villas ${var.environment} budget notification"
  budget_filter { projects = ["projects/${data.google_project.current.number}"] }
  amount {
    specified_amount {
      currency_code = var.billing_currency
      units         = tostring(var.monthly_budget_amount)
    }
  }
  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 1.0 }
  all_updates_rule {
    monitoring_notification_channels = var.notification_channels
    disable_default_iam_recipients   = false
  }
  depends_on = [google_project_service.required]
}

