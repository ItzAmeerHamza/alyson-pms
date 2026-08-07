#!/usr/bin/env bash
# Deploy Alyson Time Doctor API to Lambda + API Gateway.
# Prerequisites: AWS CLI, SAM CLI, Docker, deploy.env configured.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

if [[ ! -f "$SCRIPT_DIR/deploy.env" ]]; then
  echo "Missing $SCRIPT_DIR/deploy.env — copy deploy.env.example and fill in values."
  exit 1
fi
# shellcheck source=/dev/null
source "$SCRIPT_DIR/deploy.env"

: "${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID in deploy.env}"
: "${VPC_SUBNET_IDS:?Set VPC_SUBNET_IDS in deploy.env}"
: "${VPC_SECURITY_GROUP_IDS:?Set VPC_SECURITY_GROUP_IDS in deploy.env}"
: "${DATABASE_PASSWORD:?Set DATABASE_PASSWORD in deploy.env}"
: "${INTERNAL_API_KEY:?Set INTERNAL_API_KEY in deploy.env}"

export AWS_REGION="${AWS_REGION:-us-west-2}"
export STACK_NAME="${STACK_NAME:-alyson-time-doctor-api-dev}"
export ECR_REPO="${ECR_REPO:-alyson-time-doctor-api}"
export SAM_DEPLOY_BUCKET="${SAM_DEPLOY_BUCKET:-alyson-pm}"
export SAM_DEPLOY_PREFIX="${SAM_DEPLOY_PREFIX:-sam-deploy/alyson-time-doctor-api-dev}"

GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo local)"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d%H%M%S)-${GIT_SHA}}"
IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:${IMAGE_TAG}"
IMAGE_URI_LATEST="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest"

echo "==> Build NestJS"
cd "$BACKEND_DIR"
npm ci
npm run build

echo "==> Ensure ECR repository exists"
aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" 2>/dev/null \
  || aws ecr create-repository \
    --repository-name "$ECR_REPO" \
    --region "$AWS_REGION" \
    --tags Key=team,Value="Alyson PM"

echo "==> Docker login + build + push"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

docker build --platform linux/arm64 --provenance=false --sbom=false \
  --build-arg "COGNITO_ISSUER=https://cognito-idp.${AWS_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}" \
  -f Dockerfile.lambda -t "${ECR_REPO}:${IMAGE_TAG}" .
docker tag "${ECR_REPO}:${IMAGE_TAG}" "$IMAGE_URI"
docker tag "${ECR_REPO}:${IMAGE_TAG}" "$IMAGE_URI_LATEST"
docker push "$IMAGE_URI"
docker push "$IMAGE_URI_LATEST"
echo "==> Pushed image tags: ${IMAGE_TAG}, latest"

echo "==> SAM deploy (s3://${SAM_DEPLOY_BUCKET}/${SAM_DEPLOY_PREFIX}/)"
cd "$SCRIPT_DIR"

SQS_VPC_ENDPOINT_DNS="${SQS_VPC_ENDPOINT_DNS:-$(aws ec2 describe-vpc-endpoints \
  --region "$AWS_REGION" \
  --filters "Name=tag:aws:cloudformation:stack-name,Values=${STACK_NAME}" "Name=service-name,Values=com.amazonaws.${AWS_REGION}.sqs" \
  --query 'VpcEndpoints[0].DnsEntries[?starts_with(DnsName, `vpce-`) == `true` && contains(DnsName, `.sqs.`) == `true`].DnsName | [0]' \
  --output text 2>/dev/null || true)}"
SQS_VPC_ENDPOINT_DNS="${SQS_VPC_ENDPOINT_DNS//None/}"
if [[ -z "$SQS_VPC_ENDPOINT_DNS" ]]; then
  echo "ERROR: Could not resolve SQS VPC endpoint DNS for stack ${STACK_NAME}."
  echo "Set SQS_VPC_ENDPOINT_DNS in deploy.env or ensure the stack SQS endpoint exists."
  exit 1
fi
echo "==> SQS VPC endpoint DNS: ${SQS_VPC_ENDPOINT_DNS} (Private DNS disabled; SDK-only)"

# Lambda Invoke endpoint: pick a Lambda subnet whose AZ offers the service (Private DNS stays false).
LAMBDA_ENDPOINT_SUBNET_ID="${LAMBDA_ENDPOINT_SUBNET_ID:-${COGNITO_IDP_SUBNET_ID:-}}"
if [[ -z "$LAMBDA_ENDPOINT_SUBNET_ID" ]]; then
  LAMBDA_AZS="$(aws ec2 describe-vpc-endpoint-services \
    --region "$AWS_REGION" \
    --service-names "com.amazonaws.${AWS_REGION}.lambda" \
    --query 'ServiceDetails[0].AvailabilityZones' \
    --output text 2>/dev/null | tr '\t' ' ' || true)"
  IFS=',' read -r -a _subnet_arr <<< "${VPC_SUBNET_IDS}"
  for _sn in "${_subnet_arr[@]}"; do
    _sn="$(echo "$_sn" | xargs)"
    [[ -z "$_sn" ]] && continue
    _az="$(aws ec2 describe-subnets --region "$AWS_REGION" --subnet-ids "$_sn" \
      --query 'Subnets[0].AvailabilityZone' --output text 2>/dev/null || true)"
    if [[ -n "$_az" ]] && echo " ${LAMBDA_AZS} " | grep -Fq " ${_az} "; then
      LAMBDA_ENDPOINT_SUBNET_ID="$_sn"
      break
    fi
  done
fi
if [[ -z "$LAMBDA_ENDPOINT_SUBNET_ID" ]]; then
  echo "ERROR: No VPC_SUBNET_IDS entry is in an AZ that supports lambda VPC endpoints."
  echo "Supported AZs: ${LAMBDA_AZS:-unknown}. Set LAMBDA_ENDPOINT_SUBNET_ID in deploy.env."
  exit 1
fi
echo "==> Lambda VPC endpoint subnet: ${LAMBDA_ENDPOINT_SUBNET_ID} (Private DNS disabled; SDK-only)"

# Bare address only — SAM --parameter-overrides splits on spaces/<> and truncates display names.
DEFAULT_EMAIL_FROM='hamza@cintara.ai'
EMAIL_FROM_PARAM="${EMAIL_FROM:-$DEFAULT_EMAIL_FROM}"
if [[ "$EMAIL_FROM_PARAM" == *" "* || "$EMAIL_FROM_PARAM" == *"<"* ]]; then
  echo "WARN: EMAIL_FROM contains spaces or <>; using bare address for SAM params."
  EMAIL_FROM_PARAM="$(echo "$EMAIL_FROM_PARAM" | sed -n 's/.*<\([^>]*\)>.*/\1/p')"
  EMAIL_FROM_PARAM="${EMAIL_FROM_PARAM:-hamza@cintara.ai}"
fi
EMAIL_SENDERS_PARAM="${EMAIL_SENDERS:-hamza@cintara.ai,mohita@cintara.ai}"
# Strip spaces so SAM --parameter-overrides does not split the list.
EMAIL_SENDERS_PARAM="${EMAIL_SENDERS_PARAM// /}"
echo "==> EMAIL_FROM: ${EMAIL_FROM_PARAM}"
echo "==> EMAIL_SENDERS: ${EMAIL_SENDERS_PARAM}"

sam deploy \
  --stack-name "$STACK_NAME" \
  --template-file template.yaml \
  --capabilities CAPABILITY_IAM \
  --s3-bucket "$SAM_DEPLOY_BUCKET" \
  --s3-prefix "$SAM_DEPLOY_PREFIX" \
  --resolve-image-repos \
  --tags team="Alyson PM" \
  --parameter-overrides \
    "ImageUri=${IMAGE_URI}" \
    "VpcSubnetIds=${VPC_SUBNET_IDS}" \
    "VpcSecurityGroupIds=${VPC_SECURITY_GROUP_IDS}" \
    "VpcId=${VPC_ID:-vpc-0b6659ffcf9d60888}" \
    "DatabaseHost=${DATABASE_HOST}" \
    "DatabaseName=${DATABASE_NAME}" \
    "DatabaseUser=${DATABASE_USER}" \
    "DatabasePassword=${DATABASE_PASSWORD}" \
    "S3BucketName=${S3_BUCKET_NAME}" \
    "AllowedOrigins=${ALLOWED_ORIGINS}" \
    "InternalApiKey=${INTERNAL_API_KEY}" \
    "CognitoUserPoolId=${COGNITO_USER_POOL_ID}" \
    "CognitoClientId=${COGNITO_CLIENT_ID}" \
    "DeepseekApiKey=${DEEPSEEK_API_KEY:-}" \
    "ScreenshotAiEnabled=${SCREENSHOT_AI_ENABLED:-false}" \
    "ScreenshotAiBackfillBatchSize=${SCREENSHOT_AI_BACKFILL_BATCH_SIZE:-100}" \
    "EnvironmentName=${ENVIRONMENT_NAME:-dev}" \
    "SqsVpcEndpointDnsName=${SQS_VPC_ENDPOINT_DNS}" \
    "LambdaEndpointSubnetId=${LAMBDA_ENDPOINT_SUBNET_ID}" \
    "EmailFrom=${EMAIL_FROM_PARAM}" \
    "EmailSenders=${EMAIL_SENDERS_PARAM}"

echo "==> Stack outputs"
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query 'Stacks[0].Outputs' \
  --output table

echo "==> Tag external resources (S3, ECR, RDS Proxy, security group)"
bash "$SCRIPT_DIR/tag-resources.sh"

echo "Test: curl https://<ApiEndpoint-from-output>/health"
