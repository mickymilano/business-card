import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { 
  Save, Trash2, Check, X, Mail, Phone, Building2, 
  Globe, Linkedin, User, Briefcase, MapPin, AlertCircle,
  Edit2, Eye
} from "lucide-react";
import * as db from "@/services/db";

const ContactDetailPage = () => {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const { currentProject } = useApp();
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (currentProject && contactId) {
      fetchContact();
    }
  }, [currentProject, contactId]);

  const fetchContact = async () => {
    try {
      const data = await db.getContact(contactId);
      if (data) {
        setContact(data);
        setFormData(data);
      } else {
        toast.error("Contact not found");
        navigate("/contacts");
      }
    } catch (e) {
      console.error("Failed to load contact:", e);
      toast.error("Failed to load contact");
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
      const updated = await db.updateContact(contactId, formData);
      setContact(updated);
      setFormData(updated);
      setEditing(false);
      toast.success("Contact updated");
    } catch (e) {
      console.error("Failed to save changes:", e);
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const approveContact = async () => {
    try {
      const updated = await db.updateContact(contactId, { review_status: "approved" });
      setContact(updated);
      setFormData(updated);
      toast.success("Contact approved");
    } catch (e) {
      console.error("Failed to approve contact:", e);
      toast.error("Failed to approve contact");
    }
  };

  const rejectContact = async () => {
    try {
      await db.deleteContact(contactId);
      toast.success("Contact rejected and deleted");
      navigate("/contacts");
    } catch (e) {
      console.error("Failed to reject contact:", e);
      toast.error("Failed to reject contact");
    }
  };

  const deleteContact = async () => {
    if (!confirm("Are you sure you want to delete this contact?")) return;

    try {
      await db.deleteContact(contactId);
      toast.success("Contact deleted");
      navigate("/contacts");
    } catch (e) {
      console.error("Failed to delete contact:", e);
      toast.error("Failed to delete contact");
    }
  };

  if (!currentProject) {
    return (
      <PageTransition>
        <Header title="Contact" showBack />
        <main className="p-4 text-center py-16">
          <p className="text-muted-foreground">Please select a project first</p>
        </main>
      </PageTransition>
    );
  }

  if (loading) {
    return (
      <PageTransition>
        <Header title="Loading..." showBack />
        <main className="p-4">
          <div className="h-32 bg-secondary rounded-xl animate-pulse mb-4" />
          <div className="h-48 bg-secondary rounded-xl animate-pulse" />
        </main>
      </PageTransition>
    );
  }

  const fields = [
    { section: "Personal", fields: [
      { key: "first_name", label: "First Name", icon: User },
      { key: "middle_name", label: "Middle Name", icon: User },
      { key: "last_name", label: "Last Name", icon: User },
      { key: "full_name_original", label: "Original Name", icon: User },
    ]},
    { section: "Professional", fields: [
      { key: "job_title", label: "Job Title", icon: Briefcase },
      { key: "department", label: "Department", icon: Building2 },
    ]},
    { section: "Contact", fields: [
      { key: "primary_email", label: "Primary Email", icon: Mail, type: "email" },
      { key: "secondary_email", label: "Secondary Email", icon: Mail, type: "email" },
      { key: "mobile_phone", label: "Mobile Phone", icon: Phone, type: "tel" },
      { key: "direct_phone", label: "Direct Phone", icon: Phone, type: "tel" },
      { key: "office_phone", label: "Office Phone", icon: Phone, type: "tel" },
      { key: "linkedin_url", label: "LinkedIn", icon: Linkedin, type: "url" },
      { key: "personal_website", label: "Website", icon: Globe, type: "url" },
    ]},
    { section: "Company", fields: [
      { key: "company_name_display", label: "Company Name", icon: Building2 },
      { key: "brand_name", label: "Brand Name", icon: Building2 },
      { key: "legal_company_name", label: "Legal Name", icon: Building2 },
    ]},
    { section: "Address", fields: [
      { key: "address", label: "Address (Street, City, Province)", icon: MapPin },
      { key: "postal_code", label: "Postal Code / ZIP / CAP", icon: MapPin },
      { key: "country", label: "Country", icon: Globe },
    ]},
  ];

  const getConfidenceColor = (score) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <PageTransition>
      <Header 
        title={editing ? "Edit Contact" : "Contact Details"} 
        showBack 
        actions={
          <div className="flex items-center gap-2">
            {!editing ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditing(true)}
                className="h-10 w-10 rounded-full"
                data-testid="edit-btn"
              >
                <Edit2 className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setEditing(false);
                  setFormData(contact);
                }}
                className="h-10 w-10 rounded-full"
                data-testid="cancel-edit-btn"
              >
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>
        }
      />

      <main className="p-4 max-w-2xl mx-auto">
        {/* Header Card */}
        <Card className="border mb-4" data-testid="contact-header">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold font-['Manrope'] tracking-tight">
                  {contact?.full_name || `${contact?.first_name} ${contact?.last_name}`.trim() || "Unknown"}
                </h2>
                {contact?.job_title && (
                  <p className="text-muted-foreground">{contact.job_title}</p>
                )}
                {contact?.company_name_display && (
                  <p className="text-sm text-muted-foreground">{contact.company_name_display}</p>
                )}
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold ${getConfidenceColor(contact?.confidence_score)}`}>
                  {contact?.confidence_score}%
                </div>
                <div className="text-xs text-muted-foreground">confidence</div>
              </div>
            </div>

            {/* Status badges */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <Badge variant={contact?.review_status === "approved" ? "default" : "outline"}>
                {contact?.review_status?.replace("_", " ")}
              </Badge>
              {contact?.duplicate_status === "potential_duplicate" && (
                <Badge variant="destructive">Potential Duplicate</Badge>
              )}
              <Badge variant="secondary">{contact?.import_source_type}</Badge>
            </div>

            {/* AI Notes */}
            {contact?.ai_notes && (
              <div className="mt-4 p-3 bg-secondary rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium mb-1">
                  <AlertCircle className="h-4 w-4" />
                  AI Notes
                </div>
                <p className="text-sm text-muted-foreground">{contact.ai_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Review Actions */}
        {contact?.review_status === "needs_review" && !editing && (
          <Card className="border mb-4 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">Review Required</h3>
                  <p className="text-xs text-muted-foreground">Verify the extracted data is correct</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={rejectContact}
                    className="rounded-full"
                    data-testid="reject-btn"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={approveContact}
                    className="rounded-full"
                    data-testid="approve-btn"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Fields */}
        {fields.map((section) => (
          <Card key={section.section} className="border mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-['Manrope'] uppercase tracking-widest text-muted-foreground">
                {section.section}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {section.fields.map((field) => {
                const value = contact?.[field.key];
                const handleClick = () => {
                  if (!value) return;
                  if (field.type === 'email') {
                    window.location.href = `mailto:${value}`;
                  } else if (field.type === 'tel') {
                    window.location.href = `tel:${value.replace(/\s/g, '')}`;
                  } else if (field.type === 'url' || field.key === 'linkedin_url') {
                    window.open(value.startsWith('http') ? value : `https://${value}`, '_blank');
                  } else if (field.key === 'address') {
                    const addressParts = [value, contact?.postal_code, contact?.country].filter(Boolean);
                    const query = encodeURIComponent(addressParts.join(', '));
                    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
                  }
                };
                const isClickable = value && (field.type === 'email' || field.type === 'tel' || field.type === 'url' || field.key === 'linkedin_url' || field.key === 'address');
                
                return (
                  <div key={field.key}>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <field.icon className="h-3 w-3" />
                      {field.label}
                    </Label>
                    {editing ? (
                      <Input
                        value={formData[field.key] || ""}
                        onChange={(e) => handleChange(field.key, e.target.value)}
                        type={field.type || "text"}
                        className="mt-1 h-10"
                        data-testid={`input-${field.key}`}
                      />
                    ) : isClickable ? (
                      <button
                        onClick={handleClick}
                        className="text-sm mt-1 text-primary hover:underline text-left block"
                      >
                        {value}
                      </button>
                    ) : (
                      <p className="text-sm mt-1">
                        {value || <span className="text-muted-foreground">—</span>}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}

        {/* Notes */}
        <Card className="border mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-['Manrope'] uppercase tracking-widest text-muted-foreground">
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <Textarea
                value={formData.notes || ""}
                onChange={(e) => handleChange("notes", e.target.value)}
                placeholder="Add notes about this contact..."
                className="min-h-[100px]"
                data-testid="input-notes"
              />
            ) : (
              <p className="text-sm">
                {contact?.notes || <span className="text-muted-foreground">No notes</span>}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 mt-6">
          {editing ? (
            <Button
              onClick={saveChanges}
              disabled={saving}
              className="h-12 rounded-full font-semibold"
              data-testid="save-btn"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={deleteContact}
              className="h-12 rounded-full"
              data-testid="delete-btn"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Contact
            </Button>
          )}
        </div>
      </main>
    </PageTransition>
  );
};

export default ContactDetailPage;
