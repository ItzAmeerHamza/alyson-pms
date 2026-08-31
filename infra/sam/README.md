# SAM — Alyson Time Doctor API + Screenshot AI

Deploys **API Gateway HTTP API → Lambda (container)** for the NestJS backend, plus **SQS + AI worker/backfill Lambdas** for screenshot analysis.

See **`SCREENSHOT_AI_SERVICES.md`** for the full list of AWS services used by the AI pipeline.

## Approved AWS names

| Item | Name |
|------|------|
| CloudFormation stack (dev) | `alyson-time-doctor-api-dev` |
| CloudFormation stack (prod) | `alyson-time-doctor-api-prod` |
| ECR repository | `alyson-time-doctor-api` |
| Lambda logical ID (in template) | `AlysonTimeDoctorApiFunction` |
| HTTP API logical ID (in template) | `AlysonTimeDoctorHttpApi` |
| Lambda logical ID (worker) | `ScreenshotAiWorkerFunction` |
| Lambda logical ID (backfill) | `ScreenshotAiBackfillFunction` |
| SQS main queue | `alyson-time-doctor-screenshot-ai-queue-{env}` |
| SQS dead-letter queue | `alyson-time-doctor-screenshot-ai-dlq-{env}` |
| Worker Lambda | `alyson-time-doctor-screenshot-ai-worker-{env}` |
| Backfill Lambda | `alyson-time-doctor-screenshot-ai-backfill-{env}` |
| Backfill schedule rule | `alyson-time-doctor-screenshot-ai-backfill-schedule-{env}` |
| Environment suffix param | `EnvironmentName` = `dev` \| `staging` \| `prod` |
| Resource tag | `team` = `Alyson PM` (all stack resources; Cognito + RDS instance excluded) |

Do not use TimeFlow, Pulse, or timeflow names for new infra resources.

## Prerequisites

- AWS CLI + SAM CLI configured (`aws configure`)
- ECR repository **`alyson-time-doctor-api`**
- RDS + **RDS Proxy** in the same VPC as the Lambda
- Cognito User Pool ID (JWT validated in Nest)
- S3 bucket for screenshots (private)
- **Prod DB:** apply schema/grants/bootstrap from [`db/prod/README.md`](../../db/prod/README.md) before pointing a prod stack at the database. Env template: [`deploy.env.prod.example`](deploy.env.prod.example).

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
  --tags team="Alyson PM" \
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

`--tags team="Alyson PM"` tags the CloudFormation stack; Lambda and HTTP API also get the tag from `template.yaml`.

## Tag resources (without full deploy)

```bash
cd infra/sam
source deploy.env   # AWS_ACCOUNT_ID, region, bucket, etc.
bash tag-resources.sh
```

Tags: ECR, S3, RDS Proxy, Lambda security group, Lambda, API Gateway, CloudFormation stack.  
Skips: Cognito User Pool, RDS PostgreSQL, Cognito VPC endpoint.

## Outputs

- `ApiEndpoint` — set as `VITE_BACKEND_URL` (web) and `BACKEND_API_URL` (desktop agent; append `/sync/desktop-action` for agent sync URL if needed).

## Screenshot thumb CloudFront

Gallery `thumb_url` can go through CloudFront instead of S3 presign. Full `image_url` stays S3-presigned. The bucket stays private (OAC + HMAC query). Set a hex secret and redeploy:

```bash
openssl rand -hex 32
# add to deploy.env:
# export SCREENSHOT_THUMB_CDN_HMAC_SECRET=<that value>
```

`deploy.sh` creates the distribution, merges **one** `s3:GetObject` statement (`AllowAlysonPulseThumbCloudFront`) onto the existing shared-bucket policy, and writes `s3://<bucket>/alyson-td-internal/thumb-cdn.json` (domain + HMAC). The API reads that object so Lambda env stays under 4KB. First CloudFront deploy can take 10–15 minutes.

Leave the secret empty to keep S3-presigned `thumb_url`.

## Security notes

- Store `DATABASE_PASSWORD` and `INTERNAL_API_KEY` in **Secrets Manager**; reference from SAM `Secrets` (not plain parameters in prod).
- Lambda must run in **private subnets** with egress to RDS Proxy and S3 (VPC endpoint or NAT).
- Do not enable public RDS; Proxy security group allows only Lambda SG.

## Local invoke (optional)

```bash
sam local start-api --template template.yaml
```

Requires Docker and valid `.env` mapped in `template.yaml` `Environment` for local only.
