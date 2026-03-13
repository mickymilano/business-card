# BizScan Pro - Business Card Scanner PWA

## Product Overview
A mobile-first Progressive Web Application (PWA) for comprehensive contact acquisition and management from business cards.

## Core Architecture

### Data Storage: IndexedDB (Local Storage)
**Implemented in v2.0** - All data is stored locally in the browser using IndexedDB:
- **Pros:**
  - ✅ Data persists across app redeployments
  - ✅ Fast read/write operations
  - ✅ No authentication required
  - ✅ Works offline
  - ✅ Simple implementation
- **Cons:**
  - ⚠️ Data is device/browser specific
  - ⚠️ No cross-device sync
  - ⚠️ Clearing browser data erases everything

### Backend: AI Extraction Only
The FastAPI backend now serves only AI operations:
- `/api/scan` - Single business card OCR extraction
- `/api/scan/batch` - Batch PDF processing (multiple cards per page)
- Uses Anthropic Claude Sonnet 4.5 via Emergent LLM Key

## Features Implemented

### ✅ Project Management
- Create, view, delete projects
- Project-based data organization
- Statistics dashboard (contacts, companies, review, duplicates)

### ✅ Business Card Scanning
- Single card scanning (front + optional back)
- Client-side image compression for performance
- AI-powered OCR extraction with Claude

### ✅ Batch PDF Processing
- Upload PDF with multiple business cards per page
- Automatic page-by-page extraction
- Progress tracking

### ✅ Excel/CSV Import
- Client-side file parsing with XLSX library
- Column mapping interface
- Auto-suggestion for common field names

### ✅ Contact Management
- Full CRUD operations
- Search and filter
- Edit contact details
- Delete contacts permanently

### ✅ Company Management
- Automatic company extraction from cards
- Company list view

### ✅ Review Queue
- Contacts with low confidence flagged for review
- Approve or reject actions
- Bulk operations

### ✅ Duplicate Detection
- Contacts flagged as potential duplicates
- Keep (remove flag) or Delete options
- Permanent deletion from database

### ✅ Export
- CSV export of contacts
- CSV export of companies

### ✅ Backup & Sync (NEW)
- Full backup export to JSON file
- Import backup from JSON file
- Merge mode option (add to existing or replace)
- Instructions for transferring between devices
- Italian UI for backup page

### ✅ Settings
- API key configuration (optional, uses Emergent key by default)
- Claude model selection
- AI feature toggles
- Local storage info display
- Link to Backup & Sync page

## Technical Stack

### Frontend
- React 18
- Tailwind CSS
- Shadcn/UI components
- Framer Motion animations
- XLSX library for Excel parsing
- IndexedDB for data storage

### Backend
- FastAPI (Python)
- emergentintegrations for Claude AI
- PyMuPDF for PDF processing
- Pillow for image processing

## Database Schema (IndexedDB)

### Projects Store
```javascript
{
  id: string,
  name: string,
  notes: string,
  created_at: string,
  updated_at: string
}
```

### Contacts Store
```javascript
{
  id: string,
  project_id: string,
  first_name: string,
  last_name: string,
  full_name: string,
  job_title: string,
  department: string,
  mobile_phone: string,
  primary_email: string,
  company_name_display: string,
  address: string,
  postal_code: string,
  country: string,
  confidence_score: number,
  review_status: 'pending' | 'needs_review' | 'approved',
  duplicate_status: 'none' | 'potential_duplicate',
  import_source_type: string,
  // ... more fields
}
```

### Companies Store
```javascript
{
  id: string,
  project_id: string,
  legal_company_name: string,
  brand_name: string,
  company_display_name: string,
  website: string,
  // ... more fields
}
```

### Settings Store
Key-value pairs for app configuration.

## API Endpoints

### Backend (AI Only)
- `GET /api/` - Health check
- `GET /api/health` - Health status
- `POST /api/scan` - Single card extraction
- `POST /api/scan/batch` - Batch PDF extraction

## File Structure
```
/app
├── backend/
│   ├── server.py       # FastAPI - AI extraction only
│   ├── requirements.txt
│   └── .env
└── frontend/
    ├── src/
    │   ├── services/
    │   │   └── db.js   # IndexedDB service
    │   ├── pages/      # All page components
    │   ├── components/ # Shadcn/UI components
    │   └── App.js
    ├── package.json
    └── .env
```

## Changelog

### v2.0.0 (March 2026)
- **MAJOR CHANGE:** Migrated from MongoDB/Google Sheets to IndexedDB
- All data now stored locally in browser
- Backend simplified to AI extraction only
- Frontend handles all CRUD operations
- Excel import handled client-side with XLSX library
- **NEW:** PWA icon "ES" (blue background, white letters)
- **NEW:** Backup & Sync feature for data transfer between devices
- **NEW:** Full backup export/import with JSON files
- Apple touch icon and PWA manifest configured

### v1.0.0 (Previous)
- Initial implementation with MongoDB backend
- Google Sheets migration (incomplete)

## Known Limitations
1. Data is browser/device specific - no sync between devices
2. Clearing browser data will erase all data
3. No user authentication (all data is local)

## Future Enhancements (Backlog)
- P2: Optional cloud sync (Google Drive/Sheets)
- P2: Data backup/restore functionality
- P2: Cross-device sync option
- P3: PWA install prompt
- P3: Offline scan queue
