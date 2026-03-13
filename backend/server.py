from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
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
# SCAN ROUTES (AI-only, no data storage)
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
async def scan_batch_pdf(file: UploadFile = File(...)):
    """Process a PDF with multiple business cards per page (AI only)"""
    try:
        # Read PDF
        pdf_bytes = await file.read()
        pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        all_contacts = []
        page_results = []
        
        for page_num in range(len(pdf_document)):
            page = pdf_document[page_num]
            
            # Convert page to image (optimized resolution)
            mat = fitz.Matrix(1.5, 1.5)  # 1.5x zoom for good OCR
            pix = page.get_pixmap(matrix=mat)
            
            # Convert to PIL Image and compress
            img = PILImage.frombytes("RGB", [pix.width, pix.height], pix.samples)
            
            # Resize if too large
            max_size = 1500
            if img.width > max_size or img.height > max_size:
                ratio = min(max_size / img.width, max_size / img.height)
                new_size = (int(img.width * ratio), int(img.height * ratio))
                img = img.resize(new_size, PILImage.Resampling.LANCZOS)
            
            # Convert to base64
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=75)
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
                logger.info(f"Page {page_num + 1}: Found {len(cards)} cards")
            except Exception as e:
                logger.error(f"Page {page_num + 1} error: {e}")
                page_results.append({
                    "page": page_num + 1,
                    "cards_found": 0,
                    "status": "error",
                    "error": str(e)
                })
        
        pdf_document.close()
        
        return {
            "total_pages": len(pdf_document),
            "contacts": all_contacts,
            "page_results": page_results
        }
    except Exception as e:
        logger.error(f"Batch scan error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===================
# ROOT
# ===================

@api_router.get("/")
async def root():
    return {"message": "BizScan Pro API - AI Extraction Only", "version": "3.0.0"}

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
