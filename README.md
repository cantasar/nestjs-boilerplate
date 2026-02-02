 # NestJS Backend Template
 
 Bu proje backend geliştiricilerin hızlı bir şekilde yeni projeler başlatabilmesi için hazırlanmış bir **NestJS boilerplate/template** çalışmasıdır.
 
 Amaç; projeler arasında ortak olan altyapı parçalarını (konfigürasyon, logging, hata yönetimi, DB bağlantısı, temel auth akışları, docker vb.) tek bir başlangıç noktasında toplayarak yeni proje geliştirme süresini azaltmaktır.
 
 ## İçerik
 
 - **NestJS 11** tabanlı API
 - **Global config** (`@nestjs/config`) + **Zod** ile environment doğrulama
 - **Swagger** dokümantasyonu (`/docs`)
 - **API versioning** (URI üzerinden, örn: `/api/v1/...`)
 - **Global response standardı** (interceptor ile `statusCode`, `message`, `data` formatı)
 - **Global exception filter** ile standart hata cevabı
 - **Pino logger** (`nestjs-pino`)
 - **PostgreSQL** + **Drizzle ORM** altyapısı
 - **Redis** (örnek kullanım: forgot-password rate limit + doğrulama kodu)
 - **Mail servisi** (ZeptoMail istemcisi ile OTP mail gönderimi)
 - **Dockerfile** ve **docker-compose** (Postgres + Redis)
 - **ESLint + Prettier**
 - **Jest** unit test ve e2e test altyapısı
 
 ## Gereksinimler
 
 - Node.js (öneri: `.node-version` ile uyumlu sürüm)
 - Paket yöneticisi: **pnpm** (Dockerfile ve lockfile buna göre)
 - Docker (opsiyonel ama önerilir)
 
 ## Kurulum
 
 1) Bağımlılıkları yükleyin:
 
 ```bash
 pnpm install
 ```
 
 2) Ortam değişkenlerini hazırlayın:
 
 - `.env.example` dosyasını referans alarak `.env` oluşturun.
 - Bu template bazı değişkenleri **zorunlu** bekler (aşağıya bakınız).
 
 3) Servisleri ayağa kaldırın (Postgres + Redis):
 
 ```bash
 docker compose up -d
 ```
 
 4) Uygulamayı başlatın:
 
 ```bash
 pnpm start:dev
 ```
 
 Varsayılan olarak:
 
 - API: `http://localhost:3000/api`
 - Swagger: `http://localhost:3000/docs`
 
 ## Ortam Değişkenleri (ENV)
 
Proje `ConfigModule` + Zod doğrulaması ile çalışır. Uygulama ayağa kalkarken bazı değişkenler yoksa başlangıçta hata verir.
 
Zorunlu değişkenler (minimum):
 
- `DATABASE_URL`
- `JWT_SECRET`
- `REDIS_URL`
- `ZEPTOMAIL_URL`
- `ZEPTOMAIL_TOKEN`
- `MAIL_FROM_ADDRESS`
- `MAIL_FROM_NAME`
 
`.env.example` içinde ayrıca Docker compose ile uyumlu Postgres/Redis host/port örnekleri bulunur.
 
 ## Kullanım / Mevcut Endpoint’ler
 
 API prefix’i global olarak `api` olarak ayarlıdır ve controller’lar URI versioning kullanır.
 
 Örnek Auth endpoint’leri:
 
 - `POST /api/v1/auth/register`
 - `POST /api/v1/auth/login`
 - `POST /api/v1/auth/forgot-password`
 - `POST /api/v1/auth/reset-password`
 - `POST /api/v1/auth/refresh`
 
 Swagger üzerinden tüm endpoint’leri ve DTO şemalarını görüntüleyebilirsiniz.
 
 ## Veritabanı (Drizzle)
 
 Drizzle bağlantısı `DrizzleModule` üzerinden **global provider** olarak verilir.
 
 Kullanılabilir script’ler:
 
 ```bash
 pnpm db:generate
 pnpm db:migrate
 pnpm db:pull
 pnpm db:push
 pnpm db:studio
 ```
 
 Not: Drizzle konfigurasyonu `drizzle.config.ts` üzerinden `DATABASE_URL` ile çalışır.
 
 ## Kod Kalitesi
 
 - Lint:
 
 ```bash
 pnpm lint
 ```
 
 - Format:
 
 ```bash
 pnpm format
 ```
 
 ## Test
 
 - Unit test:
 
 ```bash
 pnpm test
 ```
 
 - e2e test:
 
 ```bash
 pnpm test:e2e
 ```
 
 ## Proje Yapısı (Özet)
 
 - `src/main.ts`
   - Global prefix (`/api`)
   - URI versioning
   - Global validation pipe
   - Swagger setup (`/docs`)
   - Global interceptor (response standardı)
   - Global exception filter
 - `src/app.module.ts`
   - Config + validation
   - Pino logger
   - DB (Drizzle)
   - Auth
   - Mail
 - `src/auth/*`
   - JWT auth + refresh token akışı
   - Forgot/reset password akışı (Redis TTL)
 - `src/db/*`
   - Drizzle client + schema
 - `src/common/*`
   - response decorator/interceptor + exception filter
 