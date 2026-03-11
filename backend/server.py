from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import base64
import json
import io
from openpyxl import Workbook, load_workbook
from openpyxl.utils.dataframe import dataframe_to_rows
import pandas as pd
import csv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ===================
# MODELS
# ===================

class ProjectCreate(BaseModel):
    name: str
    notes: Optional[str] = ""

class ProjectResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    created_at: str
    updated_at: str
    notes: str
    contact_count: int = 0
    company_count: int = 0

class ContactCreate(BaseModel):
    project_id: str
    first_name: Optional[str] = ""
    middle_name: Optional[str] = ""
    last_name: Optional[str] = ""
    full_name: Optional[str] = ""
    full_name_original: Optional[str] = ""
    job_title: Optional[str] = ""
    department: Optional[str] = ""
    mobile_phone: Optional[str] = ""
    direct_phone: Optional[str] = ""
    office_phone: Optional[str] = ""
    primary_email: Optional[str] = ""
    secondary_email: Optional[str] = ""
    linkedin_url: Optional[str] = ""
    personal_website: Optional[str] = ""
    company_id: Optional[str] = ""
    company_name_display: Optional[str] = ""
    brand_name: Optional[str] = ""
    legal_company_name: Optional[str] = ""
    import_source_type: Optional[str] = ""
    import_source_file: Optional[str] = ""
    source_image_front: Optional[str] = ""
    source_image_back: Optional[str] = ""
    confidence_score: Optional[float] = 0.0
    validation_status: Optional[str] = "pending"
    review_status: Optional[str] = "pending"
    duplicate_status: Optional[str] = "none"
    ai_notes: Optional[str] = ""
    notes: Optional[str] = ""

class ContactResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    project_id: str
    first_name: str
    middle_name: str
    last_name: str
    full_name: str
    full_name_original: str
    job_title: str
    department: str
    mobile_phone: str
    direct_phone: str
    office_phone: str
    primary_email: str
    secondary_email: str
    linkedin_url: str
    personal_website: str
    company_id: str
    company_name_display: str
    brand_name: str
    legal_company_name: str
    import_source_type: str
    import_source_file: str
    source_image_front: str
    source_image_back: str
    confidence_score: float
    validation_status: str
    review_status: str
    duplicate_status: str
    ai_notes: str
    notes: str
    created_at: str
    updated_at: str

class CompanyCreate(BaseModel):
    project_id: str
    legal_company_name: Optional[str] = ""
    brand_name: Optional[str] = ""
    company_display_name: Optional[str] = ""
    website: Optional[str] = ""
    main_phone: Optional[str] = ""
    main_email: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    postal_code: Optional[str] = ""
    province_region: Optional[str] = ""
    country: Optional[str] = ""
    industry: Optional[str] = ""
    legal_name_confidence: Optional[float] = 0.0
    brand_name_confidence: Optional[float] = 0.0
    validation_status: Optional[str] = "pending"
    enrichment_notes: Optional[str] = ""
    notes: Optional[str] = ""

class CompanyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    project_id: str
    legal_company_name: str
    brand_name: str
    company_display_name: str
    website: str
    main_phone: str
    main_email: str
    address: str
    city: str
    postal_code: str
    province_region: str
    country: str
    industry: str
    legal_name_confidence: float
    brand_name_confidence: float
    validation_status: str
    enrichment_notes: str
    notes: str
    created_at: str
    updated_at: str

class SettingsUpdate(BaseModel):
    anthropic_api_key: Optional[str] = None
    claude_model: Optional[str] = "claude-sonnet-4-5-20250929"
    ai_enabled: Optional[bool] = True
    ai_ocr_enabled: Optional[bool] = True
    ai_validation_enabled: Optional[bool] = True
    ai_duplicate_enabled: Optional[bool] = True

class SettingsResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    anthropic_api_key: str
    claude_model: str
    ai_enabled: bool
    ai_ocr_enabled: bool
    ai_validation_enabled: bool
    ai_duplicate_enabled: bool
    connection_status: str

class ScanRequest(BaseModel):
    project_id: str
    image_front: str  # base64 encoded
    image_back: Optional[str] = None  # base64 encoded
    multiple_cards: Optional[bool] = False

class ImportMappingRequest(BaseModel):
    project_id: str
    file_content: str  # base64 encoded
    file_type: str  # xlsx, xls, csv
    column_mapping: Dict[str, str]  # source_column -> target_field

class DuplicateGroup(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    project_id: str
    record_type: str
    candidate_ids: List[str]
    duplicate_reason: str
    confidence_score: float
    decision_status: str
    decided_by: str
    decision_datetime: str

# ===================
# HELPER FUNCTIONS
# ===================

def get_api_key():
    """Get API key - prefer stored key, fallback to emergent key"""
    return os.environ.get('EMERGENT_LLM_KEY', '')

async def get_settings():
    """Get current settings from DB or return defaults"""
    settings = await db.settings.find_one({}, {"_id": 0})
    if not settings:
        settings = {
            "anthropic_api_key": "",
            "claude_model": "claude-sonnet-4-5-20250929",
            "ai_enabled": True,
            "ai_ocr_enabled": True,
            "ai_validation_enabled": True,
            "ai_duplicate_enabled": True,
            "connection_status": "not_tested"
        }
    return settings

async def extract_business_card_data(image_base64: str, image_back_base64: Optional[str] = None) -> Dict[str, Any]:
    """Extract data from business card image using Claude"""
    settings = await get_settings()
    api_key = settings.get('anthropic_api_key') or get_api_key()
    model = settings.get('claude_model', 'claude-sonnet-4-5-20250929')
    
    if not api_key:
        raise HTTPException(status_code=400, detail="No API key configured")
    
    system_prompt = """You are an expert at reading and extracting structured data from business cards.
    Extract all visible information and return it as a JSON object with these fields:
    - first_name, middle_name, last_name, full_name_original
    - job_title, department
    - mobile_phone, direct_phone, office_phone
    - primary_email, secondary_email
    - linkedin_url, personal_website
    - company_name_display (the name shown on card)
    - brand_name (commercial/trading name if different)
    - legal_company_name (legal entity name if visible, otherwise empty)
    - address, city, postal_code, province_region, country
    - industry (infer if possible)
    - confidence_score (0-100, your confidence in extraction accuracy)
    - ai_notes (any observations, uncertainties, or quality issues)
    
    Important rules:
    1. Distinguish between brand name and legal company name
    2. Identify all phone numbers and categorize them
    3. Detect email addresses carefully
    4. Note any extraction uncertainties in ai_notes
    5. Support any language on the card
    6. Return ONLY valid JSON, no markdown formatting"""
    
    chat = LlmChat(
        api_key=api_key,
        session_id=f"scan-{str(uuid.uuid4())}",
        system_message=system_prompt
    ).with_model("anthropic", model)
    
    # Build message with image(s)
    images = [ImageContent(image_base64=image_base64)]
    prompt = "Extract all contact and company information from this business card image. Return the data as a valid JSON object."
    
    if image_back_base64:
        images.append(ImageContent(image_base64=image_back_base64))
        prompt = "Extract all contact and company information from both sides of this business card. The first image is the front, the second is the back. Combine all information into a single JSON object."
    
    user_message = UserMessage(
        text=prompt,
        file_contents=images
    )
    
    try:
        response = await chat.send_message(user_message)
        # Parse JSON from response
        response_text = response.strip()
        # Remove markdown code blocks if present
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        response_text = response_text.strip()
        
        extracted_data = json.loads(response_text)
        return extracted_data
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Claude response: {e}")
        return {
            "confidence_score": 0,
            "ai_notes": f"Failed to parse extraction result: {str(e)}",
            "validation_status": "error"
        }
    except Exception as e:
        logger.error(f"Claude API error: {e}")
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {str(e)}")

async def validate_contact_data(contact_data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate extracted contact data using Claude"""
    settings = await get_settings()
    if not settings.get('ai_validation_enabled', True):
        return {"validation_status": "skipped", "ai_notes": "AI validation disabled"}
    
    api_key = settings.get('anthropic_api_key') or get_api_key()
    model = settings.get('claude_model', 'claude-sonnet-4-5-20250929')
    
    if not api_key:
        return {"validation_status": "skipped", "ai_notes": "No API key"}
    
    system_prompt = """You are a data validation expert. Review the contact data and check for:
    1. Job title mistakenly extracted as person name
    2. City or address extracted as surname
    3. Invalid email format
    4. Invalid or malformed phone numbers
    5. Invalid LinkedIn URL format
    6. Mismatch between email domain and website
    7. Confusion between brand and legal company name
    
    Return a JSON object with:
    - validation_status: "valid", "needs_review", or "invalid"
    - issues: list of detected issues
    - suggestions: list of suggested corrections
    - confidence_score: 0-100
    Return ONLY valid JSON."""
    
    chat = LlmChat(
        api_key=api_key,
        session_id=f"validate-{str(uuid.uuid4())}",
        system_message=system_prompt
    ).with_model("anthropic", model)
    
    user_message = UserMessage(
        text=f"Validate this contact data and check for plausibility issues:\n{json.dumps(contact_data, indent=2)}"
    )
    
    try:
        response = await chat.send_message(user_message)
        response_text = response.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        response_text = response_text.strip()
        return json.loads(response_text)
    except Exception as e:
        logger.error(f"Validation error: {e}")
        return {"validation_status": "error", "ai_notes": str(e)}

async def detect_duplicates(project_id: str, contact_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Find potential duplicates for a contact"""
    duplicates = []
    
    # Primary rule: same first + last + mobile
    if contact_data.get('first_name') and contact_data.get('last_name') and contact_data.get('mobile_phone'):
        cursor = db.contacts.find({
            "project_id": project_id,
            "first_name": contact_data['first_name'],
            "last_name": contact_data['last_name'],
            "mobile_phone": contact_data['mobile_phone']
        }, {"_id": 0})
        async for doc in cursor:
            duplicates.append({"match": doc, "reason": "same_name_mobile", "confidence": 95})
    
    # Secondary: same first + last + email
    if contact_data.get('first_name') and contact_data.get('last_name') and contact_data.get('primary_email'):
        cursor = db.contacts.find({
            "project_id": project_id,
            "first_name": contact_data['first_name'],
            "last_name": contact_data['last_name'],
            "primary_email": contact_data['primary_email']
        }, {"_id": 0})
        async for doc in cursor:
            if doc.get('id') not in [d['match'].get('id') for d in duplicates]:
                duplicates.append({"match": doc, "reason": "same_name_email", "confidence": 90})
    
    # LinkedIn match
    if contact_data.get('linkedin_url'):
        cursor = db.contacts.find({
            "project_id": project_id,
            "linkedin_url": contact_data['linkedin_url']
        }, {"_id": 0})
        async for doc in cursor:
            if doc.get('id') not in [d['match'].get('id') for d in duplicates]:
                duplicates.append({"match": doc, "reason": "same_linkedin", "confidence": 95})
    
    return duplicates

def generate_excel_workbook(project: Dict, contacts: List[Dict], companies: List[Dict], 
                           import_logs: List[Dict], duplicates: List[Dict], ai_audits: List[Dict]) -> io.BytesIO:
    """Generate master Excel workbook for a project"""
    wb = Workbook()
    
    # Projects sheet
    ws_projects = wb.active
    ws_projects.title = "Projects"
    ws_projects.append(["project_id", "project_name", "created_date", "created_time", "last_updated_date", "last_updated_time", "notes"])
    created = datetime.fromisoformat(project['created_at'].replace('Z', '+00:00')) if isinstance(project['created_at'], str) else project['created_at']
    updated = datetime.fromisoformat(project['updated_at'].replace('Z', '+00:00')) if isinstance(project['updated_at'], str) else project['updated_at']
    ws_projects.append([
        project['id'], project['name'],
        created.strftime('%Y-%m-%d'), created.strftime('%H:%M:%S'),
        updated.strftime('%Y-%m-%d'), updated.strftime('%H:%M:%S'),
        project.get('notes', '')
    ])
    
    # Contacts sheet
    ws_contacts = wb.create_sheet("Contacts")
    contact_headers = ["contact_id", "project_id", "first_name", "middle_name", "last_name", "full_name", 
                       "full_name_original", "job_title", "department", "mobile_phone", "direct_phone",
                       "office_phone", "primary_email", "secondary_email", "linkedin_url", "personal_website",
                       "company_id", "company_name_display", "brand_name", "legal_company_name",
                       "import_source_type", "import_source_file", "source_image_front", "source_image_back",
                       "confidence_score", "validation_status", "review_status", "duplicate_status",
                       "ai_notes", "created_at", "updated_at", "notes"]
    ws_contacts.append(contact_headers)
    for c in contacts:
        ws_contacts.append([c.get(h.replace('contact_id', 'id'), '') for h in contact_headers])
    
    # Companies sheet
    ws_companies = wb.create_sheet("Companies")
    company_headers = ["company_id", "project_id", "legal_company_name", "brand_name", "company_display_name",
                       "website", "main_phone", "main_email", "address", "city", "postal_code",
                       "province_region", "country", "industry", "legal_name_confidence", "brand_name_confidence",
                       "validation_status", "enrichment_notes", "created_at", "updated_at", "notes"]
    ws_companies.append(company_headers)
    for c in companies:
        ws_companies.append([c.get(h.replace('company_id', 'id'), '') for h in company_headers])
    
    # Import_Log sheet
    ws_import = wb.create_sheet("Import_Log")
    import_headers = ["batch_id", "project_id", "source_type", "file_name", "import_datetime",
                      "rows_imported", "rows_created", "rows_merged", "rows_flagged", "errors"]
    ws_import.append(import_headers)
    for log in import_logs:
        ws_import.append([log.get(h, '') for h in import_headers])
    
    # Duplicates_Review sheet
    ws_duplicates = wb.create_sheet("Duplicates_Review")
    dup_headers = ["duplicate_group_id", "project_id", "record_type", "candidate_record_ids",
                   "duplicate_reason", "confidence_score", "decision_status", "decided_by", "decision_datetime"]
    ws_duplicates.append(dup_headers)
    for d in duplicates:
        row = [d.get(h, '') for h in dup_headers]
        row[3] = ','.join(d.get('candidate_ids', []))  # Convert list to string
        ws_duplicates.append(row)
    
    # AI_Audit sheet
    ws_audit = wb.create_sheet("AI_Audit")
    audit_headers = ["record_id", "record_type", "task_type", "claude_model",
                     "confidence_score", "ai_notes", "manual_override", "timestamp"]
    ws_audit.append(audit_headers)
    for a in ai_audits:
        ws_audit.append([a.get(h, '') for h in audit_headers])
    
    # Save to BytesIO
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output

# ===================
# API ROUTES
# ===================

@api_router.get("/")
async def root():
    return {"message": "BizScan Pro API", "version": "1.0.0"}

# --- Settings ---
@api_router.get("/settings", response_model=SettingsResponse)
async def get_settings_endpoint():
    settings = await get_settings()
    return SettingsResponse(**settings)

@api_router.post("/settings", response_model=SettingsResponse)
async def update_settings(settings: SettingsUpdate):
    current = await get_settings()
    update_data = settings.model_dump(exclude_unset=True)
    current.update(update_data)
    current['connection_status'] = 'not_tested'
    
    await db.settings.update_one({}, {"$set": current}, upsert=True)
    return SettingsResponse(**current)

@api_router.post("/settings/test-connection")
async def test_connection():
    """Test Claude API connection"""
    settings = await get_settings()
    api_key = settings.get('anthropic_api_key') or get_api_key()
    model = settings.get('claude_model', 'claude-sonnet-4-5-20250929')
    
    if not api_key:
        return {"status": "error", "message": "No API key configured"}
    
    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"test-{str(uuid.uuid4())}",
            system_message="You are a test assistant."
        ).with_model("anthropic", model)
        
        response = await chat.send_message(UserMessage(text="Say 'Connection successful!' and nothing else."))
        
        await db.settings.update_one({}, {"$set": {"connection_status": "connected"}}, upsert=True)
        return {"status": "success", "message": response.strip(), "model": model}
    except Exception as e:
        await db.settings.update_one({}, {"$set": {"connection_status": "error"}}, upsert=True)
        return {"status": "error", "message": str(e)}

# --- Projects ---
@api_router.get("/projects", response_model=List[ProjectResponse])
async def get_projects():
    projects = await db.projects.find({}, {"_id": 0}).to_list(1000)
    
    # Get counts for each project
    for p in projects:
        p['contact_count'] = await db.contacts.count_documents({"project_id": p['id']})
        p['company_count'] = await db.companies.count_documents({"project_id": p['id']})
    
    return projects

@api_router.post("/projects", response_model=ProjectResponse)
async def create_project(project: ProjectCreate):
    now = datetime.now(timezone.utc).isoformat()
    project_doc = {
        "id": str(uuid.uuid4()),
        "name": project.name,
        "notes": project.notes or "",
        "created_at": now,
        "updated_at": now
    }
    await db.projects.insert_one(project_doc)
    project_doc.pop('_id', None)
    project_doc['contact_count'] = 0
    project_doc['company_count'] = 0
    return project_doc

@api_router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str):
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project['contact_count'] = await db.contacts.count_documents({"project_id": project_id})
    project['company_count'] = await db.companies.count_documents({"project_id": project_id})
    return project

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    result = await db.projects.delete_one({"id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    # Clean up related data
    await db.contacts.delete_many({"project_id": project_id})
    await db.companies.delete_many({"project_id": project_id})
    await db.import_logs.delete_many({"project_id": project_id})
    await db.duplicates.delete_many({"project_id": project_id})
    return {"message": "Project deleted"}

# --- Contacts ---
@api_router.get("/projects/{project_id}/contacts", response_model=List[ContactResponse])
async def get_contacts(project_id: str, review_status: Optional[str] = None):
    query = {"project_id": project_id}
    if review_status:
        query["review_status"] = review_status
    contacts = await db.contacts.find(query, {"_id": 0}).to_list(10000)
    return contacts

@api_router.post("/projects/{project_id}/contacts", response_model=ContactResponse)
async def create_contact(project_id: str, contact: ContactCreate):
    now = datetime.now(timezone.utc).isoformat()
    contact_doc = contact.model_dump()
    contact_doc['id'] = str(uuid.uuid4())
    contact_doc['project_id'] = project_id
    contact_doc['created_at'] = now
    contact_doc['updated_at'] = now
    
    # Set defaults for empty strings
    for key in contact_doc:
        if contact_doc[key] is None:
            contact_doc[key] = ""
    
    await db.contacts.insert_one(contact_doc)
    contact_doc.pop('_id', None)
    
    # Update project timestamp
    await db.projects.update_one({"id": project_id}, {"$set": {"updated_at": now}})
    
    return contact_doc

@api_router.get("/projects/{project_id}/contacts/{contact_id}", response_model=ContactResponse)
async def get_contact(project_id: str, contact_id: str):
    contact = await db.contacts.find_one({"id": contact_id, "project_id": project_id}, {"_id": 0})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact

@api_router.put("/projects/{project_id}/contacts/{contact_id}", response_model=ContactResponse)
async def update_contact(project_id: str, contact_id: str, contact: ContactCreate):
    now = datetime.now(timezone.utc).isoformat()
    update_data = contact.model_dump(exclude_unset=True)
    update_data['updated_at'] = now
    
    result = await db.contacts.update_one(
        {"id": contact_id, "project_id": project_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    updated = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    await db.projects.update_one({"id": project_id}, {"$set": {"updated_at": now}})
    return updated

@api_router.delete("/projects/{project_id}/contacts/{contact_id}")
async def delete_contact(project_id: str, contact_id: str):
    result = await db.contacts.delete_one({"id": contact_id, "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"message": "Contact deleted"}

# --- Companies ---
@api_router.get("/projects/{project_id}/companies", response_model=List[CompanyResponse])
async def get_companies(project_id: str):
    companies = await db.companies.find({"project_id": project_id}, {"_id": 0}).to_list(10000)
    return companies

@api_router.post("/projects/{project_id}/companies", response_model=CompanyResponse)
async def create_company(project_id: str, company: CompanyCreate):
    now = datetime.now(timezone.utc).isoformat()
    company_doc = company.model_dump()
    company_doc['id'] = str(uuid.uuid4())
    company_doc['project_id'] = project_id
    company_doc['created_at'] = now
    company_doc['updated_at'] = now
    
    for key in company_doc:
        if company_doc[key] is None:
            company_doc[key] = ""
    
    await db.companies.insert_one(company_doc)
    company_doc.pop('_id', None)
    
    await db.projects.update_one({"id": project_id}, {"$set": {"updated_at": now}})
    return company_doc

@api_router.put("/projects/{project_id}/companies/{company_id}", response_model=CompanyResponse)
async def update_company(project_id: str, company_id: str, company: CompanyCreate):
    now = datetime.now(timezone.utc).isoformat()
    update_data = company.model_dump(exclude_unset=True)
    update_data['updated_at'] = now
    
    result = await db.companies.update_one(
        {"id": company_id, "project_id": project_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Company not found")
    
    updated = await db.companies.find_one({"id": company_id}, {"_id": 0})
    return updated

@api_router.delete("/projects/{project_id}/companies/{company_id}")
async def delete_company(project_id: str, company_id: str):
    result = await db.companies.delete_one({"id": company_id, "project_id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Company not found")
    return {"message": "Company deleted"}

# --- Scanning ---
@api_router.post("/projects/{project_id}/scan")
async def scan_business_card(project_id: str, scan: ScanRequest):
    """Scan a business card and extract contact data"""
    # Verify project exists
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Extract data using Claude
    extracted_data = await extract_business_card_data(scan.image_front, scan.image_back)
    
    # Validate the extracted data
    validation_result = await validate_contact_data(extracted_data)
    
    # Check for duplicates
    duplicates = await detect_duplicates(project_id, extracted_data)
    
    # Prepare contact data
    now = datetime.now(timezone.utc).isoformat()
    contact_doc = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "first_name": extracted_data.get('first_name', ''),
        "middle_name": extracted_data.get('middle_name', ''),
        "last_name": extracted_data.get('last_name', ''),
        "full_name": f"{extracted_data.get('first_name', '')} {extracted_data.get('last_name', '')}".strip(),
        "full_name_original": extracted_data.get('full_name_original', ''),
        "job_title": extracted_data.get('job_title', ''),
        "department": extracted_data.get('department', ''),
        "mobile_phone": extracted_data.get('mobile_phone', ''),
        "direct_phone": extracted_data.get('direct_phone', ''),
        "office_phone": extracted_data.get('office_phone', ''),
        "primary_email": extracted_data.get('primary_email', ''),
        "secondary_email": extracted_data.get('secondary_email', ''),
        "linkedin_url": extracted_data.get('linkedin_url', ''),
        "personal_website": extracted_data.get('personal_website', ''),
        "company_id": "",
        "company_name_display": extracted_data.get('company_name_display', ''),
        "brand_name": extracted_data.get('brand_name', ''),
        "legal_company_name": extracted_data.get('legal_company_name', ''),
        "import_source_type": "scan",
        "import_source_file": "",
        "source_image_front": scan.image_front[:100] + "..." if len(scan.image_front) > 100 else scan.image_front,
        "source_image_back": (scan.image_back[:100] + "..." if scan.image_back and len(scan.image_back) > 100 else (scan.image_back or "")),
        "confidence_score": extracted_data.get('confidence_score', 0),
        "validation_status": validation_result.get('validation_status', 'pending'),
        "review_status": "needs_review" if extracted_data.get('confidence_score', 0) < 80 else "approved",
        "duplicate_status": "potential_duplicate" if duplicates else "none",
        "ai_notes": extracted_data.get('ai_notes', '') + "\n" + validation_result.get('ai_notes', ''),
        "notes": "",
        "created_at": now,
        "updated_at": now
    }
    
    # Save contact
    await db.contacts.insert_one(contact_doc)
    contact_doc.pop('_id', None)
    
    # Create or update company if company info exists
    company_doc = None
    if extracted_data.get('company_name_display') or extracted_data.get('brand_name'):
        company_doc = {
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "legal_company_name": extracted_data.get('legal_company_name', ''),
            "brand_name": extracted_data.get('brand_name', ''),
            "company_display_name": extracted_data.get('company_name_display', ''),
            "website": extracted_data.get('website', ''),
            "main_phone": extracted_data.get('office_phone', ''),
            "main_email": "",
            "address": extracted_data.get('address', ''),
            "city": extracted_data.get('city', ''),
            "postal_code": extracted_data.get('postal_code', ''),
            "province_region": extracted_data.get('province_region', ''),
            "country": extracted_data.get('country', ''),
            "industry": extracted_data.get('industry', ''),
            "legal_name_confidence": 50 if extracted_data.get('legal_company_name') else 0,
            "brand_name_confidence": 80 if extracted_data.get('brand_name') else 0,
            "validation_status": "pending",
            "enrichment_notes": "",
            "notes": "",
            "created_at": now,
            "updated_at": now
        }
        await db.companies.insert_one(company_doc)
        company_doc.pop('_id', None)
        
        # Link contact to company
        await db.contacts.update_one({"id": contact_doc['id']}, {"$set": {"company_id": company_doc['id']}})
        contact_doc['company_id'] = company_doc['id']
    
    # Log AI audit
    await db.ai_audits.insert_one({
        "record_id": contact_doc['id'],
        "record_type": "contact",
        "task_type": "scan_extraction",
        "claude_model": (await get_settings()).get('claude_model', 'claude-sonnet-4-5-20250929'),
        "confidence_score": extracted_data.get('confidence_score', 0),
        "ai_notes": extracted_data.get('ai_notes', ''),
        "manual_override": False,
        "timestamp": now
    })
    
    # Update project timestamp
    await db.projects.update_one({"id": project_id}, {"$set": {"updated_at": now}})
    
    return {
        "contact": contact_doc,
        "company": company_doc,
        "validation": validation_result,
        "duplicates": duplicates,
        "extracted_data": extracted_data
    }

# --- Import ---
@api_router.post("/projects/{project_id}/import/preview")
async def preview_import(project_id: str, file: UploadFile = File(...)):
    """Preview an Excel/CSV file before importing"""
    content = await file.read()
    filename = file.filename.lower()
    
    try:
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith('.xlsx'):
            df = pd.read_excel(io.BytesIO(content), engine='openpyxl')
        elif filename.endswith('.xls'):
            df = pd.read_excel(io.BytesIO(content), engine='xlrd')
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Use CSV, XLSX, or XLS.")
        
        # Get column names and sample data
        columns = df.columns.tolist()
        sample_rows = df.head(5).fillna('').to_dict('records')
        row_count = len(df)
        
        # Suggested mappings
        target_fields = [
            "first_name", "middle_name", "last_name", "full_name", "job_title", 
            "department", "mobile_phone", "direct_phone", "office_phone",
            "primary_email", "secondary_email", "linkedin_url", "personal_website",
            "company_name_display", "brand_name", "legal_company_name",
            "address", "city", "postal_code", "province_region", "country", "notes"
        ]
        
        # Auto-suggest mappings
        suggested_mappings = {}
        for col in columns:
            col_lower = col.lower().replace(' ', '_').replace('-', '_')
            for field in target_fields:
                if field in col_lower or col_lower in field:
                    suggested_mappings[col] = field
                    break
            # Common variations
            if 'email' in col_lower and col not in suggested_mappings:
                suggested_mappings[col] = 'primary_email'
            if 'phone' in col_lower and 'mobile' in col_lower and col not in suggested_mappings:
                suggested_mappings[col] = 'mobile_phone'
            if 'phone' in col_lower and col not in suggested_mappings:
                suggested_mappings[col] = 'office_phone'
            if 'company' in col_lower and col not in suggested_mappings:
                suggested_mappings[col] = 'company_name_display'
        
        return {
            "filename": file.filename,
            "columns": columns,
            "sample_rows": sample_rows,
            "row_count": row_count,
            "suggested_mappings": suggested_mappings,
            "target_fields": target_fields
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

@api_router.post("/projects/{project_id}/import")
async def import_file(
    project_id: str,
    file: UploadFile = File(...),
    column_mapping: str = Form(...)
):
    """Import an Excel/CSV file with column mapping"""
    # Verify project exists
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    content = await file.read()
    filename = file.filename.lower()
    mapping = json.loads(column_mapping)
    
    try:
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith('.xlsx'):
            df = pd.read_excel(io.BytesIO(content), engine='openpyxl')
        elif filename.endswith('.xls'):
            df = pd.read_excel(io.BytesIO(content), engine='xlrd')
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")
        
        now = datetime.now(timezone.utc).isoformat()
        batch_id = str(uuid.uuid4())
        rows_imported = 0
        rows_created = 0
        rows_merged = 0
        rows_flagged = 0
        errors = []
        
        for _, row in df.iterrows():
            try:
                # Map columns to contact fields
                contact_data = {
                    "id": str(uuid.uuid4()),
                    "project_id": project_id,
                    "import_source_type": "excel_import",
                    "import_source_file": file.filename,
                    "source_image_front": "",
                    "source_image_back": "",
                    "confidence_score": 100,
                    "validation_status": "imported",
                    "review_status": "pending",
                    "duplicate_status": "none",
                    "ai_notes": "",
                    "notes": "",
                    "created_at": now,
                    "updated_at": now
                }
                
                # Apply mapping
                for source_col, target_field in mapping.items():
                    if source_col in row.index and target_field:
                        value = row[source_col]
                        if pd.notna(value):
                            contact_data[target_field] = str(value)
                
                # Set defaults for missing fields
                for field in ["first_name", "middle_name", "last_name", "full_name", "full_name_original",
                              "job_title", "department", "mobile_phone", "direct_phone", "office_phone",
                              "primary_email", "secondary_email", "linkedin_url", "personal_website",
                              "company_id", "company_name_display", "brand_name", "legal_company_name"]:
                    if field not in contact_data:
                        contact_data[field] = ""
                
                # Generate full_name if not provided
                if not contact_data.get('full_name') and (contact_data.get('first_name') or contact_data.get('last_name')):
                    contact_data['full_name'] = f"{contact_data.get('first_name', '')} {contact_data.get('last_name', '')}".strip()
                
                # Check for duplicates
                duplicates = await detect_duplicates(project_id, contact_data)
                if duplicates:
                    contact_data['duplicate_status'] = 'potential_duplicate'
                    contact_data['review_status'] = 'needs_review'
                    rows_flagged += 1
                
                # Save contact
                await db.contacts.insert_one(contact_data)
                rows_created += 1
                rows_imported += 1
                
            except Exception as e:
                errors.append(f"Row {rows_imported + 1}: {str(e)}")
        
        # Log import
        import_log = {
            "batch_id": batch_id,
            "project_id": project_id,
            "source_type": "excel_import",
            "file_name": file.filename,
            "import_datetime": now,
            "rows_imported": rows_imported,
            "rows_created": rows_created,
            "rows_merged": rows_merged,
            "rows_flagged": rows_flagged,
            "errors": json.dumps(errors)
        }
        await db.import_logs.insert_one(import_log)
        
        # Update project timestamp
        await db.projects.update_one({"id": project_id}, {"$set": {"updated_at": now}})
        
        return {
            "batch_id": batch_id,
            "rows_imported": rows_imported,
            "rows_created": rows_created,
            "rows_merged": rows_merged,
            "rows_flagged": rows_flagged,
            "errors": errors
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Import failed: {str(e)}")

# --- Duplicates ---
@api_router.get("/projects/{project_id}/duplicates")
async def get_duplicates(project_id: str):
    """Get contacts flagged as potential duplicates"""
    contacts = await db.contacts.find({
        "project_id": project_id,
        "duplicate_status": "potential_duplicate"
    }, {"_id": 0}).to_list(10000)
    return contacts

@api_router.post("/projects/{project_id}/duplicates/merge")
async def merge_duplicates(project_id: str, contact_ids: List[str], keep_id: str):
    """Merge duplicate contacts, keeping one as primary"""
    now = datetime.now(timezone.utc).isoformat()
    
    # Get all contacts to merge
    contacts = []
    async for c in db.contacts.find({"id": {"$in": contact_ids}, "project_id": project_id}, {"_id": 0}):
        contacts.append(c)
    
    if not contacts:
        raise HTTPException(status_code=404, detail="No contacts found")
    
    # Find the primary contact
    primary = next((c for c in contacts if c['id'] == keep_id), contacts[0])
    
    # Merge data from other contacts (fill empty fields)
    for contact in contacts:
        if contact['id'] != primary['id']:
            for key, value in contact.items():
                if key not in ['id', 'created_at', '_id'] and value and not primary.get(key):
                    primary[key] = value
    
    primary['updated_at'] = now
    primary['duplicate_status'] = 'merged'
    primary['ai_notes'] += f"\nMerged from contacts: {', '.join([c['id'] for c in contacts if c['id'] != keep_id])}"
    
    # Update primary contact
    await db.contacts.update_one({"id": keep_id}, {"$set": primary})
    
    # Delete other contacts
    for contact in contacts:
        if contact['id'] != keep_id:
            await db.contacts.delete_one({"id": contact['id']})
    
    return {"message": "Contacts merged", "primary_id": keep_id}

@api_router.post("/projects/{project_id}/duplicates/dismiss")
async def dismiss_duplicate(project_id: str, contact_id: str):
    """Mark a contact as not a duplicate"""
    result = await db.contacts.update_one(
        {"id": contact_id, "project_id": project_id},
        {"$set": {"duplicate_status": "dismissed", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"message": "Duplicate dismissed"}

# --- Review ---
@api_router.get("/projects/{project_id}/review")
async def get_review_queue(project_id: str):
    """Get contacts needing review"""
    contacts = await db.contacts.find({
        "project_id": project_id,
        "review_status": "needs_review"
    }, {"_id": 0}).to_list(10000)
    return contacts

@api_router.post("/projects/{project_id}/contacts/{contact_id}/approve")
async def approve_contact(project_id: str, contact_id: str):
    """Approve a contact after review"""
    result = await db.contacts.update_one(
        {"id": contact_id, "project_id": project_id},
        {"$set": {"review_status": "approved", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"message": "Contact approved"}

@api_router.post("/projects/{project_id}/contacts/{contact_id}/reject")
async def reject_contact(project_id: str, contact_id: str):
    """Reject a contact after review"""
    result = await db.contacts.update_one(
        {"id": contact_id, "project_id": project_id},
        {"$set": {"review_status": "rejected", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"message": "Contact rejected"}

# --- Export ---
@api_router.get("/projects/{project_id}/export")
async def export_project(project_id: str, format: str = "xlsx"):
    """Export project data as Excel or CSV"""
    from fastapi.responses import StreamingResponse
    
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    contacts = await db.contacts.find({"project_id": project_id}, {"_id": 0}).to_list(10000)
    companies = await db.companies.find({"project_id": project_id}, {"_id": 0}).to_list(10000)
    import_logs = await db.import_logs.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    duplicates = await db.duplicates.find({"project_id": project_id}, {"_id": 0}).to_list(1000)
    ai_audits = await db.ai_audits.find({"record_id": {"$in": [c['id'] for c in contacts]}}, {"_id": 0}).to_list(10000)
    
    if format == "xlsx":
        output = generate_excel_workbook(project, contacts, companies, import_logs, duplicates, ai_audits)
        filename = f"{project['name'].replace(' ', '_')}_export.xlsx"
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    elif format == "csv":
        # Export contacts as CSV
        output = io.StringIO()
        if contacts:
            writer = csv.DictWriter(output, fieldnames=contacts[0].keys())
            writer.writeheader()
            writer.writerows(contacts)
        
        filename = f"{project['name'].replace(' ', '_')}_contacts.csv"
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported format. Use xlsx or csv.")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
