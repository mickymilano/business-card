from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Request, Response, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import base64
import json
import io
import httpx
from openpyxl import Workbook
import fitz  # PyMuPDF for PDF processing
from PIL import Image as PILImage
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

# Google API imports
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB for user sessions only (not for business data)
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'test_database')]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
ROOT_FOLDER_NAME = "Business Card Scanner"
SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets'
]

# ===================
# MODELS
# ===================

class UserSession(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str
    session_token: str
    google_access_token: str
    google_refresh_token: Optional[str] = None
    expires_at: datetime

class ProjectCreate(BaseModel):
    name: str
    notes: Optional[str] = ""

class ContactCreate(BaseModel):
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
    address: Optional[str] = ""
    postal_code: Optional[str] = ""
    country: Optional[str] = ""
    confidence_score: Optional[float] = 0.0
    validation_status: Optional[str] = "pending"
    review_status: Optional[str] = "pending"
    duplicate_status: Optional[str] = "none"
    ai_notes: Optional[str] = ""
    notes: Optional[str] = ""

class ScanRequest(BaseModel):
    project_id: str
    image_front: str
    image_back: Optional[str] = None

class SettingsUpdate(BaseModel):
    anthropic_api_key: Optional[str] = None
    claude_model: Optional[str] = "claude-sonnet-4-5-20250929"
    ai_enabled: Optional[bool] = True

# ===================
# AUTH HELPERS
# ===================

async def get_current_user(request: Request) -> Dict[str, Any]:
    """Get current user from session token"""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check expiry
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    return session

def get_google_credentials(session: Dict[str, Any]) -> Credentials:
    """Create Google credentials from session"""
    return Credentials(
        token=session.get("google_access_token"),
        refresh_token=session.get("google_refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ.get("GOOGLE_CLIENT_ID", ""),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET", ""),
        scopes=SCOPES
    )

# ===================
# GOOGLE DRIVE/SHEETS HELPERS
# ===================

async def get_or_create_root_folder(credentials: Credentials) -> str:
    """Get or create the root 'Business Card Scanner' folder"""
    drive_service = build('drive', 'v3', credentials=credentials)
    
    # Search for existing folder
    query = f"name='{ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = drive_service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
    files = results.get('files', [])
    
    if files:
        return files[0]['id']
    
    # Create folder
    folder_metadata = {
        'name': ROOT_FOLDER_NAME,
        'mimeType': 'application/vnd.google-apps.folder'
    }
    folder = drive_service.files().create(body=folder_metadata, fields='id').execute()
    logger.info(f"Created root folder: {ROOT_FOLDER_NAME}")
    return folder['id']

async def get_or_create_project_folder(credentials: Credentials, root_folder_id: str, project_name: str) -> str:
    """Get or create a project folder inside root"""
    drive_service = build('drive', 'v3', credentials=credentials)
    
    # Search for existing folder
    query = f"name='{project_name}' and '{root_folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = drive_service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
    files = results.get('files', [])
    
    if files:
        return files[0]['id']
    
    # Create folder
    folder_metadata = {
        'name': project_name,
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': [root_folder_id]
    }
    folder = drive_service.files().create(body=folder_metadata, fields='id').execute()
    logger.info(f"Created project folder: {project_name}")
    return folder['id']

async def get_or_create_spreadsheet(credentials: Credentials, folder_id: str, name: str, headers: List[str]) -> str:
    """Get or create a Google Sheet with headers"""
    drive_service = build('drive', 'v3', credentials=credentials)
    sheets_service = build('sheets', 'v4', credentials=credentials)
    
    # Search for existing spreadsheet
    query = f"name='{name}' and '{folder_id}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
    results = drive_service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
    files = results.get('files', [])
    
    if files:
        return files[0]['id']
    
    # Create spreadsheet
    spreadsheet_metadata = {
        'name': name,
        'mimeType': 'application/vnd.google-apps.spreadsheet',
        'parents': [folder_id]
    }
    spreadsheet = drive_service.files().create(body=spreadsheet_metadata, fields='id').execute()
    spreadsheet_id = spreadsheet['id']
    
    # Add headers
    sheets_service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range='Sheet1!A1',
        valueInputOption='RAW',
        body={'values': [headers]}
    ).execute()
    
    logger.info(f"Created spreadsheet: {name}")
    return spreadsheet_id

async def read_sheet_data(credentials: Credentials, spreadsheet_id: str) -> List[Dict[str, Any]]:
    """Read all data from a spreadsheet and return as list of dicts"""
    sheets_service = build('sheets', 'v4', credentials=credentials)
    
    result = sheets_service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range='Sheet1'
    ).execute()
    
    values = result.get('values', [])
    if not values or len(values) < 2:
        return []
    
    headers = values[0]
    data = []
    for row in values[1:]:
        # Pad row to match headers length
        row_padded = row + [''] * (len(headers) - len(row))
        data.append(dict(zip(headers, row_padded)))
    
    return data

async def append_to_sheet(credentials: Credentials, spreadsheet_id: str, row_data: List[str]):
    """Append a row to a spreadsheet"""
    sheets_service = build('sheets', 'v4', credentials=credentials)
    
    sheets_service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range='Sheet1',
        valueInputOption='RAW',
        insertDataOption='INSERT_ROWS',
        body={'values': [row_data]}
    ).execute()

async def update_sheet_row(credentials: Credentials, spreadsheet_id: str, row_index: int, row_data: List[str]):
    """Update a specific row in a spreadsheet (row_index is 0-based, excluding header)"""
    sheets_service = build('sheets', 'v4', credentials=credentials)
    
    # Row 1 is header, so actual row is row_index + 2
    range_str = f'Sheet1!A{row_index + 2}'
    
    sheets_service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=range_str,
        valueInputOption='RAW',
        body={'values': [row_data]}
    ).execute()

async def delete_sheet_row(credentials: Credentials, spreadsheet_id: str, row_index: int):
    """Delete a row from spreadsheet (row_index is 0-based, excluding header)"""
    sheets_service = build('sheets', 'v4', credentials=credentials)
    
    # Get sheet ID (not spreadsheet ID)
    spreadsheet = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    sheet_id = spreadsheet['sheets'][0]['properties']['sheetId']
    
    # Delete row (row_index + 1 because header is row 0)
    requests = [{
        'deleteDimension': {
            'range': {
                'sheetId': sheet_id,
                'dimension': 'ROWS',
                'startIndex': row_index + 1,  # +1 for header
                'endIndex': row_index + 2
            }
        }
    }]
    
    sheets_service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={'requests': requests}
    ).execute()

# ===================
# PROJECT HELPERS
# ===================

CONTACT_HEADERS = [
    "id", "first_name", "middle_name", "last_name", "full_name", "full_name_original",
    "job_title", "department", "mobile_phone", "direct_phone", "office_phone",
    "primary_email", "secondary_email", "linkedin_url", "personal_website",
    "company_id", "company_name_display", "brand_name", "legal_company_name",
    "address", "postal_code", "country", "import_source_type", "import_source_file",
    "confidence_score", "validation_status", "review_status", "duplicate_status",
    "ai_notes", "notes", "created_at", "updated_at"
]

COMPANY_HEADERS = [
    "id", "legal_company_name", "brand_name", "company_display_name",
    "website", "main_phone", "main_email", "address", "city", "postal_code",
    "province_region", "country", "industry", "validation_status",
    "notes", "created_at", "updated_at"
]

PROJECT_HEADERS = [
    "id", "name", "folder_id", "contacts_sheet_id", "companies_sheet_id",
    "notes", "created_at", "updated_at"
]

async def get_projects_sheet_id(credentials: Credentials, root_folder_id: str) -> str:
    """Get or create the master Projects spreadsheet"""
    return await get_or_create_spreadsheet(credentials, root_folder_id, "_Projects", PROJECT_HEADERS)

async def setup_project_sheets(credentials: Credentials, project_folder_id: str) -> tuple:
    """Create Contacts and Companies sheets for a project"""
    contacts_id = await get_or_create_spreadsheet(credentials, project_folder_id, "Contacts", CONTACT_HEADERS)
    companies_id = await get_or_create_spreadsheet(credentials, project_folder_id, "Companies", COMPANY_HEADERS)
    return contacts_id, companies_id

# ===================
# AI HELPERS
# ===================

def get_api_key():
    return os.environ.get('EMERGENT_LLM_KEY', '')

async def get_user_settings(user_id: str) -> Dict[str, Any]:
    """Get user settings from MongoDB"""
    settings = await db.user_settings.find_one({"user_id": user_id}, {"_id": 0})
    if not settings:
        settings = {
            "user_id": user_id,
            "anthropic_api_key": "",
            "claude_model": "claude-sonnet-4-5-20250929",
            "ai_enabled": True
        }
    return settings

async def extract_business_card_data(image_base64: str, image_back_base64: Optional[str], user_id: str) -> Dict[str, Any]:
    """Extract data from business card image using Claude"""
    settings = await get_user_settings(user_id)
    api_key = settings.get('anthropic_api_key') or get_api_key()
    model = settings.get('claude_model', 'claude-sonnet-4-5-20250929')
    
    if not api_key:
        raise HTTPException(status_code=400, detail="No API key configured")
    
    system_prompt = """You are an expert at reading and extracting structured data from business cards in any language.
    Extract all visible information and return it as a JSON object with these fields:

    PERSONAL INFO:
    - first_name, middle_name, last_name, full_name_original
    
    PROFESSIONAL INFO:
    - job_title, department
    
    CONTACT INFO:
    - mobile_phone, direct_phone, office_phone
    - primary_email, secondary_email
    - linkedin_url, personal_website
    
    COMPANY INFO:
    - company_name_display, brand_name, legal_company_name, website
    
    ADDRESS INFO:
    - address (street, number, city, province in one line)
    - postal_code (only ZIP/CAP code)
    - country
    
    METADATA:
    - industry, confidence_score (0-100), ai_notes
    
    Return ONLY valid JSON, no markdown."""
    
    chat = LlmChat(
        api_key=api_key,
        session_id=f"scan-{str(uuid.uuid4())}",
        system_message=system_prompt
    ).with_model("anthropic", model)
    
    images = [ImageContent(image_base64=image_base64)]
    prompt = "Extract all contact and company information from this business card."
    
    if image_back_base64:
        images.append(ImageContent(image_base64=image_back_base64))
        prompt = "Extract all information from both sides of this business card."
    
    user_message = UserMessage(text=prompt, file_contents=images)
    
    try:
        response = await chat.send_message(user_message)
        response_text = response.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        return json.loads(response_text.strip())
    except Exception as e:
        logger.error(f"Claude API error: {e}")
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {str(e)}")

# ===================
# AUTH ROUTES
# ===================

@api_router.get("/auth/me")
async def get_me(request: Request):
    """Get current user info"""
    session = await get_current_user(request)
    return {
        "user_id": session.get("user_id"),
        "email": session.get("email"),
        "name": session.get("name"),
        "picture": session.get("picture"),
        "google_connected": bool(session.get("google_access_token"))
    }

@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    """Exchange session_id for session_token"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent Auth to get session data
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
    
    if auth_response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    
    auth_data = auth_response.json()
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=7)
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": auth_data["email"]}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
    else:
        # Create new user
        await db.users.insert_one({
            "user_id": user_id,
            "email": auth_data["email"],
            "name": auth_data["name"],
            "picture": auth_data["picture"],
            "created_at": now.isoformat()
        })
    
    # Create session with Google tokens
    session_doc = {
        "user_id": user_id,
        "email": auth_data["email"],
        "name": auth_data["name"],
        "picture": auth_data["picture"],
        "session_token": auth_data["session_token"],
        "google_access_token": auth_data.get("access_token", ""),
        "google_refresh_token": auth_data.get("refresh_token", ""),
        "expires_at": expires_at.isoformat(),
        "created_at": now.isoformat()
    }
    
    # Delete old sessions for this user
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=auth_data["session_token"],
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    return {
        "user_id": user_id,
        "email": auth_data["email"],
        "name": auth_data["name"],
        "picture": auth_data["picture"]
    }

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out"}

@api_router.get("/auth/google-status")
async def google_status(request: Request):
    """Check if Google is connected and working"""
    try:
        session = await get_current_user(request)
        credentials = get_google_credentials(session)
        
        # Try to list files to verify connection
        drive_service = build('drive', 'v3', credentials=credentials)
        drive_service.files().list(pageSize=1).execute()
        
        return {"connected": True, "email": session.get("email")}
    except Exception as e:
        logger.error(f"Google status check failed: {e}")
        return {"connected": False, "error": str(e)}

# ===================
# PROJECT ROUTES
# ===================

@api_router.get("/projects")
async def get_projects(request: Request):
    """Get all projects for current user"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        # Add contact/company counts
        for p in projects:
            try:
                if p.get('contacts_sheet_id'):
                    contacts = await read_sheet_data(credentials, p['contacts_sheet_id'])
                    p['contact_count'] = len(contacts)
                else:
                    p['contact_count'] = 0
                    
                if p.get('companies_sheet_id'):
                    companies = await read_sheet_data(credentials, p['companies_sheet_id'])
                    p['company_count'] = len(companies)
                else:
                    p['company_count'] = 0
            except:
                p['contact_count'] = 0
                p['company_count'] = 0
        
        return projects
    except Exception as e:
        logger.error(f"Error getting projects: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/projects")
async def create_project(project: ProjectCreate, request: Request):
    """Create a new project with Google Sheets"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        now = datetime.now(timezone.utc).isoformat()
        project_id = str(uuid.uuid4())
        
        # Create folder structure
        root_folder_id = await get_or_create_root_folder(credentials)
        project_folder_id = await get_or_create_project_folder(credentials, root_folder_id, project.name)
        
        # Create sheets
        contacts_sheet_id, companies_sheet_id = await setup_project_sheets(credentials, project_folder_id)
        
        # Add to projects sheet
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        
        project_row = [
            project_id, project.name, project_folder_id, contacts_sheet_id, companies_sheet_id,
            project.notes or "", now, now
        ]
        await append_to_sheet(credentials, projects_sheet_id, project_row)
        
        return {
            "id": project_id,
            "name": project.name,
            "folder_id": project_folder_id,
            "contacts_sheet_id": contacts_sheet_id,
            "companies_sheet_id": companies_sheet_id,
            "notes": project.notes or "",
            "created_at": now,
            "updated_at": now,
            "contact_count": 0,
            "company_count": 0
        }
    except Exception as e:
        logger.error(f"Error creating project: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/projects/{project_id}")
async def get_project(project_id: str, request: Request):
    """Get a specific project"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get counts
        if project.get('contacts_sheet_id'):
            contacts = await read_sheet_data(credentials, project['contacts_sheet_id'])
            project['contact_count'] = len(contacts)
        else:
            project['contact_count'] = 0
            
        if project.get('companies_sheet_id'):
            companies = await read_sheet_data(credentials, project['companies_sheet_id'])
            project['company_count'] = len(companies)
        else:
            project['company_count'] = 0
        
        return project
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, request: Request):
    """Delete a project"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        project_index = next((i for i, p in enumerate(projects) if p.get('id') == project_id), None)
        if project_index is None:
            raise HTTPException(status_code=404, detail="Project not found")
        
        project = projects[project_index]
        
        # Delete project folder (and all contents)
        if project.get('folder_id'):
            drive_service = build('drive', 'v3', credentials=credentials)
            drive_service.files().delete(fileId=project['folder_id']).execute()
        
        # Remove from projects sheet
        await delete_sheet_row(credentials, projects_sheet_id, project_index)
        
        return {"message": "Project deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting project: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===================
# CONTACTS ROUTES
# ===================

@api_router.get("/projects/{project_id}/contacts")
async def get_contacts(project_id: str, request: Request, review_status: Optional[str] = None):
    """Get all contacts for a project"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        contacts = await read_sheet_data(credentials, project['contacts_sheet_id'])
        
        # Filter by review_status if specified
        if review_status:
            contacts = [c for c in contacts if c.get('review_status') == review_status]
        
        return contacts
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting contacts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/projects/{project_id}/contacts")
async def create_contact(project_id: str, contact: ContactCreate, request: Request):
    """Create a new contact"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        now = datetime.now(timezone.utc).isoformat()
        contact_id = str(uuid.uuid4())
        
        contact_data = contact.model_dump()
        contact_data['id'] = contact_id
        contact_data['created_at'] = now
        contact_data['updated_at'] = now
        
        # Create row data matching headers
        row_data = [str(contact_data.get(h, '')) for h in CONTACT_HEADERS]
        await append_to_sheet(credentials, project['contacts_sheet_id'], row_data)
        
        return contact_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating contact: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/projects/{project_id}/contacts/{contact_id}")
async def get_contact(project_id: str, contact_id: str, request: Request):
    """Get a specific contact"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        contacts = await read_sheet_data(credentials, project['contacts_sheet_id'])
        contact = next((c for c in contacts if c.get('id') == contact_id), None)
        
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        return contact
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting contact: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/projects/{project_id}/contacts/{contact_id}")
async def update_contact(project_id: str, contact_id: str, contact: ContactCreate, request: Request):
    """Update a contact"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        contacts = await read_sheet_data(credentials, project['contacts_sheet_id'])
        contact_index = next((i for i, c in enumerate(contacts) if c.get('id') == contact_id), None)
        
        if contact_index is None:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        now = datetime.now(timezone.utc).isoformat()
        contact_data = contact.model_dump()
        contact_data['id'] = contact_id
        contact_data['created_at'] = contacts[contact_index].get('created_at', now)
        contact_data['updated_at'] = now
        
        row_data = [str(contact_data.get(h, '')) for h in CONTACT_HEADERS]
        await update_sheet_row(credentials, project['contacts_sheet_id'], contact_index, row_data)
        
        return contact_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating contact: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/projects/{project_id}/contacts/{contact_id}")
async def delete_contact(project_id: str, contact_id: str, request: Request):
    """Delete a contact"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        contacts = await read_sheet_data(credentials, project['contacts_sheet_id'])
        contact_index = next((i for i, c in enumerate(contacts) if c.get('id') == contact_id), None)
        
        if contact_index is None:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        await delete_sheet_row(credentials, project['contacts_sheet_id'], contact_index)
        
        return {"message": "Contact deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting contact: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===================
# COMPANIES ROUTES
# ===================

@api_router.get("/projects/{project_id}/companies")
async def get_companies(project_id: str, request: Request):
    """Get all companies for a project"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        companies = await read_sheet_data(credentials, project['companies_sheet_id'])
        return companies
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting companies: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/projects/{project_id}/companies/{company_id}")
async def delete_company(project_id: str, company_id: str, request: Request):
    """Delete a company"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        companies = await read_sheet_data(credentials, project['companies_sheet_id'])
        company_index = next((i for i, c in enumerate(companies) if c.get('id') == company_id), None)
        
        if company_index is None:
            raise HTTPException(status_code=404, detail="Company not found")
        
        await delete_sheet_row(credentials, project['companies_sheet_id'], company_index)
        
        return {"message": "Company deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting company: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===================
# SCAN ROUTES
# ===================

@api_router.post("/projects/{project_id}/scan")
async def scan_business_card(project_id: str, scan: ScanRequest, request: Request):
    """Scan a business card and extract data"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Extract data using Claude
        extracted_data = await extract_business_card_data(
            scan.image_front, 
            scan.image_back, 
            session['user_id']
        )
        
        now = datetime.now(timezone.utc).isoformat()
        contact_id = str(uuid.uuid4())
        
        # Build contact data
        contact_data = {
            "id": contact_id,
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
            "address": extracted_data.get('address', ''),
            "postal_code": extracted_data.get('postal_code', ''),
            "country": extracted_data.get('country', ''),
            "import_source_type": "scan",
            "import_source_file": "",
            "confidence_score": str(extracted_data.get('confidence_score', 0)),
            "validation_status": "pending",
            "review_status": "needs_review" if extracted_data.get('confidence_score', 0) < 80 else "approved",
            "duplicate_status": "none",
            "ai_notes": extracted_data.get('ai_notes', ''),
            "notes": "",
            "created_at": now,
            "updated_at": now
        }
        
        # Save contact to sheet
        row_data = [str(contact_data.get(h, '')) for h in CONTACT_HEADERS]
        await append_to_sheet(credentials, project['contacts_sheet_id'], row_data)
        
        # Create company if present
        company_data = None
        if extracted_data.get('company_name_display') or extracted_data.get('brand_name'):
            company_id = str(uuid.uuid4())
            company_data = {
                "id": company_id,
                "legal_company_name": extracted_data.get('legal_company_name', ''),
                "brand_name": extracted_data.get('brand_name', ''),
                "company_display_name": extracted_data.get('company_name_display', ''),
                "website": extracted_data.get('website', ''),
                "main_phone": extracted_data.get('office_phone', ''),
                "main_email": "",
                "address": extracted_data.get('address', ''),
                "city": "",
                "postal_code": extracted_data.get('postal_code', ''),
                "province_region": "",
                "country": extracted_data.get('country', ''),
                "industry": extracted_data.get('industry', ''),
                "validation_status": "pending",
                "notes": "",
                "created_at": now,
                "updated_at": now
            }
            
            company_row = [str(company_data.get(h, '')) for h in COMPANY_HEADERS]
            await append_to_sheet(credentials, project['companies_sheet_id'], company_row)
        
        return {
            "contact": contact_data,
            "company": company_data,
            "extracted_data": extracted_data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error scanning card: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===================
# REVIEW & DUPLICATES
# ===================

@api_router.get("/projects/{project_id}/review")
async def get_review_queue(project_id: str, request: Request):
    """Get contacts needing review"""
    return await get_contacts(project_id, request, review_status="needs_review")

@api_router.post("/projects/{project_id}/contacts/{contact_id}/approve")
async def approve_contact(project_id: str, contact_id: str, request: Request):
    """Approve a contact"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        contacts = await read_sheet_data(credentials, project['contacts_sheet_id'])
        contact_index = next((i for i, c in enumerate(contacts) if c.get('id') == contact_id), None)
        
        if contact_index is None:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        contact = contacts[contact_index]
        contact['review_status'] = 'approved'
        contact['updated_at'] = datetime.now(timezone.utc).isoformat()
        
        row_data = [str(contact.get(h, '')) for h in CONTACT_HEADERS]
        await update_sheet_row(credentials, project['contacts_sheet_id'], contact_index, row_data)
        
        return {"message": "Contact approved"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving contact: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/projects/{project_id}/contacts/{contact_id}/reject")
async def reject_contact(project_id: str, contact_id: str, request: Request):
    """Reject a contact - deletes from sheet"""
    return await delete_contact(project_id, contact_id, request)

@api_router.get("/projects/{project_id}/duplicates")
async def get_duplicates(project_id: str, request: Request):
    """Get contacts flagged as duplicates"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        contacts = await read_sheet_data(credentials, project['contacts_sheet_id'])
        duplicates = [c for c in contacts if c.get('duplicate_status') == 'potential_duplicate']
        
        return duplicates
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting duplicates: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/projects/{project_id}/duplicates/{contact_id}")
async def delete_duplicate(project_id: str, contact_id: str, request: Request):
    """Delete a duplicate contact"""
    return await delete_contact(project_id, contact_id, request)

# ===================
# SETTINGS
# ===================

@api_router.get("/settings")
async def get_settings(request: Request):
    """Get user settings"""
    session = await get_current_user(request)
    settings = await get_user_settings(session['user_id'])
    return settings

@api_router.post("/settings")
async def update_settings(settings: SettingsUpdate, request: Request):
    """Update user settings"""
    session = await get_current_user(request)
    
    update_data = settings.model_dump(exclude_unset=True)
    update_data['user_id'] = session['user_id']
    
    await db.user_settings.update_one(
        {"user_id": session['user_id']},
        {"$set": update_data},
        upsert=True
    )
    
    return await get_user_settings(session['user_id'])

@api_router.post("/settings/test-connection")
async def test_claude_connection(request: Request):
    """Test Claude API connection"""
    session = await get_current_user(request)
    settings = await get_user_settings(session['user_id'])
    
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
        
        response = await chat.send_message(UserMessage(text="Say 'Connection successful!'"))
        return {"status": "success", "message": response.strip(), "model": model}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# ===================
# EXPORT
# ===================

@api_router.get("/projects/{project_id}/export")
async def export_project(project_id: str, format: str = "xlsx", request: Request = None):
    """Export project data - redirects to Google Sheet"""
    session = await get_current_user(request)
    credentials = get_google_credentials(session)
    
    try:
        root_folder_id = await get_or_create_root_folder(credentials)
        projects_sheet_id = await get_projects_sheet_id(credentials, root_folder_id)
        projects = await read_sheet_data(credentials, projects_sheet_id)
        
        project = next((p for p in projects if p.get('id') == project_id), None)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Return links to Google Sheets
        return {
            "project_name": project.get('name'),
            "contacts_sheet_url": f"https://docs.google.com/spreadsheets/d/{project.get('contacts_sheet_id')}",
            "companies_sheet_url": f"https://docs.google.com/spreadsheets/d/{project.get('companies_sheet_id')}",
            "folder_url": f"https://drive.google.com/drive/folders/{project.get('folder_id')}"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===================
# ROOT
# ===================

@api_router.get("/")
async def root():
    return {"message": "BizScan Pro API with Google Sheets", "version": "2.0.0"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
