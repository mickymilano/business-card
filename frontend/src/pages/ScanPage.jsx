import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition, API } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Camera, Upload, Image, X, Loader2, Check, AlertCircle, Scan, Video, Square } from "lucide-react";
import * as db from "@/services/db";

// Convert image to grayscale for smaller size and faster OCR
const convertToGrayscale = (imageData, ctx, width, height) => {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    // Luminosity method: 0.299*R + 0.587*G + 0.114*B
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = gray;     // R
    data[i + 1] = gray; // G
    data[i + 2] = gray; // B
    // Alpha remains unchanged
  }
  ctx.putImageData(imageData, 0, 0);
};

// Fast grayscale image compression
const compressImageGrayscale = (file) => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      
      // Target: max 1200px on longest side
      const MAX_SIZE = 1200;
      let width = img.width;
      let height = img.height;
      
      if (width > MAX_SIZE || height > MAX_SIZE) {
        const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "medium";
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to grayscale
      const imageData = ctx.getImageData(0, 0, width, height);
      convertToGrayscale(imageData, ctx, width, height);
      
      // Compress with higher quality for grayscale (same visual quality, smaller size)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to compress image"));
            return;
          }
          
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result.split(",")[1];
            const sizeKB = Math.round(blob.size / 1024);
            console.log(`Grayscale: ${img.width}x${img.height} -> ${width}x${height}, ${sizeKB}KB`);
            
            resolve({
              base64,
              preview: reader.result,
              sizeKB
            });
          };
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.75
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image"));
    };
    
    img.src = objectUrl;
  });
};

// Simple edge detection without OpenCV (faster to load)
const detectCardEdges = (canvas) => {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Convert to grayscale values array
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
  }
  
  // Simple Sobel edge detection
  const edges = new Uint8Array(width * height);
  let edgeCount = 0;
  const threshold = 30;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Sobel X
      const gx = 
        -gray[(y-1)*width + (x-1)] + gray[(y-1)*width + (x+1)] +
        -2*gray[y*width + (x-1)] + 2*gray[y*width + (x+1)] +
        -gray[(y+1)*width + (x-1)] + gray[(y+1)*width + (x+1)];
      
      // Sobel Y
      const gy =
        -gray[(y-1)*width + (x-1)] - 2*gray[(y-1)*width + x] - gray[(y-1)*width + (x+1)] +
        gray[(y+1)*width + (x-1)] + 2*gray[(y+1)*width + x] + gray[(y+1)*width + (x+1)];
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      
      if (magnitude > threshold) {
        edges[idx] = 255;
        edgeCount++;
      }
    }
  }
  
  // Calculate edge density - if significant edges found, likely a card is present
  const edgeDensity = edgeCount / (width * height);
  
  // Look for rectangular pattern (card-like shape)
  // Check if edges form roughly a rectangle in the center area
  const centerX = width / 2;
  const centerY = height / 2;
  const checkRadius = Math.min(width, height) * 0.3;
  
  let centerEdges = 0;
  let borderEdges = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] === 255) {
        const distFromCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        if (distFromCenter < checkRadius) {
          centerEdges++;
        } else {
          borderEdges++;
        }
      }
    }
  }
  
  // A business card typically has more edges in the center (text) 
  // and clear edges at borders (card outline)
  const hasCardPattern = edgeDensity > 0.02 && edgeDensity < 0.15;
  
  return {
    detected: hasCardPattern,
    confidence: Math.min(100, Math.round(edgeDensity * 500)),
    edgeDensity
  };
};

const ScanPage = () => {
  const navigate = useNavigate();
  const { currentProject } = useApp();
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectionCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  
  const [frontImage, setFrontImage] = useState(null);
  const [backImage, setBackImage] = useState(null);
  const [hasBack, setHasBack] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);
  const [cardDetected, setCardDetected] = useState(false);
  const [detectionConfidence, setDetectionConfidence] = useState(0);
  const [autoCapturing, setAutoCapturing] = useState(false);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Rear camera
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
        
        // Start edge detection loop if auto-detect is enabled
        if (autoDetect) {
          startEdgeDetection();
        }
      }
    } catch (err) {
      console.error("Camera error:", err);
      toast.error("Impossibile accedere alla fotocamera");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    setCameraActive(false);
    setCardDetected(false);
    setDetectionConfidence(0);
  };

  const startEdgeDetection = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    
    detectionIntervalRef.current = setInterval(() => {
      if (!videoRef.current || !detectionCanvasRef.current || autoCapturing) return;
      
      const video = videoRef.current;
      const canvas = detectionCanvasRef.current;
      
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
      
      // Use smaller canvas for faster detection
      const scale = 0.25;
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const result = detectCardEdges(canvas);
      setCardDetected(result.detected);
      setDetectionConfidence(result.confidence);
      
      // Auto-capture if card detected with high confidence for 1.5 seconds
      if (result.detected && result.confidence > 50 && autoDetect && !autoCapturing) {
        setAutoCapturing(true);
        toast.info("Biglietto rilevato! Acquisizione in corso...");
        
        setTimeout(() => {
          captureFromCamera("front");
        }, 500);
      }
    }, 200); // Check every 200ms
  };

  const captureFromCamera = async (side) => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Capture at full resolution
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    
    // Convert to grayscale
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    convertToGrayscale(imageData, ctx, canvas.width, canvas.height);
    
    // Get compressed grayscale image
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          toast.error("Errore nella cattura");
          setAutoCapturing(false);
          return;
        }
        
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(",")[1];
          const sizeKB = Math.round(blob.size / 1024);
          
          if (side === "front") {
            setFrontImage({ base64, preview: reader.result, sizeKB });
            toast.success(`Immagine catturata (${sizeKB}KB - scala di grigi)`);
          } else {
            setBackImage({ base64, preview: reader.result, sizeKB });
            toast.success(`Retro catturato (${sizeKB}KB)`);
          }
          
          stopCamera();
          setAutoCapturing(false);
        };
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      0.75
    );
  };

  const handleFileSelect = async (e, side) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Seleziona un file immagine");
      return;
    }

    setCompressing(true);
    toast.info("Conversione in scala di grigi...");

    try {
      const compressed = await compressImageGrayscale(file);
      if (side === "front") {
        setFrontImage({ file, base64: compressed.base64, preview: compressed.preview, sizeKB: compressed.sizeKB });
      } else {
        setBackImage({ file, base64: compressed.base64, preview: compressed.preview, sizeKB: compressed.sizeKB });
      }
      toast.success(`Immagine pronta (${compressed.sizeKB}KB - scala di grigi)`);
    } catch (error) {
      console.error("Compression error:", error);
      toast.error("Errore nell'elaborazione immagine");
    } finally {
      setCompressing(false);
    }
  };

  const clearImage = (side) => {
    if (side === "front") {
      setFrontImage(null);
    } else {
      setBackImage(null);
    }
    setScanResult(null);
  };

  const scanCard = async () => {
    if (!frontImage) {
      toast.error("Cattura o carica il fronte del biglietto");
      return;
    }

    setScanning(true);
    setScanResult(null);

    try {
      const res = await fetch(`${API}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_front: frontImage.base64,
          image_back: backImage?.base64 || null
        })
      });

      if (res.ok) {
        const extractedData = await res.json();
        
        const contactData = {
          first_name: extractedData.first_name || '',
          middle_name: extractedData.middle_name || '',
          last_name: extractedData.last_name || '',
          full_name: `${extractedData.first_name || ''} ${extractedData.last_name || ''}`.trim(),
          full_name_original: extractedData.full_name_original || '',
          job_title: extractedData.job_title || '',
          department: extractedData.department || '',
          mobile_phone: extractedData.mobile_phone || '',
          direct_phone: extractedData.direct_phone || '',
          office_phone: extractedData.office_phone || '',
          primary_email: extractedData.primary_email || '',
          secondary_email: extractedData.secondary_email || '',
          linkedin_url: extractedData.linkedin_url || '',
          personal_website: extractedData.personal_website || '',
          company_name_display: extractedData.company_name_display || '',
          brand_name: extractedData.brand_name || '',
          legal_company_name: extractedData.legal_company_name || '',
          address: extractedData.address || '',
          postal_code: extractedData.postal_code || '',
          country: extractedData.country || '',
          import_source_type: 'scan',
          confidence_score: extractedData.confidence_score || 0,
          validation_status: 'pending',
          review_status: (extractedData.confidence_score || 0) < 80 ? 'needs_review' : 'approved',
          duplicate_status: 'none',
          ai_notes: extractedData.ai_notes || ''
        };

        const savedContact = await db.createContact(currentProject.id, contactData);
        
        let savedCompany = null;
        if (extractedData.company_name_display || extractedData.brand_name) {
          savedCompany = await db.createCompany(currentProject.id, {
            legal_company_name: extractedData.legal_company_name || '',
            brand_name: extractedData.brand_name || '',
            company_display_name: extractedData.company_name_display || '',
            website: extractedData.website || '',
            main_phone: extractedData.office_phone || '',
            address: extractedData.address || '',
            postal_code: extractedData.postal_code || '',
            country: extractedData.country || '',
            industry: extractedData.industry || ''
          });
        }

        setScanResult({
          contact: savedContact,
          company: savedCompany,
          extracted_data: extractedData
        });
        toast.success("Biglietto scansionato con successo!");
      } else {
        const error = await res.json();
        const errorMsg = error.detail || "Scansione fallita";
        if (errorMsg.includes("exceeds") || errorMsg.includes("size")) {
          toast.error("Immagine troppo grande. Riprova con un'immagine più piccola.");
        } else if (errorMsg.includes("API key") || errorMsg.includes("key")) {
          toast.error("Problema con API key. Controlla le Impostazioni.");
        } else {
          toast.error(errorMsg);
        }
      }
    } catch (e) {
      console.error("Scan error:", e);
      toast.error("Errore nella scansione. Riprova.");
    } finally {
      setScanning(false);
    }
  };

  const scanAgain = () => {
    setFrontImage(null);
    setBackImage(null);
    setScanResult(null);
    setHasBack(false);
  };

  if (!currentProject) {
    return (
      <PageTransition>
        <Header title="Scansiona" showBack />
        <main className="p-4 text-center py-16">
          <p className="text-muted-foreground mb-4">Seleziona prima un progetto</p>
          <Button onClick={() => navigate("/")} className="rounded-full">
            Vai ai Progetti
          </Button>
        </main>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <Header title="Scansiona Biglietto" showBack />

      <main className="p-4 max-w-lg mx-auto pb-24">
        {/* Hidden canvases for processing */}
        <canvas ref={canvasRef} className="hidden" />
        <canvas ref={detectionCanvasRef} className="hidden" />
        
        {/* Camera View */}
        {cameraActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-4"
          >
            <Card className="border overflow-hidden">
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full aspect-[4/3] object-cover bg-black"
                />
                
                {/* Detection overlay */}
                <div className={`absolute inset-0 border-4 transition-colors pointer-events-none ${
                  cardDetected ? 'border-green-500' : 'border-transparent'
                }`}>
                  {cardDetected && (
                    <div className="absolute top-2 left-2 right-2">
                      <Badge className="bg-green-500 text-white">
                        <Scan className="h-3 w-3 mr-1" />
                        Biglietto rilevato ({detectionConfidence}%)
                      </Badge>
                    </div>
                  )}
                </div>
                
                {/* Camera controls */}
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
                  <Button
                    size="lg"
                    className="rounded-full h-14 w-14 bg-white text-black hover:bg-gray-100"
                    onClick={() => captureFromCamera("front")}
                    data-testid="capture-btn"
                  >
                    <Camera className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="rounded-full h-14 w-14 bg-white/80"
                    onClick={stopCamera}
                  >
                    <X className="h-6 w-6" />
                  </Button>
                </div>
              </div>
              
              {/* Auto-detect toggle */}
              <CardContent className="p-3 bg-secondary/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scan className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="auto-detect" className="text-sm">
                      Acquisizione automatica
                    </Label>
                  </div>
                  <Switch
                    id="auto-detect"
                    checked={autoDetect}
                    onCheckedChange={(checked) => {
                      setAutoDetect(checked);
                      if (checked && cameraActive) {
                        startEdgeDetection();
                      }
                    }}
                    data-testid="auto-detect-switch"
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {!scanResult && !cameraActive && (
          <>
            {/* Front Image */}
            <Card className="border mb-4" data-testid="front-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium font-['Manrope']">Fronte del Biglietto</h3>
                  {frontImage && (
                    <Badge variant="secondary" className="text-xs">
                      {frontImage.sizeKB}KB • Scala di grigi
                    </Badge>
                  )}
                </div>
                
                {frontImage ? (
                  <div className="relative">
                    <img
                      src={frontImage.preview}
                      alt="Front"
                      className="w-full h-48 object-contain rounded-lg bg-secondary"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 rounded-full h-8 w-8"
                      onClick={() => clearImage("front")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-24 flex-col gap-2 rounded-xl"
                      onClick={startCamera}
                      disabled={compressing}
                      data-testid="camera-btn"
                    >
                      <Video className="h-6 w-6" />
                      <span className="text-xs">Fotocamera</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-24 flex-col gap-2 rounded-xl"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={compressing}
                      data-testid="upload-btn"
                    >
                      {compressing ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <Upload className="h-6 w-6" />
                      )}
                      <span className="text-xs">Carica</span>
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e, "front")}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Back Image Toggle */}
            <Card className="border mb-4">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="has-back" className="font-medium font-['Manrope']">
                      Biglietto con retro
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Attiva se il biglietto ha informazioni sul retro
                    </p>
                  </div>
                  <Switch
                    id="has-back"
                    checked={hasBack}
                    onCheckedChange={setHasBack}
                    data-testid="has-back-switch"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Back Image (if enabled) */}
            {hasBack && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card className="border mb-4" data-testid="back-card">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium font-['Manrope']">Retro del Biglietto</h3>
                      {backImage && (
                        <Badge variant="secondary" className="text-xs">
                          {backImage.sizeKB}KB
                        </Badge>
                      )}
                    </div>
                    
                    {backImage ? (
                      <div className="relative">
                        <img
                          src={backImage.preview}
                          alt="Back"
                          className="w-full h-48 object-contain rounded-lg bg-secondary"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2 rounded-full h-8 w-8"
                          onClick={() => clearImage("back")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 h-20 flex-col gap-2 rounded-xl"
                          onClick={() => {
                            // Use camera for back
                            cameraInputRef.current?.click();
                          }}
                          data-testid="camera-back-btn"
                        >
                          <Camera className="h-5 w-5" />
                          <span className="text-xs">Scatta</span>
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 h-20 flex-col gap-2 rounded-xl"
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = "image/*";
                            input.onchange = (e) => handleFileSelect(e, "back");
                            input.click();
                          }}
                          data-testid="upload-back-btn"
                        >
                          <Upload className="h-5 w-5" />
                          <span className="text-xs">Carica</span>
                        </Button>
                        <input
                          ref={cameraInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => handleFileSelect(e, "back")}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Grayscale Info */}
            <Card className="border mb-4 bg-blue-50 dark:bg-blue-900/20">
              <CardContent className="p-3">
                <div className="flex gap-2 items-start">
                  <Square className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Scala di grigi attiva</span>
                    <br />
                    Le immagini vengono convertite in scala di grigi per ridurre il peso e velocizzare l'elaborazione.
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Scan Button */}
            <Button
              onClick={scanCard}
              disabled={!frontImage || scanning}
              className="w-full h-14 rounded-full font-semibold text-lg"
              data-testid="scan-btn"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Elaborazione in corso...
                </>
              ) : (
                <>
                  <Scan className="h-5 w-5 mr-2" />
                  Estrai Dati
                </>
              )}
            </Button>
          </>
        )}

        {/* Scan Result */}
        {scanResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border bg-green-50 dark:bg-green-900/20 mb-4" data-testid="scan-result">
              <CardContent className="py-6">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check className="h-6 w-6 text-green-600" />
                  </div>
                </div>
                <h3 className="font-semibold font-['Manrope'] text-center text-lg mb-4">
                  Contatto Salvato!
                </h3>
                
                <div className="space-y-2 text-sm">
                  {scanResult.contact.full_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nome:</span>
                      <span className="font-medium">{scanResult.contact.full_name}</span>
                    </div>
                  )}
                  {scanResult.contact.job_title && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ruolo:</span>
                      <span>{scanResult.contact.job_title}</span>
                    </div>
                  )}
                  {scanResult.contact.company_name_display && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Azienda:</span>
                      <span>{scanResult.contact.company_name_display}</span>
                    </div>
                  )}
                  {scanResult.contact.primary_email && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Email:</span>
                      <span className="truncate ml-2">{scanResult.contact.primary_email}</span>
                    </div>
                  )}
                  {scanResult.contact.mobile_phone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Telefono:</span>
                      <span>{scanResult.contact.mobile_phone}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={scanAgain}
                className="flex-1 h-12 rounded-full"
                data-testid="scan-another-btn"
              >
                <Camera className="h-4 w-4 mr-2" />
                Scansiona Altro
              </Button>
              <Button
                onClick={() => navigate("/contacts")}
                className="flex-1 h-12 rounded-full"
                data-testid="view-contacts-btn"
              >
                Vedi Contatti
              </Button>
            </div>
          </motion.div>
        )}

        {/* Batch Scan Link */}
        {!scanResult && !cameraActive && (
          <div className="mt-6 text-center">
            <Button
              variant="link"
              onClick={() => navigate("/scan/batch")}
              className="text-muted-foreground"
              data-testid="batch-scan-link"
            >
              Hai più biglietti? Usa la scansione PDF batch
            </Button>
          </div>
        )}
      </main>
    </PageTransition>
  );
};

export default ScanPage;
