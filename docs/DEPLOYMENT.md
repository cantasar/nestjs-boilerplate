# CI/CD – Google Cloud Run

Automatic deploy with GitHub Actions. Setup steps only.

---

## Step 1: Artifact Registry

```bash
gcloud artifacts repositories create cloud-run \
  --repository-format=docker \
  --location=europe-west1
```

---

## Step 2: Service Account

```bash
# Create
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions"

# Roles (replace PROJECT_ID)
PROJECT_ID=your-project-id

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:github-actions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Create key
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions@${PROJECT_ID}.iam.gserviceaccount.com
```

---

## Step 3: GitHub Secrets

Repo → Settings → Secrets and variables → Actions → New repository secret

| Secret | Value |
|--------|-------|
| `GCP_PROJECT_ID` | GCP project ID |
| `GCP_SA_KEY` | Full contents of `key.json` file |

---

## Step 4: Deploy Trigger

**Manual:** Actions → Deploy to Cloud Run → Run workflow

**Automatic:** Push to `main` branch (skipped for `.md`, `docs/`, config file changes)

---

## Workflow File

`.github/workflows/deploy-cloud-run.yml`

For manual deploy only: remove the `push:` block.
