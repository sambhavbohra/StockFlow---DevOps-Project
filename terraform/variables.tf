variable "region" {
  description = "AWS region for every resource."
  type        = string
  default     = "ap-south-1"
}

variable "cluster_name" {
  description = "EKS cluster name; also the prefix for related resource names."
  type        = string
  default     = "stockflow"
}

variable "kubernetes_version" {
  description = "EKS Kubernetes version. Keep it in standard support: extended support costs 6x more."
  type        = string
  default     = "1.37"
}

variable "node_capacity_type" {
  description = "SPOT (cheapest, can be interrupted) for build sessions; ON_DEMAND for the live demo."
  type        = string
  default     = "SPOT"

  validation {
    condition     = contains(["SPOT", "ON_DEMAND"], var.node_capacity_type)
    error_message = "node_capacity_type must be SPOT or ON_DEMAND."
  }
}

variable "node_instance_types" {
  # AWS Free-plan accounts may only launch Free Tier eligible types; these are the two that fit
  # the app + monitoring (2 vCPU, 4-8 GiB, up to 29 pods per node).
  description = "Worker instance types. Spot picks from all of them; On-Demand uses the first."
  type        = list(string)
  default     = ["c7i-flex.large", "m7i-flex.large"]
}

variable "github_repository" {
  # GitHub's OIDC `sub` claim names the repo as owner@<owner-id>/name@<repo-id>. The numeric IDs
  # (public, not secret) mean a deleted-and-recreated repo with the same name can't take over the role.
  # Find them in a failed AssumeRoleWithWebIdentity event in CloudTrail, or via the GitHub API.
  description = "GitHub repository allowed to deploy via OIDC (from main only), as owner@<owner-id>/name@<repo-id>."
  type        = string
  default     = "sambhavbohra@177709981/StockFlow---DevOps-Project@1418534382"
}
