import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition, API } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Upload, FileSpreadsheet, Loader2, Check, ArrowRight, X } from "lucide-react";

const ImportPage = () => {
  const navigate = useNavigate();
  const { currentProject } = useApp();
  const fileInputRef = useRef(null);
  
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [step, setStep] = useState(1); // 1: upload, 2: mapping, 3: result

  if (!currentProject) {
    return (
      <PageTransition>
        <Header title="Import Excel" showBack />
        <main className="p-4 text-center py-16">
          <p className="text-muted-foreground mb-4">Please select a project first</p>
          <Button onClick={() => navigate("/")} className="rounded-full">
            Go to Projects
          </Button>
        </main>
      </PageTransition>
    );
  }

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv"
    ];
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const hasValidExtension = validExtensions.some(ext => 
      selectedFile.name.toLowerCase().endsWith(ext)
    );

    if (!validTypes.includes(selectedFile.type) && !hasValidExtension) {
      toast.error("Please select an Excel (.xlsx, .xls) or CSV file");
      return;
    }

    setFile(selectedFile);

    // Get preview
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`${API}/projects/${currentProject.id}/import/preview`, {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setPreview(data);
        setMapping(data.suggested_mappings || {});
        setStep(2);
      } else {
        const error = await res.json();
        toast.error(error.detail || "Failed to parse file");
      }
    } catch (e) {
      toast.error("Failed to preview file");
    }
  };

  const updateMapping = (sourceCol, targetField) => {
    setMapping(prev => ({
      ...prev,
      [sourceCol]: targetField === "skip" ? "" : targetField
    }));
  };

  const importFile = async () => {
    setImporting(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("column_mapping", JSON.stringify(mapping));

    try {
      const res = await fetch(`${API}/projects/${currentProject.id}/import`, {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        const result = await res.json();
        setImportResult(result);
        setStep(3);
        toast.success(`Imported ${result.rows_imported} contacts`);
      } else {
        const error = await res.json();
        toast.error(error.detail || "Import failed");
      }
    } catch (e) {
      toast.error("Failed to import file");
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setMapping({});
    setImportResult(null);
    setStep(1);
  };

  return (
    <PageTransition>
      <Header title="Import Contacts" showBack />

      <main className="p-4 max-w-2xl mx-auto">
        {/* Project Info */}
        <div className="text-center mb-6">
          <p className="text-sm text-muted-foreground">
            Importing to: <span className="font-medium text-foreground">{currentProject.name}</span>
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}>
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-8 h-0.5 ${step > s ? "bg-primary" : "bg-secondary"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card 
              className="border cursor-pointer hover:border-accent/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="upload-zone"
            >
              <CardContent className="py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                  <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold font-['Manrope'] text-lg mb-2">
                  Upload Excel or CSV File
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Supports .xlsx, .xls, and .csv formats
                </p>
                <Button className="rounded-full" data-testid="select-file-btn">
                  <Upload className="h-4 w-4 mr-2" />
                  Select File
                </Button>
              </CardContent>
            </Card>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileSelect}
            />
          </motion.div>
        )}

        {/* Step 2: Column Mapping */}
        {step === 2 && preview && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="border mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-['Manrope'] flex items-center justify-between">
                  <span>{preview.filename}</span>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    <X className="h-4 w-4" />
                  </Button>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {preview.row_count} rows found
                </p>
              </CardHeader>
            </Card>

            <Card className="border mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-['Manrope']">Map Columns</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Match your file columns to contact fields
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {preview.columns.map((col) => (
                    <div key={col} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <Label className="text-sm font-medium truncate block">{col}</Label>
                        <p className="text-xs text-muted-foreground truncate">
                          {preview.sample_rows[0]?.[col] || "—"}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <Select
                        value={mapping[col] || "skip"}
                        onValueChange={(v) => updateMapping(col, v)}
                      >
                        <SelectTrigger className="w-40" data-testid={`mapping-${col}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">— Skip —</SelectItem>
                          {preview.target_fields.map((field) => (
                            <SelectItem key={field} value={field}>
                              {field.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Preview Table */}
            <Card className="border mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-['Manrope']">Preview</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-48">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {preview.columns.slice(0, 5).map((col) => (
                          <TableHead key={col} className="text-xs whitespace-nowrap">
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.sample_rows.slice(0, 3).map((row, i) => (
                        <TableRow key={i}>
                          {preview.columns.slice(0, 5).map((col) => (
                            <TableCell key={col} className="text-xs py-2 max-w-[120px] truncate">
                              {row[col] || "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>

            <Button
              onClick={importFile}
              disabled={importing}
              className="w-full h-14 rounded-full font-semibold text-base"
              data-testid="import-btn"
            >
              {importing ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5 mr-2" />
                  Import {preview.row_count} Contacts
                </>
              )}
            </Button>
          </motion.div>
        )}

        {/* Step 3: Result */}
        {step === 3 && importResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="border bg-green-50 dark:bg-green-900/20 mb-4" data-testid="import-result">
              <CardContent className="py-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="font-semibold font-['Manrope'] text-xl mb-2">
                  Import Complete!
                </h3>
                <div className="grid grid-cols-2 gap-4 mt-6 max-w-xs mx-auto">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{importResult.rows_imported}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Imported</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">{importResult.rows_flagged}</div>
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Flagged</div>
                  </div>
                </div>
                {importResult.errors?.length > 0 && (
                  <p className="text-sm text-red-600 mt-4">
                    {importResult.errors.length} errors occurred
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-3">
              <Button
                onClick={() => navigate("/contacts")}
                className="h-12 rounded-full font-semibold"
                data-testid="view-contacts-btn"
              >
                View Contacts
              </Button>
              {importResult.rows_flagged > 0 && (
                <Button
                  variant="outline"
                  onClick={() => navigate("/review")}
                  className="h-12 rounded-full"
                  data-testid="review-flagged-btn"
                >
                  Review Flagged ({importResult.rows_flagged})
                </Button>
              )}
              <Button
                variant="outline"
                onClick={reset}
                className="h-12 rounded-full"
                data-testid="import-another-btn"
              >
                Import Another File
              </Button>
            </div>
          </motion.div>
        )}
      </main>
    </PageTransition>
  );
};

export default ImportPage;
