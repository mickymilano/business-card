import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition, API } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Plus, FolderOpen, Calendar, Users, Building2, ChevronRight, Trash2 } from "lucide-react";

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { setCurrentProject } = useApp();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API}/projects`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (e) {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!newProjectName.trim()) {
      toast.error("Please enter a project name");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`${API}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim() })
      });

      if (res.ok) {
        const project = await res.json();
        setProjects([...projects, project]);
        setCurrentProject(project);
        setShowNewDialog(false);
        setNewProjectName("");
        toast.success("Project created successfully");
        navigate(`/project/${project.id}`);
      } else {
        toast.error("Failed to create project");
      }
    } catch (e) {
      toast.error("Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async (e, projectId) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this project? All contacts and data will be lost.")) {
      return;
    }

    try {
      const res = await fetch(`${API}/projects/${projectId}`, { method: "DELETE" });
      if (res.ok) {
        setProjects(projects.filter(p => p.id !== projectId));
        toast.success("Project deleted");
      }
    } catch (e) {
      toast.error("Failed to delete project");
    }
  };

  const selectProject = (project) => {
    setCurrentProject(project);
    navigate(`/project/${project.id}`);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <PageTransition>
      <Header 
        title="Projects" 
        actions={
          <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
            <DialogTrigger asChild>
              <Button 
                size="icon" 
                className="h-10 w-10 rounded-full"
                data-testid="new-project-btn"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[90vw] sm:max-w-md rounded-xl">
              <DialogHeader>
                <DialogTitle className="font-['Manrope'] text-xl">New Project</DialogTitle>
                <DialogDescription>
                  Create a new project to organize your business cards and contacts.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="project-name">Project Name</Label>
                <Input
                  id="project-name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g., Tech Conference 2025"
                  className="mt-2 h-12"
                  data-testid="project-name-input"
                  onKeyDown={(e) => e.key === "Enter" && createProject()}
                />
              </div>
              <DialogFooter>
                <Button 
                  onClick={createProject} 
                  disabled={creating}
                  className="w-full h-12 rounded-full font-semibold"
                  data-testid="create-project-btn"
                >
                  {creating ? "Creating..." : "Create Project"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <main className="p-4 max-w-4xl mx-auto">
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-secondary rounded-xl animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mx-auto mb-6">
              <FolderOpen className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold font-['Manrope'] tracking-tight mb-2">
              No Projects Yet
            </h2>
            <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
              Create your first project to start scanning business cards and importing contacts.
            </p>
            <Button 
              onClick={() => setShowNewDialog(true)}
              className="h-12 px-8 rounded-full font-semibold"
              data-testid="empty-create-project-btn"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create First Project
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3" data-testid="projects-list">
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card 
                  className="cursor-pointer hover:shadow-md transition-all active:scale-[0.99] border"
                  onClick={() => selectProject(project)}
                  data-testid={`project-card-${project.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold font-['Manrope'] text-lg truncate">
                          {project.name}
                        </h3>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(project.created_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {project.contact_count || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            {project.company_count || 0}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => deleteProject(e, project.id)}
                          data-testid={`delete-project-${project.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
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

export default ProjectsPage;
