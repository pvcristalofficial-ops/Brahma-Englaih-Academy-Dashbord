# Brahma English Academy - Enquiry, Follow-up & Fee Dashboard

React (frontend) + PHP / MySQL (backend). Student enquiries save karo, daily follow-ups track karo, admission confirm hote hi
professional receipt banao - aur data kabhi duplicate, gayab ya missing na ho.

## Kya-kya milta hai

| Module | Kya karta hai |
|---|---|
| **Dashboard** | Aaj ke follow-ups, enquiries, admissions, conversion %, fees collected / pending, daily chart, **source-wise aur campaign-wise performance** (kaunsa Meta ad admission laata hai) |
| **Enquiries** | Naya enquiry (duplicate mobile turant pakda jata hai), search / filters, Call + WhatsApp one-tap, CSV export (admin) |
| **Today's follow-ups** | Aaj ke due + missed + auto-added leads, ek hi list mein. Har lead par: Call, WhatsApp, Log follow-up, Admit |
| **Admission + Receipt** | "Confirm admission" = admission + first payment + receipt ek saath. A4 par **Student copy + Office copy**, amount in words (Indian system), WhatsApp share, Print / Save as PDF |
| **Fees due** | Instalment due list, overdue highlight, WhatsApp reminder, ek click mein "Collect" (nayi receipt) |
| **Admin** | Courses & fees, team users (admin / counsellor), academy details (receipt par), activity log, full backup download |
| **Website form** | brahmaenglishacademy.com ka enquiry form seedha dashboard mein (`docs/website-enquiry-form.html`) |

## Follow-up ka rule (aapki requirement)

* Har open enquiry ki ek **next follow-up date** hoti hai. Follow-up log karte waqt next date dena **zaroori** hai (sirf "Not interested / Wrong number" mein nahi) - isliye koi lead bhoolti nahi.
* Follow-up **nahi kiya** to wo lead **agle din se hi "Today's follow-ups" mein carry-forward** ho jati hai (red badge: "Overdue 3 days").
* Agar kisi enquiry par **koi date set nahi** aur **7 din** koi contact nahi hua, to wo **automatically** Today's follow-ups mein aa jati hai (purple badge "Auto-added"). 7 ki jagah apna number **Settings** mein set kar sakte hain.
* Ye sab database query se live calculate hota hai (cron job ki zaroorat nahi), isliye server band/restart hone par bhi kuch miss nahi hota.
* Admission hote hi enquiry follow-up list se hat jati hai. "Lost" bhi delete nahi hoti - **Re-open** kar sakte hain.

## Data safe kaise rehta hai

**Duplicate nahi**
* Mobile number par database-level `UNIQUE` key. Do log ek hi second mein save dabayein to bhi sirf ek record banta hai (10 parallel requests ka test pass).
* `+91`, `0`, space, dash - sab normalise hote hain (98765-43210 = +91 98765 43210). Alternate number bhi check hota hai.
* Double-click / net slow hone par retry: har form ki ek idempotency key hoti hai, isliye dobara save nahi hota.
* Admission ek enquiry par sirf ek baar (UNIQUE). Receipt number financial-year-wise **gap-free** (`BEA/2026-27/0001`).
* Website form se same number dobara aaye to duplicate nahi banta - purani enquiry aaj ki list mein aa jati hai.

**Data gayab nahi**
* Koi `DELETE` nahi: enquiry **Archive** hoti hai (restore ho sakti hai), galat receipt **Void** hoti hai (record + reason rehta hai), user **Deactivate** hota hai.
* Foreign keys `ON DELETE RESTRICT`; InnoDB transactions - admission + payment + receipt + enquiry update ya to sab hota hai ya kuch nahi.
* Do staff ek hi record edit karein to purani screen se save **block** hota hai (version check), koi kisi ka kaam overwrite nahi karta.
* Fees galti se zyada nahi lag sakti (balance se zyada payment reject). Paid amount hamesha valid receipts ke sum ke barabar.
* **Activity log**: kisne, kab, kya badla (purani + nayi value ke saath).
* Typing draft browser mein auto-save hota hai; internet/server error par form khali nahi hota.
* **Backup**: Settings se ek click mein `.sql.gz` download, ya daily automatic backup (neeche). Backup restore karke test kiya hai - row counts aur content checksum bilkul same.

**Missing data nahi**
* Required fields (naam, mobile, source, next follow-up date), 10-digit mobile validation, non-cash payment par transaction number zaroori, pending balance par next due date zaroori.
* MySQL strict mode - koi value chup-chaap kat/badal nahi sakti.

**Security**
* Login (bcrypt / password_hash), session cookie `HttpOnly + SameSite`, **CSRF token**, brute-force lock (5 galat attempt = 15 min), roles (admin / counsellor), idle timeout 8 ghante.
* Sab SQL prepared statements. Sirf JSON accept hota hai. Security headers + CSP. CSV export formula-injection se safe.
* `config.php`, `src/`, `storage/`, `database/` web se **403** (Apache par test kiya).
* Counsellor ko users, export, backup, activity log, receipt void, archive nahi dikhta (server par bhi block hai).

## Folder structure

```
backend/      PHP API  ->  upload karo:  <site>/dashboard/api/
frontend/     React app (Vite)
docs/         website enquiry form snippet
scripts/      build-release.sh  (upload-ready zip banata hai)
```

## Hosting par lagana (cPanel / shared hosting)

Recommended: subdomain `dashboard.brahmaenglishacademy.com` (HTTPS ke saath).

1. **Release banao** (apne computer par, Node 18+ chahiye):
   ```bash
   ./scripts/build-release.sh        # -> release/brahma-dashboard.zip
   ```
2. **cPanel -> MySQL Databases**: ek database + user banao, user ko database par *All Privileges* do.
3. Zip ko subdomain ke folder (document root) mein upload karke **Extract** karo. Aisa dikhna chahiye:
   `index.html`, `assets/`, `.htaccess`, `api/`.
4. `api/config.sample.php` ka naam **`config.php`** karo aur kholkar bharo: database host / name / user / password, aur `setup_key` (koi lamba random text).
5. `api/storage/` ko writable rakho (permission 755 ya 775).
6. Browser mein kholo `https://dashboard.brahmaenglishacademy.com/api/setup.php` -> setup key + apna naam / email / password daalo -> **Install**.
7. **`api/setup.php` file delete kar do.** (Wo ek baar chalne ke baad khud lock ho jati hai, phir bhi delete karna best hai.)
8. `https://dashboard.brahmaenglishacademy.com/` par login karo.
9. **Courses & Fees** mein har course ki fees bharo (abhi 0 hai - admission par yahi auto-fill hoti hai). **Settings** mein academy ka address / phone / GSTIN bharo (receipt par chhapta hai). **Team / Users** mein counsellors ke login banao.
10. **Daily backup (recommended)**: cPanel -> Cron Jobs -> daily:
    `php /home/CPANELUSER/path/to/dashboard/api/bin/backup.php`
    Backups `api/storage/backups/` mein bante hain (last 30 rehte hain). Kabhi-kabhi Settings se download karke Google Drive par bhi rakho.

> Agar `dashboard.` subdomain nahi, to folder `public_html/dashboard/` bhi chalega (URL: `.../dashboard/`, trailing `/` ke saath).
> **Nginx** hosting ho to `.htaccess` kaam nahi karta - hosting support se `api/src`, `api/storage`, `api/database`, `api/bin`, `api/config.php` block karwaiye aur sab `api/*` requests `api/index.php` par bhejiye.

## Website form jodna

`backend/config.php` mein `'public_form_key' => '...'` bharo, phir `docs/website-enquiry-form.html` ka code website par paste karo (`FORM_KEY` aur `API_URL` badlo). Meta landing page ka `?utm_campaign=...` apne aap "Campaign" field mein save hota hai.

## Local development

```bash
# 1) MySQL / MariaDB mein database banao, phir:
cp backend/config.sample.php backend/config.php      # db details bharo
php backend/bin/install.php --name="Owner" --email=you@example.com --password='Str0ngPass1'
php -S 127.0.0.1:8000 backend/dev-router.php          # API

# 2) naye terminal mein
cd frontend && npm install && npm run dev              # http://localhost:5173  (API proxy -> :8000)
```

## Tests

```bash
php -S 127.0.0.1:8000 backend/dev-router.php &
BEA_TEST_DB=bea_test node --test backend/tests/api.test.mjs   # 17 integration tests (WIPES that test DB)
cd frontend && npm test                                       # amount-in-words, dates, phone helpers
```
API tests duplicate race (10 parallel saves), admission race, parallel instalments, receipt numbering, rollover rules, permissions, CSRF, CSV safety, backup, public form - sab cover karte hain.

## Dhyan dein

* WhatsApp / Call buttons `wa.me` aur `tel:` links hain (aapke phone / WhatsApp Web mein khulte hain). Automatic WhatsApp message bhejne ke liye WhatsApp Business API alag se lagegi.
* Mobile number sirf Indian 10-digit (6-9 se shuru) accept hota hai.
* Receipt numbers financial year (Apr-Mar) ke hisaab se reset hote hain.
