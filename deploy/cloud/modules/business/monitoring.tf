resource "google_monitoring_uptime_check_config" "web" {
  count        = var.business.public_access && var.business.external_liveness ? 1 : 0
  display_name = "${local.name} public liveness"
  timeout      = "10s"
  period       = "900s"
  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
    accepted_response_status_codes { status_class = "STATUS_CLASS_2XX" }
  }
  monitored_resource {
    type   = "uptime_url"
    labels = { project_id = var.project_id, host = trimprefix(var.business.public_origin, "https://") }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  count                 = var.business.public_access && var.business.external_liveness ? 1 : 0
  display_name          = "${local.name} unavailable"
  combiner              = "OR"
  notification_channels = var.notification_channels
  conditions {
    display_name = "Public liveness failed"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.web[0].uptime_check_id}\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "300s"
      aggregations {
        alignment_period   = "900s"
        per_series_aligner = "ALIGN_FRACTION_TRUE"
      }
    }
  }
  documentation {
    content   = "Follow docs/cloud-run-neon.md and docs/recovery.md. Liveness is data-free; verify schema separately. Never include guest details, query URLs, tokens or database exports in an incident."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "job_failure" {
  count                 = var.business.schedules_enabled ? 1 : 0
  display_name          = "${local.name} backup or freshness job failed"
  combiner              = "OR"
  notification_channels = var.notification_channels
  conditions {
    display_name = "Failed backup protection execution"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/job/completed_execution_count\" AND resource.type=\"cloud_run_job\" AND (resource.label.job_name=\"${google_cloud_run_v2_job.operation["backup"].name}\" OR resource.label.job_name=\"${google_cloud_run_v2_job.operation["age"].name}\") AND metric.label.result=\"failed\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period   = "3600s"
        per_series_aligner = "ALIGN_DELTA"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "freshness_missing" {
  count                 = var.business.schedules_enabled ? 1 : 0
  display_name          = "${local.name} backup freshness checks missing"
  combiner              = "OR"
  notification_channels = var.notification_channels
  conditions {
    display_name = "No successful repository freshness check within eight hours"
    condition_absent {
      filter   = "metric.type=\"run.googleapis.com/job/completed_execution_count\" AND resource.type=\"cloud_run_job\" AND resource.label.job_name=\"${google_cloud_run_v2_job.operation["age"].name}\" AND metric.label.result=\"succeeded\""
      duration = "28800s"
      aggregations {
        alignment_period   = "3600s"
        per_series_aligner = "ALIGN_DELTA"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "application" {
  count                 = var.business.public_access ? 1 : 0
  display_name          = "${local.name} application failure signal"
  combiner              = "OR"
  notification_channels = var.notification_channels
  conditions {
    display_name = "Privacy-safe application failure"
    condition_matched_log {
      filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${local.name}\" AND textPayload =~ \"villas_operation_failed category=(DATABASE_FAILURES|SERVICE_FAILURES|BOOKING_FAILURES)\""
    }
  }
  alert_strategy {
    notification_rate_limit { period = "1800s" }
    auto_close = "86400s"
  }
}
