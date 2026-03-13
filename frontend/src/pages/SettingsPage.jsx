import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp, Header, PageTransition, API } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Settings, Key, Cpu, Check, X, Loader2, Wifi, WifiOff, Eye, EyeOff, Database, CloudUpload, ChevronRight } from "lucide-react";
import * as db from "@/services/db";

const SettingsPage = () => {
  const navigate = useNavigate();
  const { settings, setSettings } = useApp();
  const [localSettings, setLocalSettings] = useState({
    anthropic_api_key: "",
    claude_model: "claude-sonnet-4-5-20250929",
    ai_enabled: true,
    ai_ocr_enabled: true,
    ai_validation_enabled: true,
    ai_duplicate_enabled: true,
    connection_status: "not_tested"
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    } else {
      fetchSettings();
    }
  }, [settings]);

  const fetchSettings = async () => {
    try {
      const savedSettings = await db.getSettings();
      if (savedSettings && Object.keys(savedSettings).length > 0) {
        const mergedSettings = { ...localSettings, ...savedSettings };
        setLocalSettings(mergedSettings);
        setSettings(mergedSettings);
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  };

  const handleChange = (key, value) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      // Save each setting to IndexedDB
      for (const [key, value] of Object.entries(localSettings)) {
        await db.setSetting(key, value);
      }
      setSettings(localSettings);
      toast.success("Settings saved locally");
    } catch (e) {
      console.error("Failed to save settings:", e);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      // Test backend health
      const res = await fetch(`${API}/health`);
      
      if (res.ok) {
        setLocalSettings(prev => ({ ...prev, connection_status: "connected" }));
        toast.success("Backend connected successfully!");
      } else {
        setLocalSettings(prev => ({ ...prev, connection_status: "error" }));
        toast.error("Backend connection failed");
      }
    } catch (e) {
      setLocalSettings(prev => ({ ...prev, connection_status: "error" }));
      toast.error("Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const models = [
    { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5 (Recommended)" },
    { value: "claude-opus-4-5-20251101", label: "Claude Opus 4.5 (Most Capable)" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Fastest)" },
  ];

  const getConnectionBadge = () => {
    switch (localSettings.connection_status) {
      case "connected":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <Wifi className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive">
            <WifiOff className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            Not tested
          </Badge>
        );
    }
  };

  return (
    <PageTransition>
      <Header title="Settings" />

      <main className="p-4 max-w-md mx-auto">
        {/* API Configuration */}
        <Card className="border mb-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-['Manrope'] flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Claude API
                </CardTitle>
                <CardDescription className="mt-1">
                  Configure your Anthropic API key
                </CardDescription>
              </div>
              {getConnectionBadge()}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="api-key" className="text-sm">API Key</Label>
              <div className="relative mt-1">
                <Input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  value={localSettings.anthropic_api_key}
                  onChange={(e) => handleChange("anthropic_api_key", e.target.value)}
                  placeholder="sk-ant-..."
                  className="h-12 pr-10"
                  data-testid="api-key-input"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to use the default Emergent key
              </p>
            </div>

            <div>
              <Label htmlFor="model" className="text-sm">Claude Model</Label>
              <Select
                value={localSettings.claude_model}
                onValueChange={(v) => handleChange("claude_model", v)}
              >
                <SelectTrigger className="mt-1 h-12" data-testid="model-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              onClick={testConnection}
              disabled={testing}
              className="w-full h-12 rounded-full"
              data-testid="test-connection-btn"
            >
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                <>
                  <Wifi className="h-4 w-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* AI Features */}
        <Card className="border mb-4">
          <CardHeader>
            <CardTitle className="font-['Manrope'] flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              AI Features
            </CardTitle>
            <CardDescription>
              Enable or disable AI-powered features
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="ai-enabled" className="font-medium">AI Processing</Label>
                <p className="text-xs text-muted-foreground">Master switch for all AI features</p>
              </div>
              <Switch
                id="ai-enabled"
                checked={localSettings.ai_enabled}
                onCheckedChange={(v) => handleChange("ai_enabled", v)}
                data-testid="ai-enabled-switch"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="ai-ocr" className="font-medium">OCR & Extraction</Label>
                <p className="text-xs text-muted-foreground">Extract data from business cards</p>
              </div>
              <Switch
                id="ai-ocr"
                checked={localSettings.ai_ocr_enabled}
                onCheckedChange={(v) => handleChange("ai_ocr_enabled", v)}
                disabled={!localSettings.ai_enabled}
                data-testid="ai-ocr-switch"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="ai-validation" className="font-medium">Validation</Label>
                <p className="text-xs text-muted-foreground">Validate extracted data plausibility</p>
              </div>
              <Switch
                id="ai-validation"
                checked={localSettings.ai_validation_enabled}
                onCheckedChange={(v) => handleChange("ai_validation_enabled", v)}
                disabled={!localSettings.ai_enabled}
                data-testid="ai-validation-switch"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="ai-duplicate" className="font-medium">Duplicate Detection</Label>
                <p className="text-xs text-muted-foreground">AI-assisted duplicate matching</p>
              </div>
              <Switch
                id="ai-duplicate"
                checked={localSettings.ai_duplicate_enabled}
                onCheckedChange={(v) => handleChange("ai_duplicate_enabled", v)}
                disabled={!localSettings.ai_enabled}
                data-testid="ai-duplicate-switch"
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button
          onClick={saveSettings}
          disabled={saving}
          className="w-full h-14 rounded-full font-semibold text-base"
          data-testid="save-settings-btn"
        >
          {saving ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-5 w-5 mr-2" />
              Save Settings
            </>
          )}
        </Button>

        {/* Info */}
        <Card className="border mb-4 bg-blue-50 dark:bg-blue-900/20">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Database className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-sm">Local Storage</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  All your data is stored locally on this device using IndexedDB. 
                  Data persists across app redeployments but is specific to this browser.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Backup & Sync */}
        <Card 
          className="border mb-4 cursor-pointer hover:border-accent/50 transition-colors"
          onClick={() => navigate("/backup")}
          data-testid="backup-sync-card"
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-3">
                <CloudUpload className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">Backup & Sync</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Trasferisci i dati tra dispositivi diversi
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground mt-4">
          ES Cards v2.0 • Local Storage • Powered by Claude AI
        </p>
      </main>
    </PageTransition>
  );
};

export default SettingsPage;
