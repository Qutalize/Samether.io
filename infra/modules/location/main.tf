resource "aws_location_tracker" "this" {
  tracker_name = var.tracker_name

  position_filtering = "AccuracyBased"
}
