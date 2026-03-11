import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition, API } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Copy, Check, Merge, X, ChevronRight, Users } from "lucide-react";

const DuplicatesPage = () => {
  const navigate = useNavigate();
  const { currentProject } = useApp();
  const [duplicates, setDuplicates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentProject) {
      fetchDuplicates();
    }
  }, [currentProject]);

  const fetchDuplicates = async () => {
    try {
      const res = await fetch(`${API}/projects/${currentProject.id}/duplicates`);
      if (res.ok) {
        const data = await res.json();
        setDuplicates(data);
      }
    } catch (e) {
      toast.error("Failed to load duplicates");
    } finally {
      setLoading(false);
    }
  };

  const dismissDuplicate = async (e, contactId) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${API}/projects/${currentProject.id}/duplicates/dismiss?contact_id=${contactId}`, {
        method: "POST"
      });
      if (res.ok) {
        setDuplicates(duplicates.filter(c => c.id !== contactId));
        toast.success("Duplicate dismissed");
      }
    } catch (e) {
      toast.error("Failed to dismiss duplicate");
    }
  };

  if (!currentProject) {
    return (
      <PageTransition>
        <Header title="Duplicates" showBack />
        <main className="p-4 text-center py-16">
          <p className="text-muted-foreground mb-4">Please select a project first</p>
          <Button onClick={() => navigate("/")} className="rounded-full">
            Go to Projects
          </Button>
        </main>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <Header title={`Potential Duplicates (${duplicates.length})`} showBack />

      <main className="p-4 max-w-2xl mx-auto">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-secondary rounded-xl animate-pulse" />
            ))}
          </div>
        ) : duplicates.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="font-semibold font-['Manrope'] mb-2">
              No Duplicates Found
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Your contact list looks clean!
            </p>
            <Button variant="outline" onClick={() => navigate("/contacts")} className="rounded-full">
              View All Contacts
            </Button>
          </div>
        ) : (
          <div className="space-y-4" data-testid="duplicates-list">
            <p className="text-sm text-muted-foreground">
              These contacts may be duplicates based on matching names, emails, or phone numbers.
            </p>

            <div className="flex flex-col gap-3">
              {duplicates.map((contact, index) => (
                <motion.div
                  key={contact.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card 
                    className="border hover:shadow-md transition-all cursor-pointer"
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                    data-testid={`duplicate-card-${contact.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                          <Copy className="h-5 w-5 text-red-600" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold font-['Manrope'] truncate">
                            {contact.full_name || `${contact.first_name} ${contact.last_name}`.trim() || "Unknown"}
                          </h3>
                          
                          <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
                            {contact.primary_email && (
                              <p className="truncate">{contact.primary_email}</p>
                            )}
                            {contact.mobile_phone && (
                              <p>{contact.mobile_phone}</p>
                            )}
                            {contact.company_name_display && (
                              <p className="truncate">{contact.company_name_display}</p>
                            )}
                          </div>

                          <Badge variant="secondary" className="mt-2 text-xs">
                            {contact.import_source_type}
                          </Badge>
                        </div>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-full text-muted-foreground hover:text-foreground"
                          onClick={(e) => dismissDuplicate(e, contact.id)}
                          data-testid={`dismiss-${contact.id}`}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Not duplicate
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </main>
    </PageTransition>
  );
};

export default DuplicatesPage;
