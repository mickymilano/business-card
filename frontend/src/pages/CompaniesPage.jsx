import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Building2, Search, ChevronRight, Globe, Phone, Mail, MapPin } from "lucide-react";
import * as db from "@/services/db";

const CompaniesPage = () => {
  const navigate = useNavigate();
  const { currentProject } = useApp();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (currentProject) {
      fetchCompanies();
    }
  }, [currentProject]);

  const fetchCompanies = async () => {
    try {
      const data = await db.getCompaniesByProject(currentProject.id);
      setCompanies(data);
    } catch (e) {
      console.error("Failed to load companies:", e);
      toast.error("Failed to load companies");
    } finally {
      setLoading(false);
    }
  };

  if (!currentProject) {
    return (
      <PageTransition>
        <Header title="Companies" showBack />
        <main className="p-4 text-center py-16">
          <p className="text-muted-foreground mb-4">Please select a project first</p>
          <Button onClick={() => navigate("/")} className="rounded-full">
            Go to Projects
          </Button>
        </main>
      </PageTransition>
    );
  }

  const filteredCompanies = companies.filter(c => {
    const query = searchQuery.toLowerCase();
    return (
      c.company_display_name?.toLowerCase().includes(query) ||
      c.legal_company_name?.toLowerCase().includes(query) ||
      c.brand_name?.toLowerCase().includes(query) ||
      c.industry?.toLowerCase().includes(query) ||
      c.city?.toLowerCase().includes(query)
    );
  });

  return (
    <PageTransition>
      <Header title={`Companies (${companies.length})`} showBack />

      <main className="p-4 max-w-2xl mx-auto">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 rounded-xl"
            data-testid="search-companies"
          />
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-secondary rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold font-['Manrope'] mb-2">
              {searchQuery ? "No companies found" : "No companies yet"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery 
                ? "Try a different search term" 
                : "Companies are automatically created when scanning business cards"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2" data-testid="companies-list">
            {filteredCompanies.map((company, index) => (
              <motion.div
                key={company.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
              >
                <Card 
                  className="border hover:shadow-md transition-all cursor-pointer"
                  onClick={() => navigate(`/company/${company.id}`)}
                  data-testid={`company-card-${company.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold font-['Manrope'] truncate">
                          {company.company_display_name || company.brand_name || company.legal_company_name || "Unknown"}
                        </h3>
                        
                        {company.brand_name && company.brand_name !== company.company_display_name && (
                          <p className="text-sm text-muted-foreground">
                            Brand: {company.brand_name}
                          </p>
                        )}
                        
                        {company.legal_company_name && (
                          <p className="text-xs text-muted-foreground">
                            Legal: {company.legal_company_name}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                          {company.industry && (
                            <span className="px-2 py-0.5 bg-secondary rounded-full">
                              {company.industry}
                            </span>
                          )}
                          {company.website && (
                            <span className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              {company.website}
                            </span>
                          )}
                          {company.city && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {company.city}{company.country ? `, ${company.country}` : ""}
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

export default CompaniesPage;
