# Katkı Rehberi (CONTRIBUTING)

Bu doküman, bu NestJS template’ini geliştirmek isteyen katkı sahipleri için çalışma kurallarını ve kalite standartlarını tanımlar.

## 1) Genel İlkeler

- Bu repository bir **template** olduğu için değişikliklerin amacı; yeni projelere kopyalanınca minimum eforla çalışacak, anlaşılır ve sürdürülebilir bir temel sağlamaktır.
- Backward compatibility mümkün olduğunca korunmalıdır. Kırıcı değişiklikler (breaking changes) net şekilde belirtilmelidir.
- Güvenlik ve gizlilik önceliklidir. Hiçbir şekilde gerçek anahtar/şifre/secret repository’ye eklenmemelidir.

## 2) Branch Politikası

- **`main` branch’ine doğrudan push yapmak yasaktır.**
- Tüm değişiklikler **feature branch** üzerinden yapılır ve **Pull Request (PR)** ile `main`’e alınır.
- Branch isimlendirme önerisi:
  - `feature/<kisa-aciklama>`
  - `fix/<kisa-aciklama>`
  - `chore/<kisa-aciklama>`
  - `docs/<kisa-aciklama>`

## 3) Issue ve PR Süreci

- Büyük değişikliklerden önce bir **Issue** açılması önerilir.
- PR’lar mümkünse küçük ve odaklı olmalıdır.
- PR içinde aşağıdaki bilgiler bulunmalıdır:
  - Değişikliğin amacı
  - Kapsam (hangi modül/dosyalara dokunduğu)
  - Çalıştırılan kontroller (lint/test)
  - Varsa migration etkisi
  - Varsa breaking change açıklaması

## 4) Kodlama Standartları

- Proje **TypeScript** ve **NestJS** best practice’lerine uygun olmalıdır.
- Kod stili:
  - Format için Prettier kullanılır.
  - Lint için ESLint kuralları geçerli kabul edilir.
- İsimlendirme:
  - Modüller `*.module.ts`, servisler `*.service.ts`, controller’lar `*.controller.ts` şeklinde olmalıdır.
- Sorumluluk ayrımı:
  - Controller’lar mümkün olduğunca ince tutulmalı; iş kuralları servis katmanında olmalıdır.
  - Ortak yapıların `src/common` altında toplanması tercih edilir.

## 5) Zorunlu Kontroller

PR açmadan önce aşağıdaki komutların başarılı çalıştığından emin olun:

```bash
pnpm lint
pnpm test
```

Değişikliğe göre ayrıca:

```bash
pnpm test:e2e
```

## 6) Commit Mesajları

Commit mesajlarında tutarlılık için aşağıdaki format önerilir:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`
- `refactor: ...`
- `test: ...`

Örnek:

- `feat: add healthcheck endpoint`
- `fix: handle redis connection errors`

## 7) Konfigürasyon ve Secret Yönetimi

- `.env` dosyası repository’ye eklenmemelidir.
- `.env.example` güncel tutulmalıdır.
- Yeni bir ortam değişkeni ekleniyorsa:
  - `.env.example` içine örnek değer eklenmeli,
  - `src/config/env.validation.ts` şemasına doğrulama kuralı eklenmelidir.

## 8) Veritabanı ve Migration

- Şema değişiklikleri Drizzle yapısına uygun şekilde yapılmalıdır.
- Migration gerekiyorsa PR açıklamasında belirtilmelidir.

## 9) Güvenlik

- Log’lara token/şifre/OTP gibi hassas veriler yazdırılmamalıdır.
- Auth ile ilgili değişikliklerde edge-case senaryoları (süre aşımı, token yenileme, rate limit) göz önünde bulundurulmalıdır.

## 10) İnceleme ve Onay

- PR’lar en az bir reviewer tarafından incelenmelidir.
- Reviewer feedback’leri uygulanmadan PR merge edilmemelidir.

Teşekkürler. Bu kurallara uyan katkılar, template’in daha hızlı olgunlaşmasını sağlar.
