import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { 
  Building2, Globe, Phone, Mail, MapPin, Trash2, 
  Edit2, Save, X, ExternalLink, Briefcase
} from "lucide-react";
import * as db from "@/services/db";

const CompanyDetailPage = () => {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { currentProject } = useApp();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (currentProject && companyId) {
      fetchCompany();
    }
  }, [currentProject, companyId]);

  const fetchCompany = async () => {
    try {
      const data = await db.getCompany(companyId);
      if (data) {
        setCompany(data);
        setFormData(data);
      } else {
        toast.error("Azienda non trovata");
        navigate("/companies");
      }
    } catch (e) {
      console.error("Failed to load company:", e);
      toast.error("Errore nel caricamento");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      // Update company in IndexedDB
      const store = await db.initDB().then(() => {
        return new Promise((resolve) => {
          const request = indexedDB.open('BizScanPro', 1);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction('companies', 'readwrite');
            resolve(transaction.objectStore('companies'));
          };
        });
      });
      
      const updated = { ...formData, updated_at: new Date().toISOString() };
      await new Promise((resolve, reject) => {
        const request = store.put(updated);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      
      setCompany(updated);
      setEditing(false);
      toast.success("Azienda aggiornata");
    } catch (e) {
      console.error("Failed to save:", e);
      toast.error("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const deleteCompany = async () => {
    if (!confirm("Eliminare questa azienda?")) return;

    try {
      await db.deleteCompany(companyId);
      toast.success("Azienda eliminata");
      navigate("/companies");
    } catch (e) {
      console.error("Failed to delete:", e);
      toast.error("Errore nell'eliminazione");
    }
  };

  const openWebsite = (url) => {
    if (!url) return;
    let fullUrl = url;
    if (!url.startsWith('http')) {
      fullUrl = 'https://' + url;
    }
    window.open(fullUrl, '_blank');
  };

  if (!currentProject) {
    return (
      <PageTransition>
        <Header title="Dettaglio Azienda" showBack />
        <main className="p-4 text-center py-16">
          <p className="text-muted-foreground mb-4">Seleziona prima un progetto</p>
          <Button onClick={() => navigate("/")} className="rounded-full">
            Vai ai Progetti
          </Button>
        </main>
      </PageTransition>
    );
  }

  if (loading) {
    return (
      <PageTransition>
        <Header title="Dettaglio Azienda" showBack />
        <main className="p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-secondary rounded-xl" />
            <div className="h-48 bg-secondary rounded-xl" />
          </div>
        </main>
      </PageTransition>
    );
  }

  if (!company) {
    return (
      <PageTransition>
        <Header title="Dettaglio Azienda" showBack />
        <main className="p-4 text-center py-16">
          <p className="text-muted-foreground">Azienda non trovata</p>
        </main>
      </PageTransition>
    );
  }

  const Field = ({ label, field, icon: Icon, type = "text", link = false }) => {
    const value = editing ? formData[field] : company[field];
    
    if (!editing && !value) return null;
    
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          {Icon && <Icon className="h-3 w-3" />}
          {label}
        </Label>
        {editing ? (
          <Input
            type={type}
            value={value || ''}
            onChange={(e) => handleChange(field, e.target.value)}
            className="h-9"
          />
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{value}</p>
            {link && value && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => openWebsite(value)}
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <PageTransition>
      <Header 
        title={editing ? "Modifica Azienda" : "Dettaglio Azienda"} 
        showBack 
      />

      <main className="p-4 max-w-lg mx-auto pb-24">
        {/* Header Card */}
        <Card className="border mb-4" data-testid="company-header">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold font-['Manrope'] text-lg">
                    {company.company_display_name || company.brand_name || company.legal_company_name || "Azienda"}
                  </h2>
                  {company.industry && (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {company.industry}
                    </Badge>
                  )}
                </div>
              </div>
              
              {!editing ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditing(true)}
                  data-testid="edit-btn"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditing(false);
                    setFormData(company);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Company Info */}
        <Card className="border mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Informazioni Azienda
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Nome Display" field="company_display_name" icon={Building2} />
            <Field label="Brand" field="brand_name" icon={Briefcase} />
            <Field label="Ragione Sociale" field="legal_company_name" icon={Building2} />
            <Field label="Settore" field="industry" icon={Briefcase} />
          </CardContent>
        </Card>

        {/* Contact Info */}
        <Card className="border mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Contatti
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Sito Web" field="website" icon={Globe} link />
            <Field label="Telefono" field="main_phone" icon={Phone} type="tel" />
            <Field label="Email" field="main_email" icon={Mail} type="email" />
          </CardContent>
        </Card>

        {/* Address */}
        <Card className="border mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Indirizzo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Indirizzo" field="address" icon={MapPin} />
            <Field label="Città" field="city" icon={MapPin} />
            <Field label="CAP" field="postal_code" icon={MapPin} />
            <Field label="Provincia/Regione" field="province_region" icon={MapPin} />
            <Field label="Paese" field="country" icon={MapPin} />
          </CardContent>
        </Card>

        {/* Notes */}
        {(editing || company.notes) && (
          <Card className="border mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Note
              </CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  className="w-full h-24 px-3 py-2 text-sm border rounded-lg resize-none"
                  placeholder="Aggiungi note..."
                />
              ) : (
                <p className="text-sm">{company.notes}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        {editing ? (
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setEditing(false);
                setFormData(company);
              }}
              className="flex-1 h-12 rounded-full"
            >
              Annulla
            </Button>
            <Button
              onClick={saveChanges}
              disabled={saving}
              className="flex-1 h-12 rounded-full"
              data-testid="save-btn"
            >
              {saving ? "Salvataggio..." : "Salva"}
            </Button>
          </div>
        ) : (
          <Button
            variant="destructive"
            onClick={deleteCompany}
            className="w-full h-12 rounded-full"
            data-testid="delete-btn"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Elimina Azienda
          </Button>
        )}

        {/* Metadata */}
        {!editing && (
          <div className="mt-6 text-center text-xs text-muted-foreground">
            <p>Creata: {new Date(company.created_at).toLocaleDateString('it-IT')}</p>
            {company.updated_at && (
              <p>Modificata: {new Date(company.updated_at).toLocaleDateString('it-IT')}</p>
            )}
          </div>
        )}
      </main>
    </PageTransition>
  );
};

export default CompanyDetailPage;
