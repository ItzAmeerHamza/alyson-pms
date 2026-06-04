# SAM — TimeFlow API (serverless skeleton)

Deploys **API Gateway HTTP API → Lambda (container)** for the NestJS backend. Workers and EventBridge rules are phase 2 (add nested stacks or separate templates).

## Prerequisites

- AWS CLI + SAM CLI configured (`aws configure`)
- ECR repository for the API image
- RDS + **RDS Proxy** in the same VPC as the Lambda
- Cognito User Pool ID (for JWT authorizer, optional in dev)
- S3 bucket for screenshots (private)

## Build and deploy

```bash
# From repo root
export AWS_REGION=us-west-2
export STACK_NAME=timeflow-api-dev

# Build Nest and Docker image (after Dockerfile.lambda and lambda.ts exist)
cd backend
npm ci && npm run build
docker build -f Dockerfile.lambda -t timeflow-api:latest .

# Push to ECR (replace ACCOUNT_ID and REPO)
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
docker tag timeflow-api:latest ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/timeflow-api:latest
docker push ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/timeflow-api:latest

cd ../infra/sam
sam deploy \
  --guided \
  --stack-name $STACK_NAME \
  --parameter-overrides \
    ImageUri=ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/timeflow-api:latest \
    VpcSubnetIds=subnet-aaa,subnet-bbb \
    VpcSecurityGroupIds=sg-lambda-rds \
    DatabaseHost=your-proxy.proxy-xxxx.us-west-2.rds.amazonaws.com \
    S3BucketName=your-screenshots-bucket \
    AllowedOrigins=https://timeflow.example.com,http://localhost:8080
```

## Outputs

- `ApiEndpoint` — set as `VITE_BACKEND_URL` (web) and `BACKEND_API_URL` (agent, append `/sync/desktop-action` for agent config).

## Security notes

- Store `DATABASE_PASSWORD` and `INTERNAL_API_KEY` in **Secrets Manager**; reference from SAM `Secrets` (not plain parameters in prod).
- Lambda must run in **private subnets** with egress to RDS Proxy and S3 (VPC endpoint or NAT).
- Do not enable public RDS; Proxy security group allows only Lambda SG.

## Local invoke (optional)

```bash
sam local start-api --template template.yaml
```

Requires Docker and valid `.env` mapped in `template.yaml` `Environment` for local only.
