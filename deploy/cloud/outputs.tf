output "businesses" { value = { for id, business in module.business : id => business.setup } }
output "registry" { value = "europe-west3-docker.pkg.dev/${var.registry_project_id}/villas" }
output "publisher_service_account" { value = try(google_service_account.publisher[0].email, null) }
output "workload_identity_provider" { value = try(google_iam_workload_identity_pool_provider.github[0].name, null) }
