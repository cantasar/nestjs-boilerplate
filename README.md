# NestJS Boilerplate

Backend projeleri için hazır NestJS şablonu. Auth, DB, Redis, Mail altyapısı dahildir.

## Gereksinimler

- **Node.js** 20+ (`.nvmrc` ile uyumlu)
- **PostgreSQL** (Docker veya lokal)
- **Redis** (Docker veya lokal)

## Kurulum

```bash
# Bağımlılıklar
npm install

# Ortam değişkenleri
cp .env.example .env
# .env dosyasını düzenleyin

# Veritabanı (opsiyonel - local dev için)
docker compose up -d

# Migration (Neon/Cloud SQL kullanıyorsanız DATABASE_URL ile)
npm run db:push

# Başlat
npm run start:dev
```

## Ortam Değişkenleri

| Değişken | Zorunlu | Varsayılan | Açıklama |
|----------|---------|------------|----------|
| `JWT_SECRET` | **Evet** | - | JWT imzalama anahtarı |
| `DATABASE_URL` | Hayır | - | PostgreSQL URL (yoksa HOST/PORT/USER/PASSWORD/NAME kullanılır) |
| `DATABASE_HOST` | Hayır | localhost | |
| `DATABASE_PORT` | Hayır | 5432 | |
| `DATABASE_USER` | Hayır | postgres | |
| `DATABASE_PASSWORD` | Hayır | '' | |
| `DATABASE_NAME` | Hayır | app | |
| `REDIS_URL` | Hayır | redis://localhost:6379 | |
| `ZEPTOMAIL_URL` | Hayır | - | Mail (forgot-password için) |
| `ZEPTOMAIL_TOKEN` | Hayır | - | |
| `MAIL_FROM_ADDRESS` | Hayır | - | |
| `MAIL_FROM_NAME` | Hayır | - | |

## Endpoint'ler

| Endpoint | Açıklama |
|----------|----------|
| `GET /health` | Liveness (load balancer) |
| `GET /health/ready` | Readiness (DB + Redis durumu) |
| `POST /api/v1/auth/register` | Kayıt |
| `POST /api/v1/auth/login` | Giriş |
| `POST /api/v1/auth/refresh` | Token yenileme |
| `GET /api/v1/todos` | Todo listesi (Bearer token) |
| `POST /api/v1/todos` | Todo oluştur |

**Swagger:** http://localhost:3000/docs

## Komutlar

```bash
npm run start:dev    # Geliştirme
npm run build        # Build
npm run lint         # ESLint
npm run format       # Prettier
npm run test         # Unit test
npm run test:e2e     # E2E test
npm run db:generate  # Migration oluştur
npm run db:push      # Schema'yı DB'ye uygula
npm run db:studio    # Drizzle Studio
```

## Proje Yapısı

```
src/
├── auth/          # JWT auth, register, login, forgot/reset password
├── users/         # User repository
├── todos/         # Örnek modül (silinebilir)
├── database/      # Drizzle schema + module
├── mail/          # ZeptoMail
├── redis/         # Redis client
├── health/        # Health check
├── common/        # Guards, filters, decorators
└── config/        # Env validation
```
