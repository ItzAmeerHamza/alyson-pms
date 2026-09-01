#!/usr/bin/env bash
# Merge Pulse screenshot cold-storage rule onto the shared bucket lifecycle.
# Does not expire objects and does not touch other prefixes (sam-deploy, Athena, CDN config).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/deploy.env" ]]; then
  # shellcheck source=/dev/null
  source "$SCRIPT_DIR/deploy.env"
fi

export AWS_REGION="${AWS_REGION:-us-west-2}"
export S3_BUCKET_NAME="${S3_BUCKET_NAME:?Set S3_BUCKET_NAME}"
export S3_PREFIX="${S3_PREFIX:-alyson-td-screenshots}"
export SCREENSHOT_COLD_AFTER_DAYS="${SCREENSHOT_COLD_AFTER_DAYS:-30}"
export SCREENSHOT_COLD_STORAGE_CLASS="${SCREENSHOT_COLD_STORAGE_CLASS:-GLACIER_IR}"

echo "==> Merge lifecycle on s3://${S3_BUCKET_NAME}/${S3_PREFIX}/* → ${SCREENSHOT_COLD_STORAGE_CLASS} after ${SCREENSHOT_COLD_AFTER_DAYS}d"

python3 - <<'PY'
import json, os, subprocess, sys

rule_id = "AlysonPulseScreenshotsToColdStorage"
bucket = os.environ["S3_BUCKET_NAME"]
region = os.environ["AWS_REGION"]
prefix = os.environ.get("S3_PREFIX", "alyson-td-screenshots").strip("/") + "/"
days = int(os.environ.get("SCREENSHOT_COLD_AFTER_DAYS", "30"))
storage = os.environ.get("SCREENSHOT_COLD_STORAGE_CLASS", "GLACIER_IR")

wanted = {
    "ID": rule_id,
    "Status": "Enabled",
    "Filter": {"Prefix": prefix},
    "Transitions": [{"Days": days, "StorageClass": storage}],
}

get = subprocess.run(
    [
        "aws",
        "s3api",
        "get-bucket-lifecycle-configuration",
        "--bucket",
        bucket,
        "--region",
        region,
        "--output",
        "json",
    ],
    capture_output=True,
    text=True,
)
if get.returncode == 0:
    config = json.loads(get.stdout)
elif "NoSuchLifecycleConfiguration" in (get.stderr or ""):
    config = {"Rules": []}
else:
    sys.stderr.write(get.stderr or get.stdout or "get-bucket-lifecycle-configuration failed\n")
    sys.exit(get.returncode or 1)

rules = [r for r in (config.get("Rules") or []) if r.get("ID") != rule_id]
rules.append(wanted)
payload = {"Rules": rules}

put = subprocess.run(
    [
        "aws",
        "s3api",
        "put-bucket-lifecycle-configuration",
        "--bucket",
        bucket,
        "--region",
        region,
        "--lifecycle-configuration",
        json.dumps(payload),
    ],
    capture_output=True,
    text=True,
)
if put.returncode != 0:
    sys.stderr.write(put.stderr or put.stdout or "put-bucket-lifecycle-configuration failed\n")
    sys.exit(put.returncode)
print("ok:", rule_id, prefix, f"{days}d", storage, f"({len(rules)} rule(s) on bucket)")
PY
