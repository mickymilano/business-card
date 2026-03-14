import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition, API } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Camera, Upload, X, Loader2, Check, Scan } from "lucide-react";
import * as db from "@/services/db";

// Compress and convert to grayscale
const compressImageGrayscale = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        // Target: max 1200px
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
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to grayscale
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
        
        // Compress
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Compression failed"));
              return;
            }
            const reader2 = new FileReader();
            reader2.onloadend = () => {
              resolve({
                base64: reader2.result.split(",")[1],
                preview: reader2.result,
                sizeKB: Math.round(blob.size / 1024)
              });
            };
            reader2.readAsDataURL(blob);
          },
          "image/jpeg",
          0.75
        );
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
};

const ScanPage = () => {
  const navigate = useNavigate();
  const { currentProject } = useApp();
  const frontInputRef = useRef(null);
  const backInputRef = useRef(null);
  
  const [frontImage, setFrontImage] = useState(null);
  const [backImage, setBackImage] = useState(null);
  const [hasBack, setHasBack] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [compressing, setCompressing] = useState(false);

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

  const handleImageSelect = async (e, side) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Seleziona un'immagine");
      return;
    }

    setCompressing(true);
    try {
      const compressed = await compressImageGrayscale(file);
      if (side === "front") {
        setFrontImage(compressed);
      } else {
        setBackImage(compressed);
      }
      toast.success(`Immagine pronta (${compressed.sizeKB}KB)`);
    } catch (error) {
      console.error("Compression error:", error);
      toast.error("Errore nell'elaborazione");
    } finally {
      setCompressing(false);
    }
  };

  const clearImage = (side) => {
    if (side === "front") {
      setFrontImage(null);
      if (frontInputRef.current) frontInputRef.current.value = '';
    } else {
      setBackImage(null);
      if (backInputRef.current) backInputRef.current.value = '';
    }
    setScanResult(null);
  };

  const scanCard = async () => {
    if (!frontImage) {
      toast.error("Scatta o carica il fronte del biglietto");
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
        toast.success("Biglietto scansionato!");
      } else {
        const error = await res.json();
        toast.error(error.detail || "Scansione fallita");
      }
    } catch (e) {
      console.error("Scan error:", e);
      toast.error("Errore nella scansione");
    } finally {
      setScanning(false);
    }
  };

  const scanAgain = () => {
    setFrontImage(null);
    setBackImage(null);
    setScanResult(null);
    setHasBack(false);
    if (frontInputRef.current) frontInputRef.current.value = '';
    if (backInputRef.current) backInputRef.current.value = '';
  };

  return (
    <PageTransition>
      <Header title="Scansiona Biglietto" showBack />

      <main className="p-4 max-w-lg mx-auto pb-24">
        {!scanResult && (
          <>
            {/* Front Image */}
            <Card className="border mb-4" data-testid="front-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium font-['Manrope']">Fronte del Biglietto</h3>
                  {frontImage && (
                    <Badge variant="secondary" className="text-xs">
                      {frontImage.sizeKB}KB • B/N
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
                      onClick={() => frontInputRef.current?.click()}
                      disabled={compressing}
                      data-testid="camera-front-btn"
                    >
                      {compressing ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <Camera className="h-6 w-6" />
                      )}
                      <span className="text-xs">Scatta Foto</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-24 flex-col gap-2 rounded-xl"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/*";
                        input.onchange = (e) => handleImageSelect(e, "front");
                        input.click();
                      }}
                      disabled={compressing}
                      data-testid="upload-front-btn"
                    >
                      <Upload className="h-6 w-6" />
                      <span className="text-xs">Carica</span>
                    </Button>
                    <input
                      ref={frontInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handleImageSelect(e, "front")}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Back Toggle */}
            <Card className="border mb-4">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="has-back" className="font-medium font-['Manrope']">
                      Biglietto con retro
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Attiva se ci sono info sul retro
                    </p>
                  </div>
                  <Switch
                    id="has-back"
                    checked={hasBack}
                    onCheckedChange={setHasBack}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Back Image */}
            {hasBack && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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
                          onClick={() => backInputRef.current?.click()}
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
                            input.onchange = (e) => handleImageSelect(e, "back");
                            input.click();
                          }}
                          data-testid="upload-back-btn"
                        >
                          <Upload className="h-5 w-5" />
                          <span className="text-xs">Carica</span>
                        </Button>
                        <input
                          ref={backInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => handleImageSelect(e, "back")}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Info */}
            <Card className="border mb-4 bg-blue-50 dark:bg-blue-900/20">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">
                  Le immagini vengono convertite in <strong>scala di grigi</strong> per ridurre il peso e velocizzare l'elaborazione.
                </p>
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
                  Elaborazione...
                </>
              ) : (
                <>
                  <Scan className="h-5 w-5 mr-2" />
                  Estrai Dati
                </>
              )}
            </Button>

            {/* Batch Link */}
            <div className="mt-6 text-center">
              <Button
                variant="link"
                onClick={() => navigate("/scan/batch")}
                className="text-muted-foreground"
              >
                Hai più biglietti? Usa la scansione PDF batch
              </Button>
            </div>
          </>
        )}

        {/* Result */}
        {scanResult && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
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
                      <span className="text-muted-foreground">Tel:</span>
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
              >
                <Camera className="h-4 w-4 mr-2" />
                Scansiona Altro
              </Button>
              <Button
                onClick={() => navigate("/contacts")}
                className="flex-1 h-12 rounded-full"
              >
                Vedi Contatti
              </Button>
            </div>
          </motion.div>
        )}
      </main>
    </PageTransition>
  );
};

export default ScanPage;
