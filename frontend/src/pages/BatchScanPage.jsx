import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition, API } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FileText, Upload, Loader2, Check, X, AlertCircle, 
  Users, Building2, ChevronRight, FileWarning
} from "lucide-react";
import * as db from "@/services/db";

const BatchScanPage = () => {
  const navigate = useNavigate();
  const { currentProject } = useApp();
  const fileInputRef = useRef(null);
  
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  if (!currentProject) {
    return (
      <PageTransition>
        <Header title="Batch Scan" showBack />
        <main className="p-4 text-center py-16">
          <p className="text-muted-foreground mb-4">Seleziona prima un progetto</p>
          <Button onClick={() => navigate("/")} className="rounded-full">
            Vai ai Progetti
          </Button>
        </main>
      </PageTransition>
    );
  }

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      toast.error("Seleziona un file PDF");
      return;
    }

    // Check size (max 50MB)
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error("PDF troppo grande (max 50MB)");
      return;
    }

    setFile(selectedFile);
    setResult(null);
    setError(null);
  };

  // Poll job status
  const pollJobStatus = async (id) => {
    try {
      const res = await fetch(`${API}/scan/batch/${id}`);
      if (!res.ok) {
        throw new Error("Errore nel recupero stato");
      }
      
      const data = await res.json();
      
      setProgress(data.progress);
      setCurrentPage(data.current_page);
      setTotalPages(data.total_pages);
      
      if (data.status === "processing") {
        setStatusMessage(`Elaborazione pagina ${data.current_page} di ${data.total_pages}...`);
      } else if (data.status === "queued") {
        setStatusMessage("In coda...");
      }
      
      if (data.status === "completed") {
        // Save all contacts to IndexedDB
        let contactsCreated = 0;
        let needsReview = 0;
        
        for (const extractedCard of data.contacts || []) {
          const contactData = {
            first_name: extractedCard.first_name || '',
            middle_name: extractedCard.middle_name || '',
            last_name: extractedCard.last_name || '',
            full_name: `${extractedCard.first_name || ''} ${extractedCard.last_name || ''}`.trim(),
            full_name_original: extractedCard.full_name_original || '',
            job_title: extractedCard.job_title || '',
            department: extractedCard.department || '',
            mobile_phone: extractedCard.mobile_phone || '',
            direct_phone: extractedCard.direct_phone || '',
            office_phone: extractedCard.office_phone || '',
            primary_email: extractedCard.primary_email || '',
            secondary_email: extractedCard.secondary_email || '',
            linkedin_url: extractedCard.linkedin_url || '',
            personal_website: extractedCard.personal_website || '',
            company_name_display: extractedCard.company_name_display || '',
            brand_name: extractedCard.brand_name || '',
            legal_company_name: extractedCard.legal_company_name || '',
            address: extractedCard.address || '',
            postal_code: extractedCard.postal_code || '',
            country: extractedCard.country || '',
            import_source_type: 'batch_pdf',
            import_source_file: file.name,
            confidence_score: extractedCard.confidence_score || 0,
            validation_status: 'pending',
            review_status: (extractedCard.confidence_score || 0) < 80 ? 'needs_review' : 'approved',
            duplicate_status: 'none',
            ai_notes: extractedCard.ai_notes || ''
          };

          await db.createContact(currentProject.id, contactData);
          contactsCreated++;
          if ((extractedCard.confidence_score || 0) < 80) needsReview++;
          
          if (extractedCard.company_name_display || extractedCard.brand_name) {
            await db.createCompany(currentProject.id, {
              legal_company_name: extractedCard.legal_company_name || '',
              brand_name: extractedCard.brand_name || '',
              company_display_name: extractedCard.company_name_display || '',
              website: extractedCard.website || '',
              main_phone: extractedCard.office_phone || '',
              address: extractedCard.address || '',
              postal_code: extractedCard.postal_code || '',
              country: extractedCard.country || '',
              industry: extractedCard.industry || ''
            });
          }
        }

        setResult({
          total_pages: data.total_pages,
          total_cards_found: data.contacts_found,
          contacts_created: contactsCreated,
          needs_review: needsReview,
          page_results: data.page_results || []
        });
        setProcessing(false);
        setStatusMessage("");
        toast.success(`Trovati ${data.contacts_found} biglietti da visita!`);
        return true; // Stop polling
        
      } else if (data.status === "failed") {
        setError(data.error || "Elaborazione fallita");
        setProcessing(false);
        toast.error(data.error || "Elaborazione fallita");
        return true; // Stop polling
      }
      
      return false; // Continue polling
    } catch (e) {
      console.error("Poll error:", e);
      return false; // Continue polling
    }
  };

  const processPDF = async () => {
    if (!file) return;

    setProcessing(true);
    setProgress(5);
    setError(null);
    setStatusMessage("Caricamento PDF...");

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Start the job
      const res = await fetch(`${API}/scan/batch`, {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        const id = data.job_id;
        setJobId(id);
        setTotalPages(data.total_pages);
        setStatusMessage(`Avviata elaborazione di ${data.total_pages} pagine...`);
        toast.info(`Elaborazione ${data.total_pages} pagine. Attendere...`);
        
        // Start polling
        const pollInterval = setInterval(async () => {
          const done = await pollJobStatus(id);
          if (done) {
            clearInterval(pollInterval);
          }
        }, 2000); // Poll every 2 seconds
        
      } else {
        const errorData = await res.json();
        setError(errorData.detail || "Errore nell'avvio elaborazione");
        setProcessing(false);
        toast.error(errorData.detail || "Errore nell'avvio elaborazione");
      }
    } catch (e) {
      console.error("Batch processing error:", e);
      setError("Impossibile elaborare il PDF. Riprova.");
      setProcessing(false);
      toast.error("Impossibile elaborare il PDF");
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setProgress(0);
    setJobId(null);
    setCurrentPage(0);
    setTotalPages(0);
    setStatusMessage("");
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <PageTransition>
      <Header title="Scansione PDF Batch" showBack />

      <main className="p-4 max-w-2xl mx-auto">
        {/* Project Info */}
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground">
            Progetto: <span className="font-medium text-foreground">{currentProject.name}</span>
          </p>
        </div>

        {/* Info Card */}
        <Card className="border mb-6 bg-blue-50 dark:bg-blue-900/20">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <FileText className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-sm">Modalità Elaborazione Batch</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Carica un PDF con più biglietti da visita per pagina (max 10 per pagina).
                  Ogni pagina viene elaborata con una singola chiamata AI.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* File Upload Zone */}
        {!file && !result && (
          <Card 
            className="border cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            data-testid="pdf-upload-zone"
          >
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold font-['Manrope'] text-lg mb-2">
                Carica PDF con Biglietti da Visita
              </h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">
                Supporta PDF multi-pagina con fino a 10 biglietti per pagina
              </p>
              <Button className="rounded-full" data-testid="select-pdf-btn">
                <Upload className="h-4 w-4 mr-2" />
                Seleziona File PDF
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
                Dimensione massima: 50MB
              </p>
            </CardContent>
          </Card>
        )}

        {/* Selected File */}
        {file && !result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border mb-4">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <FileText className="h-6 w-6 text-red-600" />
                    </div>
                    <div>
                      <h4 className="font-medium truncate max-w-[200px]">{file.name}</h4>
                      <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={reset}
                    className="h-8 w-8"
                    data-testid="clear-file-btn"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {processing && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">
                        {statusMessage || "Elaborazione PDF..."}
                      </span>
                      <span className="font-medium">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    {totalPages > 0 && (
                      <p className="text-xs text-muted-foreground mt-2 text-center">
                        Pagina {currentPage} di {totalPages}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {!processing && (
              <Button
                onClick={processPDF}
                className="w-full h-14 rounded-full font-semibold text-base"
                data-testid="process-pdf-btn"
              >
                <Loader2 className="h-5 w-5 mr-2" />
                Elabora PDF
              </Button>
            )}

            {processing && (
              <Button
                disabled
                className="w-full h-14 rounded-full font-semibold text-base"
              >
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Elaborazione in corso... Attendere
              </Button>
            )}
          </motion.div>
        )}

        {/* Error State */}
        {error && !processing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Card className="border bg-red-50 dark:bg-red-900/20 mb-4">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <div>
                    <h4 className="font-medium text-sm">Processing Failed</h4>
                    <p className="text-xs text-muted-foreground">{error}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Button
              variant="outline"
              onClick={reset}
              className="w-full h-12 rounded-full"
            >
              Try Again
            </Button>
          </motion.div>
        )}

        {/* Result */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="border bg-green-50 dark:bg-green-900/20 mb-4" data-testid="batch-result">
              <CardContent className="py-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="font-semibold font-['Manrope'] text-xl mb-2">
                  Elaborazione Completata!
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  {file?.name}
                </p>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto mb-6">
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-xl">
                    <div className="text-2xl font-bold text-primary">{result.total_pages}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Pagine</div>
                  </div>
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-xl">
                    <div className="text-2xl font-bold text-green-600">{result.total_cards_found}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Biglietti</div>
                  </div>
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-xl">
                    <div className="text-2xl font-bold text-blue-600">{result.contacts_created}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Contatti</div>
                  </div>
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-xl">
                    <div className="text-2xl font-bold text-yellow-600">{result.needs_review}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Da Revisare</div>
                  </div>
                </div>

                {/* Page Details */}
                {result.page_results && result.page_results.length > 0 && (
                  <div className="text-left">
                    <h4 className="text-sm font-medium mb-2">Dettagli Pagine</h4>
                    <ScrollArea className="h-32">
                      <div className="space-y-1">
                        {result.page_results.map((page, i) => (
                          <div 
                            key={i} 
                            className="flex items-center justify-between text-sm p-2 bg-white dark:bg-gray-800 rounded"
                          >
                            <span>Pagina {page.page}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{page.cards_found} biglietti</span>
                              {page.status === "success" ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <X className="h-4 w-4 text-red-600" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3">
              <Button
                onClick={() => navigate("/contacts")}
                className="h-12 rounded-full font-semibold"
                data-testid="view-contacts-btn"
              >
                <Users className="h-4 w-4 mr-2" />
                View Contacts ({result.contacts_created})
              </Button>
              
              {result.needs_review > 0 && (
                <Button
                  variant="outline"
                  onClick={() => navigate("/review")}
                  className="h-12 rounded-full"
                  data-testid="review-btn"
                >
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Review ({result.needs_review})
                </Button>
              )}
              
              <Button
                variant="outline"
                onClick={reset}
                className="h-12 rounded-full"
                data-testid="scan-another-btn"
              >
                Process Another PDF
              </Button>
            </div>
          </motion.div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileSelect}
        />
      </main>
    </PageTransition>
  );
};

export default BatchScanPage;
