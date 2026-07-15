#!/usr/bin/env bash
# Infer SQS VPC endpoint impact per EC2 instance from Private DNS + endpoint SG rules.
# Usage: ./test-vpc-sqs-impact.sh [before|after]
set -euo pipefail

PHASE="${1:-before}"
AWS_REGION="${AWS_REGION:-us-west-2}"
VPC_ID="${VPC_ID:-vpc-0b6659ffcf9d60888}"
ENDPOINT_ID="${SQS_VPC_ENDPOINT_ID:-vpce-08bf80c705128a16d}"
ENDPOINT_SG="${SQS_VPC_ENDPOINT_SG:-sg-085c4914ef0aca78c}"

echo "========== SQS VPC impact analysis (${PHASE}) =========="

PRIVATE_DNS="$(aws ec2 describe-vpc-endpoints --region "$AWS_REGION" --vpc-endpoint-ids "$ENDPOINT_ID" \
  --query 'VpcEndpoints[0].PrivateDnsEnabled' --output text)"
ALLOWED_SGS="$(aws ec2 describe-security-groups --region "$AWS_REGION" --group-ids "$ENDPOINT_SG" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`443`].UserIdGroupPairs[].GroupId' --output text | tr '\t' '\n' | sort -u)"

echo "Endpoint: ${ENDPOINT_ID}"
echo "PrivateDnsEnabled: ${PRIVATE_DNS}"
echo "Endpoint allowed source SGs:"
echo "$ALLOWED_SGS" | sed 's/^/  - /'
echo

INSTANCES="$(aws ec2 describe-instances --region "$AWS_REGION" \
  --filters "Name=vpc-id,Values=${VPC_ID}" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].[Tags[?Key==`Name`].Value|[0],InstanceId,SecurityGroups[0].GroupId]' \
  --output text)"

SUMMARY_FILE="$(mktemp)"
trap 'rm -f "$SUMMARY_FILE"' EXIT

while IFS=$'\t' read -r NAME INSTANCE_ID INSTANCE_SG; do
  [[ -z "$INSTANCE_ID" ]] && continue
  SG_ALLOWED="no"
  if echo "$ALLOWED_SGS" | grep -qx "$INSTANCE_SG"; then
    SG_ALLOWED="yes"
  fi

  if [[ "$PRIVATE_DNS" == "True" || "$PRIVATE_DNS" == "true" ]]; then
    if [[ "$SG_ALLOWED" == "no" ]]; then
      VERDICT="DISTURBED"
      REASON="VPC DNS hijacked; SG not allowed on endpoint (connect timeout expected)"
    else
      VERDICT="WORKAROUND"
      REASON="VPC DNS hijacked; SG manually allowed on endpoint"
    fi
  else
    VERDICT="HEALTHY"
    REASON="Private DNS off — uses public/NAT SQS path, not Alyson endpoint"
  fi

  echo "--- ${NAME} (${INSTANCE_ID}, ${INSTANCE_SG}) ---"
  echo "sg_allowed_on_endpoint=${SG_ALLOWED}"
  echo "verdict=${VERDICT} (${REASON})"
  echo "${NAME}|${INSTANCE_ID}|${VERDICT}|${REASON}" >> "$SUMMARY_FILE"
  echo
done <<< "$INSTANCES"

echo "========== Summary (${PHASE}) =========="
printf '%-40s %-22s %-12s %s\n' "INSTANCE" "ID" "VERDICT" "REASON"
while IFS='|' read -r name id verdict reason; do
  printf '%-40s %-22s %-12s %s\n' "$name" "$id" "$verdict" "$reason"
done < "$SUMMARY_FILE"

DISTURBED_COUNT="$(grep -c '|DISTURBED|' "$SUMMARY_FILE" || true)"
WORKAROUND_COUNT="$(grep -c '|WORKAROUND|' "$SUMMARY_FILE" || true)"
HEALTHY_COUNT="$(grep -c '|HEALTHY|' "$SUMMARY_FILE" || true)"
echo
echo "Disturbed: ${DISTURBED_COUNT}  Workaround: ${WORKAROUND_COUNT}  Healthy: ${HEALTHY_COUNT}"
