# CI/CD – Google Cloud Run

GitHub Actions ile otomatik deploy. Sadece kurulum adımları.

---

## Adım 1: Artifact Registry

```bash
gcloud artifacts repositories create cloud-run \
  --repository-format=docker \
  --location=europe-west1
```

---

## Adım 2: Service Account

```bash
# Oluştur
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions"

# Roller (PROJECT_ID'yi değiştir)
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

# Key oluştur
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions@${PROJECT_ID}.iam.gserviceaccount.com
```

---

## Adım 3: GitHub Secrets

Repo → Settings → Secrets and variables → Actions → New repository secret

| Secret | Değer |
|--------|-------|
| `GCP_PROJECT_ID` | GCP proje ID |
| `GCP_SA_KEY` | `key.json` dosyasının tam içeriği |

---

## Adım 4: Deploy Tetikleme

**Manuel:** Actions → Deploy to Cloud Run → Run workflow

**Otomatik:** `main` branch'e push (`.md`, `docs/`, config dosyaları hariç)

---

## Workflow Dosyası

`.github/workflows/deploy-cloud-run.yml`

Sadece manuel deploy için: `push:` bloğunu sil.
