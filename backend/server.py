from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
import base64
import json
import io
import asyncio
import fitz  # PyMuPDF for PDF processing
from PIL import Image as PILImage
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ===================
# JOB STORAGE (in-memory for simplicity)
# ===================

batch_jobs: Dict[str, Dict[str, Any]] = {}

# ===================
# MODELS
# ===================

class ScanRequest(BaseModel):
    image_front: str
    image_back: Optional[str] = None

# ===================
# AI HELPERS
# ===================

def get_api_key():
    return os.environ.get('EMERGENT_LLM_KEY', '')

async def extract_business_card_data(image_base64: str, image_back_base64: Optional[str] = None) -> Dict[str, Any]:
    """Extract data from business card image using Claude"""
    api_key = get_api_key()
    model = 'claude-sonnet-4-5-20250929'
    
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

async def extract_multiple_cards(image_base64: str) -> List[Dict[str, Any]]:
    """Extract data from multiple business cards in a single image"""
    api_key = get_api_key()
    model = 'claude-sonnet-4-5-20250929'
    
    if not api_key:
        raise HTTPException(status_code=400, detail="No API key configured")
    
    system_prompt = """You are an expert at reading and extracting structured data from business cards in any language.
    This image may contain MULTIPLE business cards. Extract ALL visible business cards.
    
    Return a JSON array of cards, each with these fields:
    - first_name, middle_name, last_name, full_name_original
    - job_title, department
    - mobile_phone, direct_phone, office_phone
    - primary_email, secondary_email
    - linkedin_url, personal_website
    - company_name_display, brand_name, legal_company_name, website
    - address, postal_code, country
    - industry, confidence_score (0-100), ai_notes
    
    Return ONLY valid JSON array, no markdown. Example: [{"first_name": "John", ...}, {"first_name": "Jane", ...}]"""
    
    chat = LlmChat(
        api_key=api_key,
        session_id=f"batch-{str(uuid.uuid4())}",
        system_message=system_prompt
    ).with_model("anthropic", model)
    
    user_message = UserMessage(
        text="Extract ALL business cards from this image. Return a JSON array.",
        file_contents=[ImageContent(image_base64=image_base64)]
    )
    
    try:
        response = await chat.send_message(user_message)
        response_text = response.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        
        result = json.loads(response_text.strip())
        # Ensure it's always a list
        if isinstance(result, dict):
            return [result]
        return result
    except Exception as e:
        logger.error(f"Claude API error: {e}")
        raise HTTPException(status_code=500, detail=f"AI extraction failed: {str(e)}")

# ===================
# BACKGROUND TASK FOR BATCH PROCESSING
# ===================

async def process_batch_pdf_async(job_id: str, pdf_bytes: bytes):
    """Process PDF in background"""
    try:
        pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(pdf_document)
        
        batch_jobs[job_id]["total_pages"] = total_pages
        batch_jobs[job_id]["status"] = "processing"
        
        all_contacts = []
        page_results = []
        
        for page_num in range(total_pages):
            # Update progress
            batch_jobs[job_id]["current_page"] = page_num + 1
            batch_jobs[job_id]["progress"] = int((page_num / total_pages) * 100)
            
            page = pdf_document[page_num]
            
            # Convert page to image (optimized resolution)
            mat = fitz.Matrix(1.5, 1.5)
            pix = page.get_pixmap(matrix=mat)
            
            # Convert to PIL Image and compress
            img = PILImage.frombytes("RGB", [pix.width, pix.height], pix.samples)
            
            # Convert to grayscale for smaller size
            img = img.convert("L").convert("RGB")
            
            # Resize if too large
            max_size = 1400
            if img.width > max_size or img.height > max_size:
                ratio = min(max_size / img.width, max_size / img.height)
                new_size = (int(img.width * ratio), int(img.height * ratio))
                img = img.resize(new_size, PILImage.Resampling.LANCZOS)
            
            # Convert to base64
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=70)
            image_base64 = base64.b64encode(buffer.getvalue()).decode()
            
            try:
                # Extract all cards from this page
                cards = await extract_multiple_cards(image_base64)
                all_contacts.extend(cards)
                page_results.append({
                    "page": page_num + 1,
                    "cards_found": len(cards),
                    "status": "success"
                })
                logger.info(f"Job {job_id} - Page {page_num + 1}: Found {len(cards)} cards")
                
                # Update job with partial results
                batch_jobs[job_id]["contacts"] = all_contacts
                batch_jobs[job_id]["page_results"] = page_results
                
            except Exception as e:
                logger.error(f"Job {job_id} - Page {page_num + 1} error: {e}")
                page_results.append({
                    "page": page_num + 1,
                    "cards_found": 0,
                    "status": "error",
                    "error": str(e)
                })
        
        # Store total pages before closing
        final_total_pages = total_pages
        pdf_document.close()
        
        # Mark job as complete
        batch_jobs[job_id]["status"] = "completed"
        batch_jobs[job_id]["progress"] = 100
        batch_jobs[job_id]["contacts"] = all_contacts
        batch_jobs[job_id]["page_results"] = page_results
        
        logger.info(f"Job {job_id} completed: {len(all_contacts)} contacts from {final_total_pages} pages")
        
    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}")
        batch_jobs[job_id]["status"] = "failed"
        batch_jobs[job_id]["error"] = str(e)

# ===================
# SCAN ROUTES
# ===================

@api_router.post("/scan")
async def scan_single_card(scan: ScanRequest):
    """Scan a single business card and extract data (AI only)"""
    try:
        extracted_data = await extract_business_card_data(
            scan.image_front, 
            scan.image_back
        )
        return extracted_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Scan error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/scan/batch")
async def scan_batch_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Start batch PDF processing - returns job ID for polling"""
    try:
        # Read PDF
        pdf_bytes = await file.read()
        
        # Quick validation
        try:
            pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            total_pages = len(pdf_doc)
            pdf_doc.close()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid PDF file: {str(e)}")
        
        # Create job
        job_id = str(uuid.uuid4())[:8]
        batch_jobs[job_id] = {
            "status": "queued",
            "progress": 0,
            "total_pages": total_pages,
            "current_page": 0,
            "contacts": [],
            "page_results": [],
            "error": None
        }
        
        # Start background processing
        background_tasks.add_task(process_batch_pdf_async, job_id, pdf_bytes)
        
        logger.info(f"Started batch job {job_id} with {total_pages} pages")
        
        return {
            "job_id": job_id,
            "status": "queued",
            "total_pages": total_pages,
            "message": f"Processing {total_pages} pages. Poll /api/scan/batch/{job_id} for status."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch scan error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/scan/batch/{job_id}")
async def get_batch_status(job_id: str):
    """Get status of batch processing job"""
    if job_id not in batch_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = batch_jobs[job_id]
    
    return {
        "job_id": job_id,
        "status": job["status"],
        "progress": job["progress"],
        "total_pages": job["total_pages"],
        "current_page": job["current_page"],
        "contacts_found": len(job["contacts"]),
        "contacts": job["contacts"] if job["status"] == "completed" else [],
        "page_results": job["page_results"],
        "error": job["error"]
    }

# ===================
# ROOT
# ===================

@api_router.get("/")
async def root():
    return {"message": "BizScan Pro API - AI Extraction Only", "version": "3.1.0"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
