variable "project_id" { type = string }
variable "project_number" { type = string }
variable "environment" { type = string }
variable "business_id" { type = string }
variable "business" {
  type = object({
    name              = string
    neon_host         = string
    public_origin     = string
    app_image         = string
    backup_image      = string
    maintenance_image = string
    maintenance       = bool
    external_liveness = optional(bool, false)
    secret_versions   = map(string)
    phase             = string
    launch_qualified  = bool
    public_access     = bool
    schedules_enabled = bool
  })
}
variable "notification_channels" { type = list(string) }
