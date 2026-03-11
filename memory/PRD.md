# BizScan Pro - Product Requirements Document

## Original Problem Statement
Build a mobile-first web application (PWA) optimized for iPhone and iPad Safari, designed to scan business cards, import Excel files, consolidate contacts and companies, validate data quality, detect duplicates, and continuously update a master Excel workbook ready for CRM import.

## Architecture
- **Frontend**: React 19 + shadcn/ui + Tailwind CSS + Framer Motion
- **Backend**: FastAPI (Python 3.11) + Motor (async MongoDB)
- **AI**: Claude Sonnet 4.5 via Emergent LLM Key
- **Database**: MongoDB

## User Personas
1. **Business Professionals**: Sales reps, networkers collecting cards at events
2. **Event Attendees**: Conference goers needing quick card digitization
3. **CRM Admins**: Need clean, validated data for import

## Core Requirements (Static)
- PWA installable from browser
- Mobile-first design (iPhone/iPad Safari optimized)
- Camera capture and file upload for business cards
- Excel/CSV import with column mapping
- Claude AI-powered OCR and extraction
- Contact and company data validation
- Duplicate detection and merge
- Master Excel workbook export

## What's Been Implemented (v1.0 - March 11, 2026)

### Backend API
- [x] Project CRUD (`/api/projects`)
- [x] Contact CRUD (`/api/projects/{id}/contacts`)
- [x] Company CRUD (`/api/projects/{id}/companies`)
- [x] Business card scanning (`/api/projects/{id}/scan`)
- [x] Excel/CSV import with preview and column mapping
- [x] Duplicate detection
- [x] Review queue management
- [x] Export to XLSX/CSV (`/api/projects/{id}/export`)
- [x] Settings API with Claude connection test

### Frontend Pages
- [x] Projects list page
- [x] Project detail dashboard
- [x] Scan page (camera/upload)
- [x] Import page (3-step wizard)
- [x] Contacts list and detail
- [x] Companies list
- [x] Review queue
- [x] Duplicates management
- [x] Export page
- [x] Settings page (API key, model, toggles)

### AI Integration
- [x] Claude Sonnet 4.5 for OCR
- [x] Structured data extraction
- [x] Contact validation
- [x] Connection testing

## Prioritized Backlog

### P0 (Critical) - DONE
- ✅ Project-based workflow
- ✅ Single card scanning
- ✅ Excel/CSV import
- ✅ Claude-based extraction
- ✅ Basic duplicate detection
- ✅ Export functionality

### P1 (Important) - Future
- [ ] Front/back card linking (partially implemented)
- [ ] Multiple cards in one image detection
- [ ] Enhanced duplicate merging UI
- [ ] Batch operations on contacts
- [ ] Company enrichment

### P2 (Nice to Have) - Future
- [ ] Google Maps integration for address validation
- [ ] LinkedIn profile enrichment
- [ ] Multi-user support with authentication
- [ ] Dark mode toggle
- [ ] Offline PWA support with sync

## Next Tasks
1. Test business card scanning with real cards
2. Implement multiple cards detection from single image
3. Add batch approve/reject in review queue
4. Enhance duplicate merge interface
5. Add company deduplication

## Technical Notes
- Emergent LLM Key: `sk-emergent-4De6525E247Ae5eEb9`
- Default model: `claude-sonnet-4-5-20250929`
- MongoDB collections: projects, contacts, companies, settings, import_logs, ai_audits
