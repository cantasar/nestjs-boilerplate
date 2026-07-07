#!/bin/sh
# Scan staged changes for secrets before commit.
# Soft-fails (passes) when gitleaks is not installed — CI is the hard gate.
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "⚠️  gitleaks not installed — skipping local secret scan (CI will still enforce)."
  echo "    Install: brew install gitleaks"
  exit 0
fi
gitleaks git --pre-commit --redact --staged --no-banner || {
  echo "❌ gitleaks: potential secret in staged changes. Fix or allowlist in .gitleaks.toml."
  echo "   Bypass (discouraged): git commit --no-verify"
  exit 1
}
