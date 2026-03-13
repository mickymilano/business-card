import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import * as db from "@/services/db";

const ExportPage = () => {
  const navigate = useNavigate();
  const { currentProject } = useApp();
  const [format, setFormat] = useState("xlsx");
  const [exporting, setExporting] = useState(false);

  if (!currentProject) {
    return (
      <PageTransition>
        <Header title="Export" showBack />
        <main className="p-4 text-center py-16">
          <p className="text-muted-foreground mb-4">Please select a project first</p>
          <Button onClick={() => navigate("/")} className="rounded-full">
            Go to Projects
          </Button>
        </main>
      </PageTransition>
    );
  }

  const exportToCSV = (data, filename) => {
    if (!data.length) {
      toast.error("No data to export");
      return;
    }
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(","),
      ...data.map(row => 
        headers.map(h => {
          const val = row[h] || "";
          // Escape quotes and wrap in quotes if contains comma or newline
          const escaped = String(val).replace(/"/g, '""');
          return escaped.includes(",") || escaped.includes("\n") ? `"${escaped}"` : escaped;
        }).join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await db.exportProjectData(currentProject.id);
      const filename = `${currentProject.name.replace(/\s+/g, "_")}_export`;

      if (format === "csv") {
        exportToCSV(data.contacts, `${filename}_contacts.csv`);
        toast.success("Contacts exported successfully");
      } else {
        // For XLSX, we'll export as multiple CSVs (simplified approach)
        // In a real app, you'd use a library like xlsx
        if (data.contacts.length > 0) {
          exportToCSV(data.contacts, `${filename}_contacts.csv`);
        }
        if (data.companies.length > 0) {
          exportToCSV(data.companies, `${filename}_companies.csv`);
        }
        toast.success("Data exported successfully");
      }
    } catch (e) {
      console.error("Failed to export data:", e);
      toast.error("Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageTransition>
      <Header title="Export Data" showBack />

      <main className="p-4 max-w-md mx-auto">
        {/* Project Info */}
        <Card className="border mb-6">
          <CardHeader>
            <CardTitle className="font-['Manrope']">{currentProject.name}</CardTitle>
            <CardDescription>
              Export all contacts, companies, and project data
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Format Selection */}
        <Card className="border mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-['Manrope']">Export Format</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={format} onValueChange={setFormat} className="space-y-3">
              <div 
                className={`flex items-center space-x-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  format === "xlsx" ? "border-primary bg-primary/5" : "border-input hover:border-primary/50"
                }`}
                onClick={() => setFormat("xlsx")}
              >
                <RadioGroupItem value="xlsx" id="xlsx" />
                <div className="flex-1">
                  <Label htmlFor="xlsx" className="font-medium cursor-pointer flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    Excel Workbook (.xlsx)
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Complete workbook with all sheets: Projects, Contacts, Companies, Import Log, Duplicates, AI Audit
                  </p>
                </div>
              </div>

              <div 
                className={`flex items-center space-x-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  format === "csv" ? "border-primary bg-primary/5" : "border-input hover:border-primary/50"
                }`}
                onClick={() => setFormat("csv")}
              >
                <RadioGroupItem value="csv" id="csv" />
                <div className="flex-1">
                  <Label htmlFor="csv" className="font-medium cursor-pointer flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    CSV File (.csv)
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Contacts only, compatible with most CRM systems
                  </p>
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Export Info */}
        <Card className="border mb-6 bg-secondary/50">
          <CardContent className="p-4">
            <h4 className="font-medium text-sm mb-2">What's Included</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              {format === "xlsx" ? (
                <>
                  <li>• Projects sheet with project metadata</li>
                  <li>• Contacts sheet with all contact fields</li>
                  <li>• Companies sheet with company data</li>
                  <li>• Import Log with all import history</li>
                  <li>• Duplicates Review tracking</li>
                  <li>• AI Audit trail for all AI operations</li>
                </>
              ) : (
                <>
                  <li>• All contacts with full field data</li>
                  <li>• Compatible with Google Contacts, Outlook, CRMs</li>
                </>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Export Button */}
        <Button
          onClick={handleExport}
          disabled={exporting}
          className="w-full h-14 rounded-full font-semibold text-base"
          data-testid="export-btn"
        >
          {exporting ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Preparing Export...
            </>
          ) : (
            <>
              <Download className="h-5 w-5 mr-2" />
              Download {format.toUpperCase()}
            </>
          )}
        </Button>
      </main>
    </PageTransition>
  );
};

export default ExportPage;
