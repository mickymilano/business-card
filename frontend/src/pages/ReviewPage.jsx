import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ClipboardCheck, Check, X, ChevronRight, AlertCircle, User } from "lucide-react";
import * as db from "@/services/db";

const ReviewPage = () => {
  const navigate = useNavigate();
  const { currentProject } = useApp();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentProject) {
      fetchReviewQueue();
    }
  }, [currentProject]);

  const fetchReviewQueue = async () => {
    try {
      const data = await db.getContactsByProject(currentProject.id, { review_status: "needs_review" });
      setContacts(data);
    } catch (e) {
      console.error("Failed to load review queue:", e);
      toast.error("Failed to load review queue");
    } finally {
      setLoading(false);
    }
  };

  const approveContact = async (e, contactId) => {
    e.stopPropagation();
    try {
      await db.updateContact(contactId, { review_status: "approved" });
      setContacts(contacts.filter(c => c.id !== contactId));
      toast.success("Contact approved");
    } catch (e) {
      console.error("Failed to approve contact:", e);
      toast.error("Failed to approve contact");
    }
  };

  const rejectContact = async (e, contactId) => {
    e.stopPropagation();
    try {
      await db.deleteContact(contactId);
      setContacts(contacts.filter(c => c.id !== contactId));
      toast.success("Contact rejected and deleted");
    } catch (e) {
      console.error("Failed to reject contact:", e);
      toast.error("Failed to reject contact");
    }
  };

  if (!currentProject) {
    return (
      <PageTransition>
        <Header title="Review Queue" showBack />
        <main className="p-4 text-center py-16">
          <p className="text-muted-foreground mb-4">Please select a project first</p>
          <Button onClick={() => navigate("/")} className="rounded-full">
            Go to Projects
          </Button>
        </main>
      </PageTransition>
    );
  }

  const getConfidenceBadge = (score) => {
    if (score >= 80) return "confidence-high";
    if (score >= 60) return "confidence-medium";
    return "confidence-low";
  };

  return (
    <PageTransition>
      <Header title={`Review Queue (${contacts.length})`} showBack />

      <main className="p-4 max-w-2xl mx-auto">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-secondary rounded-xl animate-pulse" />
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="font-semibold font-['Manrope'] mb-2">
              All Caught Up!
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              No contacts need review right now
            </p>
            <Button variant="outline" onClick={() => navigate("/contacts")} className="rounded-full">
              View All Contacts
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3" data-testid="review-list">
            {contacts.map((contact, index) => (
              <motion.div
                key={contact.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card 
                  className="border hover:shadow-md transition-all cursor-pointer"
                  onClick={() => navigate(`/contacts/${contact.id}`)}
                  data-testid={`review-card-${contact.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="h-5 w-5 text-yellow-600" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold font-['Manrope'] truncate">
                          {contact.full_name || `${contact.first_name} ${contact.last_name}`.trim() || "Unknown"}
                        </h3>
                        {contact.job_title && (
                          <p className="text-sm text-muted-foreground truncate">
                            {contact.job_title}
                          </p>
                        )}
                        {contact.company_name_display && (
                          <p className="text-sm text-muted-foreground truncate">
                            {contact.company_name_display}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getConfidenceBadge(contact.confidence_score)}`}>
                            {contact.confidence_score}% confidence
                          </span>
                        </div>

                        {contact.ai_notes && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {contact.ai_notes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 rounded-full bg-green-100 hover:bg-green-200 text-green-700"
                          onClick={(e) => approveContact(e, contact.id)}
                          data-testid={`approve-${contact.id}`}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 rounded-full bg-red-100 hover:bg-red-200 text-red-700"
                          onClick={(e) => rejectContact(e, contact.id)}
                          data-testid={`reject-${contact.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
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

export default ReviewPage;
