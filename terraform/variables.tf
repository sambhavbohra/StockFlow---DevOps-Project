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
  description = "Worker instance types. Spot picks from all of them; On-Demand uses the first."
  type        = list(string)
  default     = ["t3a.medium", "t3.medium"]
}

variable "github_repository" {
  description = "owner/name of the GitHub repository allowed to deploy via OIDC (from main only)."
  type        = string
  default     = "sambhavbohra/StockFlow---DevOps-Project"
}
