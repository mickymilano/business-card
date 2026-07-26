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
import asyncio
import fitz  # PyMuPDF for PDF processing
from PIL import Image as PILImage
from anthropic import AsyncAnthropic

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

# Estrazione via SDK Anthropic ufficiale.
#
# Migrazione del 27/07/2026: prima si passava da `emergentintegrations`, la
# libreria del generatore con cui l'app era nata, e da una chiave
# EMERGENT_LLM_KEY. Ora si parla direttamente con Anthropic: nessun
# intermediario, chiave nostra, modello che scegliamo noi.
#
# Cambio sostanziale oltre al fornitore: si usa l'output strutturato, quindi
# il modello NON puo' rispondere fuori schema. Sparisce l'analisi fragile che
# tagliava i recinti markdown a mano (`response_text.split("```")`), che si
# rompeva ogni volta che il modello aggiungeva una frase di cortesia.

MODEL_ID = os.environ.get('ANTHROPIC_MODEL', 'claude-sonnet-5')

# Campi estratti da un biglietto. Tutti opzionali nei fatti (un biglietto puo'
# non avere il reparto), quindi ammettono null: lo schema li dichiara comunque
# tutti obbligatori perche' l'output strutturato lo richiede, ed e' meglio un
# null esplicito di una chiave assente da gestire a valle.
_CARD_STRING_FIELDS = [
    'first_name', 'middle_name', 'last_name', 'full_name_original',
    'job_title', 'department',
    'mobile_phone', 'direct_phone', 'office_phone',
    'primary_email', 'secondary_email',
    'linkedin_url', 'personal_website',
    'company_name_display', 'brand_name', 'legal_company_name', 'website',
    'address', 'postal_code', 'country',
    'industry', 'ai_notes',
]

CARD_SCHEMA: Dict[str, Any] = {
    'type': 'object',
    'additionalProperties': False,
    'properties': {
        **{name: {'type': ['string', 'null']} for name in _CARD_STRING_FIELDS},
        'confidence_score': {'type': 'integer'},
    },
    'required': [*_CARD_STRING_FIELDS, 'confidence_score'],
}

CARDS_SCHEMA: Dict[str, Any] = {
    'type': 'object',
    'additionalProperties': False,
    'properties': {'cards': {'type': 'array', 'items': CARD_SCHEMA}},
    'required': ['cards'],
}

SYSTEM_PROMPT = """You are an expert at reading and extracting structured data from business cards in any language.

Field rules:
- address: street, number, city and province on one line.
- postal_code: only the ZIP/CAP code.
- confidence_score: 0-100, how confident you are in the extraction as a whole.
- ai_notes: anything a human should know (unreadable field, ambiguous name order, handwriting).

Never invent data. If a field is not visible on the card, set it to null."""

_client: Optional[AsyncAnthropic] = None


def get_client() -> AsyncAnthropic:
    """Client Anthropic condiviso. La chiave arriva da ANTHROPIC_API_KEY."""
    global _client
    if _client is None:
        if not os.environ.get('ANTHROPIC_API_KEY'):
            raise HTTPException(
                status_code=400,
                detail="ANTHROPIC_API_KEY non configurata: impostala nel .env del backend.",
            )
        _client = AsyncAnthropic()
    return _client


def _image_block(image_base64: str) -> Dict[str, Any]:
    """Blocco immagine per l'API. Il frontend comprime in JPEG e invia il solo
    base64, ma accettiamo anche un data URL completo per robustezza."""
    data = image_base64
    media_type = 'image/jpeg'
    if data.startswith('data:'):
        header, _, payload = data.partition(',')
        data = payload
        if ';' in header and ':' in header:
            media_type = header.split(':', 1)[1].split(';', 1)[0] or media_type
    return {'type': 'image', 'source': {'type': 'base64', 'media_type': media_type, 'data': data}}


async def _extract(content: List[Dict[str, Any]], schema: Dict[str, Any]) -> Dict[str, Any]:
    """Una sola chiamata al modello, vincolata allo schema. Restituisce
    l'oggetto gia' validato: nessuna analisi manuale del testo."""
    try:
        response = await get_client().messages.create(
            model=MODEL_ID,
            max_tokens=8000,
            system=SYSTEM_PROMPT,
            # Estrazione, non ragionamento: effort basso tiene bassi costo e
            # latenza senza perdere qualita' su un compito di lettura.
            output_config={'effort': 'low', 'format': {'type': 'json_schema', 'schema': schema}},
            messages=[{'role': 'user', 'content': content}],
        )
    except Exception as e:
        logger.error(f"Anthropic API error: {e}")
        raise HTTPException(status_code=502, detail=f"AI extraction failed: {e}")

    if response.stop_reason == 'refusal':
        raise HTTPException(status_code=422, detail="Il modello ha rifiutato di elaborare questa immagine.")

    text = next((block.text for block in response.content if block.type == 'text'), '')
    if not text:
        raise HTTPException(status_code=502, detail="Risposta vuota dal modello.")
    return json.loads(text)


async def extract_business_card_data(image_base64: str, image_back_base64: Optional[str] = None) -> Dict[str, Any]:
    """Estrae i dati di UN biglietto (fronte, e retro se presente)."""
    content: List[Dict[str, Any]] = [_image_block(image_base64)]
    prompt = "Extract all contact and company information from this business card."
    if image_back_base64:
        content.append(_image_block(image_back_base64))
        prompt = "Extract all information from both sides of this business card. It is one single card."
    content.append({'type': 'text', 'text': prompt})
    return await _extract(content, CARD_SCHEMA)


async def extract_multiple_cards(image_base64: str) -> List[Dict[str, Any]]:
    """Estrae TUTTI i biglietti presenti in una sola immagine (pagina PDF)."""
    content: List[Dict[str, Any]] = [
        _image_block(image_base64),
        {'type': 'text', 'text': "This image may contain MULTIPLE business cards. Extract every card you can see."},
    ]
    result = await _extract(content, CARDS_SCHEMA)
    return result.get('cards', [])

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
async def scan_batch_pdf(file: UploadFile = File(...)):
    """Start batch PDF processing - returns job ID for polling"""
    try:
        # Read PDF in chunks to handle large files
        chunks = []
        total_size = 0
        max_size = 50 * 1024 * 1024  # 50MB limit
        
        while True:
            chunk = await file.read(1024 * 1024)  # Read 1MB at a time
            if not chunk:
                break
            chunks.append(chunk)
            total_size += len(chunk)
            if total_size > max_size:
                raise HTTPException(status_code=400, detail="File too large (max 50MB)")
        
        pdf_bytes = b''.join(chunks)
        logger.info(f"Received PDF file: {total_size} bytes")
        
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
        
        # Start background processing using asyncio.create_task
        asyncio.create_task(process_batch_pdf_async(job_id, pdf_bytes))
        
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
