import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition, API } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Users, Search, ChevronRight, Mail, Phone, Building2, AlertCircle } from "lucide-react";

const ContactsPage = () => {
  const navigate = useNavigate();
  const { currentProject } = useApp();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (currentProject) {
      fetchContacts();
    }
  }, [currentProject]);

  const fetchContacts = async () => {
    try {
      const res = await fetch(`${API}/projects/${currentProject.id}/contacts`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
    } catch (e) {
      toast.error("Failed to load contacts");
    } finally {
      setLoading(false);
    }
  };

  if (!currentProject) {
    return (
      <PageTransition>
        <Header title="Contacts" showBack />
        <main className="p-4 text-center py-16">
          <p className="text-muted-foreground mb-4">Please select a project first</p>
          <Button onClick={() => navigate("/")} className="rounded-full">
            Go to Projects
          </Button>
        </main>
      </PageTransition>
    );
  }

  const filteredContacts = contacts.filter(c => {
    const query = searchQuery.toLowerCase();
    return (
      c.full_name?.toLowerCase().includes(query) ||
      c.first_name?.toLowerCase().includes(query) ||
      c.last_name?.toLowerCase().includes(query) ||
      c.primary_email?.toLowerCase().includes(query) ||
      c.company_name_display?.toLowerCase().includes(query) ||
      c.job_title?.toLowerCase().includes(query)
    );
  });

  const getConfidenceBadge = (score) => {
    if (score >= 80) return "confidence-high";
    if (score >= 60) return "confidence-medium";
    return "confidence-low";
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "approved": return "bg-green-100 text-green-800";
      case "needs_review": return "bg-yellow-100 text-yellow-800";
      case "rejected": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <PageTransition>
      <Header 
        title={`Contacts (${contacts.length})`} 
        showBack 
      />

      <main className="p-4 max-w-2xl mx-auto">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 rounded-xl"
            data-testid="search-contacts"
          />
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-secondary rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold font-['Manrope'] mb-2">
              {searchQuery ? "No contacts found" : "No contacts yet"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery 
                ? "Try a different search term" 
                : "Scan business cards or import contacts to get started"}
            </p>
            {!searchQuery && (
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => navigate("/scan")} className="rounded-full">
                  Scan Card
                </Button>
                <Button variant="outline" onClick={() => navigate("/import")} className="rounded-full">
                  Import File
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2" data-testid="contacts-list">
            {filteredContacts.map((contact, index) => (
              <motion.div
                key={contact.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
              >
                <Card 
                  className="cursor-pointer hover:shadow-md transition-all active:scale-[0.99] border"
                  onClick={() => navigate(`/contacts/${contact.id}`)}
                  data-testid={`contact-card-${contact.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold font-['Manrope'] truncate">
                            {contact.full_name || `${contact.first_name} ${contact.last_name}`.trim() || "Unknown"}
                          </h3>
                          {contact.review_status === "needs_review" && (
                            <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                          )}
                        </div>
                        
                        {contact.job_title && (
                          <p className="text-sm text-muted-foreground truncate">
                            {contact.job_title}
                          </p>
                        )}
                        
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                          {contact.company_name_display && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {contact.company_name_display}
                            </span>
                          )}
                          {contact.primary_email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {contact.primary_email}
                            </span>
                          )}
                          {contact.mobile_phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {contact.mobile_phone}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${getConfidenceBadge(contact.confidence_score)}`}>
                            {contact.confidence_score}%
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${getStatusBadge(contact.review_status)}`}>
                            {contact.review_status?.replace("_", " ")}
                          </span>
                          {contact.duplicate_status === "potential_duplicate" && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                              duplicate
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </PageTransition>
  );
};

export default ContactsPage;
