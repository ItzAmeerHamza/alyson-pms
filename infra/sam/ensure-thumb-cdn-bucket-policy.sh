#!/usr/bin/env bash
# Merge one CloudFront OAC GetObject statement onto the screenshots bucket.
# Does not replace other statements — alyson-pm is a shared Palisade bucket.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/deploy.env" ]]; then
  # shellcheck source=/dev/null
  source "$SCRIPT_DIR/deploy.env"
fi

export AWS_REGION="${AWS_REGION:-us-west-2}"
export AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID}"
export STACK_NAME="${STACK_NAME:-alyson-time-doctor-api-prod}"
export S3_BUCKET_NAME="${S3_BUCKET_NAME:?Set S3_BUCKET_NAME}"
export S3_PREFIX="${S3_PREFIX:-alyson-td-screenshots}"

DIST_ID="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ScreenshotThumbCdnDistributionId'].OutputValue" \
  --output text 2>/dev/null || true)"
DIST_ID="${DIST_ID//None/}"
if [[ -z "$DIST_ID" ]]; then
  echo "ERROR: Stack ${STACK_NAME} has no ScreenshotThumbCdnDistributionId output."
  echo "Set SCREENSHOT_THUMB_CDN_HMAC_SECRET and redeploy, then rerun this script."
  exit 1
fi

export THUMB_CDN_DISTRIBUTION_ID="$DIST_ID"
echo "==> Merge CloudFront GetObject on s3://${S3_BUCKET_NAME}/${S3_PREFIX}/* for ${DIST_ID}"

python3 - <<'PY'
import json, os, subprocess, sys

sid = "AllowAlysonPulseThumbCloudFront"
bucket = os.environ["S3_BUCKET_NAME"]
region = os.environ["AWS_REGION"]
account = os.environ["AWS_ACCOUNT_ID"]
dist_id = os.environ["THUMB_CDN_DISTRIBUTION_ID"]
prefix = os.environ.get("S3_PREFIX", "alyson-td-screenshots").strip("/")

wanted = {
    "Sid": sid,
    "Effect": "Allow",
    "Principal": {"Service": "cloudfront.amazonaws.com"},
    "Action": "s3:GetObject",
    "Resource": f"arn:aws:s3:::{bucket}/{prefix}/*",
    "Condition": {
        "StringEquals": {
            "AWS:SourceArn": f"arn:aws:cloudfront::{account}:distribution/{dist_id}"
        }
    },
}

get = subprocess.run(
    ["aws", "s3api", "get-bucket-policy", "--bucket", bucket, "--region", region, "--output", "json"],
    capture_output=True,
    text=True,
)
if get.returncode == 0:
    policy = json.loads(json.loads(get.stdout)["Policy"])
elif "NoSuchBucketPolicy" in (get.stderr or "") or "The bucket policy does not exist" in (get.stderr or ""):
    policy = {"Version": "2012-10-17", "Statement": []}
else:
    sys.stderr.write(get.stderr or get.stdout or "get-bucket-policy failed\n")
    sys.exit(get.returncode or 1)

statements = policy.get("Statement") or []
if isinstance(statements, dict):
    statements = [statements]
statements = [s for s in statements if not (isinstance(s, dict) and s.get("Sid") == sid)]
statements.append(wanted)
policy["Version"] = policy.get("Version") or "2012-10-17"
policy["Statement"] = statements

put = subprocess.run(
    [
        "aws",
        "s3api",
        "put-bucket-policy",
        "--bucket",
        bucket,
        "--region",
        region,
        "--policy",
        json.dumps(policy),
    ],
    capture_output=True,
    text=True,
)
if put.returncode != 0:
    sys.stderr.write(put.stderr or put.stdout or "put-bucket-policy failed\n")
    sys.exit(put.returncode)
print("ok: bucket policy includes", sid)
PY

DOMAIN="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ScreenshotThumbCdnDomain'].OutputValue" \
  --output text 2>/dev/null || true)"
DOMAIN="${DOMAIN//None/}"
if [[ -z "$DOMAIN" || -z "${SCREENSHOT_THUMB_CDN_HMAC_SECRET:-}" ]]; then
  echo "ERROR: Missing CloudFront domain or SCREENSHOT_THUMB_CDN_HMAC_SECRET; cannot write thumb CDN config."
  exit 1
fi
export THUMB_CDN_DOMAIN="$DOMAIN"
echo "==> Write s3://${S3_BUCKET_NAME}/alyson-td-internal/thumb-cdn.json (API reads this; not in Lambda env)"
python3 - <<'PY'
import json, os, subprocess, sys, tempfile

bucket = os.environ["S3_BUCKET_NAME"]
region = os.environ["AWS_REGION"]
body = json.dumps({
    "domain": os.environ["THUMB_CDN_DOMAIN"].strip(),
    "secret": os.environ["SCREENSHOT_THUMB_CDN_HMAC_SECRET"].strip(),
}, separators=(",", ":"))
fd, path = tempfile.mkstemp(suffix=".json")
try:
    with os.fdopen(fd, "w") as f:
        f.write(body)
    put = subprocess.run(
        [
            "aws",
            "s3api",
            "put-object",
            "--bucket",
            bucket,
            "--region",
            region,
            "--key",
            "alyson-td-internal/thumb-cdn.json",
            "--content-type",
            "application/json",
            "--cache-control",
            "no-store",
            "--body",
            path,
        ],
        capture_output=True,
        text=True,
    )
finally:
    os.unlink(path)
if put.returncode != 0:
    sys.stderr.write(put.stderr or put.stdout or "put-object failed\n")
    sys.exit(put.returncode)
print("ok: thumb CDN config written")
PY
