mock_provider "google" {
  mock_data "google_project" {
    defaults = { number = "123456789012" }
  }
}

variables {
  personal_access_token = "synthetic-mock-token-with-no-cloud-access"
  project_id            = "villas-synthetic-staging"
  registry_project_id   = "villas-synthetic-staging"
  environment           = "staging"
  businesses = {
    lake-house = {
      name              = "Lake House"
      neon_host         = "ep-synthetic-lake.eu-central-1.aws.neon.tech"
      public_origin     = "https://villas-lake-house-staging-123456789012.europe-west3.run.app"
      app_image         = "europe-west3-docker.pkg.dev/villas-synthetic-staging/villas/app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      backup_image      = "europe-west3-docker.pkg.dev/villas-synthetic-staging/villas/backup@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      maintenance_image = "europe-west3-docker.pkg.dev/villas-synthetic-staging/villas/proxy@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
      secret_versions = {
        db-runtime = "1", db-migration = "1", db-backup = "1", google-client-id = "1", google-client-secret = "1", backup-password = "1", initial-owner = "1"
      }
    }
  }
}

run "secrets_before_workloads" {
  command = plan
  assert {
    condition     = module.business["lake-house"].setup.service == null && length(module.business["lake-house"].setup.jobs) == 0
    error_message = "Create secret containers and isolated identities before mounting secret versions or starting an unmigrated database."
  }
  assert {
    condition     = !module.business["lake-house"].setup.public_access && !module.business["lake-house"].setup.schedules_enabled
    error_message = "Preparation must remain private and unscheduled."
  }
  assert {
    condition     = google_artifact_registry_repository.release[0].docker_config[0].immutable_tags
    error_message = "Published version tags must be immutable."
  }
  assert {
    condition     = strcontains(google_iam_workload_identity_pool_provider.github[0].attribute_condition, "assertion.repository_id == '324284128'") && strcontains(google_iam_workload_identity_pool_provider.github[0].attribute_condition, "assertion.event_name == 'workflow_dispatch'") && strcontains(google_iam_workload_identity_pool_provider.github[0].attribute_condition, "assertion.workflow_ref == 'skrce/villas/.github/workflows/release.yml@refs/heads/master'")
    error_message = "Keyless publication must pin immutable repository identity and the master release workflow."
  }
}

run "no_employer_project" {
  command = plan
  variables { project_id = "employer-project" }
  expect_failures = [var.project_id]
}

run "separate_environment_names" {
  command = plan
  variables { environment = "development" }
  expect_failures = [var.environment]
}

run "no_external_registry" {
  command = plan
  variables { registry_project_id = "employer-registry" }
  expect_failures = [var.registry_project_id]
}

run "no_other_neon_region" {
  command = plan
  variables {
    businesses = { for id, business in var.businesses : id => merge(business, { neon_host = "ep-synthetic-lake.us-east-1.aws.neon.tech" }) }
  }
  expect_failures = [var.businesses]
}

run "no_mutable_secret_versions" {
  command = plan
  variables {
    businesses = { for id, business in var.businesses : id => merge(business, { secret_versions = merge(business.secret_versions, { db-runtime = "latest" }) }) }
  }
  expect_failures = [var.businesses]
}

run "no_mutable_image_tags" {
  command = plan
  variables {
    businesses = { for id, business in var.businesses : id => merge(business, { app_image = "europe-west3-docker.pkg.dev/villas-synthetic-staging/villas/app:latest" }) }
  }
  expect_failures = [var.businesses]
}

run "no_unqualified_public_service" {
  command = plan
  variables {
    businesses = { for id, business in var.businesses : id => merge(business, { phase = "service", public_access = true }) }
  }
  expect_failures = [var.businesses]
}

run "no_shared_business_endpoint" {
  command = plan
  variables {
    businesses = merge(var.businesses, { garden = merge(var.businesses["lake-house"], { name = "Garden" }) })
  }
  expect_failures = [var.businesses]
}

run "two_businesses_have_distinct_resources" {
  command = plan
  variables {
    businesses = merge(var.businesses, { garden = merge(var.businesses["lake-house"], { name = "Garden", neon_host = "ep-synthetic-garden.eu-central-1.aws.neon.tech" }) })
  }
  assert {
    condition     = module.business["lake-house"].setup.secrets["db-runtime"] != module.business["garden"].setup.secrets["db-runtime"] && module.business["lake-house"].setup.backup_repository != module.business["garden"].setup.backup_repository
    error_message = "Businesses must not share secret containers or backup repositories."
  }
}
