#!/usr/bin/env bash
# Generate a STABLE self-signed code-signing certificate for Alyson PM.
#
# Why: macOS TCC (Screen Recording / Accessibility) is tied to the app's
# code-signing identity. Ad-hoc signing ("-") creates a NEW identity on every
# build, so permissions reset after each auto-update. Signing every release
# with THIS same .p12 keeps the identity stable so permissions persist.
#
# Usage:
#   ./scripts/generate-stable-codesign-cert.sh
#   ./scripts/generate-stable-codesign-cert.sh /path/to/output.p12
#
# Then add GitHub Actions secrets (repo revcloud/alyson-pms):
#   MAC_CSC_LINK          = contents of the .p12.base64 file (one line)
#   MAC_CSC_KEY_PASSWORD  = the password printed below
#
# Keep the .p12 + password somewhere safe (1Password). Never commit them.

set -euo pipefail

CERT_NAME="Alyson PM Code Signing"
OUT_P12="${1:-./alyson-pm-codesign.p12}"
OUT_DIR="$(cd "$(dirname "$OUT_P12")" && pwd)"
OUT_BASE="$(basename "$OUT_P12" .p12)"
P12_PATH="${OUT_DIR}/${OUT_BASE}.p12"
B64_PATH="${OUT_DIR}/${OUT_BASE}.p12.base64"
PASSWORD="${MAC_CSC_KEY_PASSWORD:-$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/codesign.cnf" <<EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${CERT_NAME}
O = RevCloud
C = US

[v3_req]
basicConstraints = CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF

openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$TMP/codesign.key" \
  -out "$TMP/codesign.csr" \
  -config "$TMP/codesign.cnf"

openssl x509 -req \
  -in "$TMP/codesign.csr" \
  -signkey "$TMP/codesign.key" \
  -out "$TMP/codesign.crt" \
  -days 3650 \
  -extfile "$TMP/codesign.cnf" \
  -extensions v3_req

# Use legacy PBES1/3DES so macOS `security import` / electron-builder accept the
# .p12 (OpenSSL 3 default AES-PBES2 often fails with "MAC verification failed").
openssl pkcs12 -export \
  -out "$P12_PATH" \
  -inkey "$TMP/codesign.key" \
  -in "$TMP/codesign.crt" \
  -password "pass:${PASSWORD}" \
  -name "${CERT_NAME}" \
  -certpbe PBE-SHA1-3DES \
  -keypbe PBE-SHA1-3DES \
  -macalg sha1 \
  -legacy 2>/dev/null \
  || openssl pkcs12 -export \
    -out "$P12_PATH" \
    -inkey "$TMP/codesign.key" \
    -in "$TMP/codesign.crt" \
    -password "pass:${PASSWORD}" \
    -name "${CERT_NAME}" \
    -certpbe PBE-SHA1-3DES \
    -keypbe PBE-SHA1-3DES \
    -macalg sha1

# GitHub Actions / electron-builder expect base64 of the .p12 (no newlines).
base64 < "$P12_PATH" | tr -d '\n' > "$B64_PATH"
echo >> "$B64_PATH"

echo ""
echo "=============================================="
echo "Stable code-signing certificate created"
echo "=============================================="
echo "  Certificate name : ${CERT_NAME}"
echo "  P12 file         : ${P12_PATH}"
echo "  Base64 for secret: ${B64_PATH}"
echo "  Password         : ${PASSWORD}"
echo ""
echo "Add these GitHub secrets (Settings → Secrets → Actions):"
echo "  MAC_CSC_LINK         = paste contents of ${B64_PATH}"
echo "  MAC_CSC_KEY_PASSWORD = ${PASSWORD}"
echo ""
echo "Or via gh CLI:"
echo "  gh secret set MAC_CSC_LINK --repo revcloud/alyson-pms < \"${B64_PATH}\""
echo "  gh secret set MAC_CSC_KEY_PASSWORD --repo revcloud/alyson-pms --body \"${PASSWORD}\""
echo ""
echo "Do NOT commit the .p12 or password. Store them in a password manager."
echo "=============================================="
