import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition, API } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Camera, Upload, Image, X, Loader2, Check, AlertCircle } from "lucide-react";

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

  const handleFileSelect = (e, side) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result.split(",")[1];
      if (side === "front") {
        setFrontImage({ file, base64, preview: event.target.result });
      } else {
        setBackImage({ file, base64, preview: event.target.result });
      }
    };
    reader.readAsDataURL(file);
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
      const res = await fetch(`${API}/projects/${currentProject.id}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: currentProject.id,
          image_front: frontImage.base64,
          image_back: backImage?.base64 || null,
          multiple_cards: false
        })
      });

      if (res.ok) {
        const result = await res.json();
        setScanResult(result);
        toast.success("Card scanned successfully!");
      } else {
        const error = await res.json();
        toast.error(error.detail || "Scan failed");
      }
    } catch (e) {
      toast.error("Failed to scan card. Please check your connection.");
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
