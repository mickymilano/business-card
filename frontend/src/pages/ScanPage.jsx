import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition, API } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Camera, Upload, Image, X, Loader2, Check, AlertCircle, FileText } from "lucide-react";
import * as db from "@/services/db";

// Fast image compression - optimized for mobile
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    // Create object URL instead of reading entire file as base64 first
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl); // Clean up
      
      // Target: max 1200px on longest side (sufficient for OCR, much faster)
      const MAX_SIZE = 1200;
      let width = img.width;
      let height = img.height;
      
      // Only resize if needed
      if (width > MAX_SIZE || height > MAX_SIZE) {
        const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      
      // Use OffscreenCanvas if available (faster, runs off main thread)
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "medium";
      ctx.drawImage(img, 0, 0, width, height);
      
      // Single compression pass with fixed quality (0.7 is good balance)
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
            console.log(`Compressed: ${img.width}x${img.height} -> ${width}x${height}, ${sizeKB}KB`);
            
            resolve({
              base64,
              preview: reader.result
            });
          };
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.7 // Fixed quality - no loops
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image"));
    };
    
    img.src = objectUrl;
  });
};

const ScanPage = () => {
  const navigate = useNavigate();
  const { currentProject } = useApp();
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  
  const [frontImage, setFrontImage] = useState(null);
  const [backImage, setBackImage] = useState(null);
  const [hasBack, setHasBack] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [compressing, setCompressing] = useState(false);

  if (!currentProject) {
    return (
      <PageTransition>
        <Header title="Scan Card" showBack />
        <main className="p-4 text-center py-16">
          <p className="text-muted-foreground mb-4">Please select a project first</p>
          <Button onClick={() => navigate("/")} className="rounded-full">
            Go to Projects
          </Button>
        </main>
      </PageTransition>
    );
  }

  const handleFileSelect = async (e, side) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    setCompressing(true);
    toast.info("Optimizing image...");

    try {
      const compressed = await compressImage(file);
      if (side === "front") {
        setFrontImage({ file, base64: compressed.base64, preview: compressed.preview });
      } else {
        setBackImage({ file, base64: compressed.base64, preview: compressed.preview });
      }
      toast.success("Image ready");
    } catch (error) {
      console.error("Compression error:", error);
      toast.error("Failed to process image");
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
      toast.error("Please capture or upload the front of the card");
      return;
    }

    setScanning(true);
    setScanResult(null);

    try {
      // Call backend API for AI extraction only
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
        
        // Save contact to IndexedDB
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
        
        // Save company if present
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
        toast.success("Card scanned successfully!");
      } else {
        const error = await res.json();
        const errorMsg = error.detail || "Scan failed";
        if (errorMsg.includes("exceeds") || errorMsg.includes("size")) {
          toast.error("Image too large. Please try a smaller image.");
        } else if (errorMsg.includes("API key") || errorMsg.includes("key")) {
          toast.error("API key issue. Check Settings.");
        } else {
          toast.error(errorMsg);
        }
      }
    } catch (e) {
      console.error("Scan error:", e);
      toast.error("Failed to scan card. Please try again.");
    } finally {
      setScanning(false);
    }
  };

  const resetScan = () => {
    setFrontImage(null);
    setBackImage(null);
    setScanResult(null);
    setHasBack(false);
  };

  const viewContact = () => {
    if (scanResult?.contact?.id) {
      navigate(`/contacts/${scanResult.contact.id}`);
    }
  };

  return (
    <PageTransition>
      <Header title="Scan Business Card" showBack />

      <main className="p-4 max-w-md mx-auto">
        {/* Project Info */}
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground">
            Scanning for project: <span className="font-medium text-foreground">{currentProject.name}</span>
          </p>
        </div>

        {/* Batch PDF Banner */}
        <Card 
          className="mb-6 border bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 cursor-pointer hover:shadow-md transition-all"
          onClick={() => navigate("/scan/batch")}
          data-testid="batch-scan-banner"
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-sm">Have many cards?</h4>
                <p className="text-xs text-muted-foreground">Upload a PDF with multiple cards per page</p>
              </div>
              <Button size="sm" variant="secondary" className="rounded-full">
                Batch Scan
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Toggle for back side */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <Switch
            id="has-back"
            checked={hasBack}
            onCheckedChange={setHasBack}
            data-testid="has-back-toggle"
          />
          <Label htmlFor="has-back" className="text-sm cursor-pointer">
            Card has back side
          </Label>
        </div>

        {/* Front Image Capture */}
        <Card className="mb-4 border overflow-hidden" data-testid="front-card-zone">
          <CardContent className="p-0">
            {frontImage ? (
              <div className="relative">
                <img 
                  src={frontImage.preview} 
                  alt="Front of card" 
                  className="w-full h-48 object-cover"
                />
                <button
                  onClick={() => clearImage("front")}
                  className="absolute top-2 right-2 h-8 w-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                  data-testid="clear-front-image"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                  Front
                </div>
              </div>
            ) : (
              <div className="upload-zone h-48 flex flex-col items-center justify-center m-4">
                <Camera className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="font-medium mb-1">Front of Card</p>
                <p className="text-sm text-muted-foreground mb-4">Take photo or upload image</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cameraInputRef.current?.click()}
                    className="rounded-full"
                    data-testid="capture-front-btn"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Camera
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full"
                    data-testid="upload-front-btn"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Back Image Capture (conditional) */}
        {hasBack && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="mb-4 border overflow-hidden" data-testid="back-card-zone">
              <CardContent className="p-0">
                {backImage ? (
                  <div className="relative">
                    <img 
                      src={backImage.preview} 
                      alt="Back of card" 
                      className="w-full h-48 object-cover"
                    />
                    <button
                      onClick={() => clearImage("back")}
                      className="absolute top-2 right-2 h-8 w-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                      data-testid="clear-back-image"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                      Back
                    </div>
                  </div>
                ) : (
                  <div className="upload-zone h-48 flex flex-col items-center justify-center m-4">
                    <Image className="h-8 w-8 text-muted-foreground mb-3" />
                    <p className="font-medium mb-1">Back of Card</p>
                    <p className="text-sm text-muted-foreground mb-4">Optional: capture back side</p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById("back-camera")?.click()}
                        className="rounded-full"
                        data-testid="capture-back-btn"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Camera
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById("back-file")?.click()}
                        className="rounded-full"
                        data-testid="upload-back-btn"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e, "front")}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFileSelect(e, "front")}
        />
        <input
          id="back-file"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e, "back")}
        />
        <input
          id="back-camera"
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFileSelect(e, "back")}
        />

        {/* Scan Result */}
        {scanResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="mb-4 border bg-green-50 dark:bg-green-900/20" data-testid="scan-result">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold font-['Manrope']">
                      {scanResult.contact?.full_name || "Contact Extracted"}
                    </h3>
                    {scanResult.contact?.job_title && (
                      <p className="text-sm text-muted-foreground">{scanResult.contact.job_title}</p>
                    )}
                    {scanResult.contact?.company_name_display && (
                      <p className="text-sm text-muted-foreground">{scanResult.contact.company_name_display}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        scanResult.contact?.confidence_score >= 80 
                          ? "confidence-high" 
                          : scanResult.contact?.confidence_score >= 60 
                          ? "confidence-medium" 
                          : "confidence-low"
                      }`}>
                        {scanResult.contact?.confidence_score}% confidence
                      </span>
                      {scanResult.duplicates?.length > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                          Potential duplicate
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          {!scanResult ? (
            <Button
              onClick={scanCard}
              disabled={!frontImage || scanning}
              className="h-14 rounded-full font-semibold text-base"
              data-testid="scan-btn"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Scanning with AI...
                </>
              ) : (
                <>
                  <Camera className="h-5 w-5 mr-2" />
                  Scan Card
                </>
              )}
            </Button>
          ) : (
            <>
              <Button
                onClick={viewContact}
                className="h-14 rounded-full font-semibold text-base"
                data-testid="view-contact-btn"
              >
                View & Edit Contact
              </Button>
              <Button
                variant="outline"
                onClick={resetScan}
                className="h-12 rounded-full"
                data-testid="scan-another-btn"
              >
                Scan Another Card
              </Button>
            </>
          )}
        </div>
      </main>
    </PageTransition>
  );
};

export default ScanPage;
