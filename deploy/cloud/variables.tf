variable "personal_access_token" {
  type      = string
  sensitive = true
  ephemeral = true
  nullable  = false
  validation {
    condition     = length(var.personal_access_token) > 20
    error_message = "Supply an explicit short-lived personal token. Ambient ADC is not used."
  }
}

variable "project_id" {
  type = string
  validation {
    condition     = can(regex("^villas-[a-z0-9-]{1,23}[a-z0-9]$", var.project_id))
    error_message = "Use a separate Villas personal GCP project."
  }
}

variable "environment" {
  type = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Use staging or production, with separate projects and state."
  }
}

variable "registry_project_id" {
  type = string
  validation {
    condition     = can(regex("^villas-[a-z0-9-]{1,23}[a-z0-9]$", var.registry_project_id))
    error_message = "The shared release registry must be a Villas project."
  }
}

variable "businesses" {
  type = map(object({
    name                = string
    neon_host           = string
    public_origin       = string
    app_image           = string
    backup_image        = string
    maintenance_image   = string
    maintenance         = optional(bool, false)
    external_liveness   = optional(bool, false)
    secret_versions     = map(string)
    phase               = optional(string, "secrets")
    launch_qualified    = optional(bool, false)
    verification_window = optional(bool, false)
    public_access       = optional(bool, false)
    schedules_enabled   = optional(bool, false)
  }))
  default = {}
  validation {
    condition = alltrue([for id, business in var.businesses :
      can(regex("^[a-z][a-z0-9-]{0,15}$", id)) &&
      length(business.name) >= 1 && length(business.name) <= 100 &&
      !can(regex("[\\x00-\\x1f\\x7f]", business.name)) &&
      can(regex("^ep-[a-z0-9-]+(\\.c-[0-9]+)?\\.eu-central-1\\.aws\\.neon\\.tech$", business.neon_host)) &&
      !strcontains(business.neon_host, "-pooler") &&
      can(regex("^https://[a-z0-9-]+\\.europe-west3\\.run\\.app$", business.public_origin)) &&
      business.app_image == "europe-west3-docker.pkg.dev/${var.registry_project_id}/villas/app@${split("@", business.app_image)[length(split("@", business.app_image)) - 1]}" &&
      can(regex("@sha256:[a-f0-9]{64}$", business.app_image)) &&
      business.backup_image == "europe-west3-docker.pkg.dev/${var.registry_project_id}/villas/backup@${split("@", business.backup_image)[length(split("@", business.backup_image)) - 1]}" &&
      can(regex("@sha256:[a-f0-9]{64}$", business.backup_image)) &&
      business.maintenance_image == "europe-west3-docker.pkg.dev/${var.registry_project_id}/villas/proxy@${split("@", business.maintenance_image)[length(split("@", business.maintenance_image)) - 1]}" &&
      can(regex("@sha256:[a-f0-9]{64}$", business.maintenance_image)) &&
      alltrue([for key in ["db-runtime", "db-migration", "db-backup", "google-client-id", "google-client-secret", "backup-password", "initial-owner"] : can(regex("^[1-9][0-9]*$", lookup(business.secret_versions, key, "")))]) &&
      contains(["secrets", "jobs", "service"], business.phase) &&
      (!business.public_access || business.phase == "service") &&
      (!business.maintenance || (!business.public_access && !business.schedules_enabled)) &&
      (!business.schedules_enabled || business.phase != "secrets") &&
      (!business.verification_window || var.environment == "staging") &&
      (!(business.public_access || business.schedules_enabled) || business.launch_qualified || (var.environment == "staging" && business.verification_window && !business.schedules_enabled))
    ])
    error_message = "Business setup needs a short slug/name, direct Frankfurt Neon, a Frankfurt run.app origin, Villas digest images and numeric secret versions. Public access/schedules require recorded live qualification."
  }
  validation {
    condition     = !anytrue([for business in values(var.businesses) : business.public_access || business.schedules_enabled]) || (length(var.notification_channels) > 0 && var.billing_account != null)
    error_message = "Configure alert delivery and the personal budget before enabling public access or schedules."
  }
  validation {
    condition     = length(distinct([for business in values(var.businesses) : business.neon_host])) == length(var.businesses)
    error_message = "Every business must use its own Neon project/endpoint, never another business's database."
  }
}

variable "notification_channels" {
  type    = list(string)
  default = []
}

variable "billing_account" {
  type     = string
  default  = null
  nullable = true
  validation {
    condition     = var.billing_account == null || can(regex("^[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}$", var.billing_account))
    error_message = "Supply only the personal billing account ID, never credentials."
  }
}

variable "billing_currency" {
  type    = string
  default = "USD"
  validation {
    condition     = contains(["USD", "EUR"], var.billing_currency)
    error_message = "Choose the personal billing account's actual USD or EUR currency."
  }
}

variable "monthly_budget_amount" {
  type    = number
  default = 5
  validation {
    condition     = var.monthly_budget_amount >= 1 && var.monthly_budget_amount <= 50 && floor(var.monthly_budget_amount) == var.monthly_budget_amount
    error_message = "Use a small initial notification budget, reviewed before raising."
  }
}
