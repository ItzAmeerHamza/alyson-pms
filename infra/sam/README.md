# SAM — Alyson Time Doctor API

Deploys **API Gateway HTTP API → Lambda (container)** for the NestJS backend. Workers and EventBridge rules are phase 2 (add nested stacks or separate templates).

## Approved AWS names

| Item | Name |
|------|------|
| CloudFormation stack (dev) | `alyson-time-doctor-api-dev` |
| CloudFormation stack (prod) | `alyson-time-doctor-api-prod` |
| ECR repository | `alyson-time-doctor-api` |
| Lambda logical ID (in template) | `AlysonTimeDoctorApiFunction` |
| HTTP API logical ID (in template) | `AlysonTimeDoctorHttpApi` |
| Resource tag | `team` = `alyson PM` |

Do not use TimeFlow, Pulse, or timeflow names for new infra resources.

## Prerequisites

- AWS CLI + SAM CLI configured (`aws configure`)
- ECR repository **`alyson-time-doctor-api`**
- RDS + **RDS Proxy** in the same VPC as the Lambda
- Cognito User Pool ID (JWT validated in Nest)
- S3 bucket for screenshots (private)

## Build and deploy

```bash
# From repo root
export AWS_REGION=us-west-2
export STACK_NAME=alyson-time-doctor-api-dev

# Build Nest and Docker image (after Dockerfile.lambda and lambda.ts exist)
cd backend
npm ci && npm run build
docker build -f Dockerfile.lambda -t alyson-time-doctor-api:latest .

# Push to ECR (replace ACCOUNT_ID)
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
docker tag alyson-time-doctor-api:latest ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/alyson-time-doctor-api:latest
docker push ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/alyson-time-doctor-api:latest

cd ../infra/sam
sam deploy \
  --guided \
  --stack-name $STACK_NAME \
  --tags team="alyson PM" \
  --parameter-overrides \
    ImageUri=ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/alyson-time-doctor-api:latest \
    VpcSubnetIds=subnet-aaa,subnet-bbb \
    VpcSecurityGroupIds=sg-lambda-rds \
    DatabaseHost=palisade-be-stage-time-doctor-proxy.proxy-ck4yiduvahj7.us-west-2.rds.amazonaws.com \
    DatabaseName=revclouddb \
    DatabaseUser=alyson_time_doctor_api \
    S3BucketName=your-screenshots-bucket \
    AllowedOrigins=https://your-web-app.example.com,http://localhost:8080
```

`--tags team="alyson PM"` tags the CloudFormation stack; Lambda and HTTP API also get the tag from `template.yaml`.

## Outputs

- `ApiEndpoint` — set as `VITE_BACKEND_URL` (web) and `BACKEND_API_URL` (desktop agent; append `/sync/desktop-action` for agent sync URL if needed).

## Security notes

- Store `DATABASE_PASSWORD` and `INTERNAL_API_KEY` in **Secrets Manager**; reference from SAM `Secrets` (not plain parameters in prod).
- Lambda must run in **private subnets** with egress to RDS Proxy and S3 (VPC endpoint or NAT).
- Do not enable public RDS; Proxy security group allows only Lambda SG.

## Local invoke (optional)

```bash
sam local start-api --template template.yaml
```

Requires Docker and valid `.env` mapped in `template.yaml` `Environment` for local only.
