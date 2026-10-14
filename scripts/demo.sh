#!/usr/bin/env bash
# Live demo helper: shows each step and runs it when you press Enter.
# Run from anywhere: ./scripts/demo.sh   (needs kubectl pointed at the cluster)
cd "$(dirname "$0")/.." || exit 1

step() { # step "<title>" "<command shown>" ["<command run>"]
  printf '\n\033[1;36m▶ %s\033[0m\n' "$1"
  printf '\033[2m$ %s\033[0m' "$2"
  read -r -s
  echo
  eval "${3:-$2}"
}

clear
printf '\033[1mStockFlow live demo\033[0m  (press Enter for each step)\n'

step "1. Push a small change to GitHub. This starts the CI/CD pipeline" \
  'git commit -am "Update Overview subtitle for live demo" && git push' \
  'git commit -q -m "Update Overview subtitle for live demo" -- frontend/src/pages/Overview.jsx && git push -q && git log --oneline -1'

step "2. The AWS infrastructure is written as code (Terraform)" \
  'ls terraform'

step "3. What is running in Kubernetes" \
  'kubectl get pods,svc,ingress,hpa -n stockflow && helm list -A'

step "4. The pipeline deployed the new version (waits until it is live)" \
  'kubectl get deploy -n stockflow -o wide' \
  'sha=$(git rev-parse HEAD); printf "waiting for version %s ...\n" "${sha:0:7}";
   until kubectl get deploy stockflow-frontend -n stockflow -o jsonpath="{.spec.template.spec.containers[0].image}" | grep -q "$sha"; do sleep 5; done;
   kubectl rollout status deploy/stockflow-frontend -n stockflow >/dev/null; kubectl get deploy -n stockflow -o wide'

step "5. Break it on purpose: deploy an image that does not exist" \
  'kubectl apply -f troubleshooting/broken-image.yaml && kubectl get pods -n stockflow' \
  'kubectl apply -f troubleshooting/broken-image.yaml; sleep 12; kubectl get pods -n stockflow'

step "6. Find the reason" \
  'kubectl describe pod -n stockflow -l app=stockflow-broken-image | tail -4'

step "7. Fix it" \
  'kubectl delete -f troubleshooting/broken-image.yaml && kubectl get pods -n stockflow'

printf '\n\033[1;32m✔ Demo complete\033[0m\n'
