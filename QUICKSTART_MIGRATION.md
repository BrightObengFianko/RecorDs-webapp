# Quick Start: Google Sheets Migration

## 1. Install Required Package

```bash
npm install googleapis
```

## 2. Set Up Google Service Account (One-Time Setup)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Enable "Google Sheets API" (APIs & Services > Library > Search "Google Sheets API" > Enable)
4. Create a Service Account (APIs & Services > Credentials > Create Credentials > Service Account)
5. Create a JSON key for the service account
6. Save the JSON file as `service-account.json` in your project root

## 3. Share Your Google Sheet

1. Open your "KASOA CASES 2026" spreadsheet
2. Click Share
3. Add the service account email from `service-account.json` as a viewer
4. Copy the Sheet ID from the URL and save it

## 4. Configure .env

```bash
cp .env.example .env
```

Edit `.env` and add:
```
GOOGLE_SHEET_ID=your_sheet_id_here
DEFAULT_BRANCH_ID=1
SERVICE_ACCOUNT_PATH=./service-account.json
```

## 5. Run Migration

```bash
node migrateGoogleSheets.js
```

## Done!

That's it! The script will:
- ✅ Read all 6 sheets (EXPRESS, STANDARD, M-BIRTH, SEARCH, CORRECTION, DEATH)
- ✅ Parse dates automatically (supports multiple formats)
- ✅ Clean phone numbers (Ghana numbers converted to 233 format)
- ✅ Detect and skip duplicates
- ✅ Show detailed console output
- ✅ Use transactions for data safety

---

For detailed documentation, see **MIGRATION_GUIDE.md**
