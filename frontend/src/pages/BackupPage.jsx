import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Header, PageTransition } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { 
  Download, Upload, Cloud, CloudOff, Check, Loader2, 
  AlertTriangle, Smartphone, FolderSync, HardDrive
} from "lucide-react";
import * as db from "@/services/db";

const BackupPage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const backup = await db.createFullBackup();
      
      // Create and download file
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().split('T')[0];
      a.download = `ES_Cards_Backup_${date}.json`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success("Backup scaricato con successo!");
    } catch (e) {
      console.error("Export error:", e);
      toast.error("Errore durante il backup");
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast.error("Seleziona un file .json valido");
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.data || !backup.version) {
        toast.error("File di backup non valido");
        setImporting(false);
        return;
      }

      const result = await db.restoreFromBackup(backup, { merge: mergeMode });
      setImportResult(result);
      toast.success("Dati importati con successo!");
    } catch (e) {
      console.error("Import error:", e);
      toast.error("Errore durante l'importazione");
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <PageTransition>
      <Header title="Backup & Sync" showBack />

      <main className="p-4 max-w-lg mx-auto space-y-4">
        {/* Info Card */}
        <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
          <Smartphone className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sm">
            Usa il backup per trasferire i dati tra dispositivi diversi o browser.
            I dati sono salvati localmente su ogni dispositivo.
          </AlertDescription>
        </Alert>

        {/* Export Section */}
        <Card className="border" data-testid="backup-export-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-['Manrope'] flex items-center gap-2">
              <Download className="h-5 w-5 text-green-600" />
              Esporta Backup
            </CardTitle>
            <CardDescription>
              Scarica tutti i tuoi dati in un file JSON
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleExport}
              disabled={exporting}
              className="w-full h-12 rounded-full"
              data-testid="export-backup-btn"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Creando backup...
                </>
              ) : (
                <>
                  <HardDrive className="h-5 w-5 mr-2" />
                  Scarica Backup Completo
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Import Section */}
        <Card className="border" data-testid="backup-import-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-['Manrope'] flex items-center gap-2">
              <Upload className="h-5 w-5 text-orange-600" />
              Importa Backup
            </CardTitle>
            <CardDescription>
              Ripristina i dati da un file di backup
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Merge Option */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div className="space-y-0.5">
                <Label htmlFor="merge-mode" className="text-sm font-medium">
                  Unisci con dati esistenti
                </Label>
                <p className="text-xs text-muted-foreground">
                  {mergeMode 
                    ? "I nuovi dati verranno aggiunti a quelli esistenti" 
                    : "I dati esistenti verranno sostituiti"
                  }
                </p>
              </div>
              <Switch
                id="merge-mode"
                checked={mergeMode}
                onCheckedChange={setMergeMode}
                data-testid="merge-mode-switch"
              />
            </div>

            {!mergeMode && (
              <Alert className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-xs">
                  Attenzione: tutti i dati esistenti verranno eliminati prima dell'importazione.
                </AlertDescription>
              </Alert>
            )}

            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="w-full h-12 rounded-full"
              data-testid="import-backup-btn"
            >
              {importing ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <FolderSync className="h-5 w-5 mr-2" />
                  Seleziona File di Backup
                </>
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
          </CardContent>
        </Card>

        {/* Import Result */}
        {importResult && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border bg-green-50 dark:bg-green-900/20" data-testid="import-result">
              <CardContent className="py-6">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-lg">Importazione Completata!</h3>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{importResult.projects_imported}</div>
                    <div className="text-xs text-muted-foreground">Progetti</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{importResult.contacts_imported}</div>
                    <div className="text-xs text-muted-foreground">Contatti</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{importResult.companies_imported}</div>
                    <div className="text-xs text-muted-foreground">Aziende</div>
                  </div>
                </div>
                <Button
                  onClick={() => navigate("/")}
                  className="w-full mt-4 rounded-full"
                  data-testid="go-to-projects-btn"
                >
                  Vai ai Progetti
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Instructions */}
        <Card className="border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-['Manrope']">
              Come trasferire i dati
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs flex-shrink-0">1</span>
              <p>Sul dispositivo con i dati, clicca <strong>"Scarica Backup"</strong></p>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs flex-shrink-0">2</span>
              <p>Trasferisci il file .json sul nuovo dispositivo (AirDrop, email, cloud)</p>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs flex-shrink-0">3</span>
              <p>Sul nuovo dispositivo, clicca <strong>"Seleziona File di Backup"</strong></p>
            </div>
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs flex-shrink-0">4</span>
              <p>Seleziona il file .json scaricato per importare i dati</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </PageTransition>
  );
};

export default BackupPage;
