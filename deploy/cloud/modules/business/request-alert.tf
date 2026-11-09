resource "google_monitoring_alert_policy" "requests" {
  count                 = var.business.public_access ? 1 : 0
  display_name          = "${local.name} failed service requests"
  combiner              = "OR"
  notification_channels = var.notification_channels
  conditions {
    display_name = "Cloud Run returned a server error"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${local.name}\" AND metric.label.response_code_class=\"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_DELTA"
      }
    }
  }
}
