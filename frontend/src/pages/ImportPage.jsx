import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Upload, FileSpreadsheet, Loader2, Check, ArrowRight, X } from "lucide-react";
import * as XLSX from "xlsx";
import * as db from "@/services/db";

const TARGET_FIELDS = [
  "first_name", "middle_name", "last_name", "full_name",
  "job_title", "department",
  "mobile_phone", "direct_phone", "office_phone",
  "primary_email", "secondary_email",
  "linkedin_url", "personal_website",
  "company_name_display", "brand_name", "legal_company_name",
  "address", "postal_code", "country",
  "notes"
];

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
  const [rawData, setRawData] = useState([]);

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

  const suggestMapping = (columns) => {
    const suggestions = {};
    const lowerColumns = columns.map(c => c.toLowerCase().trim());
    
    const mappingRules = {
      'first_name': ['first name', 'firstname', 'first', 'nome'],
      'last_name': ['last name', 'lastname', 'last', 'surname', 'cognome'],
      'full_name': ['full name', 'fullname', 'name', 'nome completo'],
      'job_title': ['job title', 'title', 'position', 'role', 'titolo', 'posizione'],
      'department': ['department', 'dept', 'dipartimento'],
      'mobile_phone': ['mobile', 'mobile phone', 'cell', 'cellphone', 'cellulare'],
      'direct_phone': ['direct', 'direct phone', 'direct line'],
      'office_phone': ['office', 'office phone', 'work phone', 'phone', 'telefono'],
      'primary_email': ['email', 'e-mail', 'primary email', 'mail'],
      'secondary_email': ['secondary email', 'other email', 'alt email'],
      'linkedin_url': ['linkedin', 'linkedin url', 'linkedin profile'],
      'company_name_display': ['company', 'company name', 'organization', 'azienda', 'società'],
      'address': ['address', 'street', 'indirizzo'],
      'postal_code': ['postal code', 'zip', 'zip code', 'cap', 'postcode'],
      'country': ['country', 'nation', 'paese'],
      'notes': ['notes', 'note', 'comments']
    };

    columns.forEach((col, i) => {
      const lowerCol = lowerColumns[i];
      for (const [field, patterns] of Object.entries(mappingRules)) {
        if (patterns.some(p => lowerCol.includes(p) || p.includes(lowerCol))) {
          suggestions[col] = field;
          break;
        }
      }
    });

    return suggestions;
  };

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validExtensions = [".xlsx", ".xls", ".csv"];
    const hasValidExtension = validExtensions.some(ext => 
      selectedFile.name.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      toast.error("Please select an Excel (.xlsx, .xls) or CSV file");
      return;
    }

    setFile(selectedFile);

    try {
      // Parse file with XLSX
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
      
      if (jsonData.length === 0) {
        toast.error("No data found in file");
        return;
      }

      const columns = Object.keys(jsonData[0]);
      const suggestions = suggestMapping(columns);

      setRawData(jsonData);
      setPreview({
        filename: selectedFile.name,
        columns,
        row_count: jsonData.length,
        sample_rows: jsonData.slice(0, 5),
        target_fields: TARGET_FIELDS
      });
      setMapping(suggestions);
      setStep(2);
    } catch (e) {
      console.error("File parse error:", e);
      toast.error("Failed to parse file");
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
    
    try {
      let rowsImported = 0;
      let rowsFlagged = 0;
      const errors = [];

      for (const row of rawData) {
        try {
          const contactData = {};
          
          // Apply mapping
          for (const [sourceCol, targetField] of Object.entries(mapping)) {
            if (targetField && row[sourceCol]) {
              contactData[targetField] = String(row[sourceCol]).trim();
            }
          }

          // Skip empty rows
          const hasData = Object.values(contactData).some(v => v);
          if (!hasData) continue;

          // Set defaults
          contactData.import_source_type = 'excel_import';
          contactData.import_source_file = file.name;
          contactData.validation_status = 'pending';
          contactData.review_status = 'needs_review';
          contactData.duplicate_status = 'none';
          contactData.confidence_score = 50; // Manual import - moderate confidence

          // Build full name if not provided
          if (!contactData.full_name && (contactData.first_name || contactData.last_name)) {
            contactData.full_name = `${contactData.first_name || ''} ${contactData.last_name || ''}`.trim();
          }

          await db.createContact(currentProject.id, contactData);
          rowsImported++;
          rowsFlagged++; // All imported contacts need review
        } catch (rowError) {
          errors.push(rowError.message);
        }
      }

      setImportResult({
        rows_imported: rowsImported,
        rows_flagged: rowsFlagged,
        errors
      });
      setStep(3);
      toast.success(`Imported ${rowsImported} contacts`);
    } catch (e) {
      console.error("Import error:", e);
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
    setRawData([]);
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
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">To Review</div>
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
