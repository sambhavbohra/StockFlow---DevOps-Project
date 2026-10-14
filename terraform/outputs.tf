output "region" {
  value = var.region
}

output "cluster_name" {
  value = aws_eks_cluster.this.name
}

output "configure_kubectl" {
  description = "Run this after apply to point kubectl at the cluster."
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${aws_eks_cluster.this.name}"
}

output "github_actions_role_arn" {
  description = "Set as the AWS_ROLE_ARN repository variable for the deploy job."
  value       = aws_iam_role.github_deploy.arn
}

output "vpc_id" {
  value = aws_vpc.this.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "app_url_hint" {
  description = "The app is served by Traefik on port 30080 of any node's public IP."
  value       = "kubectl get nodes -o wide  ->  http://<EXTERNAL-IP>:30080"
}
