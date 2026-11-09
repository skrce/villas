resource "google_logging_metric" "auth" {
  count  = var.business.public_access ? 1 : 0
  name   = "${local.name}-auth-signals"
  filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${local.name}\" AND textPayload =~ \"villas_operation_failed category=AUTH_FAILURES\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_monitoring_alert_policy" "auth" {
  count                 = var.business.public_access ? 1 : 0
  display_name          = "${local.name} repeated authentication failure signals"
  combiner              = "OR"
  notification_channels = var.notification_channels
  conditions {
    display_name = "Repeated rate-limited authentication signals"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.auth[0].name}\" AND resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${local.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 4
      duration        = "0s"
      aggregations {
        alignment_period   = "600s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
}
