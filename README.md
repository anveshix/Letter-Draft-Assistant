# 📜 Letter Draft Assistant v3.0 — Complete School Correspondence & Certificate OS

**Secure Bilingual (Hindi + English) Official Letter, Bulk Certificate Mail-Merge, Tamper-Proof QR Verification, Live Signature Approval, Offline Paper Scan OCR & Searchable Excel / Google Sheets Operating System.**

Built for **CM School of Excellence Girls' Dumka** (`+2 Govt. Girls' High School, Dumka`) and adaptable in 60 seconds to any school, college, or government office from **any Windows Laptop, PC, Office LAN, or Cloud Host**.

---

## 🌟 What's New in v3.0 — All 7 Indispensable School Modules

Powered by battle-tested, high-star open-source GitHub libraries (`0` npm vulnerabilities, `100%` offline-ready):

| # | Module | Open-Source Engine | School Impact |
|---|---|---|---|
| **1** | **🎓 Student & Staff Master Directory** | `exceljs/exceljs` | Import Student Admission & Staff Excel once → **1-click Fuzzy Auto-Fill** of Name, Father, Class, Roll, Adm No., DOB & **Duplicate Certificate Guard** + per-person issued history. |
| **2** | **⚡ Bulk Mail-Merge & Batch Certificates** | `Hopding/pdf-lib` + `Stuk/jszip` | Issue 10–250 Bonafide, Character, Fee Certificates, Notices, or Duty Orders at once with sequential gap-free Ref. Nos. Download as **Single Print-Ready Combined PDF** or **ZIP of `.pdf` / `.docx`**. |
| **3** | **🛡 Tamper-Proof Cryptographic QR Verification** | `soldair/node-qrcode` + Node `crypto` HMAC-SHA256 | Embeds a verifiable QR code + 16-char HMAC code on every `.pdf`, `.docx`, and print copy. Scanning opens `/verify` to confirm genuineness or cancellation without exposing private registers. |
| **4** | **✍️ Clerk → Principal Approval Queue & Signature Pad** | `szimek/signature_pad` | Office Clerk drafts & submits (`pending_approval`) → Principal inspects, signs live on screen with mouse/stylus/touch, and issues official Ref. No. |
| **5** | **📥 Inward Paper Scan + Offline Hindi/English OCR + SLA Tracker** | `naptha/tesseract.js` (`eng` + `hin` bundled) | Upload a photo/scan of any incoming DEO/DC/CBSE/RTI letter → **1.5s offline Hindi+English OCR** auto-extracts Sender, Memo No. & Subject + tracks **RTI 30-Day / Urgent 48h SLA deadlines**. |
| **6** | **🎙 Smart Bilingual Drafting Studio** | Web Speech + Phonetic Engine | **Live Voice Dictation (`hi-IN` & `en-IN`)**, offline **Roman → Devanagari phonetic typing** (`savinya nivedan` → `सविनय निवेदन`), **KrutiDev → Unicode**, **80+ Official Sarkari Phrases**, and **WhatsApp/Email dispatch share**. |
| **7** | **🔍 Fuzzy Search, Analytics Audit & Desktop PWA** | `krisk/Fuse` + Service Worker | Typo-tolerant `Fuse.js` search across registers & directories, Major-Head & Monthly visual analytics, **1-click Printable DEO/CBSE Inspection Report PDF**, and **Installable Desktop/Mobile PWA**. |

---

## 🔒 Security Architecture
- **Mandatory Authentication Gate** (`crypto.scrypt` 64-byte salted hashes + `HttpOnly; SameSite=Lax` sessions + `X-CSRF-Token` validation).
- **Role-Based Access Control (RBAC)**: `admin` (Principal — Approve, Live Sign, Cancel, Settings, Users) vs `staff` (Clerk — Draft, Directory, OCR Scan, Submit for Approval).
- **Tamper-Proof HMAC-SHA256 QR Codes**: Secret key stored at `data/verify-secret.key` (`0o600`), verified with `crypto.timingSafeEqual`.
- **Protected Private Stamps & Scans**: Stored outside `public/` in `storage/defaults/` and `data/uploads/`, served only via authenticated `/api/files/*`.
- **Strict CSP (`script-src 'self'`) & Zero Runtime CDNs**: `Fuse.js`, `SignaturePad`, `Karma`/`Mukta` fonts, and Hindi+English Tesseract traineddata are all bundled locally.

---

## 💻 1-Click Deployment on Any Laptop or PC

### Windows 10 / 11
1. Install **[Node.js LTS](https://nodejs.org/)**.
2. Double-click **`start.bat`**!
   - Automatically installs dependencies on first run, starts the server on `http://localhost:3000`, prints your **Office Wi-Fi/LAN URL** for other computers/phones, and opens your browser.

### Linux / macOS
```bash
./start.sh
```

### Docker / Render / Railway
- **Docker**: `docker compose up -d --build`
- **Render / Railway**: Blueprint configs (`render.yaml`, `railway.json`, `Dockerfile`) included out of the box.

---

## 🧪 Verification & Security Audit

```bash
npm ci
npm test
npm run security-audit
```
