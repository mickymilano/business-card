import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition, API } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { 
  Camera, FileSpreadsheet, Users, Building2, ClipboardCheck, 
  Copy, Download, ChevronRight, Calendar, Clock, FileText
} from "lucide-react";

const ProjectDetailPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { setCurrentProject } = useApp();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    contacts: 0,
    companies: 0,
    needsReview: 0,
    duplicates: 0
  });

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const res = await fetch(`${API}/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
        setCurrentProject(data);

        // Fetch stats
        const [contactsRes, reviewRes, dupsRes] = await Promise.all([
          fetch(`${API}/projects/${projectId}/contacts`),
          fetch(`${API}/projects/${projectId}/review`),
          fetch(`${API}/projects/${projectId}/duplicates`)
        ]);

        const contacts = contactsRes.ok ? await contactsRes.json() : [];
        const review = reviewRes.ok ? await reviewRes.json() : [];
        const dups = dupsRes.ok ? await dupsRes.json() : [];

        setStats({
          contacts: contacts.length,
          companies: data.company_count || 0,
          needsReview: review.length,
          duplicates: dups.length
        });
      } else {
        toast.error("Project not found");
        navigate("/");
      }
    } catch (e) {
      toast.error("Failed to load project");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { 
      weekday: "short",
      month: "short", 
      day: "numeric", 
      year: "numeric" 
    });
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  const actions = [
    { 
      icon: Camera, 
      label: "Scan Card", 
      description: "Capture business cards",
      path: "/scan",
      color: "bg-blue-500/10 text-blue-600"
    },
    { 
      icon: FileText, 
      label: "Batch PDF", 
      description: "Multiple cards per page",
      path: "/scan/batch",
      color: "bg-indigo-500/10 text-indigo-600"
    },
    { 
      icon: FileSpreadsheet, 
      label: "Import Excel", 
      description: "Import contacts from file",
      path: "/import",
      color: "bg-green-500/10 text-green-600"
    },
    { 
      icon: Users, 
      label: "Contacts", 
      description: `${stats.contacts} contacts`,
      path: "/contacts",
      color: "bg-purple-500/10 text-purple-600"
    },
    { 
      icon: Building2, 
      label: "Companies", 
      description: `${stats.companies} companies`,
      path: "/companies",
      color: "bg-orange-500/10 text-orange-600"
    },
    { 
      icon: ClipboardCheck, 
      label: "Review Queue", 
      description: `${stats.needsReview} pending`,
      path: "/review",
      color: "bg-yellow-500/10 text-yellow-600",
      badge: stats.needsReview > 0 ? stats.needsReview : null
    },
    { 
      icon: Copy, 
      label: "Duplicates", 
      description: `${stats.duplicates} potential`,
      path: "/duplicates",
      color: "bg-red-500/10 text-red-600",
      badge: stats.duplicates > 0 ? stats.duplicates : null
    },
    { 
      icon: Download, 
      label: "Export", 
      description: "Download Excel workbook",
      path: "/export",
      color: "bg-slate-500/10 text-slate-600"
    }
  ];

  if (loading) {
    return (
      <PageTransition>
        <Header title="Loading..." showBack />
        <main className="p-4">
          <div className="h-32 bg-secondary rounded-xl animate-pulse mb-4" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-secondary rounded-xl animate-pulse" />
            ))}
          </div>
        </main>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <Header title={project?.name || "Project"} showBack />

      <main className="p-4 max-w-4xl mx-auto">
        {/* Project Info Card */}
        <Card className="mb-6 border" data-testid="project-info-card">
          <CardContent className="p-5">
            <h2 className="text-2xl font-bold font-['Manrope'] tracking-tight mb-3">
              {project?.name}
            </h2>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                Created {formatDate(project?.created_at)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Updated {formatTime(project?.updated_at)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {[
            { label: "Contacts", value: stats.contacts, color: "text-blue-600" },
            { label: "Companies", value: stats.companies, color: "text-purple-600" },
            { label: "Review", value: stats.needsReview, color: "text-yellow-600" },
            { label: "Duplicates", value: stats.duplicates, color: "text-red-600" }
          ].map((stat, i) => (
            <div key={i} className="text-center p-3 bg-card rounded-xl border">
              <div className={`text-2xl font-bold font-['Manrope'] ${stat.color}`}>
                {stat.value}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-2 gap-3" data-testid="actions-grid">
          {actions.map((action, index) => (
            <motion.div
              key={action.path}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card 
                className="cursor-pointer hover:shadow-md transition-all active:scale-[0.98] border h-full"
                onClick={() => navigate(action.path)}
                data-testid={`action-${action.label.toLowerCase().replace(' ', '-')}`}
              >
                <CardContent className="p-4 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${action.color}`}>
                      <action.icon className="h-5 w-5" />
                    </div>
                    {action.badge && (
                      <Badge variant="destructive" className="text-xs">
                        {action.badge}
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-semibold font-['Manrope'] text-sm">
                    {action.label}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {action.description}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </main>
    </PageTransition>
  );
};

export default ProjectDetailPage;
