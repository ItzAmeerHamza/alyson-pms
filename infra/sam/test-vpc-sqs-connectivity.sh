#!/usr/bin/env bash
# Test SQS DNS + HTTPS connectivity from EC2 instances in the shared VPC.
# Usage: ./test-vpc-sqs-connectivity.sh [before|after]
set -euo pipefail

PHASE="${1:-before}"
AWS_REGION="${AWS_REGION:-us-west-2}"
VPC_ID="${VPC_ID:-vpc-0b6659ffcf9d60888}"
PRIVATE_ENDPOINT_IPS="172.31.12.67 172.31.55.167"
SQS_HOST="sqs.us-west-2.amazonaws.com"

REMOTE_SCRIPT="$(cat <<'EOS'
set -euo pipefail
SQS_HOST="sqs.us-west-2.amazonaws.com"
PRIVATE_IPS="172.31.12.67 172.31.55.167"
echo "=== HOST: $(hostname) ==="
echo "-- DNS --"
if command -v getent >/dev/null 2>&1; then
  getent hosts "$SQS_HOST" || true
else
  host "$SQS_HOST" || true
fi
RESOLVED="$(getent hosts "$SQS_HOST" 2>/dev/null | awk '{print $1}' | head -1 || true)"
HIJACKED="no"
for ip in $PRIVATE_IPS; do
  if [[ "$RESOLVED" == "$ip" ]]; then HIJACKED="yes"; break; fi
done
echo "resolved_ip=${RESOLVED:-none}"
echo "using_private_endpoint=${HIJACKED}"
echo "-- HTTPS --"
HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 10 "https://${SQS_HOST}/" || echo timeout)"
echo "curl_http_code=${HTTP_CODE}"
if [[ "$HTTP_CODE" == "timeout" ]]; then
  echo "result=FAIL"
elif [[ "$HTTP_CODE" =~ ^[0-9]+$ ]]; then
  echo "result=OK"
else
  echo "result=UNKNOWN"
fi
EOS
)"

echo "========== VPC SQS connectivity test (${PHASE}) =========="
echo "Region: ${AWS_REGION}  VPC: ${VPC_ID}"
echo

INSTANCES="$(aws ec2 describe-instances \
  --region "$AWS_REGION" \
  --filters "Name=vpc-id,Values=${VPC_ID}" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].[InstanceId,Tags[?Key==`Name`].Value|[0],SecurityGroups[0].GroupId]' \
  --output text)"

if [[ -z "$INSTANCES" ]]; then
  echo "No running EC2 instances found in ${VPC_ID}"
  exit 1
fi

SUMMARY_FILE="$(mktemp)"
trap 'rm -f "$SUMMARY_FILE"' EXIT

while IFS=$'\t' read -r INSTANCE_ID INSTANCE_NAME SECURITY_GROUP; do
  [[ -z "$INSTANCE_ID" ]] && continue
  echo "--- ${INSTANCE_NAME:-unknown} (${INSTANCE_ID}, ${SECURITY_GROUP}) ---"

  SSM_STATUS="$(aws ssm describe-instance-information \
    --region "$AWS_REGION" \
    --filters "Key=InstanceIds,Values=${INSTANCE_ID}" \
    --query 'InstanceInformationList[0].PingStatus' \
    --output text 2>/dev/null || echo "None")"

  if [[ "$SSM_STATUS" != "Online" ]]; then
    echo "ssm=offline (skipped — cannot run remote test)"
    echo "${INSTANCE_NAME:-unknown}|${INSTANCE_ID}|SKIP|ssm_offline" >> "$SUMMARY_FILE"
    echo
    continue
  fi

  COMMAND_ID="$(aws ssm send-command \
    --region "$AWS_REGION" \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --comment "SQS VPC connectivity test (${PHASE})" \
    --parameters "commands=[$(printf '%s' "$REMOTE_SCRIPT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')]" \
    --query 'Command.CommandId' \
    --output text)"

  for _ in $(seq 1 20); do
    STATUS="$(aws ssm get-command-invocation \
      --region "$AWS_REGION" \
      --command-id "$COMMAND_ID" \
      --instance-id "$INSTANCE_ID" \
      --query 'Status' \
      --output text 2>/dev/null || echo "Pending")"
    [[ "$STATUS" == "Success" || "$STATUS" == "Failed" ]] && break
    sleep 2
  done

  OUTPUT="$(aws ssm get-command-invocation \
    --region "$AWS_REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --query 'StandardOutputContent' \
    --output text 2>/dev/null || echo "")"

  echo "$OUTPUT"

  RESOLVED_IP="$(echo "$OUTPUT" | awk -F= '/^resolved_ip=/{print $2}')"
  HIJACKED="$(echo "$OUTPUT" | awk -F= '/^using_private_endpoint=/{print $2}')"
  RESULT="$(echo "$OUTPUT" | awk -F= '/^result=/{print $2}')"

  if [[ "$HIJACKED" == "yes" && "$RESULT" == "FAIL" ]]; then
    VERDICT="DISTURBED"
  elif [[ "$HIJACKED" == "yes" && "$RESULT" == "OK" ]]; then
    VERDICT="PRIVATE_ENDPOINT_OK"
  elif [[ "$HIJACKED" == "no" && "$RESULT" == "OK" ]]; then
    VERDICT="HEALTHY"
  elif [[ "$RESULT" == "FAIL" ]]; then
    VERDICT="FAIL"
  else
    VERDICT="${RESULT:-UNKNOWN}"
  fi

  echo "verdict=${VERDICT}"
  echo "${INSTANCE_NAME:-unknown}|${INSTANCE_ID}|${VERDICT}|resolved=${RESOLVED_IP:-none}" >> "$SUMMARY_FILE"
  echo
done <<< "$INSTANCES"

echo "========== Summary (${PHASE}) =========="
printf '%-40s %-22s %-20s %s\n' "INSTANCE" "ID" "VERDICT" "DETAIL"
while IFS='|' read -r name id verdict detail; do
  printf '%-40s %-22s %-20s %s\n' "$name" "$id" "$verdict" "$detail"
done < "$SUMMARY_FILE"

DISTURBED_COUNT="$(grep -c '|DISTURBED|' "$SUMMARY_FILE" || true)"
echo
echo "Disturbed instances: ${DISTURBED_COUNT}"
