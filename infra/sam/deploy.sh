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
    --tags Key=team,Value="alyson PM"

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
sam deploy \
  --stack-name "$STACK_NAME" \
  --template-file template.yaml \
  --capabilities CAPABILITY_IAM \
  --s3-bucket "$SAM_DEPLOY_BUCKET" \
  --s3-prefix "$SAM_DEPLOY_PREFIX" \
  --resolve-image-repos \
  --tags team="alyson PM" \
  --parameter-overrides \
    "ImageUri=${IMAGE_URI}" \
    "VpcSubnetIds=${VPC_SUBNET_IDS}" \
    "VpcSecurityGroupIds=${VPC_SECURITY_GROUP_IDS}" \
    "VpcId=${VPC_ID:-vpc-0b6659ffcf9d60888}" \
    "CognitoEndpointSubnetIds=${COGNITO_ENDPOINT_SUBNET_IDS:-subnet-0ddb23264a678e2dc}" \
    "DatabaseHost=${DATABASE_HOST}" \
    "DatabaseName=${DATABASE_NAME}" \
    "DatabaseUser=${DATABASE_USER}" \
    "DatabasePassword=${DATABASE_PASSWORD}" \
    "S3BucketName=${S3_BUCKET_NAME}" \
    "AllowedOrigins=${ALLOWED_ORIGINS}" \
    "InternalApiKey=${INTERNAL_API_KEY}" \
    "CognitoUserPoolId=${COGNITO_USER_POOL_ID}" \
    "CognitoClientId=${COGNITO_CLIENT_ID}"

echo "==> Stack outputs"
aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query 'Stacks[0].Outputs' \
  --output table

echo "Test: curl https://<ApiEndpoint-from-output>/health"
