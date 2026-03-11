import { useState, useEffect, createContext, useContext } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FolderOpen, 
  Camera, 
  FileSpreadsheet, 
  Users, 
  Building2, 
  ClipboardCheck, 
  Copy, 
  Download, 
  Settings,
  Plus,
  ArrowLeft,
  Menu
} from "lucide-react";

// Pages
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import ScanPage from "@/pages/ScanPage";
import ImportPage from "@/pages/ImportPage";
import ContactsPage from "@/pages/ContactsPage";
import ContactDetailPage from "@/pages/ContactDetailPage";
import CompaniesPage from "@/pages/CompaniesPage";
import ReviewPage from "@/pages/ReviewPage";
import DuplicatesPage from "@/pages/DuplicatesPage";
import ExportPage from "@/pages/ExportPage";
import SettingsPage from "@/pages/SettingsPage";

// Context
const AppContext = createContext();

export const useApp = () => useContext(AppContext);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Bottom Navigation Component
const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentProject } = useApp();

  const navItems = [
    { icon: FolderOpen, label: "Projects", path: "/" },
    { icon: Camera, label: "Scan", path: "/scan", requiresProject: true },
    { icon: FileSpreadsheet, label: "Import", path: "/import", requiresProject: true },
    { icon: ClipboardCheck, label: "Review", path: "/review", requiresProject: true },
    { icon: Settings, label: "Settings", path: "/settings" },
  ];

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur-lg z-50 safe-area-bottom"
      data-testid="bottom-navigation"
    >
      <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path !== "/" && location.pathname.startsWith(item.path));
          const isDisabled = item.requiresProject && !currentProject;

          return (
            <button
              key={item.path}
              onClick={() => !isDisabled && navigate(item.path)}
              disabled={isDisabled}
              className={`flex flex-col items-center justify-center h-14 w-14 rounded-xl transition-all touch-target
                ${isActive ? "text-primary bg-secondary" : "text-muted-foreground"}
                ${isDisabled ? "opacity-40 cursor-not-allowed" : "hover:bg-secondary/50 active:scale-95"}
              `}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium mt-1">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

// Header Component
export const Header = ({ title, showBack = false, actions = null }) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b safe-area-top">
      <div className="flex items-center justify-between h-14 px-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              onClick={() => navigate(-1)}
              className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-secondary active:scale-95 transition-all"
              data-testid="back-button"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <h1 className="text-lg font-semibold tracking-tight font-['Manrope']">{title}</h1>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
};

// Page Transition Wrapper
export const PageTransition = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.2, ease: "easeOut" }}
    className="pb-nav"
  >
    {children}
  </motion.div>
);

function AppContent() {
  const [currentProject, setCurrentProject] = useState(null);
  const [settings, setSettings] = useState(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch(`${API}/settings`);
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
    };
    loadSettings();

    // Load current project from localStorage
    const savedProject = localStorage.getItem("currentProject");
    if (savedProject) {
      try {
        setCurrentProject(JSON.parse(savedProject));
      } catch (e) {
        localStorage.removeItem("currentProject");
      }
    }
  }, []);

  // Save current project to localStorage
  useEffect(() => {
    if (currentProject) {
      localStorage.setItem("currentProject", JSON.stringify(currentProject));
    } else {
      localStorage.removeItem("currentProject");
    }
  }, [currentProject]);

  const contextValue = {
    currentProject,
    setCurrentProject,
    settings,
    setSettings,
    API
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="min-h-screen bg-background">
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/project/:projectId" element={<ProjectDetailPage />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/contacts/:contactId" element={<ContactDetailPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/duplicates" element={<DuplicatesPage />} />
            <Route path="/export" element={<ExportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </AnimatePresence>
        <BottomNav />
        <Toaster position="top-center" richColors closeButton />
      </div>
    </AppContext.Provider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
