#!/usr/bin/env bash
# Apply team=Alyson PM to Time Doctor AWS resources.
# Skips: Cognito User Pool, RDS PostgreSQL instance.
# Tags: Lambda, API Gateway, ECR, S3, RDS Proxy, Lambda security group, CloudFormation stack.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$SCRIPT_DIR/deploy.env" ]]; then
  # shellcheck source=/dev/null
  source "$SCRIPT_DIR/deploy.env"
fi

export AWS_REGION="${AWS_REGION:-us-west-2}"
export AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID in deploy.env or environment}"
export STACK_NAME="${STACK_NAME:-alyson-time-doctor-api-dev}"
export ECR_REPO="${ECR_REPO:-alyson-time-doctor-api}"
export S3_BUCKET_NAME="${S3_BUCKET_NAME:-alyson-pm}"
export RDS_PROXY_NAME="${RDS_PROXY_NAME:-palisade-be-stage-time-doctor-proxy}"
export VPC_SECURITY_GROUP_IDS="${VPC_SECURITY_GROUP_IDS:-sg-06839ddc28ac0b659}"

TEAM_TAG_KEY="team"
TEAM_TAG_VALUE="Alyson PM"

tag_ok() { echo "  tagged: $1"; }
tag_skip() { echo "  skip: $1 ($2)"; }
tag_fail() { echo "  warn: $1 — $2" >&2; }

echo "==> Tagging Time Doctor resources (team=${TEAM_TAG_VALUE}) in ${AWS_REGION}"

echo "==> CloudFormation stack: ${STACK_NAME}"
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  aws cloudformation update-stack \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --use-previous-template \
    --capabilities CAPABILITY_IAM \
    --tags "Key=${TEAM_TAG_KEY},Value=${TEAM_TAG_VALUE}" 2>/dev/null \
    && tag_ok "stack ${STACK_NAME}" \
    || tag_skip "stack ${STACK_NAME}" "already tagged or no update needed"
else
  tag_skip "stack ${STACK_NAME}" "stack not found"
fi

echo "==> ECR repository: ${ECR_REPO}"
ECR_ARN="arn:aws:ecr:${AWS_REGION}:${AWS_ACCOUNT_ID}:repository/${ECR_REPO}"
if aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" >/dev/null 2>&1; then
  aws ecr tag-resource \
    --resource-arn "$ECR_ARN" \
    --region "$AWS_REGION" \
    --tags "Key=${TEAM_TAG_KEY},Value=${TEAM_TAG_VALUE}"
  tag_ok "$ECR_ARN"
else
  tag_skip "$ECR_REPO" "repository not found"
fi

echo "==> S3 bucket: ${S3_BUCKET_NAME}"
if aws s3api head-bucket --bucket "$S3_BUCKET_NAME" --region "$AWS_REGION" 2>/dev/null; then
  aws s3api put-bucket-tagging \
    --bucket "$S3_BUCKET_NAME" \
    --region "$AWS_REGION" \
    --tagging "TagSet=[{Key=${TEAM_TAG_KEY},Value=${TEAM_TAG_VALUE}}]"
  tag_ok "$S3_BUCKET_NAME"
else
  tag_skip "$S3_BUCKET_NAME" "bucket not found or no access"
fi

echo "==> RDS Proxy: ${RDS_PROXY_NAME}"
PROXY_ARN=$(aws rds describe-db-proxies \
  --db-proxy-name "$RDS_PROXY_NAME" \
  --region "$AWS_REGION" \
  --query 'DBProxies[0].DBProxyArn' \
  --output text 2>/dev/null || echo "")
if [[ -n "$PROXY_ARN" && "$PROXY_ARN" != "None" ]]; then
  aws rds add-tags-to-resource \
    --resource-name "$PROXY_ARN" \
    --region "$AWS_REGION" \
    --tags "Key=${TEAM_TAG_KEY},Value=${TEAM_TAG_VALUE}"
  tag_ok "$RDS_PROXY_NAME"
else
  tag_skip "$RDS_PROXY_NAME" "proxy not found"
fi

echo "==> Lambda security group(s): ${VPC_SECURITY_GROUP_IDS}"
IFS=',' read -ra SG_IDS <<< "$VPC_SECURITY_GROUP_IDS"
for sg in "${SG_IDS[@]}"; do
  sg="${sg// /}"
  [[ -z "$sg" ]] && continue
  if aws ec2 describe-security-groups --group-ids "$sg" --region "$AWS_REGION" >/dev/null 2>&1; then
    aws ec2 create-tags \
      --resources "$sg" \
      --region "$AWS_REGION" \
      --tags "Key=${TEAM_TAG_KEY},Value=${TEAM_TAG_VALUE}"
    tag_ok "$sg"
  else
    tag_skip "$sg" "security group not found"
  fi
done

echo "==> Lambda + API Gateway + Screenshot AI (from stack resources)"
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  for logical_id in AlysonTimeDoctorApiFunction ScreenshotAiWorkerFunction ScreenshotAiBackfillFunction TimeLogsExportFunction; do
    LAMBDA_NAME=$(aws cloudformation describe-stack-resource \
      --stack-name "$STACK_NAME" \
      --logical-resource-id "$logical_id" \
      --region "$AWS_REGION" \
      --query 'StackResourceDetail.PhysicalResourceId' \
      --output text 2>/dev/null || echo "")
    if [[ -n "$LAMBDA_NAME" && "$LAMBDA_NAME" != "None" ]]; then
      LAMBDA_ARN="arn:aws:lambda:${AWS_REGION}:${AWS_ACCOUNT_ID}:function:${LAMBDA_NAME}"
      aws lambda tag-resource \
        --resource "$LAMBDA_ARN" \
        --region "$AWS_REGION" \
        --tags "${TEAM_TAG_KEY}=${TEAM_TAG_VALUE}" 2>/dev/null \
        && tag_ok "Lambda ${LAMBDA_NAME}" \
        || tag_fail "Lambda ${LAMBDA_NAME}" "tag-resource failed"
    fi
  done

  for logical_id in ScreenshotAiQueue ScreenshotAiDLQ; do
    QUEUE_URL=$(aws cloudformation describe-stack-resource \
      --stack-name "$STACK_NAME" \
      --logical-resource-id "$logical_id" \
      --region "$AWS_REGION" \
      --query 'StackResourceDetail.PhysicalResourceId' \
      --output text 2>/dev/null || echo "")
    if [[ -n "$QUEUE_URL" && "$QUEUE_URL" != "None" && "$QUEUE_URL" == https://* ]]; then
      QUEUE_ARN=$(aws sqs get-queue-attributes \
        --queue-url "$QUEUE_URL" \
        --attribute-names QueueArn \
        --region "$AWS_REGION" \
        --query 'Attributes.QueueArn' \
        --output text 2>/dev/null || echo "")
      if [[ -n "$QUEUE_ARN" && "$QUEUE_ARN" != "None" ]]; then
        aws sqs tag-queue \
          --queue-url "$QUEUE_URL" \
          --tags "${TEAM_TAG_KEY}=${TEAM_TAG_VALUE}" \
          --region "$AWS_REGION" 2>/dev/null \
          && tag_ok "SQS ${logical_id}" \
          || tag_fail "SQS ${logical_id}" "tag-queue failed"
      fi
    fi
  done

  API_ID=$(aws cloudformation describe-stack-resource \
    --stack-name "$STACK_NAME" \
    --logical-resource-id AlysonTimeDoctorHttpApi \
    --region "$AWS_REGION" \
    --query 'StackResourceDetail.PhysicalResourceId' \
    --output text 2>/dev/null || echo "")
  if [[ -n "$API_ID" && "$API_ID" != "None" ]]; then
    API_ARN="arn:aws:apigateway:${AWS_REGION}::/apis/${API_ID}"
    aws apigatewayv2 tag-resource \
      --resource-arn "$API_ARN" \
      --region "$AWS_REGION" \
      --tags "${TEAM_TAG_KEY}=${TEAM_TAG_VALUE}" 2>/dev/null \
      && tag_ok "HTTP API ${API_ID}" \
      || tag_fail "HTTP API ${API_ID}" "tag-resource failed"
  fi
fi

echo ""
echo "Done. Not tagged (by design): Cognito User Pool, RDS PostgreSQL instance, Cognito VPC endpoint."
echo "Redeploy with ./deploy.sh to persist Lambda/API tags from template.yaml."
