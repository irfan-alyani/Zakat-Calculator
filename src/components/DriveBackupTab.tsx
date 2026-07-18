import React, { useState, useEffect } from "react";
import { 
  Cloud, 
  CloudLightning, 
  Trash2, 
  LogOut, 
  Calendar, 
  User, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Download, 
  Save, 
  FileJson,
  Info
} from "lucide-react";
import { User as FirebaseUser } from "firebase/auth";
import { 
  googleSignIn, 
  logout, 
  initAuth 
} from "../lib/driveAuth";
import { 
  listZakatFiles, 
  saveZakatFile, 
  loadZakatFileContent, 
  deleteZakatFile, 
  DriveFile, 
  SavedZakatData 
} from "../lib/driveApi";
import { ZakatAssets, ZakatLiabilities, CalculationResult } from "../types";

interface DriveBackupTabProps {
  currentAssets: ZakatAssets;
  currentLiabilities: ZakatLiabilities;
  currentCurrency: string;
  currentNisabStandard: "gold" | "silver";
  currentResults: CalculationResult;
  onLoadCalculation: (
    assets: ZakatAssets, 
    liabilities: ZakatLiabilities, 
    currency: string, 
    nisabStandard: "gold" | "silver"
  ) => void;
}

export default function DriveBackupTab({
  currentAssets,
  currentLiabilities,
  currentCurrency,
  currentNisabStandard,
  currentResults,
  onLoadCalculation
}: DriveBackupTabProps) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Drive operations states
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [customFileName, setCustomFileName] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Track initializing auth state
  const [initializingAuth, setInitializingAuth] = useState<boolean>(true);

  // Initialize Auth state listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setNeedsAuth(false);
        setInitializingAuth(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
        setInitializingAuth(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Set default filename when currency or time changes
  useEffect(() => {
    const dateStr = new Date().toISOString().split("T")[0];
    setCustomFileName(`zakat_calc_${dateStr}_${currentCurrency}`);
  }, [currentCurrency]);

  // Load files when token is available
  useEffect(() => {
    if (token) {
      fetchFiles();
    }
  }, [token]);

  const fetchFiles = async () => {
    if (!token) return;
    setLoadingFiles(true);
    setActionError(null);
    try {
      const driveFiles = await listZakatFiles(token);
      setFiles(driveFiles);
    } catch (err: any) {
      console.error("Error fetching files from Drive:", err);
      setActionError(err.message || "Could not list files from your Google Drive.");
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setActionError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      setActionError(err.message || "Failed to log in with your Google account.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setToken(null);
      setNeedsAuth(true);
      setFiles([]);
    } catch (err: any) {
      console.error("Logout failed:", err);
    }
  };

  const handleSaveFile = async () => {
    if (!token) return;
    if (!customFileName.trim()) {
      setActionError("Please enter a valid file name.");
      return;
    }

    setSaving(true);
    setActionError(null);
    setSuccessMessage(null);

    const zakatPayload: SavedZakatData = {
      version: "1.0",
      savedAt: new Date().toISOString(),
      currency: currentCurrency,
      nisabStandard: currentNisabStandard,
      assets: currentAssets,
      liabilities: currentLiabilities,
      summary: {
        netAssets: currentResults.netAssets,
        zakatOwed: currentResults.zakatOwed,
        nisabThreshold: currentNisabStandard === "gold" ? currentResults.nisabGoldSelected : currentResults.nisabSilverSelected
      }
    };

    try {
      const savedFile = await saveZakatFile(token, customFileName.trim(), zakatPayload);
      setSuccessMessage(`Successfully saved "${savedFile.name}" to Google Drive.`);
      // Refresh list
      await fetchFiles();
    } catch (err: any) {
      console.error("Save failed:", err);
      setActionError(err.message || "Failed to save calculation to Google Drive.");
    } finally {
      setSaving(false);
    }
  };

  const handleLoadFile = async (fileId: string, name: string) => {
    if (!token) return;
    setActionError(null);
    setSuccessMessage(null);
    try {
      const confirmed = window.confirm(`Would you like to load the calculation from "${name}"? This will replace your current inputs in the calculator.`);
      if (!confirmed) return;

      const fileData = await loadZakatFileContent(token, fileId);
      
      if (!fileData || !fileData.assets) {
        throw new Error("Invalid or corrupted file content.");
      }

      onLoadCalculation(
        fileData.assets,
        fileData.liabilities || { debtsOwed: 0, billsDue: 0, businessExpenses: 0 },
        fileData.currency || "USD",
        fileData.nisabStandard || "gold"
      );

      setSuccessMessage(`Calculation loaded successfully from "${name}".`);
    } catch (err: any) {
      console.error("Load failed:", err);
      setActionError(err.message || "Failed to load calculation from Google Drive.");
    }
  };

  const handleDeleteFile = async (fileId: string, name: string) => {
    if (!token) return;
    setActionError(null);
    setSuccessMessage(null);
    try {
      // Mandated explicit user confirmation before destructive operations
      const confirmed = window.confirm(`Are you sure you want to permanently delete "${name}" from your Google Drive? This action cannot be undone.`);
      if (!confirmed) return;

      await deleteZakatFile(token, fileId);
      setSuccessMessage(`"${name}" was deleted successfully.`);
      await fetchFiles();
    } catch (err: any) {
      console.error("Delete failed:", err);
      setActionError(err.message || "Failed to delete file from Google Drive.");
    }
  };

  // Render Loading screen during auth initialization check
  if (initializingAuth) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[400px]">
        <Loader2 className="h-8 w-8 text-emerald-800 animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-500">Connecting to Google Auth Services...</p>
      </div>
    );
  }

  // Render Login flow if authentication is required
  if (needsAuth) {
    return (
      <div className="lg:col-span-12">
        <div className="max-w-2xl mx-auto bg-white rounded-3xl p-8 md:p-12 border border-slate-200 shadow-sm text-center">
          <div className="bg-emerald-50 w-16 h-16 rounded-2xl flex items-center justify-center text-emerald-800 mx-auto mb-6">
            <Cloud className="h-8 w-8" />
          </div>

          <h2 className="text-2xl font-display font-bold text-slate-900 mb-3">Google Drive Backup Integration</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            Save and retrieve your annual Zakat calculations securely in your personal Google Drive storage.
            Keep track of historical values across lunar years and restore previous calculations instantly.
          </p>

          <div className="bg-emerald-50/50 rounded-2xl p-6 text-left border border-emerald-100 mb-8 max-w-lg mx-auto">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 shrink-0" /> Authentication and Permissions Card
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              By connecting Google Drive, this application will read, write, and manage only the specific Zakat calculation files you authorize, with permission from your personal account. Your sensitive financial data remains completely private inside your Google Drive.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="gsi-material-button shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
              id="gsi-drive-login-button"
            >
              <div className="gsi-material-button-state"></div>
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: "block" }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                </div>
                <span className="gsi-material-button-contents font-sans font-medium text-sm text-slate-700">Sign in with Google</span>
              </div>
            </button>
            {isLoggingIn && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-2">
                <Loader2 className="h-3.5 w-3.5 text-emerald-800 animate-spin" />
                Awaiting authorization from Google popup...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-8">
      {/* Sidebar: Profile, cloud sync, and save panel */}
      <div className="md:col-span-5 space-y-6">
        
        {/* User Card */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div className="flex items-center gap-3">
              {user?.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt={user.displayName || "Google User"} 
                  className="w-10 h-10 rounded-full border-2 border-emerald-500"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800">
                  <User className="h-5 w-5" />
                </div>
              )}
              <div>
                <h3 className="text-sm font-bold text-slate-800 font-display">{user?.displayName || "Google Account"}</h3>
                <p className="text-[10px] text-slate-500 truncate max-w-[150px]">{user?.email}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-rose-600 transition-colors p-2 rounded-xl hover:bg-rose-50"
              title="Sign Out"
              id="drive-logout-btn"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          <div className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-100">
            <span className="font-bold text-emerald-800 block mb-1">Backup Vault Connected</span>
            You are successfully authenticated. Files will be managed in your personal Google Drive storage.
          </div>
        </div>

        {/* Save Current Calculation Form */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 font-display flex items-center gap-2">
            <Save className="h-4.5 w-4.5 text-emerald-700" /> Save Current Wealth Assessment
          </h3>
          <p className="text-xs text-slate-500">
            This will upload your current assets, liabilities, currency configurations, and final calculation totals to Google Drive.
          </p>

          <div className="space-y-3">
            <div>
              <label htmlFor="drive-file-name" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                File Name (.json)
              </label>
              <div className="relative">
                <input
                  id="drive-file-name"
                  type="text"
                  value={customFileName}
                  onChange={(e) => setCustomFileName(e.target.value)}
                  placeholder="e.g. zakat_calc_2026_USD"
                  className="w-full px-4 py-3 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono text-slate-800 pr-12"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 font-mono">
                  .json
                </span>
              </div>
            </div>

            {actionError && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}

            {successMessage && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-emerald-800 text-xs flex items-start gap-2">
                <CheckCircle className="h-4 w-4 shrink-0 mt-0.5 animate-bounce" />
                <span>{successMessage}</span>
              </div>
            )}

            <button
              onClick={handleSaveFile}
              disabled={saving || !customFileName.trim()}
              className="w-full bg-emerald-800 hover:bg-emerald-900 text-white py-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer disabled:opacity-50"
              id="save-to-drive-btn"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving assessment...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save to Google Drive
                </>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* Main Panel: List of saved calculations */}
      <div className="md:col-span-7">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm min-h-[380px] flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 font-display flex items-center gap-2">
                <CloudLightning className="h-5 w-5 text-emerald-800" /> Saved Assessments History
              </h3>
              <p className="text-xs text-slate-500">Historical files in your Google Drive storage</p>
            </div>
            
            <button
              onClick={fetchFiles}
              disabled={loadingFiles}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100/80 px-3 py-1.5 rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5"
              id="refresh-drive-list-btn"
            >
              {loadingFiles ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Refresh Storage
            </button>
          </div>

          {/* Files List */}
          <div className="flex-grow">
            {loadingFiles ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-8 w-8 text-emerald-800 animate-spin mb-3" />
                <p className="text-xs text-slate-500 font-medium">Scanning Google Drive backups...</p>
              </div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="bg-slate-50 p-4 rounded-full border border-slate-100 text-slate-300 mb-4">
                  <FileJson className="h-8 w-8" />
                </div>
                <p className="text-sm font-bold text-slate-700">No backup files found</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Save your first calculation in the panel to create a secure JSON backup in your Google Drive.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {files.map((file) => (
                  <div 
                    key={file.id}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/10 transition-all gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="bg-amber-50 text-amber-700 p-2.5 rounded-xl border border-amber-100 mt-0.5">
                        <FileJson className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 font-mono truncate max-w-[200px] sm:max-w-[280px]" title={file.name}>
                          {file.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>
                            {new Date(file.createdTime).toLocaleDateString([], {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => handleLoadFile(file.id, file.name)}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                        title="Load Assessment data"
                      >
                        <Download className="h-3.5 w-3.5" /> Load
                      </button>
                      <button
                        onClick={() => handleDeleteFile(file.id, file.name)}
                        className="bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-100 hover:border-rose-100 p-2 rounded-xl transition-all cursor-pointer"
                        title="Delete calculation backup"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
