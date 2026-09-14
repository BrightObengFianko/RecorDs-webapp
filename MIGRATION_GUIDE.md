# Google Sheets to PostgreSQL Migration Guide

## Overview

This migration script imports records from your private Google Spreadsheet "KASOA CASES 2026" into your PostgreSQL database. It handles date parsing, phone number formatting, duplicate detection, and provides detailed console output.

## Setup Instructions

### 1. Install Dependencies

Run this command to install the required Google Sheets API package:

```bash
npm install googleapis
```

### 2. Set Up Google Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable the **Google Sheets API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"
4. Create a Service Account:
   - Navigate to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Fill in the details and click "Create and Continue"
   - Skip the optional steps and click "Done"
5. Create a Key:
   - Click on the newly created service account
   - Go to the "Keys" tab
   - Click "Add Key" > "Create new key"
   - Choose "JSON" and click "Create"
   - The JSON file will download automatically
6. Save the JSON file:
   - Rename it to `service-account.json`
   - Place it in your project root directory (next to `package.json`)
   - **Important**: This file is in `.gitignore` and should NEVER be committed

### 3. Share Google Sheet with Service Account

1. Open your Google Spreadsheet "KASOA CASES 2026"
2. Click "Share"
3. Copy the email from your `service-account.json` file (looks like `xxx@yyy.iam.gserviceaccount.com`)
4. Add this email as a viewer to your spreadsheet
5. Click "Share" (no notification needed)

### 4. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and update these values:
   ```
   DB_USER=postgres
   DB_HOST=localhost
   DB_NAME=record_db
   DB_PASSWORD=your_actual_password
   DB_PORT=5432
   GOOGLE_SHEET_ID=YOUR_ACTUAL_SHEET_ID
   DEFAULT_BRANCH_ID=1
   SERVICE_ACCOUNT_PATH=./service-account.json
   ```

   **Where to find GOOGLE_SHEET_ID:**
   - Open your Google Spreadsheet
   - Look at the URL: `https://docs.google.com/spreadsheets/d/{ID_IS_HERE}/edit`
   - Copy that ID

### 5. Run the Migration

```bash
node migrateGoogleSheets.js
```

## Expected Behavior

### Console Output Example

```
🚀 Starting Google Sheets to PostgreSQL Migration
============================================================
✅ Connected to PostgreSQL

📋 Processing sheet: EXPRESS (category: EXPRESS)
  ✅ Read: 45, Inserted: 42, Skipped: 2, Duplicates: 1, Errors: 0

📋 Processing sheet: STANDARD (category: STANDARD)
  ✅ Read: 67, Inserted: 65, Skipped: 1, Duplicates: 1, Errors: 0

[... more sheets ...]

============================================================
📊 MIGRATION SUMMARY
============================================================
Total records read:     450
Successfully inserted:  435 ✅
Skipped:                10
Duplicates found:       5
Errors:                 0
============================================================
✅ Migration completed successfully!
```

## Features

### Date Format Support

The migration script automatically converts various date formats to ISO 8601 (YYYY-MM-DD):

- ✅ `05TH JANUARY 2026`
- ✅ `5th January 2026`
- ✅ `10-10-1988`
- ✅ `10/10/1988`
- ✅ `2026-01-05`

### Phone Number Cleaning

- Removes spaces, `+`, dashes, and parentheses
- Converts Ghana numbers starting with `0` to `233` format:
  - `0501234567` → `233501234567`
- Validates that the result contains only digits

### Duplicate Detection

Records are considered duplicates if they have the same:
- Category
- Name
- Date of Birth
- Phone Number
- Registration Date

Duplicates are logged but NOT re-inserted.

### Date Grouping

The migration handles grouped dates in the spreadsheet. If a registration date appears only on the first row:

```
05TH JANUARY 2026 | JOHN DOE
                 | JANE DOE
                 | MICHAEL DOE
```

It automatically fills down the date for all rows until a new date appears.

### Transactions

Each sheet is processed in a PostgreSQL transaction. If an error occurs:
- All changes for that sheet are rolled back
- The migration continues with the next sheet
- A detailed error message is shown

## Troubleshooting

### Error: "Could not load service-account.json"

**Solution**: 
1. Download your Google Service Account JSON file
2. Save it as `service-account.json` in your project root
3. Ensure the file is not in `.gitignore` (you should exclude it from git, but it needs to exist locally)

### Error: "GOOGLE_SHEET_ID not set in .env"

**Solution**:
1. Copy the spreadsheet ID from the URL
2. Add it to your `.env` file as `GOOGLE_SHEET_ID=your_id_here`

### Error: "Permission denied" or "Sheet not found"

**Solution**:
1. Make sure you've shared the spreadsheet with the service account email
2. Verify the spreadsheet ID is correct
3. Check that sheet tab names exactly match: EXPRESS, STANDARD, M-BIRTH, SEARCH, CORRECTION, DEATH

### Error: "Database connection failed"

**Solution**:
1. Verify PostgreSQL is running
2. Check DB credentials in `.env` file
3. Ensure the database exists: `record_db`
4. Test connection: `psql -U postgres -h localhost -d record_db`

### Records show "Pending" status

If all records are imported with "Pending" status, the STATUS column (F) in the sheet may be empty. Update the sheet with actual statuses: Ready, Not Ready, or Pending.

## Column Mapping Reference

| Google Sheet Column | PostgreSQL Column | Notes |
|---|---|---|
| Sheet Tab Name | category | EXPRESS, STANDARD, M-BIRTH, SEARCH, CORRECTION, or DEATH |
| A - DATE | registration_date | Parsed to YYYY-MM-DD format |
| B - NAME | name | Required; rows without names are skipped |
| C - DATE OF BIRTH | date_of_birth | Optional; parsed to YYYY-MM-DD format |
| D - PHONE | phone_number | Cleaned; Ghana numbers converted to 233 format |
| E - REGISTRAR | registrar | Optional; registrar name |
| F - STATUS | status | Ready, Not Ready, or Pending |
| H - SMS SENT | sms_sent | YES/NO converted to boolean |
| I - SMS SENT DATE | sms_date | Parsed to YYYY-MM-DD format |
| — | id | Auto-generated by PostgreSQL |
| — | created_at | Set to current timestamp |
| — | updated_at | Set to current timestamp |
| — | notes | Set to NULL |
| — | date_of_death | Set to NULL (for Death category if needed) |
| — | branch_id | Set to DEFAULT_BRANCH_ID from .env |

## Running Multiple Times

The script is safe to run multiple times:

- **First run**: Imports all records
- **Second run**: Only new records are imported; duplicates are skipped
- Duplicates are detected and logged but NOT re-inserted

## Best Practices

1. ✅ **Backup your database** before running the migration
   ```bash
   pg_dump -U postgres record_db > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. ✅ **Test with a small subset** first (create a test sheet)

3. ✅ **Review the console output** carefully for any errors or unexpected skips

4. ✅ **Never commit** `service-account.json` or `.env` to version control

5. ✅ **Keep your service account credentials secure** - treat `service-account.json` like a password

## Performance

Migration time depends on the number of records:
- 100 records: ~2-5 seconds
- 500 records: ~10-20 seconds
- 1000+ records: ~30-60 seconds

## Security Notes

- The `service-account.json` file contains credentials and is git-ignored
- Database passwords are stored in `.env` and never committed
- All SQL queries use parameterized statements to prevent SQL injection
- Phone numbers and emails are NOT logged to prevent data leaks

## Support

If you encounter issues:

1. Check the console output for detailed error messages
2. Review the troubleshooting section above
3. Ensure your Google Sheet structure matches the requirements
4. Verify all environment variables are correctly set
5. Check that your PostgreSQL database is accessible

## Next Steps

After successful migration:

1. Verify records in the database:
   ```sql
   SELECT category, COUNT(*) as count FROM records GROUP BY category;
   ```

2. Review any skipped records in the console output

3. Manually verify a few sample records for data accuracy

4. Update any records with "Pending" status if needed

5. Consider running the migration script as part of your deployment process
