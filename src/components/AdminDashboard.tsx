import React, { useState, useEffect } from "react";
import { db, auth, handleFirestoreError, OperationType, isFirestoreQuotaExceeded, markFirestoreQuotaExceeded, resetFirestoreQuotaCheck } from "../lib/firebase";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  setDoc,
  getDoc
} from "firebase/firestore";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { Student, WebsiteSettings } from "../types";
import { getFile, saveFile, deleteFile } from "../lib/indexedDb";
import { uploadMedia, syncMedia, deleteMedia } from "../lib/mediaSync";
import { 
  BarChart as ReBarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import { 
  Lock, LogOut, Users, CheckCircle, Clock, XCircle, 
  FileText, Phone, MessageSquare, Trash2, Edit3, Save, 
  TrendingUp, BarChart2, PieChart as PieIcon, Settings, 
  Bell, Calendar, MapPin, Mail, ChevronRight, 
  AlertCircle, RefreshCw, Eye, Image, Upload, Sparkles,
  Download, User, Shield, Fingerprint, LayoutDashboard, Printer
} from "lucide-react";
import LogoIcon from "./LogoIcon";

const COLORS = ["#f59e0b", "#10b981", "#ef4444", "#3b82f6", "#8b5cf6"];

const DEFAULT_FAQS = [
  {
    question: "What are the batch timings?",
    answer: "We offer multiple flexible batches throughout the day from 7:00 AM to 8:30 PM, including dedicated early morning and late evening sessions to suit school-going students, college students, and working professionals."
  },
  {
    question: "Do you provide study materials?",
    answer: "Yes, we provide comprehensive, custom-designed printed books, grammar worksheets, and online speech/fluency modules covering Spoken English and competitive examination topics at no extra cost."
  },
  {
    question: "Is there a demo class available before taking admission?",
    answer: "Absolutely! We offer a 2-day free demo class for all prospective students so you can experience our high-quality coaching and interactive teaching methodology first-hand."
  },
  {
    question: "What is the fee structure and duration of the course?",
    answer: "Our Spoken English and Personality Development course typically spans 3 months. Fees are highly affordable with flexible monthly or full-course payment options. Visit or contact us for detailed tier-pricing."
  },
  {
    question: "Do you offer competitive exam preparation assistance?",
    answer: "Yes, our academic and grammar modules are specially tailored to help students prepare for school/board exams as well as competitive tests requiring strong English grammar and communicative competence."
  }
];

const DEFAULT_SCHEDULES = [
  { id: "1", className: "Spoken English (Basic)", days: "Mon, Wed, Fri", timing: "08:00 AM - 09:30 AM", subject: "Conversational Skills", instructor: "Mr. Imran Ansari" },
  { id: "2", className: "Academic English Grammar", days: "Mon, Tue, Wed, Thu, Fri", timing: "10:00 AM - 11:30 AM", subject: "Syllabus Grammar", instructor: "Mrs. Sharma" },
  { id: "3", className: "Spoken English (Intermediate)", days: "Tue, Thu, Sat", timing: "04:00 PM - 05:30 PM", subject: "Personality Development & Fluency", instructor: "Mr. Imran Ansari" },
  { id: "4", className: "Advanced IELTS/TOEFL Prep", days: "Mon, Wed, Fri", timing: "06:00 PM - 07:30 PM", subject: "Speaking & Writing Modules", instructor: "Dr. Roy" },
  { id: "5", className: "Weekend Executive Fluency", days: "Saturday & Sunday", timing: "11:00 AM - 01:30 PM", subject: "Corporate Soft Skills & Public Speaking", instructor: "Mr. Imran Ansari" }
];

export default function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [user, setUser] = useState<any>(null);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginTab, setLoginTab] = useState<"database" | "demo">("database");
  const [loginStep, setLoginStep] = useState<"credentials" | "pin">("credentials");

  // Custom multi-credential & CAPTCHA states
  const [adminIdInput, setAdminIdInput] = useState("");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminPinInput, setAdminPinInput] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [captchaText, setCaptchaText] = useState("");
  const [showExpiredReset, setShowExpiredReset] = useState(false);
  const [newPasswordReset, setNewPasswordReset] = useState("");
  const [newPasswordResetConfirm, setNewPasswordResetConfirm] = useState("");

  // Dashboard Data States
  const [registrations, setRegistrations] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<"analytics" | "admissions" | "settings" | "students">("analytics");
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Approved" | "Rejected">("All");
  const [selectedFeeMonth, setSelectedFeeMonth] = useState<string>("");

  const [reconnectingDb, setReconnectingDb] = useState(false);
  const handleReconnectDb = async () => {
    setReconnectingDb(true);
    const success = await resetFirestoreQuotaCheck();
    setReconnectingDb(false);
    if (success) {
      alert("🎉 Connection Verified! Successfully reconnected to the live Firebase Firestore database! The page will now reload to synchronize real-time updates across devices.");
      window.location.reload();
    } else {
      alert("⚠️ Firebase Daily write quota limit is still exceeded. Staying in local fallback mode. This will automatically try again when your daily Firebase write quota resets in 24 hours.");
    }
  };

  // Student Management and Fee states
  const [selectedManagedStudent, setSelectedManagedStudent] = useState<Student | null>(null);
  const [searchManagedStudent, setSearchManagedStudent] = useState("");
  const [isAddingFee, setIsAddingFee] = useState(false);
  const [editingFeeRecord, setEditingFeeRecord] = useState<any>(null);
  
  // Student editing states
  const [isEditingStudent, setIsEditingStudent] = useState(false);
  const [studentForm, setStudentForm] = useState({
    name: "",
    mobile: "",
    email: "",
    age: 0,
    fatherName: "",
    className: "",
    stream: "",
    preferredBatch: "",
    address: ""
  });
  
  // Fee logging form state
  const [feeForm, setFeeForm] = useState({
    month: "",
    amountPaid: 0,
    totalDue: 0,
    paymentDate: new Date().toISOString().substring(0, 10),
    paymentStatus: "Paid" as "Paid" | "Partially Paid" | "Unpaid",
    remarks: ""
  });
  
  // Student ID Card states
  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<Student | null>(null);
  const [isIdCardModalOpen, setIsIdCardModalOpen] = useState(false);
  const [photoSizeWarning, setPhotoSizeWarning] = useState<string | null>(null);
  const [idCardForm, setIdCardForm] = useState({
    name: "",
    className: "",
    stream: "",
    address: "",
    id: "",
    fatherName: "",
    mobile: "",
    joiningDate: new Date().toISOString().substring(0, 10),
    validUntil: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().substring(0, 10),
    studentPhoto: "",
    adminSignature: ""
  });

  useEffect(() => {
    if (selectedIdCardStudent) {
      setPhotoSizeWarning(null);
      setIdCardForm(prev => ({
        ...prev,
        name: selectedIdCardStudent.name || "",
        className: selectedIdCardStudent.className || "",
        stream: selectedIdCardStudent.stream || "",
        address: selectedIdCardStudent.address || "",
        id: selectedIdCardStudent.id || "",
        fatherName: selectedIdCardStudent.fatherName || "",
        mobile: selectedIdCardStudent.mobile || "",
        joiningDate: selectedIdCardStudent.joiningDate || new Date().toISOString().substring(0, 10),
        studentPhoto: "" // reset photo for new student, signature is preserved
      }));
    }
  }, [selectedIdCardStudent]);

  useEffect(() => {
    const loadSignature = async () => {
      try {
        const blob = await getFile("admin_signature");
        if (blob) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setIdCardForm(prev => ({ ...prev, adminSignature: reader.result as string }));
          };
          reader.readAsDataURL(blob);
        }
      } catch (err) {
        console.warn("Failed to load saved signature:", err);
      }
    };
    loadSignature();
  }, []);
  
  // Settings Editor State
  const [settings, setSettings] = useState<WebsiteSettings>({
    slogan: "★ A Course That Can Change The Course of Your Life ★",
    experienceYears: 12,
    studentsTrained: 500,
    successRate: 95,
    contactPhone1: "9532462057",
    contactPhone2: "9918833932",
    faqs: [],
    schedules: [],
    adminEmailForNotifications: ""
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // FAQ Addition form states
  const [newFaqQuestion, setNewFaqQuestion] = useState("");
  const [newFaqAnswer, setNewFaqAnswer] = useState("");
  
  // FAQ Editing state
  const [editingFaqIdx, setEditingFaqIdx] = useState<number | null>(null);
  const [editFaqQuestion, setEditFaqQuestion] = useState("");
  const [editFaqAnswer, setEditFaqAnswer] = useState("");
  
  // Schedule Addition form states
  const [newSchClassName, setNewSchClassName] = useState("");
  const [newSchSubject, setNewSchSubject] = useState("");
  const [newSchDays, setNewSchDays] = useState("");
  const [newSchTiming, setNewSchTiming] = useState("");
  const [newSchInstructor, setNewSchInstructor] = useState("");

  // Video and Image local uploads
  const [videoPreviews, setVideoPreviews] = useState<(string | null)[]>([null, null, null]);
  const [imagePreviews, setImagePreviews] = useState<(string | null)[]>(Array(15).fill(null));

  useEffect(() => {
    const loadLocalFiles = async () => {
      try {
        const newVideoPreviews = [null, null, null];
        for (let i = 0; i < 3; i++) {
          const blob = await syncMedia(`video_${i}`);
          if (blob) {
            newVideoPreviews[i] = URL.createObjectURL(blob);
          }
        }
        setVideoPreviews(newVideoPreviews);

        const newImagePreviews = Array(15).fill(null);
        for (let i = 0; i < 15; i++) {
          const blob = await syncMedia(`image_${i}`);
          if (blob) {
            newImagePreviews[i] = URL.createObjectURL(blob);
          }
        }
        setImagePreviews(newImagePreviews);
      } catch (err) {
        console.error("Error loading local files from IndexedDB:", err);
      }
    };
    loadLocalFiles();
  }, [user]);

  // Synchronize video previews with cloud settings (Base64 or external URLs) if local blob doesn't override them
  useEffect(() => {
    const syncPreviewsWithSettings = () => {
      setVideoPreviews(prev => {
        const copy = [...prev];
        let changed = false;
        const keys = ["videoAUrl", "videoBUrl", "videoCUrl"] as const;
        for (let i = 0; i < 3; i++) {
          const urlVal = settings[keys[i]];
          if (urlVal) {
            if (urlVal.startsWith("data:") && copy[i] !== urlVal) {
              copy[i] = urlVal;
              changed = true;
            } else if (!urlVal.startsWith("indexeddb:") && !urlVal.startsWith("data:") && copy[i] !== urlVal) {
              copy[i] = urlVal;
              changed = true;
            }
          } else {
            if (copy[i] !== null && !copy[i]?.startsWith("blob:")) {
              copy[i] = null;
              changed = true;
            }
          }
        }
        return changed ? copy : prev;
      });
    };
    syncPreviewsWithSettings();
  }, [settings]);

  // Track latest notifications/toast
  const [newToast, setNewToast] = useState<string | null>(null);
  const [prevRegCount, setPrevRegCount] = useState<number>(-1);

  // Custom Logo upload state and effects
  const [customLogoPreview, setCustomLogoPreview] = useState<string | null>(null);

  // Upload progress tracking (0 to 100 per media ID or file name)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    const loadLogoPreview = async () => {
      try {
        const blob = await syncMedia("custom_logo");
        if (blob) {
          setCustomLogoPreview(URL.createObjectURL(blob));
        } else {
          setCustomLogoPreview(null);
        }
      } catch (err) {
        console.warn("Failed to load logo preview:", err);
      }
    };
    loadLogoPreview();
    window.addEventListener("custom-logo-updated", loadLogoPreview);
    return () => {
      window.removeEventListener("custom-logo-updated", loadLogoPreview);
    };
  }, []);

  // Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  // Generate unique CAPTCHA code
  const generateCaptcha = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let text = "";
    for (let i = 0; i < 5; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaText(text);
    setCaptchaInput("");
  };

  useEffect(() => {
    generateCaptcha();
  }, []);

  // Unconditional website content settings load on mount to read credentials
  useEffect(() => {
    const loadSettings = async () => {
      if (isFirestoreQuotaExceeded()) {
        const saved = localStorage.getItem("demo_settings");
        if (saved) {
          try {
            const data = JSON.parse(saved) as WebsiteSettings;
            setSettings({
              ...data,
              faqs: data.faqs || [],
              schedules: data.schedules || [],
              adminEmailForNotifications: data.adminEmailForNotifications || ""
            });
          } catch (jsonErr) {
            console.error("Failed to parse cached local settings on mount:", jsonErr);
          }
        }
        return;
      }
      try {
        const docRef = doc(db, "settings", "main");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as WebsiteSettings;
          setSettings({
            ...data,
            faqs: data.faqs || [],
            schedules: data.schedules || [],
            adminEmailForNotifications: data.adminEmailForNotifications || ""
          });
          // Cache it
          localStorage.setItem("demo_settings", JSON.stringify(data));
        } else {
          // Default fallbacks are already set in state
          console.log("No custom settings found in DB, using local defaults.");
        }
      } catch (err) {
        console.error("Error reading settings doc on mount:", err);
        const errStr = String(err);
        if (
          errStr.includes("resource-exhausted") ||
          errStr.includes("quota") ||
          errStr.includes("Quota") ||
          errStr.includes("exhausted")
        ) {
          markFirestoreQuotaExceeded();
        }
        const saved = localStorage.getItem("demo_settings");
        if (saved) {
          try {
            const data = JSON.parse(saved) as WebsiteSettings;
            setSettings({
              ...data,
              faqs: data.faqs || [],
              schedules: data.schedules || [],
              adminEmailForNotifications: data.adminEmailForNotifications || ""
            });
          } catch (jsonErr) {
            console.error("Failed to parse cached local settings on mount fallback:", jsonErr);
          }
        }
      }
    };
    loadSettings();
  }, [user]);

  // Step 1: Verify Admin ID, Password and CAPTCHA
  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    const configuredId = (settings.adminId || "SBWGOZ").trim();
    const configuredPassword = settings.adminPassword || "Royal@2026";

    // 1. Verify CAPTCHA (case insensitive)
    if (captchaInput.trim().toUpperCase() !== captchaText) {
      setLoginError("Invalid CAPTCHA code. Please try again.");
      generateCaptcha();
      setLoginLoading(false);
      return;
    }

    // 2. Verify Credentials
    if (
      adminIdInput.trim() !== configuredId ||
      adminPasswordInput !== configuredPassword
    ) {
      setLoginError("Invalid Admin ID or Password.");
      generateCaptcha();
      setLoginLoading(false);
      return;
    }

    // All correct, advance to PIN verification step
    setLoginStep("pin");
    setLoginError("");
    setLoginLoading(false);
  };

  // Step 2: Verify Security PIN and Authenticate
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    const configuredPin = (settings.adminPin || "232326").trim();
    const passwordLastUpdated = settings.passwordLastUpdated || "2026-07-01T00:00:00.000Z";

    // 1. Verify Security PIN
    if (adminPinInput.trim() !== configuredPin) {
      setLoginError("Invalid Security PIN.");
      setLoginLoading(false);
      return;
    }

    // 2. Verify 3-Month Password Expiration
    const lastUpdatedDate = new Date(passwordLastUpdated);
    const timeDiff = Math.abs(new Date().getTime() - lastUpdatedDate.getTime());
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

    if (daysDiff >= 90) {
      setShowExpiredReset(true);
      setLoginLoading(false);
      return;
    }

    // 3. Authenticate instantly using a custom local admin session
    setUser({
      email: "admin@royalcoaching.com",
      uid: "admin-uid",
      isLocalAdmin: true
    });
    setLoginLoading(false);
  };

  // Forced expired password reset handler
  const handleExpiredPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    if (newPasswordReset.length < 6) {
      setLoginError("New password must be at least 6 characters long.");
      return;
    }
    if (newPasswordReset !== newPasswordResetConfirm) {
      setLoginError("Passwords do not match.");
      return;
    }
    if (newPasswordReset === (settings.adminPassword || "Royal@2026")) {
      setLoginError("New password must be different from your current expired password.");
      return;
    }

    setLoginLoading(true);

    try {
      // Save changes to settings main
      const docRef = doc(db, "settings", "main");
      const updatedSettings = {
        ...settings,
        adminPassword: newPasswordReset,
        passwordLastUpdated: new Date().toISOString()
      };
      
      // Try to write to Firestore, but fall back gracefully if it fails
      if (isFirestoreQuotaExceeded()) {
        localStorage.setItem("demo_settings", JSON.stringify(updatedSettings));
      } else {
        try {
          await setDoc(docRef, updatedSettings);
        } catch (writeErr: any) {
          console.warn("Failed to write updated settings to Firestore, saving locally:", writeErr);
          const errStr = String(writeErr);
          if (
            writeErr?.code === "resource-exhausted" ||
            writeErr?.code === "quota-exceeded" ||
            errStr.includes("Quota") ||
            errStr.includes("quota") ||
            errStr.includes("exhausted")
          ) {
            markFirestoreQuotaExceeded();
          }
          localStorage.setItem("demo_settings", JSON.stringify(updatedSettings));
        }
      }
      
      setSettings(updatedSettings);
      setShowExpiredReset(false);
      setUser({
        email: "admin@royalcoaching.com",
        uid: "admin-uid",
        isLocalAdmin: true
      });
      alert("Password successfully updated! You can now access your dashboard.");
    } catch (err: any) {
      console.error("Error setting new expired password:", err);
      setLoginError("Failed to update password. Please check your network connection.");
    } finally {
      setLoginLoading(false);
    }
  };

  // Log Out
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      // Clear credentials input
      setAdminIdInput("");
      setAdminPasswordInput("");
      setAdminPinInput("");
      setCaptchaInput("");
      generateCaptcha();
    } catch (err) {
      console.error("Logout error", err);
    }
  };

  // Real-time Registrations Sync
  useEffect(() => {
    if (!user) return;

    if (user.isDemo || isFirestoreQuotaExceeded()) {
      // Offline/Demo Mode: load mock registrations from localStorage or defaults
      const loadDemoRegs = () => {
        const saved = localStorage.getItem("demo_registrations");
        if (saved) {
          setRegistrations(JSON.parse(saved));
        } else {
          const defaultMocks: Student[] = [
            {
              id: "demo-1",
              name: "Imran Ansari",
              mobile: "9876543210",
              email: "imran@example.com",
              address: "Dildar Nagar, Ghazipur, UP",
              age: 18,
              status: "Pending",
              timestamp: new Date(Date.now() - 3600000).toISOString(),
              viewed: false
            },
            {
              id: "demo-2",
              name: "Aman Gupta",
              mobile: "9123456789",
              email: "aman@example.com",
              address: "Subhash Nagar, Ghazipur",
              age: 16,
              status: "Approved",
              timestamp: new Date(Date.now() - 86400000).toISOString(),
              viewed: true
            },
            {
              id: "demo-3",
              name: "Priya Sharma",
              mobile: "8877665544",
              email: "priya@example.com",
              address: "Railway Station Road, Dildar Nagar",
              age: 15,
              status: "Approved",
              timestamp: new Date(Date.now() - 172800000).toISOString(),
              viewed: true
            }
          ];
          setRegistrations(defaultMocks);
          localStorage.setItem("demo_registrations", JSON.stringify(defaultMocks));
        }
      };
      loadDemoRegs();
      return;
    }

    const q = query(collection(db, "registrations"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Student[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Student);
      });

      // Show toast on new registrations
      setPrevRegCount((prevCount) => {
        if (prevCount !== -1 && data.length > prevCount) {
          const newest = data[0];
          setNewToast(`New Student Registered: ${newest.name}`);
          setTimeout(() => setNewToast(null), 5000);
        }
        return data.length;
      });

      setRegistrations(data);
      
      // Update selected student if it is currently open
      setSelectedStudent((prevSelected) => {
        if (prevSelected) {
          const updated = data.find(s => s.id === prevSelected.id);
          return updated || prevSelected;
        }
        return null;
      });
    }, (error) => {
      console.warn("Firestore read permissions error, falling back to local storage:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      if (
        errMsg.includes("resource-exhausted") ||
        errMsg.includes("quota") ||
        errMsg.includes("Quota") ||
        errMsg.includes("exhausted")
      ) {
        markFirestoreQuotaExceeded();
      }
      const saved = localStorage.getItem("demo_registrations");
      if (saved) {
        try {
          setRegistrations(JSON.parse(saved));
        } catch (e) {
          console.error("Error parsing local fallback registrations:", e);
        }
      } else {
        const defaultMocks: Student[] = [
          {
            id: "demo-1",
            name: "Imran Ansari",
            mobile: "9876543210",
            email: "imran@example.com",
            address: "Dildar Nagar, Ghazipur, UP",
            age: 18,
            status: "Pending",
            timestamp: new Date().toISOString(),
            viewed: false
          }
        ];
        setRegistrations(defaultMocks);
        localStorage.setItem("demo_registrations", JSON.stringify(defaultMocks));
      }
    });

    return unsubscribe;
  }, [user]);

  // Load Website Content Settings
  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      if (user.isDemo || isFirestoreQuotaExceeded()) {
        // Load demo settings from localStorage or fallback
        const saved = localStorage.getItem("demo_settings");
        if (saved) {
          try {
            const data = JSON.parse(saved) as WebsiteSettings;
            setSettings({
              ...data,
              faqs: data.faqs || [],
              schedules: data.schedules || [],
              adminEmailForNotifications: data.adminEmailForNotifications || ""
            });
          } catch (e) {
            console.error("Error parsing local demo settings:", e);
          }
        }
        return;
      }

      try {
        const docRef = doc(db, "settings", "main");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as WebsiteSettings;
          setSettings({
            ...data,
            faqs: data.faqs || [],
            schedules: data.schedules || [],
            adminEmailForNotifications: data.adminEmailForNotifications || ""
          });
        } else {
          // Initialize in DB if not exists
          await setDoc(docRef, settings);
        }
      } catch (err) {
        console.warn("Error reading website settings from Firestore, loading local fallback:", err);
        const errStr = String(err);
        if (
          errStr.includes("resource-exhausted") ||
          errStr.includes("quota") ||
          errStr.includes("Quota") ||
          errStr.includes("exhausted")
        ) {
          markFirestoreQuotaExceeded();
        }
        const saved = localStorage.getItem("demo_settings");
        if (saved) {
          try {
            const data = JSON.parse(saved) as WebsiteSettings;
            setSettings({
              ...data,
              faqs: data.faqs || [],
              schedules: data.schedules || [],
              adminEmailForNotifications: data.adminEmailForNotifications || ""
            });
          } catch (e) {
            console.error("Error parsing local fallback settings:", e);
          }
        }
      }
    };
    loadSettings();
  }, [user]);

  // Save Website Content Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsLoading(true);
    setSettingsSuccess(false);

    if (user && (user.isDemo || isFirestoreQuotaExceeded())) {
      try {
        localStorage.setItem("demo_settings", JSON.stringify(settings));
        setSettingsSuccess(true);
        setTimeout(() => setSettingsSuccess(false), 3000);
      } catch (err) {
        console.error("Local storage error:", err);
        alert("Failed to save settings locally.");
      } finally {
        setSettingsLoading(false);
      }
      return;
    }

    try {
      const docRef = doc(db, "settings", "main");
      await setDoc(docRef, settings);
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 3000);
    } catch (err) {
      console.warn("Error saving website settings to Firestore, falling back to local storage:", err);
      try {
        localStorage.setItem("demo_settings", JSON.stringify(settings));
        setSettingsSuccess(true);
        setTimeout(() => setSettingsSuccess(false), 3000);
      } catch (localErr) {
        console.error("Local storage fallback error:", localErr);
        alert("Failed to save content modifications.");
      }
    } finally {
      setSettingsLoading(false);
    }
  };

  // Base64 Single Image upload processor (legacy, but updated to use IndexedDB image_0 as fallback)
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Selected image is too large! Please choose an image smaller than 2MB.");
      return;
    }
    try {
      const res = await uploadMedia("image_0", file, (percent) => {
        setUploadProgress(prev => ({ ...prev, image_0: percent }));
      });
      const url = URL.createObjectURL(file);
      setImagePreviews(prev => {
        const copy = [...prev];
        copy[0] = url;
        return copy;
      });
      setSettings(prev => ({
        ...prev,
        aboutUsImage: "indexeddb:image_0"
      }));
      if (res.localOnly) {
        alert("The main image is active locally on this browser, but couldn't be saved to the cloud because the database free-tier quota has been reached. It will work perfectly for your local preview!");
      }
    } catch (err) {
      console.error("Failed to save main spotlight image:", err);
      alert("Failed to upload image to the server.");
    }
  };

  // Video local upload processor (Up to 3 videos, max 20MB)
  const handleVideoUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      alert("Selected video is too large! Please choose a video smaller than 20MB.");
      return;
    }
    
    try {
      // Notify user of active server upload
      const uploadStatusMsg = "Uploading video to database server (chunk by chunk). Please keep this tab open. This will take a few seconds...";
      console.log(uploadStatusMsg);
      
      const res = await uploadMedia(`video_${index}`, file, (percent) => {
        setUploadProgress(prev => ({ ...prev, [`video_${index}`]: percent }));
      });
      
      const url = URL.createObjectURL(file);
      setVideoPreviews(prev => {
        const copy = [...prev];
        copy[index] = url;
        return copy;
      });
      
      const key = index === 0 ? "videoAUrl" : index === 1 ? "videoBUrl" : "videoCUrl";
      setSettings(prev => ({
        ...prev,
        [key]: `indexeddb:video_${index}`
      }));
      
      if (res.localOnly) {
        alert("The video is active locally on this browser, but couldn't be saved to the cloud because the database free-tier quota has been reached. It will work perfectly for your local preview!");
      } else {
        alert(`Success! Video has been successfully saved to the server database. All visitors across the web can now play and watch it!`);
      }
    } catch (err) {
      console.error("Error saving video to database:", err);
      alert("Failed to upload video to the server. Please try a smaller or different file.");
    }
  };

  const handleRemoveVideo = async (index: number) => {
    if (!window.confirm("Are you sure you want to remove this video from the server?")) return;
    try {
      await deleteMedia(`video_${index}`);
      setVideoPreviews(prev => {
        const copy = [...prev];
        copy[index] = null;
        return copy;
      });
      const key = index === 0 ? "videoAUrl" : index === 1 ? "videoBUrl" : "videoCUrl";
      setSettings(prev => ({
        ...prev,
        [key]: ""
      }));
      // Reset progress
      setUploadProgress(prev => {
        const copy = { ...prev };
        delete copy[`video_${index}`];
        return copy;
      });
      alert("Video removed from server successfully.");
    } catch (err) {
      console.error("Error removing video:", err);
      alert("Failed to remove video from server.");
    }
  };

  // Image local upload processor (Up to 15 images, max 2MB)
  const handleImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Selected image is too large! Please choose an image smaller than 2MB.");
      return;
    }
    try {
      const res = await uploadMedia(`image_${index}`, file, (percent) => {
        setUploadProgress(prev => ({ ...prev, [`image_${index}`]: percent }));
      });
      const url = URL.createObjectURL(file);
      setImagePreviews(prev => {
        const copy = [...prev];
        copy[index] = url;
        return copy;
      });
      
      // Trigger save/change setting flag so Firestore settings documents update
      setSettings(prev => ({
        ...prev,
        aboutUsImage: prev.aboutUsImage || "indexeddb:has_images"
      }));
      
      if (res.localOnly) {
        alert(`Image ${index + 1} is active locally on this browser, but couldn't be saved to the cloud because the database free-tier quota has been reached. It will work perfectly for your local preview!`);
      } else {
        alert(`Image ${index + 1} uploaded to the server successfully!`);
      }
    } catch (err) {
      console.error("Error saving image to database:", err);
      alert("Failed to upload image to the server.");
    }
  };

  const handleRemoveImage = async (index: number) => {
    if (!window.confirm("Are you sure you want to delete this image from the server?")) return;
    try {
      await deleteMedia(`image_${index}`);
      setImagePreviews(prev => {
        const copy = [...prev];
        copy[index] = null;
        return copy;
      });
      if (index === 0) {
        setSettings(prev => ({
          ...prev,
          aboutUsImage: ""
        }));
      }
      alert("Image removed from server successfully.");
    } catch (err) {
      console.error("Error removing image:", err);
      alert("Failed to remove image from server.");
    }
  };

  // DB Modification: Mark as Viewed (Notification read trigger)
  const handleViewStudent = async (student: Student) => {
    const studentWithViewed = { ...student, viewed: true };
    setSelectedStudent(studentWithViewed);
    if (!student.viewed && student.id) {
      if (user && (user.isDemo || isFirestoreQuotaExceeded())) {
        const updated = registrations.map(r => r.id === student.id ? { ...r, viewed: true } : r);
        setRegistrations(updated);
        localStorage.setItem("demo_registrations", JSON.stringify(updated));
        return;
      }
      try {
        const updated = registrations.map(r => r.id === student.id ? { ...r, viewed: true } : r);
        setRegistrations(updated);
        localStorage.setItem("demo_registrations", JSON.stringify(updated));
        await updateDoc(doc(db, "registrations", student.id), { viewed: true });
      } catch (err) {
        console.warn("Error updating viewed status in Firestore, falling back to local:", err);
        const updated = registrations.map(r => r.id === student.id ? { ...r, viewed: true } : r);
        setRegistrations(updated);
        localStorage.setItem("demo_registrations", JSON.stringify(updated));
      }
    }
  };

  const handlePrintReceipt = (student: Student) => {
    const printHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Admission Slip - Royal Coaching Centre</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              color: #0f172a;
              background-color: #ffffff;
              padding: 40px;
              margin: 0;
            }
            .slip-card {
              max-width: 600px;
              margin: 0 auto;
              border: 2px solid #e2e8f0;
              border-radius: 16px;
              padding: 32px;
              box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05);
              position: relative;
              background: #ffffff;
              overflow: hidden;
            }
            .watermark {
              position: absolute;
              top: 55%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-15deg);
              font-size: 55px;
              font-weight: 900;
              color: rgba(37, 99, 235, 0.04);
              letter-spacing: 2px;
              white-space: nowrap;
              pointer-events: none;
              z-index: 0;
            }
            .header {
              text-align: center;
              border-bottom: 2px dashed #e2e8f0;
              padding-bottom: 24px;
              margin-bottom: 24px;
              z-index: 1;
              position: relative;
            }
            .logo {
              font-size: 28px;
              font-weight: 800;
              color: #2563eb;
              margin: 0 0 4px 0;
              letter-spacing: -0.5px;
            }
            .subtitle {
              font-size: 13px;
              color: #64748b;
              margin: 0;
              font-weight: 500;
            }
            .slip-title {
              font-size: 16px;
              font-weight: 700;
              text-align: center;
              background: #eff6ff;
              color: #1e40af;
              padding: 10px;
              border-radius: 8px;
              margin: 0 0 28px 0;
              text-transform: uppercase;
              letter-spacing: 1px;
              border: 1px solid #dbeafe;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              z-index: 1;
              position: relative;
            }
            .full-row {
              grid-column: span 2;
            }
            .label {
              font-size: 10px;
              font-weight: 700;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.7px;
              margin-bottom: 4px;
            }
            .value {
              font-size: 14px;
              font-weight: 600;
              color: #0f172a;
              word-break: break-word;
            }
            .id-value {
              font-family: monospace;
              font-size: 13px;
              color: #0f172a;
              background-color: #f8fafc;
              padding: 3px 6px;
              border-radius: 4px;
              border: 1px solid #e2e8f0;
            }
            .badge {
              display: inline-block;
              background-color: #fef3c7;
              color: #d97706;
              border: 1px solid #fde68a;
              font-size: 10px;
              font-weight: 700;
              padding: 4px 10px;
              border-radius: 9999px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .footer {
              text-align: center;
              margin-top: 32px;
              padding-top: 24px;
              border-top: 1px solid #f1f5f9;
              font-size: 11px;
              color: #94a3b8;
              line-height: 1.6;
              z-index: 1;
              position: relative;
            }
            .stamp-area {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              margin-top: 40px;
              font-size: 12px;
              font-weight: 500;
              color: #64748b;
              z-index: 1;
              position: relative;
            }
            .signature-line {
              border-top: 1px solid #cbd5e1;
              width: 150px;
              text-align: center;
              padding-top: 5px;
              margin-top: 40px;
            }
            .barcode-container {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 12px;
              margin: 16px auto 24px auto;
              max-width: 320px;
            }
            .barcode-title {
              font-size: 9px;
              font-weight: 700;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              margin-bottom: 6px;
            }
            .barcode-lines {
              display: flex;
              align-items: center;
              justify-content: center;
              height: 28px;
              width: 200px;
              margin-bottom: 4px;
              opacity: 0.85;
            }
            .barcode-bar {
              background-color: #000000 !important;
              border-left: 2px solid #000000;
              height: 100%;
              margin-right: 1.5px;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .barcode-text {
              font-family: monospace;
              font-size: 11px;
              font-weight: 700;
              color: #334155;
              letter-spacing: 2px;
              text-transform: uppercase;
            }
            @media print {
              body {
                padding: 0;
              }
              .slip-card {
                border: 1px solid #cbd5e1;
                box-shadow: none;
                max-width: 100%;
              }
            }
          </style>
        </head>
        <body>
          <div class="slip-card">
            <div class="watermark">ROYAL COACHING</div>
            
            <div class="header">
              <h1 class="logo">Royal Coaching Centre</h1>
              <p class="subtitle">Quality Education for Spoken English & Academic Excellence</p>
            </div>
            
            <h2 class="slip-title">Admission Registration Receipt</h2>

            <div class="barcode-container">
              <div class="barcode-title">Registration Slip ID</div>
              <div class="barcode-lines">
                ${[2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 4, 1, 2, 1, 3, 1, 2, 1, 4, 1, 3, 2, 1, 3].map(w => `<div class="barcode-bar" style="width: ${w}px;"></div>`).join("")}
              </div>
              <div class="barcode-text">${student.id || "REG-PENDING"}</div>
            </div>
            
            <div class="info-grid">
              <div>
                <div class="label">Student Name</div>
                <div class="value">${student.name || "N/A"}</div>
              </div>
              <div>
                <div class="label">Admission Temp ID</div>
                <div class="value"><span class="id-value">${student.id || "N/A"}</span></div>
              </div>
              
              <div>
                <div class="label">Mobile Number</div>
                <div class="value">${student.mobile || "N/A"}</div>
              </div>
              <div>
                <div class="label">Age</div>
                <div class="value">${student.age || "N/A"} Years</div>
              </div>
              
              <div class="full-row">
                <div class="label">Email Address</div>
                <div class="value">${student.email || "N/A"}</div>
              </div>
              
              <div class="full-row">
                <div class="label">Residential Address</div>
                <div class="value">${student.address || "N/A"}</div>
              </div>
              
              <div>
                <div class="label">Registration Status</div>
                <div class="value">
                  <span class="badge">${student.status || "Pending"}</span>
                </div>
              </div>
              <div>
                <div class="label">Date of Registration</div>
                <div class="value">
                  ${student.timestamp ? new Date(student.timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : new Date().toLocaleString()}
                </div>
              </div>
            </div>
            
            <div class="stamp-area">
              <div>
                Receipt Generated Electronically
              </div>
              <div class="signature-line">
                Authorized Signatory
              </div>
            </div>
            
            <div class="footer">
              <p>Please keep this receipt safe for reference during batch allotment and fee payment.</p>
              <p>© ${new Date().getFullYear()} Royal Coaching Centre. All rights reserved.</p>
            </div>
          </div>
          
          <script>
            window.onload = function() {
              window.focus();
              try {
                window.print();
              } catch (e) {
                console.warn("Print error inside iframe:", e);
              }
            };
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(printHtml);
      printWindow.document.close();
    } else {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0px";
      iframe.style.height = "0px";
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(printHtml);
        iframeDoc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.warn("Iframe fallback printing failed:", e);
          }
        }, 500);

        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 6000);
      }
    }
  };

  const getIdCardHtml = () => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Student ID Card - ${idCardForm.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              margin: 0;
              padding: 20px;
              display: flex;
              justify-content: center;
              align-items: center;
              background-color: #f1f5f9;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .id-card {
              width: 3.375in;
              height: 5.125in;
              border-radius: 16px;
              background: radial-gradient(circle at 50% 50%, #ffffff 0%, #f8fafc 100%);
              box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
              border: 1px solid #e2e8f0;
              overflow: hidden;
              position: relative;
              display: flex;
              flex-direction: column;
              box-sizing: border-box;
            }
            .card-header {
              background: linear-gradient(135deg, #1e3a8a, #3b82f6);
              color: #ffffff;
              text-align: center;
              padding: 14px 10px;
              position: relative;
              border-bottom: 3px solid #fbbf24;
            }
            .coaching-title {
              font-size: 14px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin: 0;
              color: #ffffff;
              text-shadow: 0 1px 2px rgba(0,0,0,0.2);
            }
            .coaching-subtitle {
              font-size: 8px;
              font-weight: 600;
              color: #fbbf24;
              text-transform: uppercase;
              letter-spacing: 0.8px;
              margin: 2px 0 0 0;
            }
            .coaching-address {
              font-size: 6.5px;
              font-weight: 500;
              color: #e2e8f0;
              margin: 2px 0 0 0;
            }
            .photo-container {
              display: flex;
              justify-content: center;
              margin-top: 14px;
              margin-bottom: 10px;
              position: relative;
              z-index: 10;
            }
            .photo-frame {
              width: 85px;
              height: 105px;
              border-radius: 8px;
              border: 3px solid #ffffff;
              box-shadow: 0 4px 10px rgba(0,0,0,0.15);
              background: #f8fafc;
              overflow: hidden;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .student-photo {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }
            .no-photo {
              color: #94a3b8;
              font-size: 8px;
              font-weight: bold;
              text-transform: uppercase;
              text-align: center;
              padding: 4px;
            }
            .student-name {
              font-size: 13px;
              font-weight: 800;
              color: #0f172a;
              text-transform: uppercase;
              text-align: center;
              letter-spacing: 0.3px;
              margin: 0 10px 8px 10px;
              border-bottom: 1px solid #f1f5f9;
              padding-bottom: 4px;
            }
            .details-grid {
              flex: 1;
              padding: 0 16px;
              display: flex;
              flex-direction: column;
              gap: 4px;
              margin-bottom: 72px; /* Ensure space for the absolute footer wave */
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 8px;
              line-height: 1.25;
              border-bottom: 1px dashed #f1f5f9;
              padding-bottom: 3px;
            }
            .detail-row:last-child {
              border-bottom: none;
            }
            .detail-label {
              font-weight: 700;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.4px;
            }
            .detail-value {
              font-weight: 600;
              color: #0f172a;
              text-align: right;
            }
            
            /* Beautiful Wave Footer styling */
            .footer-container {
              position: absolute;
              bottom: 0;
              left: 0;
              width: 100%;
              display: flex;
              flex-direction: column;
              overflow: hidden;
              pointer-events: none;
              z-index: 20;
            }
            .wave-svg {
              width: 100%;
              height: 22px;
              display: block;
              margin-bottom: -1px; /* avoid white gap */
            }
            .footer-content {
              background: #1e3a8a;
              color: #ffffff;
              padding: 6px 16px 12px 16px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              pointer-events: auto;
            }
            .barcode-box {
              background: #ffffff;
              padding: 4px 6px;
              border-radius: 6px;
              display: flex;
              flex-direction: column;
              align-items: center;
              box-shadow: 0 2px 5px rgba(0,0,0,0.15);
            }
            .barcode-lines {
              display: flex;
              align-items: stretch;
              height: 14px;
              width: 80px;
              gap: 0.8px;
            }
            .barcode-bar {
              background-color: #000000 !important;
              height: 100%;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .signature-box {
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .signature-image {
              max-height: 20px;
              max-width: 70px;
              object-fit: contain;
              margin-bottom: 2px;
              filter: brightness(1.1);
            }
            .signature-placeholder {
              height: 18px;
              width: 60px;
              border-bottom: 1px dashed rgba(255,255,255,0.4);
              margin-bottom: 2px;
            }
            .signature-label {
              font-size: 6px;
              font-weight: 700;
              color: #93c5fd;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            
            @media print {
              body {
                background: none;
                padding: 0;
                margin: 0;
                display: block;
              }
              .id-card {
                box-shadow: none;
                border: 1px solid #e2e8f0;
                page-break-inside: avoid;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .footer-content {
                background: #1e3a8a !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .barcode-bar {
                background-color: #000000 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="id-card">
            <div class="card-header">
              <h2 class="coaching-title">Royal Coaching Centre</h2>
              <div class="coaching-subtitle">Quality Spoken English</div>
              <div class="coaching-address">Dildar Nagar, Ghazipur, UP</div>
            </div>
            
            <div class="photo-container">
              <div class="photo-frame">
                ${idCardForm.studentPhoto ? `
                  <img src="${idCardForm.studentPhoto}" class="student-photo" alt="Student" />
                ` : `
                  <div class="no-photo">Upload<br/>Photo<br/>(Max 30KB)</div>
                `}
              </div>
            </div>
            
            <h3 class="student-name">${idCardForm.name}</h3>
            
            <div class="details-grid">
              <div class="detail-row">
                <span class="detail-label">Roll No</span>
                <span class="detail-value" style="font-family: monospace; font-size: 9px; font-weight: bold; color: #1e3a8a;">
                  ${idCardForm.id}
                </span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Class / Std</span>
                <span class="detail-value">Class ${idCardForm.className || "N/A"}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Father's Name</span>
                <span class="detail-value" style="max-width: 140px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${idCardForm.fatherName || "N/A"}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Mobile No</span>
                <span class="detail-value" style="font-family: monospace;">${idCardForm.mobile || "N/A"}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Address</span>
                <span class="detail-value" style="max-width: 140px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${idCardForm.address || "N/A"}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Joining Date</span>
                <span class="detail-value" style="font-family: monospace;">${idCardForm.joiningDate ? new Date(idCardForm.joiningDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "N/A"}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Valid Until</span>
                <span class="detail-value" style="font-family: monospace;">${idCardForm.validUntil ? new Date(idCardForm.validUntil).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "N/A"}</span>
              </div>
            </div>
            
            <div class="footer-container">
              <svg class="wave-svg" viewBox="0 0 120 20" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M0 8 C 30 18, 40 2, 80 10 C 100 14, 110 6, 120 12 L120 20 L0 20 Z" fill="#1e3a8a" />
                <path d="M0 12 C 20 4, 40 16, 70 8 C 90 4, 105 12, 120 6 L120 20 L0 20 Z" fill="#3b82f6" opacity="0.4" />
              </svg>
              <div class="footer-content">
                <div class="barcode-box">
                  <div class="barcode-lines">
                    ${[2, 1, 3, 1, 2, 1, 4, 1, 2, 1, 3, 1].map((w, i) => `<div class="barcode-bar" style="flex: ${w}; border-left: ${w * 1.2}px solid #000000 !important;"></div>`).join("")}
                  </div>
                </div>
                
                <div class="signature-box">
                  ${idCardForm.adminSignature ? `
                    <img src="${idCardForm.adminSignature}" class="signature-image" alt="Signature" />
                  ` : `
                    <div class="signature-placeholder"></div>
                  `}
                  <div class="signature-label">Principal</div>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintStudentIdCard = () => {
    const cardHtml = getIdCardHtml();
    
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(cardHtml);
      printWindow.document.close();
    } else {
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0px";
      iframe.style.height = "0px";
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(cardHtml);
        iframeDoc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.warn("Iframe fallback printing failed:", e);
          }
        }, 500);

        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 6000);
      }
    }
  };

  // DB Modification: Update Admission Status
  const handleUpdateStatus = async (studentId: string, status: "Approved" | "Rejected" | "Pending") => {
    const todayStr = new Date().toISOString().substring(0, 10);
    const extraFields = status === "Approved" ? { joiningDate: todayStr, exitStatus: "Active" as const } : {};

    // Update selectedStudent state instantly
    if (selectedStudent && selectedStudent.id === studentId) {
      setSelectedStudent(prev => prev ? { ...prev, status, ...extraFields } : null);
    }

    if (user && (user.isDemo || isFirestoreQuotaExceeded())) {
      const updated = registrations.map(r => r.id === studentId ? { ...r, status, ...extraFields } : r);
      setRegistrations(updated);
      localStorage.setItem("demo_registrations", JSON.stringify(updated));
      return;
    }
    try {
      const updated = registrations.map(r => r.id === studentId ? { ...r, status, ...extraFields } : r);
      setRegistrations(updated);
      localStorage.setItem("demo_registrations", JSON.stringify(updated));
      await updateDoc(doc(db, "registrations", studentId), { status, ...extraFields });
    } catch (err) {
      console.warn("Error updating status in Firestore, falling back to local:", err);
      const updated = registrations.map(r => r.id === studentId ? { ...r, status, ...extraFields } : r);
      setRegistrations(updated);
      localStorage.setItem("demo_registrations", JSON.stringify(updated));
    }
  };

  // DB Modification: Delete Student Entry
  const handleDeleteStudent = async (studentId: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this student registration record from the database?")) {
      return;
    }
    if (user && (user.isDemo || isFirestoreQuotaExceeded())) {
      const updated = registrations.filter(r => r.id !== studentId);
      setRegistrations(updated);
      localStorage.setItem("demo_registrations", JSON.stringify(updated));
      setSelectedStudent(null);
      return;
    }
    try {
      const updated = registrations.filter(r => r.id !== studentId);
      setRegistrations(updated);
      localStorage.setItem("demo_registrations", JSON.stringify(updated));
      setSelectedStudent(null);
      await deleteDoc(doc(db, "registrations", studentId));
    } catch (err) {
      console.warn("Error deleting document from Firestore, falling back to local:", err);
      const updated = registrations.filter(r => r.id !== studentId);
      setRegistrations(updated);
      localStorage.setItem("demo_registrations", JSON.stringify(updated));
      setSelectedStudent(null);
    }
  };

  // Student Management & Enrollment Handlers
  const handleUpdateEnrollment = async (
    studentId: string, 
    joiningDate: string, 
    exitDate: string, 
    exitStatus: "Active" | "Exited"
  ) => {
    const updated = registrations.map(r => r.id === studentId ? { ...r, joiningDate, exitDate, exitStatus } : r);
    setRegistrations(updated);
    localStorage.setItem("demo_registrations", JSON.stringify(updated));

    const s = updated.find(r => r.id === studentId);
    if (s && selectedManagedStudent?.id === studentId) {
      setSelectedManagedStudent(s);
    }

    if (user && (user.isDemo || isFirestoreQuotaExceeded())) {
      return;
    }
    try {
      await updateDoc(doc(db, "registrations", studentId), { joiningDate, exitDate, exitStatus });
    } catch (err) {
      console.warn("Firestore error updating enrollment:", err);
    }
  };

  const handleStartEditStudent = () => {
    if (!selectedManagedStudent) return;
    setStudentForm({
      name: selectedManagedStudent.name || selectedManagedStudent.fullName || "",
      mobile: selectedManagedStudent.mobile || selectedManagedStudent.mobileNo || "",
      email: selectedManagedStudent.email || selectedManagedStudent.emailId || "",
      age: selectedManagedStudent.age || 0,
      fatherName: selectedManagedStudent.fatherName || "",
      className: selectedManagedStudent.className || "",
      stream: selectedManagedStudent.stream || "",
      preferredBatch: selectedManagedStudent.preferredBatch || "",
      address: selectedManagedStudent.address || ""
    });
    setIsEditingStudent(true);
  };

  const handleSaveStudentDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedManagedStudent || !selectedManagedStudent.id) return;

    const updatedStudent: Student = {
      ...selectedManagedStudent,
      name: studentForm.name,
      mobile: studentForm.mobile,
      email: studentForm.email,
      age: Number(studentForm.age) || 0,
      fatherName: studentForm.fatherName,
      className: studentForm.className,
      stream: studentForm.stream,
      preferredBatch: studentForm.preferredBatch,
      address: studentForm.address
    };

    const updated = registrations.map(r => r.id === selectedManagedStudent.id ? updatedStudent : r);
    setRegistrations(updated);
    localStorage.setItem("demo_registrations", JSON.stringify(updated));
    setSelectedManagedStudent(updatedStudent);
    setIsEditingStudent(false);

    if (user && (user.isDemo || isFirestoreQuotaExceeded())) {
      return;
    }
    try {
      await updateDoc(doc(db, "registrations", selectedManagedStudent.id), {
        name: studentForm.name,
        mobile: studentForm.mobile,
        email: studentForm.email,
        age: Number(studentForm.age) || 0,
        fatherName: studentForm.fatherName,
        className: studentForm.className,
        stream: studentForm.stream,
        preferredBatch: studentForm.preferredBatch,
        address: studentForm.address
      });
    } catch (err) {
      console.warn("Firestore error updating student details:", err);
    }
  };

  const handleSaveFeeRecord = async (studentId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!feeForm.month) {
      alert("Please enter a valid month/period (e.g. July 2026)");
      return;
    }

    const currentStudent = registrations.find(r => r.id === studentId);
    if (!currentStudent) return;

    const currentFees = currentStudent.fees || [];
    let updatedFees = [...currentFees];

    if (editingFeeRecord) {
      updatedFees = updatedFees.map(f => f.id === editingFeeRecord.id ? { 
        ...f, 
        month: feeForm.month,
        amountPaid: Number(feeForm.amountPaid),
        totalDue: Number(feeForm.totalDue),
        paymentDate: feeForm.paymentDate,
        paymentStatus: feeForm.paymentStatus,
        remarks: feeForm.remarks
      } : f);
    } else {
      const newFee = {
        id: "fee-" + Date.now(),
        month: feeForm.month,
        amountPaid: Number(feeForm.amountPaid),
        totalDue: Number(feeForm.totalDue),
        paymentDate: feeForm.paymentDate,
        paymentStatus: feeForm.paymentStatus,
        remarks: feeForm.remarks
      };
      updatedFees.push(newFee);
    }

    const updated = registrations.map(r => r.id === studentId ? { ...r, fees: updatedFees } : r);
    setRegistrations(updated);
    localStorage.setItem("demo_registrations", JSON.stringify(updated));

    const s = updated.find(r => r.id === studentId);
    if (s) {
      setSelectedManagedStudent(s);
    }

    setIsAddingFee(false);
    setEditingFeeRecord(null);
    setFeeForm({
      month: "",
      amountPaid: 0,
      totalDue: 0,
      paymentDate: new Date().toISOString().substring(0, 10),
      paymentStatus: "Paid",
      remarks: ""
    });

    if (user && (user.isDemo || isFirestoreQuotaExceeded())) {
      return;
    }
    try {
      await updateDoc(doc(db, "registrations", studentId), { fees: updatedFees });
    } catch (err) {
      console.warn("Firestore error saving fee:", err);
    }
  };

  const handleDeleteFeeRecord = async (studentId: string, feeId: string) => {
    if (!window.confirm("Are you sure you want to delete this fee record?")) return;
    const currentStudent = registrations.find(r => r.id === studentId);
    if (!currentStudent) return;

    const updatedFees = (currentStudent.fees || []).filter(f => f.id !== feeId);

    const updated = registrations.map(r => r.id === studentId ? { ...r, fees: updatedFees } : r);
    setRegistrations(updated);
    localStorage.setItem("demo_registrations", JSON.stringify(updated));

    const s = updated.find(r => r.id === studentId);
    if (s) {
      setSelectedManagedStudent(s);
    }

    if (user && (user.isDemo || isFirestoreQuotaExceeded())) {
      return;
    }
    try {
      await updateDoc(doc(db, "registrations", studentId), { fees: updatedFees });
    } catch (err) {
      console.warn("Firestore error deleting fee:", err);
    }
  };

  // Custom Logo upload processors
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Selected logo image is too large! Please choose an image smaller than 2MB.");
      return;
    }
    try {
      const res = await uploadMedia("custom_logo", file, (percent) => {
        setUploadProgress(prev => ({ ...prev, custom_logo: percent }));
      });
      window.dispatchEvent(new Event("custom-logo-updated"));
      if (res.localOnly) {
        alert("The custom logo is active locally on this browser, but couldn't be saved to the cloud because the database free-tier quota has been reached. It will work perfectly for your local preview!");
      } else {
        alert("Logo uploaded to server successfully!");
      }
    } catch (err) {
      console.error("Error saving logo to database:", err);
      alert("Failed to upload logo.");
    }
  };

  const handleRemoveLogo = async () => {
    if (!window.confirm("Are you sure you want to remove the custom logo from the server?")) return;
    try {
      await deleteMedia("custom_logo");
      window.dispatchEvent(new Event("custom-logo-updated"));
      setUploadProgress(prev => {
        const copy = { ...prev };
        delete copy.custom_logo;
        return copy;
      });
      alert("Custom logo removed from server successfully.");
    } catch (err) {
      console.error("Error removing logo:", err);
      alert("Failed to remove custom logo.");
    }
  };

  // Export filtered list to CSV download
  const exportToCSV = (statusType: "Approved" | "Pending" | "Rejected") => {
    const listToExport = registrations.filter(r => r.status === statusType);
    if (listToExport.length === 0) {
      alert(`No student registration records found with status "${statusType}" to export.`);
      return;
    }
    
    // Headers matching student schema
    const headers = ["Registration Slip Id", "Name", "Email", "Mobile", "Age", "Address", "Status", "Timestamp"];
    
    // Helper to escape CSV values
    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return "";
      let str = String(val);
      // Escape quotes and wrap in quotes if there are commas, newlines or quotes
      str = str.replace(/"/g, '""');
      if (str.includes(",") || str.includes("\n") || str.includes('"')) {
        str = `"${str}"`;
      }
      return str;
    };

    const rows = listToExport.map(r => [
      r.id,
      r.name,
      r.email,
      r.mobile,
      r.age,
      r.address,
      r.status,
      r.timestamp
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(escapeCSV).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${statusType}_students_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportStudentsWithFeesToCSV = () => {
    const approvedStudents = registrations.filter(r => r.status === "Approved");
    if (approvedStudents.length === 0) {
      alert("No approved student records found to export.");
      return;
    }

    const headers = [
      "Registration Slip Id",
      "Student Name", 
      "Email", 
      "Mobile", 
      "Father's Name", 
      "Class Name", 
      "Stream", 
      "Joining Date", 
      "Exit Status", 
      "Exit Date", 
      "Fee Month", 
      "Amount Paid", 
      "Total Due", 
      "Payment Date", 
      "Payment Status", 
      "Remarks"
    ];

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return "";
      let str = String(val);
      str = str.replace(/"/g, '""');
      if (str.includes(",") || str.includes("\n") || str.includes('"')) {
        str = `"${str}"`;
      }
      return str;
    };

    const rows: string[][] = [];

    approvedStudents.forEach(s => {
      const fees = s.fees || [];
      const studentName = s.name || s.fullName || "Unnamed";
      const studentMobile = s.mobile || s.mobileNo || "N/A";
      const studentFatherName = s.fatherName || "N/A";
      const studentClassName = s.className || "N/A";
      const studentStream = s.stream || "N/A";
      const studentJoiningDate = s.joiningDate || "N/A";
      const studentExitStatus = s.exitStatus || "Active";
      const studentExitDate = s.exitDate || "N/A";

      if (fees.length === 0) {
        rows.push([
          s.id || "N/A",
          studentName,
          s.email || "N/A",
          studentMobile,
          studentFatherName,
          studentClassName,
          studentStream,
          studentJoiningDate,
          studentExitStatus,
          studentExitDate,
          "N/A", // Fee Month
          "0", // Amount Paid
          "0", // Total Due
          "N/A", // Payment Date
          "No Fees Logged", // Payment Status
          "" // Remarks
        ]);
      } else {
        fees.forEach(f => {
          rows.push([
            s.id || "N/A",
            studentName,
            s.email || "N/A",
            studentMobile,
            studentFatherName,
            studentClassName,
            studentStream,
            studentJoiningDate,
            studentExitStatus,
            studentExitDate,
            f.month,
            String(f.amountPaid),
            String(f.totalDue),
            f.paymentDate,
            f.paymentStatus,
            f.remarks || ""
          ]);
        });
      }
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(escapeCSV).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `student_fees_monthwise_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Unread Notification Count
  const unreadCount = registrations.filter((r) => !r.viewed).length;

  // Filtered Admissions List
  const filteredAdmissions = registrations.filter((r) => {
    if (statusFilter === "All") return true;
    return r.status === statusFilter;
  });

  // Calculate Metrics
  const totalRegs = registrations.length;
  const pendingRegs = registrations.filter(r => r.status === "Pending").length;
  const approvedRegs = registrations.filter(r => r.status === "Approved").length;
  const rejectedRegs = registrations.filter(r => r.status === "Rejected").length;
  
  const avgAge = totalRegs > 0 
    ? Math.round(registrations.reduce((sum, r) => sum + r.age, 0) / totalRegs) 
    : 0;

  // Recharts: Registrations Trend Data
  const trendData = () => {
    const datesMap: { [date: string]: number } = {};
    // Last 7 days distribution
    registrations.forEach((r) => {
      const d = new Date(r.timestamp);
      const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      datesMap[dateStr] = (datesMap[dateStr] || 0) + 1;
    });
    return Object.keys(datesMap).map(key => ({ date: key, count: datesMap[key] })).reverse();
  };

  // Recharts: Age Demographics Data
  const ageData = [
    { range: "4-12", count: registrations.filter(r => r.age >= 4 && r.age <= 12).length },
    { range: "13-18", count: registrations.filter(r => r.age >= 13 && r.age <= 18).length },
    { range: "19-25", count: registrations.filter(r => r.age >= 19 && r.age <= 25).length },
    { range: "26-35", count: registrations.filter(r => r.age >= 26 && r.age <= 35).length },
    { range: "36+", count: registrations.filter(r => r.age >= 36).length }
  ];

  // Recharts: Status Pie Data
  const pieData = [
    { name: "Pending", value: pendingRegs },
    { name: "Approved", value: approvedRegs },
    { name: "Rejected", value: rejectedRegs }
  ].filter(item => item.value > 0);

  // Generate last 6 months programmatically for Admissions vs Exits trends
  const getMonthlyStats = () => {
    const months: { label: string; yearMonth: string; admissions: number; exits: number }[] = [];
    const date = new Date(); // Current date (2026-07-05)
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }); // e.g. "Jul 26"
      const year = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0'); // "07"
      const yearMonth = `${year}-${monthStr}`; // "2026-07"
      
      months.push({
        label,
        yearMonth,
        admissions: 0,
        exits: 0
      });
    }

    // Populate admissions and exits from registrations
    registrations.forEach((student) => {
      // Admission (Approved status)
      if (student.status === "Approved") {
        let joinDateStr = student.joiningDate;
        if (!joinDateStr && student.timestamp) {
          joinDateStr = student.timestamp.substring(0, 10); // get YYYY-MM-DD
        }
        
        if (joinDateStr) {
          const joinYM = joinDateStr.substring(0, 7); // YYYY-MM
          const match = months.find(m => m.yearMonth === joinYM);
          if (match) {
            match.admissions++;
          }
        }
      }

      // Exit (exitStatus is Exited and has exitDate)
      if (student.exitStatus === "Exited" && student.exitDate) {
        const exitYM = student.exitDate.substring(0, 7); // YYYY-MM
        const match = months.find(m => m.yearMonth === exitYM);
        if (match) {
          match.exits++;
        }
      }
    });

    return months;
  };

  const monthlyData = getMonthlyStats();

  const getMonthlyFeeStats = () => {
    const statsMap: {
      [key: string]: {
        month: string;
        income: number;
        totalDue: number;
        paidCount: number;
        partiallyPaidCount: number;
        unpaidCount: number;
        students: { name: string; status: string; amountPaid: number; totalDue: number; mobile: string }[];
      };
    } = {};

    registrations.forEach((student) => {
      const fees = student.fees || [];
      const sName = student.name || student.fullName || "Unnamed";
      const sMobile = student.mobile || student.mobileNo || "N/A";

      fees.forEach((fee) => {
        const monthKey = (fee.month || "").trim();
        if (!monthKey) return;

        if (!statsMap[monthKey]) {
          statsMap[monthKey] = {
            month: monthKey,
            income: 0,
            totalDue: 0,
            paidCount: 0,
            partiallyPaidCount: 0,
            unpaidCount: 0,
            students: [],
          };
        }

        statsMap[monthKey].income += fee.amountPaid || 0;
        statsMap[monthKey].totalDue += fee.totalDue || 0;

        if (fee.paymentStatus === "Paid") {
          statsMap[monthKey].paidCount++;
        } else if (fee.paymentStatus === "Partially Paid") {
          statsMap[monthKey].partiallyPaidCount++;
        } else {
          statsMap[monthKey].unpaidCount++;
        }

        statsMap[monthKey].students.push({
          name: sName,
          status: fee.paymentStatus,
          amountPaid: fee.amountPaid || 0,
          totalDue: fee.totalDue || 0,
          mobile: sMobile,
        });
      });
    });

    return Object.values(statsMap);
  };

  const monthlyFeeData = getMonthlyFeeStats();

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-50 text-slate-800 flex flex-col font-sans">
      
      {/* Dynamic Audio/Visual Real-Time Notification Toast */}
      {newToast && (
        <div className="fixed top-20 right-6 z-55 max-w-sm bg-blue-600 text-white p-4 rounded-xl shadow-lg flex items-center gap-3 border border-blue-500 animate-slideIn">
          <Bell className="w-6 h-6 text-white animate-swing shrink-0" />
          <div>
            <p className="text-[10px] font-bold tracking-wider uppercase opacity-80">Live Notification</p>
            <p className="font-bold text-sm">{newToast}</p>
          </div>
        </div>
      )}

      {/* SECURE LOGIN GATEWAY */}
      {!user ? (
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-900 relative">
          {/* Decorative ambient glowing backdrops for professional visual depth */}
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="w-full max-w-md bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden transition-all duration-300">
            {/* Top custom glowing line */}
            <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500"></div>
            
            <div className="text-center mb-6">
              <div className="mb-4 inline-flex p-3 bg-slate-900 border border-slate-800 rounded-2xl shadow-inner">
                <LogoIcon className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Administrator Portal</h2>
              <p className="text-slate-400 text-xs mt-1.5 max-w-xs mx-auto">Manage student registrations, real-time analytics, and system configurations</p>
            </div>

            {/* Database Mode Content block */}
            <div>
                {loginError && loginError !== "auth-operation-not-allowed" && (
                  <div className="mb-5 p-3.5 bg-red-950/40 border border-red-900/50 rounded-xl text-red-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{loginError}</span>
                  </div>
                )}

                {loginError === "auth-operation-not-allowed" && (
                  <div className="mb-6 p-5 bg-slate-900/80 border border-slate-800 rounded-xl text-slate-300 text-xs">
                    <div className="flex items-center gap-2 text-amber-500 font-bold mb-2">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <span className="uppercase tracking-wider text-[11px]">Firebase Authentication Setup Required</span>
                    </div>
                    <p className="mb-3 leading-relaxed text-slate-400">
                      The <span className="font-semibold text-amber-400">"Email/Password" Sign-in Provider</span> has not been enabled in your Firebase Project Console.
                    </p>
                    <div className="space-y-1.5 mb-4 pl-2 border-l-2 border-amber-500 text-slate-400">
                      <p>1. Open your <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-blue-400 underline font-semibold hover:text-blue-300">Firebase Console</a>.</p>
                      <p>2. Go to <span className="font-semibold text-slate-300">Authentication</span> &gt; <span className="font-semibold text-slate-300">Sign-in method</span>.</p>
                      <p>3. Enable <span className="font-semibold text-slate-300">Email/Password</span> under Native Providers and save.</p>
                    </div>
                    <div className="border-t border-slate-800/80 pt-3 flex flex-col gap-2">
                      <p className="text-slate-400 text-[10px] italic font-medium">Would you like to bypass and enter Offline Demo Mode?</p>
                      <button
                        type="button"
                        onClick={() => {
                          setLoginError("");
                          setUser({
                            email: "demo@royalcoaching.com",
                            uid: "demo-uid",
                            isDemo: true
                          });
                        }}
                        className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold rounded-lg text-xs uppercase tracking-wider transition shadow-sm text-center cursor-pointer"
                      >
                        🚀 Enter Demo Mode (Offline/Local)
                      </button>
                    </div>
                  </div>
                )}

                {showExpiredReset ? (
                  /* Password expired (3-month cycle) force-reset view */
                  <form onSubmit={handleExpiredPasswordReset} className="space-y-4">
                    <div className="p-3.5 bg-amber-950/40 border border-amber-900/40 rounded-xl text-amber-300 text-xs">
                      <p className="font-bold mb-1 uppercase tracking-wider text-[10px] flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5 text-amber-400" /> Security Policy Requirement
                      </p>
                      <p>Our organization requires a mandatory administrative password change every 3 months. Please configure a new secure password to proceed.</p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        New Secure Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="password"
                          value={newPasswordReset}
                          onChange={(e) => setNewPasswordReset(e.target.value)}
                          placeholder="Minimum 6 characters"
                          required
                          className="w-full pl-10 pr-4 py-3 border border-slate-800 rounded-xl bg-slate-900/60 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="password"
                          value={newPasswordResetConfirm}
                          onChange={(e) => setNewPasswordResetConfirm(e.target.value)}
                          placeholder="Repeat new password"
                          required
                          className="w-full pl-10 pr-4 py-3 border border-slate-800 rounded-xl bg-slate-900/60 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowExpiredReset(false);
                          setNewPasswordReset("");
                          setNewPasswordResetConfirm("");
                        }}
                        className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-xs uppercase tracking-wider cursor-pointer border border-slate-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loginLoading}
                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/10"
                      >
                        {loginLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Update & Login"}
                      </button>
                    </div>
                  </form>
                ) : loginStep === "credentials" ? (
                  /* Step 1: Admin ID, Password, and CAPTCHA */
                  <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Login ID
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="text"
                          value={adminIdInput}
                          onChange={(e) => setAdminIdInput(e.target.value)}
                          placeholder="Enter admin ID"
                          required
                          className="w-full pl-10 pr-4 py-3 border border-slate-800 rounded-xl bg-slate-900/60 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-mono uppercase tracking-wider transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="password"
                          value={adminPasswordInput}
                          onChange={(e) => setAdminPasswordInput(e.target.value)}
                          placeholder="Enter Password"
                          required
                          className="w-full pl-10 pr-4 py-3 border border-slate-800 rounded-xl bg-slate-900/60 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm transition-all"
                        />
                      </div>
                    </div>

                    {/* Captcha Box */}
                    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Fingerprint className="w-3.5 h-3.5 text-blue-400" /> Security Verification (CAPTCHA)
                        </span>
                        <button
                          type="button"
                          onClick={generateCaptcha}
                          className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[10px] font-bold cursor-pointer transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" /> Refresh
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {/* Beautiful high-contrast clearer visible CAPTCHA display */}
                        <div className="flex-1 h-12 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-center relative overflow-hidden select-none px-4 shadow-sm">
                          {/* Subtle background security line pattern */}
                          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(45deg, #000, #000 1px, transparent 1px, transparent 10px)" }}></div>
                          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(-45deg, #000, #000 1px, transparent 1px, transparent 10px)" }}></div>
                          
                          <div className="relative flex items-center justify-center gap-3">
                            {captchaText.split("").map((char, idx) => {
                              const charCode = char.charCodeAt(0);
                              const rotateDeg = ((charCode % 14) - 7); // rotation between -7 and 7
                              const yOffset = ((charCode % 6) - 3);   // y shift between -3px and 3px
                              const colorClass = idx % 2 === 0 ? "text-blue-400" : "text-emerald-400";
                              return (
                                <span
                                  key={idx}
                                  className={`inline-block font-sans font-extrabold text-xl tracking-wide ${colorClass} select-none drop-shadow-sm`}
                                  style={{
                                    transform: `rotate(${rotateDeg}deg) translateY(${yOffset}px)`,
                                  }}
                                >
                                  {char}
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        <input
                          type="text"
                          value={captchaInput}
                          onChange={(e) => setCaptchaInput(e.target.value)}
                          placeholder="Code"
                          maxLength={5}
                          required
                          className="w-28 p-2.5 border border-slate-800 rounded-lg bg-slate-950 text-white text-center uppercase focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-extrabold tracking-widest h-12 shadow-inner"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loginLoading}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl uppercase tracking-widest hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 text-xs cursor-pointer flex items-center justify-center gap-2 mt-4 shadow-lg shadow-blue-500/10"
                    >
                      {loginLoading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Verifying...
                        </>
                      ) : (
                        "Verify & Sign In"
                      )}
                    </button>
                  </form>
                ) : (
                  /* Step 2: PIN input step */
                  <form onSubmit={handlePinSubmit} className="space-y-4">
                    <div className="p-3.5 bg-blue-950/40 border border-blue-900/40 rounded-xl text-xs text-blue-300 mb-2 leading-relaxed flex items-start gap-2">
                      <Shield className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <span>
                        <strong className="block text-white mb-0.5">✓ Credentials Verified</strong>
                        Please enter your secure 6-Digit Security PIN to authorize administrative dashboard access.
                      </span>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                        Security PIN
                      </label>
                      <div className="relative">
                        <Fingerprint className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="password"
                          value={adminPinInput}
                          onChange={(e) => setAdminPinInput(e.target.value)}
                          placeholder="Enter 6-Digit PIN"
                          maxLength={6}
                          required
                          className="w-full pl-10 pr-4 py-3 border border-slate-800 rounded-xl bg-slate-900/60 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm font-mono text-center tracking-widest transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={loginLoading}
                        className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl uppercase tracking-widest transition-all duration-300 text-xs cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10"
                      >
                        {loginLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Entering Account...
                          </>
                        ) : (
                          "Verify PIN & Access Dashboard"
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setLoginStep("credentials");
                          setLoginError("");
                        }}
                        className="text-slate-400 hover:text-white text-xs transition-colors py-1 cursor-pointer block text-center font-semibold"
                      >
                        ← Back to Credentials
                      </button>
                    </div>
                  </form>
                )}
              </div>

            <button
              onClick={onClose}
              className="mt-6 w-full text-slate-500 hover:text-slate-300 text-xs underline cursor-pointer text-center block transition-colors"
            >
              Back to Royal Coaching Centre Homepage
            </button>
          </div>
        </div>
      ) : (
        
        /* LOGGED-IN ADMIN DASHBOARD CONTAINER */
        <div className="flex-1 flex overflow-hidden font-sans text-slate-800 bg-slate-50">
          
          {/* Sidebar Navigation */}
          <aside className="w-64 bg-slate-900 flex flex-col shrink-0">
            <div className="p-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <LogoIcon className="w-8 h-8 shrink-0 text-white" />
                <div>
                  <span className="text-white font-semibold tracking-wide uppercase text-sm block">Royal Coaching</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-bold">Admin Portal</span>
                </div>
              </div>
            </div>
            
            <nav className="flex-1 py-6 px-4 space-y-1.5">
              <button
                onClick={() => setActiveTab("analytics")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 text-left group ${
                  activeTab === "analytics"
                    ? "bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 pl-3 font-semibold"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-white pl-4"
                }`}
              >
                <BarChart2 className={`w-5 h-5 shrink-0 transition-colors ${activeTab === "analytics" ? "text-blue-400" : "text-slate-500 group-hover:text-white"}`} />
                <span className="text-sm font-medium">Dashboard</span>
              </button>
              
              <button
                onClick={() => setActiveTab("admissions")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 text-left relative group ${
                  activeTab === "admissions"
                    ? "bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 pl-3 font-semibold"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-white pl-4"
                }`}
              >
                <FileText className={`w-5 h-5 shrink-0 transition-colors ${activeTab === "admissions" ? "text-blue-400" : "text-slate-500 group-hover:text-white"}`} />
                <span className="text-sm font-medium">Admissions</span>
                {unreadCount > 0 && (
                  <span className="absolute right-4 px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full shadow-sm">
                    {unreadCount}
                  </span>
                )}
              </button>
              
              <button
                onClick={() => setActiveTab("students")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 text-left group ${
                  activeTab === "students"
                    ? "bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 pl-3 font-semibold"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-white pl-4"
                }`}
              >
                <Users className={`w-5 h-5 shrink-0 transition-colors ${activeTab === "students" ? "text-blue-400" : "text-slate-500 group-hover:text-white"}`} />
                <span className="text-sm font-medium">Student Management</span>
              </button>
              
              <button
                onClick={() => setActiveTab("settings")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 text-left group ${
                  activeTab === "settings"
                    ? "bg-blue-600/10 text-blue-400 border-l-4 border-blue-500 pl-3 font-semibold"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-white pl-4"
                }`}
              >
                <Settings className={`w-5 h-5 shrink-0 transition-colors ${activeTab === "settings" ? "text-blue-400" : "text-slate-500 group-hover:text-white"}`} />
                <span className="text-sm font-medium">Database Settings</span>
              </button>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
              <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                Royal Coaching Centre
                {user?.isDemo || isFirestoreQuotaExceeded() ? (
                  <div className="flex items-center gap-2">
                    <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
                      {isFirestoreQuotaExceeded() ? "LOCAL FALLBACK MODE" : "OFFLINE DEMO MODE"}
                    </span>
                    {isFirestoreQuotaExceeded() && (
                      <button
                        onClick={handleReconnectDb}
                        disabled={reconnectingDb}
                        className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-[9px] font-bold rounded shadow transition cursor-pointer flex items-center gap-1 uppercase"
                        title="Try reconnecting to live Firebase Firestore database"
                      >
                        {reconnectingDb ? (
                          <>
                            <span className="inline-block animate-spin rounded-full h-2 w-2 border-b-2 border-white"></span>
                            CHECKING...
                          </>
                        ) : (
                          "RECONNECT"
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                    SYSTEM SECURE
                  </span>
                )}
              </h1>
              <div className="flex items-center gap-6">
                <div className="relative">
                  <button 
                    onClick={() => { setActiveTab("admissions"); setStatusFilter("Pending"); }}
                    className="relative w-5 h-5 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-md cursor-pointer transition"
                  >
                    Log Out
                  </button>
                  {/* Removed exit dashboard button as per style requests */}
                </div>
              </div>
            </header>

            {(user?.isDemo || isFirestoreQuotaExceeded()) && (
              <div className="bg-amber-50 border-b border-amber-200 px-8 py-3 flex flex-col md:flex-row items-start md:items-center justify-between text-amber-900 text-xs gap-4 shrink-0 font-medium">
                <span className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    {isFirestoreQuotaExceeded() ? (
                      <span>
                        <strong>Local Fallback Active (Firebase Quota Exceeded):</strong> The Google Cloud / Firebase Spark (Free Tier) daily write limit has been reached for this project. To avoid interruptions, the app has safely fallen back to your browser's IndexedDB and LocalStorage cache. All data you enter remains functional locally.
                      </span>
                    ) : (
                      <span>
                        <strong>Offline Demo Mode Enabled:</strong> Firebase Email/Password Auth is disabled in this project environment. Registrations and Website Settings edits are saved to your local browser storage.
                      </span>
                    )}
                  </span>
                </span>
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                  {isFirestoreQuotaExceeded() && (
                    <button
                      onClick={() => {
                        localStorage.removeItem("firestore_quota_exceeded");
                        // Also clear individual local-only media flags
                        for (let i = 0; i < localStorage.length; i++) {
                          const key = localStorage.key(i);
                          if (key && key.startsWith("local_only_media_")) {
                            localStorage.removeItem(key);
                          }
                        }
                        window.location.reload();
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded text-[10px] transition uppercase tracking-wider whitespace-nowrap cursor-pointer shadow-sm"
                    >
                      Reset Quota & Try Global Sync
                    </button>
                  )}
                  {isFirestoreQuotaExceeded() ? (
                    <a 
                      href="https://console.firebase.google.com/project/smooth-firmament-l18qq/firestore/databases/ai-studio-ea58b777-f24e-48ff-98cc-1e0e0369395f/data?openUpgradeDialog=true" 
                      target="_blank" 
                      rel="noreferrer" 
                      className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-3 py-1.5 rounded text-[10px] transition uppercase tracking-wider whitespace-nowrap shadow-sm"
                    >
                      Upgrade Plan on Google Console
                    </a>
                  ) : (
                    <a 
                      href="https://console.firebase.google.com" 
                      target="_blank" 
                      rel="noreferrer" 
                      className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-3 py-1.5 rounded text-[10px] transition uppercase tracking-wider whitespace-nowrap shadow-sm"
                    >
                      Configure Firebase Auth
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Scroll-less Content Body */}
            <div className="flex-1 p-6 overflow-y-auto bg-slate-50">
              
              {/* ANALYTICS HUB TAB */}
              {activeTab === "analytics" && (
                <div className="space-y-6">
                  
                  {/* 1. Real-Time Stats Overview Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Total Students</p>
                      <p className="text-2xl font-semibold text-slate-900 mt-1">{totalRegs}</p>
                      <span className="text-[10px] text-emerald-600 font-bold">100% database sync</span>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Pending Review</p>
                      <p className="text-2xl font-semibold text-slate-900 mt-1">{pendingRegs}</p>
                      <span className="text-[10px] text-blue-600 font-bold">{unreadCount} unread applications</span>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Approved Students</p>
                      <p className="text-2xl font-semibold text-slate-900 mt-1">{approvedRegs}</p>
                      <span className="text-[10px] text-slate-500 font-bold">
                        {totalRegs > 0 ? Math.round((approvedRegs / totalRegs) * 100) : 0}% clearance rate
                      </span>
                    </div>
                  </div>

                  {/* 2. Graphical Charts Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Demographic Age Chart */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
                      <div className="mb-6">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Age Demographics</h3>
                        <p className="text-slate-500 text-xs mt-0.5">Distribution count by age groups</p>
                      </div>
                      <div className="h-64 w-full flex-1">
                        {totalRegs > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <ReBarChart data={ageData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="range" stroke="#64748b" fontSize={11} tickLine={false} />
                              <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                              <ReTooltip 
                                contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px" }}
                                labelStyle={{ color: "#0f172a", fontWeight: "bold" }}
                              />
                              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                                {ageData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Bar>
                            </ReBarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                            No demographic metrics compiled yet.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Monthly Admissions & Exits Analysis Chart */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
                      <div className="mb-6 flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-emerald-500" /> Enrollment Trends
                          </h3>
                          <p className="text-slate-500 text-xs mt-0.5">Month-wise admissions vs student exits</p>
                        </div>
                        <span className="text-[10px] bg-blue-50 text-blue-700 font-semibold px-2.5 py-1 rounded-full border border-blue-100">
                          Last 6 Months
                        </span>
                      </div>
                      <div className="h-64 w-full flex-1">
                        {totalRegs > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <ReBarChart data={monthlyData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                              <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                              <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                              <ReTooltip 
                                contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px" }}
                                labelStyle={{ color: "#0f172a", fontWeight: "bold" }}
                              />
                              <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: '600' }} />
                              <Bar name="Admissions" dataKey="admissions" fill="#10b981" radius={[4, 4, 0, 0]} />
                              <Bar name="Exits / Completed" dataKey="exits" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </ReBarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                            No student enrollments or exits logged yet.
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* 3. Monthly Fee Revenue & Status Analytics Panel */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                          <BarChart2 className="w-4 h-4 text-indigo-500" /> Monthly Fee & Payment Collection Analytics
                        </h3>
                        <p className="text-slate-500 text-xs mt-0.5">Track student fee collection, paid, and unpaid statuses month-wise</p>
                      </div>

                      {/* Month Selector dropdown */}
                      {monthlyFeeData.length > 0 && (
                        <div className="flex items-center gap-2 shrink-0">
                          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Select Month to Inspect:</label>
                          <select
                            value={selectedFeeMonth || monthlyFeeData[monthlyFeeData.length - 1]?.month}
                            onChange={(e) => setSelectedFeeMonth(e.target.value)}
                            className="text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                          >
                            {monthlyFeeData.map((m) => (
                              <option key={m.month} value={m.month}>
                                {m.month}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {monthlyFeeData.length > 0 ? (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        
                        {/* Interactive Month Inspection Side Panel */}
                        <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
                          {(() => {
                            const activeMonthStr = selectedFeeMonth || monthlyFeeData[monthlyFeeData.length - 1]?.month;
                            const activeMonthData = monthlyFeeData.find(m => m.month === activeMonthStr) || monthlyFeeData[monthlyFeeData.length - 1];
                            
                            if (!activeMonthData) return null;

                            const totalStudentsLogged = activeMonthData.students.length;
                            const totalPaid = activeMonthData.paidCount;
                            const totalPartiallyPaid = activeMonthData.partiallyPaidCount;
                            const totalUnpaid = activeMonthData.unpaidCount;
                            
                            // Let's list students for this month
                            const unpaidList = activeMonthData.students.filter(s => s.status === "Unpaid" || s.status === "Partially Paid");

                            return (
                              <div className="space-y-4 h-full flex flex-col">
                                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between">
                                  <div>
                                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Active Inspection Month</span>
                                    <h4 className="text-lg font-bold text-indigo-950">{activeMonthData.month}</h4>
                                  </div>
                                  <span className="bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
                                    {totalStudentsLogged} Logged
                                  </span>
                                </div>

                                {/* Month metrics grid */}
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-150 text-center">
                                    <span className="text-[9px] font-bold text-emerald-600 uppercase block">Total Income</span>
                                    <span className="text-sm font-extrabold text-slate-800">₹{activeMonthData.income}</span>
                                    <span className="text-[8px] text-slate-400 block mt-0.5">collected</span>
                                  </div>
                                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-150 text-center">
                                    <span className="text-[9px] font-bold text-blue-600 uppercase block">Paid Students</span>
                                    <span className="text-sm font-extrabold text-slate-800">{totalPaid}</span>
                                    <span className="text-[8px] text-slate-400 block mt-0.5">students</span>
                                  </div>
                                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-150 text-center">
                                    <span className="text-[9px] font-bold text-red-500 uppercase block">Unpaid/Partial</span>
                                    <span className="text-sm font-extrabold text-slate-800">{totalUnpaid + totalPartiallyPaid}</span>
                                    <span className="text-[8px] text-slate-400 block mt-0.5">pending</span>
                                  </div>
                                </div>

                                {/* Pending / Unpaid Students List */}
                                <div className="flex-1 bg-slate-50 border border-slate-150 rounded-xl p-4 flex flex-col overflow-hidden max-h-[220px]">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                                    ⚠️ Unpaid &amp; Partially Paid List ({unpaidList.length})
                                  </span>
                                  {unpaidList.length > 0 ? (
                                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                                      {unpaidList.map((s, idx) => (
                                        <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                                          <div>
                                            <p className="font-bold text-slate-900">{s.name}</p>
                                            <p className="text-[10px] text-slate-400">{s.mobile}</p>
                                          </div>
                                          <div className="text-right">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${s.status === "Partially Paid" ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-red-50 text-red-600 border border-red-100"}`}>
                                              {s.status}
                                            </span>
                                            <p className="text-[10px] font-semibold text-slate-600 mt-1">Due: ₹{s.totalDue - s.amountPaid}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="flex-1 flex items-center justify-center text-xs text-slate-400 text-center py-6">
                                      ✨ All students have fully paid for this month!
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Recharts Graphical Chart: Month-wise Collections and Student Status */}
                        <div className="lg:col-span-7 flex flex-col justify-between h-full min-h-[320px]">
                          <div className="mb-4">
                            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Month-on-Month Trends</span>
                            <p className="text-xs text-slate-500">Collected Income &amp; Student Counts trends across all logged periods</p>
                          </div>

                          <div className="h-64 w-full flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                              <ReBarChart data={monthlyFeeData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
                                <YAxis yAxisId="left" stroke="#10b981" fontSize={11} tickLine={false} label={{ value: 'Income (₹)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#10b981', fontSize: '11px', fontWeight: 'bold' } }} />
                                <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} label={{ value: 'Students Count', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: '#64748b', fontSize: '11px', fontWeight: 'bold' } }} />
                                <ReTooltip 
                                  contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px" }}
                                  labelStyle={{ color: "#0f172a", fontWeight: "bold" }}
                                />
                                <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: '600' }} />
                                <Bar yAxisId="left" name="Income Collected (₹)" dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
                                <Bar yAxisId="right" name="Fully Paid Students" dataKey="paidCount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar yAxisId="right" name="Unpaid Students" dataKey="unpaidCount" fill="#ef4444" radius={[4, 4, 0, 0]} />
                              </ReBarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="p-12 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                        <p className="font-medium text-slate-500">No student fee logs or monthly payments compiled yet.</p>
                        <p className="text-slate-400 mt-1">Go to Student Management &gt; Select a student &gt; Record payments to see trends here.</p>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* ADMISSION RECORDS TABLE & VIEWER */}
              {activeTab === "admissions" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* Registrations List Panel */}
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col lg:col-span-8">
                    <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
                          Recent Admissions Section
                          <span className="bg-slate-100 text-slate-600 font-mono text-xs px-2 py-0.5 rounded font-bold">
                            {filteredAdmissions.length}
                          </span>
                        </h3>
                        <p className="text-slate-400 text-xs mt-0.5">Manage student registration dossiers securely</p>
                      </div>

                      {/* Filter controls */}
                      <div className="flex bg-slate-50 p-1 rounded border border-slate-200 flex-wrap gap-1">
                        {["All", "Pending", "Approved", "Rejected"].map((tab) => (
                          <button
                            key={tab}
                            onClick={() => setStatusFilter(tab as any)}
                            className={`px-3 py-1 text-xs font-semibold rounded transition cursor-pointer ${
                              statusFilter === tab
                                ? "bg-slate-900 text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Export Actions Bar */}
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CSV Data Exports:</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button 
                          onClick={() => exportToCSV("Approved")}
                          className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-200 rounded text-xs font-bold transition flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-600" /> Export Approved
                        </button>
                        <button 
                          onClick={() => exportToCSV("Pending")}
                          className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-700 hover:text-amber-800 border border-slate-200 hover:border-amber-200 rounded text-xs font-bold transition flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-amber-600" /> Export Pending
                        </button>
                        <button 
                          onClick={() => exportToCSV("Rejected")}
                          className="px-2.5 py-1 bg-white hover:bg-red-50 text-red-700 hover:text-red-800 border border-slate-200 hover:border-red-200 rounded text-xs font-bold transition flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-red-600" /> Export Rejected
                        </button>
                      </div>
                    </div>

                    {/* Desktop Table / Mobile List */}
                    <div className="overflow-x-auto">
                      {filteredAdmissions.length > 0 ? (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                            <tr>
                              <th className="p-4 border-b border-slate-100">Student Name</th>
                              <th className="p-4 border-b border-slate-100">Email</th>
                              <th className="p-4 border-b border-slate-100 text-center">Age</th>
                              <th className="p-4 border-b border-slate-100 text-center">Status</th>
                              <th className="p-4 border-b border-slate-100 text-right">Registered</th>
                              <th className="p-4 border-b border-slate-100 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {filteredAdmissions.map((student) => {
                              const isNew = !student.viewed;
                              return (
                                <tr 
                                  key={student.id}
                                  onClick={() => handleViewStudent(student)}
                                  className={`hover:bg-slate-50 transition-colors cursor-pointer group ${
                                    selectedStudent?.id === student.id ? "bg-slate-50" : ""
                                  } ${isNew ? "bg-blue-50/30 font-semibold" : ""}`}
                                >
                                  <td className="p-4 font-semibold text-slate-900 flex items-center gap-2">
                                    {isNew && (
                                      <span className="w-2 h-2 bg-blue-600 rounded-full mr-2" />
                                    )}
                                    <span className="group-hover:text-blue-600 transition">{student.name}</span>
                                  </td>
                                  <td className="p-4 text-slate-500">{student.email}</td>
                                  <td className="p-4 text-center font-mono">{student.age}</td>
                                  <td className="p-4 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                      student.status === "Approved"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : student.status === "Rejected"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-amber-100 text-amber-700"
                                    }`}>
                                      {student.status}
                                    </span>
                                  </td>
                                  <td className="p-4 text-right text-slate-400 italic">
                                    {new Date(student.timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                                  </td>
                                  <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                      <button 
                                        onClick={() => handleViewStudent(student)}
                                        className="px-3 py-1 bg-blue-50 text-blue-600 font-bold rounded border border-blue-100 hover:bg-blue-600 hover:text-white transition text-xs cursor-pointer animate-fadeIn"
                                      >
                                        Details
                                      </button>
                                      <button 
                                        onClick={() => handlePrintReceipt(student)}
                                        className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white font-bold rounded border border-amber-200 hover:border-amber-600 transition text-xs flex items-center gap-1 cursor-pointer"
                                        title="Print Admission Slip"
                                      >
                                        <Printer className="w-3.5 h-3.5" />
                                        <span>Print Slip</span>
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteStudent(student.id || "")}
                                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded transition cursor-pointer"
                                        title="Delete Registration"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div className="py-12 text-center text-slate-400 text-sm">
                          No registrations matching the filter "{statusFilter}" were found.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Detailed Student Dossier Panel */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm relative min-h-[380px] lg:col-span-4 flex flex-col">
                    {selectedStudent ? (
                      <div className="space-y-5 flex-1 flex flex-col">
                        
                        {/* Header Card */}
                        <div className="border-b border-slate-100 pb-4">
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              selectedStudent.status === "Approved"
                                ? "bg-emerald-100 text-emerald-700"
                                : selectedStudent.status === "Rejected"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {selectedStudent.status} Status
                            </span>
                            
                            <button 
                              onClick={() => handleDeleteStudent(selectedStudent.id || "")}
                              className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 rounded-md transition cursor-pointer"
                              title="Delete Registration Record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <h3 className="text-base font-bold text-slate-900 tracking-wide">{selectedStudent.name}</h3>
                          <p className="text-slate-400 text-[10px] font-mono">ID: {selectedStudent.id}</p>
                        </div>

                        {/* Info items */}
                        <div className="space-y-4 flex-1">
                          <div className="flex items-start gap-3">
                            <Phone className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mobile Phone</p>
                              <p className="text-xs font-semibold text-slate-800 mt-0.5">{selectedStudent.mobile}</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Address</p>
                              <p className="text-xs font-semibold text-slate-800 mt-0.5 break-all">{selectedStudent.email}</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <Calendar className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Student Age</p>
                              <p className="text-xs text-slate-800 mt-0.5 font-bold">{selectedStudent.age} Years Old</p>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-1" />
                            <div className="flex-1">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Physical Address</p>
                              <div className="mt-1.5 w-full min-h-[72px] max-h-[140px] overflow-y-auto p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-mono whitespace-pre-wrap leading-relaxed shadow-inner">
                                {selectedStudent.address}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Submission Timestamp</p>
                              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                                {new Date(selectedStudent.timestamp).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Communications & Integrations */}
                        <div className="pt-4 border-t border-slate-100 space-y-2 mt-auto">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Student Outreach</p>
                          <div className="grid grid-cols-2 gap-2">
                            <a 
                              href={`tel:${selectedStudent.mobile}`}
                              className="flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded transition"
                            >
                              <Phone className="w-3.5 h-3.5 text-blue-600" /> Direct Call
                            </a>
                            <a 
                              href={`https://wa.me/${selectedStudent.mobile.replace(/\D/g, "")}?text=Hello%20${encodeURIComponent(selectedStudent.name)},%20this%20is%20Royal%20Coaching%20Centre.%20We%20received%20your%20admission%20registration.`}
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-1.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded transition"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp
                            </a>
                          </div>
                        </div>

                        {/* Secure Modifications Action Buttons */}
                        <div className="pt-4 border-t border-slate-100 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Database Modifications</p>
                          
                          <div className="flex flex-col gap-2">
                            {selectedStudent.status !== "Approved" && (
                              <button
                                onClick={() => handleUpdateStatus(selectedStudent.id || "", "Approved")}
                                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded shadow-sm transition-all cursor-pointer text-xs uppercase tracking-wider"
                              >
                                ✓ Approve Student Admission
                              </button>
                            )}
                            {selectedStudent.status !== "Rejected" && (
                              <button
                                onClick={() => handleUpdateStatus(selectedStudent.id || "", "Rejected")}
                                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded transition text-xs font-bold cursor-pointer"
                              >
                                ✗ Reject / Cancel Admission
                              </button>
                            )}
                            {selectedStudent.status !== "Pending" && (
                              <button
                                onClick={() => handleUpdateStatus(selectedStudent.id || "", "Pending")}
                                className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded border border-slate-200 transition text-[11px] font-medium cursor-pointer"
                              >
                                Reset to Review Pending
                              </button>
                            )}
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                        <Eye className="w-12 h-12 mb-2 text-slate-300 animate-pulse" />
                        <p className="text-sm font-bold text-slate-500">No Student Selected</p>
                        <p className="text-xs mt-1 text-slate-400 max-w-xs">
                          Select an admission registration row on the left to display their full detailed file, and execute secure database modifications.
                        </p>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* WEBSITE CONTENT EDITOR TAB */}
              {activeTab === "settings" && (
                <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-6">
                    <div className="p-2 bg-blue-50 border border-blue-100 rounded-lg text-blue-600">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Database Settings</h3>
                      <p className="text-slate-500 text-xs">Modify landing page parameters in real-time in Firestore</p>
                    </div>
                  </div>

                  {settingsSuccess && (
                    <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      <span>Website content updated successfully! Homepage readers will load these modifications instantly.</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveSettings} className="space-y-6">
                    
                    {/* Slogan */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        Marquee Slogan / Tagline
                      </label>
                      <input
                        type="text"
                        value={settings.slogan}
                        onChange={(e) => setSettings({ ...settings, slogan: e.target.value })}
                        required
                        className="w-full p-2.5 border border-slate-200 rounded bg-slate-50 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">Scrolls across the top banner of the landing page.</span>
                    </div>

                    {/* Core Metrics Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                          Experience Years
                        </label>
                        <input
                          type="number"
                          value={settings.experienceYears}
                          onChange={(e) => setSettings({ ...settings, experienceYears: parseInt(e.target.value) || 0 })}
                          required
                          className="w-full p-2.5 border border-slate-200 rounded bg-slate-50 text-slate-800 focus:outline-none focus:border-blue-500 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                          Students Trained
                        </label>
                        <input
                          type="number"
                          value={settings.studentsTrained}
                          onChange={(e) => setSettings({ ...settings, studentsTrained: parseInt(e.target.value) || 0 })}
                          required
                          className="w-full p-2.5 border border-slate-200 rounded bg-slate-50 text-slate-800 focus:outline-none focus:border-blue-500 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                          Success Rate (%)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={settings.successRate}
                          onChange={(e) => setSettings({ ...settings, successRate: parseInt(e.target.value) || 0 })}
                          required
                          className="w-full p-2.5 border border-slate-200 rounded bg-slate-50 text-slate-800 focus:outline-none focus:border-blue-500 text-sm font-mono"
                        />
                      </div>
                    </div>

                    {/* Phones Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                          Primary Contact Phone
                        </label>
                        <input
                          type="text"
                          value={settings.contactPhone1}
                          onChange={(e) => setSettings({ ...settings, contactPhone1: e.target.value })}
                          required
                          className="w-full p-2.5 border border-slate-200 rounded bg-slate-50 text-slate-800 focus:outline-none focus:border-blue-500 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                          Secondary Contact Phone
                        </label>
                        <input
                          type="text"
                          value={settings.contactPhone2}
                          onChange={(e) => setSettings({ ...settings, contactPhone2: e.target.value })}
                          required
                          className="w-full p-2.5 border border-slate-200 rounded bg-slate-50 text-slate-800 focus:outline-none focus:border-blue-500 text-sm font-mono"
                        />
                      </div>
                    </div>

                    {/* Student Success Highlights Editorial Panel */}
                    <div className="border-t border-slate-150 pt-6">
                      <h4 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">
                        Student Success Highlights (4 Key Areas)
                      </h4>
                      <p className="text-slate-500 text-xs mb-4">
                        Define the four main benefits and results featured on the center's landing page highlights grid.
                      </p>
                      
                      <div className="space-y-4">
                        {[0, 1, 2, 3].map((index) => {
                          const currentHighlight = settings.highlights?.[index] || {
                            title: index === 0 ? "Fluent Spoken English" : index === 1 ? "Academic Improvement" : index === 2 ? "Confidence & Persona" : "Proven Track Record",
                            desc: ""
                          };
                          
                          return (
                            <div key={index} className="p-4 bg-slate-50 rounded-xl border border-slate-250">
                              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest block mb-2">
                                Highlight Area #0{index + 1}
                              </span>
                              <div className="grid grid-cols-1 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                    Feature Title
                                  </label>
                                  <input
                                    type="text"
                                    value={currentHighlight.title}
                                    onChange={(e) => {
                                      const updatedList = [...(settings.highlights || [
                                        { title: "Fluent Spoken English", desc: "Students transition from hesitant speakers to highly fluent, confident English communicators in just weeks." },
                                        { title: "Academic Improvement", desc: "Consistent performance and grade boosts in school exams through structured guidance and concept development." },
                                        { title: "Confidence & Persona", desc: "Specialized training in self-confidence, body language, and personality building to prepare for public speaking." },
                                        { title: "Proven Track Record", desc: "Hundreds of our trained students have successfully qualified in exams and reached leading educational stages." }
                                      ])];
                                      updatedList[index] = { ...updatedList[index], title: e.target.value };
                                      setSettings({ ...settings, highlights: updatedList });
                                    }}
                                    required
                                    className="w-full p-2 border border-slate-200 rounded bg-white text-slate-850 text-xs font-semibold"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                    Feature Description Text
                                  </label>
                                  <textarea
                                    value={currentHighlight.desc}
                                    onChange={(e) => {
                                      const updatedList = [...(settings.highlights || [
                                        { title: "Fluent Spoken English", desc: "Students transition from hesitant speakers to highly fluent, confident English communicators in just weeks." },
                                        { title: "Academic Improvement", desc: "Consistent performance and grade boosts in school exams through structured guidance and concept development." },
                                        { title: "Confidence & Persona", desc: "Specialized training in self-confidence, body language, and personality building to prepare for public speaking." },
                                        { title: "Proven Track Record", desc: "Hundreds of our trained students have successfully qualified in exams and reached leading educational stages." }
                                      ])];
                                      updatedList[index] = { ...updatedList[index], desc: e.target.value };
                                      setSettings({ ...settings, highlights: updatedList });
                                    }}
                                    required
                                    rows={2}
                                    className="w-full p-2 border border-slate-200 rounded bg-white text-slate-850 text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Our Experience Detailed Editorial */}
                    <div className="border-t border-slate-150 pt-6">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        "Our Experience" Section Text Block
                      </label>
                      <textarea
                        value={settings.experienceText || "With several years of intensive coaching experience, Royal Coaching Centre has helped numerous students improve their English speaking skills, confidence, and academic scores. We combine personalized individual attention with modern interactive sessions to yield exceptional results."}
                        onChange={(e) => setSettings({ ...settings, experienceText: e.target.value })}
                        rows={4}
                        required
                        className="w-full p-2.5 border border-slate-200 rounded bg-slate-50 text-slate-800 text-sm leading-relaxed"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Describe the years of excellence and center experience details featured under the dynamic numbers counter.
                      </span>
                    </div>

                    {/* About Us Dynamic Mission Statement */}
                    <div className="border-t border-slate-150 pt-6">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        "About Us" Mission Statement Text
                      </label>
                      <textarea
                        value={settings.aboutUsText || "Our absolute mission is to empower students with high-quality education, self-confidence, Spoken English fluency, and practical communication skills, so they can achieve success in every single stage of life."}
                        onChange={(e) => setSettings({ ...settings, aboutUsText: e.target.value })}
                        rows={4}
                        required
                        className="w-full p-2.5 border border-slate-200 rounded bg-slate-50 text-slate-800 text-sm leading-relaxed italic"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Edit the focal quoted mission statement displayed inside the elegant gold-bordered card of the About Us block.
                      </span>
                    </div>

                    {/* Multi-Image Gallery (MAX 15 Images, Max Size 2MB) */}
                    <div className="border-t border-slate-150 pt-6">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                        Coaching Center Image Gallery (Max 15 Images)
                      </label>
                      <p className="text-slate-500 text-xs mb-4">
                        Upload custom photos of classes, seminars, or student achievements. Images are displayed as a beautiful dynamic gallery. Max image size: 2MB.
                      </p>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                        {Array.from({ length: 15 }).map((_, index) => {
                          const preview = imagePreviews[index];
                          const progress = uploadProgress[`image_${index}`];
                          const isUploading = progress !== undefined && progress < 100;
                          
                          return (
                            <div key={index} className="relative group border border-slate-200 rounded-xl overflow-hidden aspect-square flex flex-col bg-slate-50">
                              {isUploading && (
                                <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-white z-10 p-2">
                                  <div className="relative w-12 h-12 flex items-center justify-center">
                                    <svg className="w-full h-full transform -rotate-90">
                                      <circle
                                        cx="24"
                                        cy="24"
                                        r="20"
                                        stroke="currentColor"
                                        strokeWidth="3"
                                        fill="transparent"
                                        className="text-slate-700"
                                      />
                                      <circle
                                        cx="24"
                                        cy="24"
                                        r="20"
                                        stroke="currentColor"
                                        strokeWidth="3"
                                        fill="transparent"
                                        strokeDasharray={2 * Math.PI * 20}
                                        strokeDashoffset={2 * Math.PI * 20 * (1 - progress / 100)}
                                        className="text-amber-400 transition-all duration-300"
                                      />
                                    </svg>
                                    <span className="absolute text-[10px] font-bold text-amber-400">
                                      {progress}%
                                    </span>
                                  </div>
                                  <span className="text-[8px] font-bold uppercase tracking-wider mt-1 text-slate-300">
                                    Uploading
                                  </span>
                                </div>
                              )}
                              {preview ? (
                                <>
                                  <img
                                    src={preview}
                                    alt={`Gallery slot ${index + 1}`}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveImage(index)}
                                      className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold uppercase tracking-wider transition cursor-pointer"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <label className="flex-1 flex flex-col items-center justify-center p-2 text-center cursor-pointer hover:bg-slate-100/80 transition group">
                                  <Image className="w-5 h-5 text-slate-400 group-hover:text-blue-500 mb-1 transition-colors" />
                                  <span className="text-[10px] text-slate-500 font-medium">Slot #{index + 1}</span>
                                  <span className="text-[8px] text-slate-400 mt-0.5 font-semibold uppercase">Upload</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleImageUpload(index, e)}
                                    className="hidden"
                                    disabled={isUploading}
                                  />
                                </label>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* CUSTOM LOGO BRANDING PANEL */}
                    <div className="border-t border-slate-150 pt-6">
                      <h4 className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wider flex items-center gap-2">
                        <Image className="w-4 h-4 text-amber-500" /> Coaching Center Logo Branding
                      </h4>
                      <p className="text-slate-500 text-xs mb-4">
                        Upload your custom Coaching Center logo image (such as an emblem, seal, or badge). If uploaded, it will automatically override the default SVG logo on all public headers, footer, and dashboards. Max size: 2MB.
                      </p>

                      <div className="flex flex-col sm:flex-row items-center gap-6 bg-slate-50 border border-slate-200 p-4 rounded-xl">
                        <div className="w-20 h-20 bg-white border border-slate-200 rounded-full flex items-center justify-center overflow-hidden shrink-0 shadow-sm relative">
                          {uploadProgress.custom_logo !== undefined && uploadProgress.custom_logo < 100 && (
                            <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-white z-10 p-1">
                              <span className="text-[10px] font-bold text-amber-400">
                                {uploadProgress.custom_logo}%
                              </span>
                              <span className="text-[7px] font-semibold uppercase tracking-widest text-slate-350 mt-0.5 scale-90">
                                Saving...
                              </span>
                            </div>
                          )}
                          {customLogoPreview ? (
                            <img 
                              src={customLogoPreview} 
                              alt="Custom logo preview" 
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center p-2 text-center text-[9px] text-slate-400 font-bold uppercase">
                              <LogoIcon className="w-10 h-10 text-slate-300" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 space-y-2 text-center sm:text-left">
                          <p className="text-xs font-semibold text-slate-800">
                            {customLogoPreview ? "✓ Custom Logo Active" : "Using Default Vector Emblem Logo"}
                          </p>
                          <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                            <label className="py-1.5 px-4 bg-slate-900 hover:bg-black text-white rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 shadow-sm">
                              <Upload className="w-3.5 h-3.5" />
                              <span>Upload Logo Image</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                className="hidden"
                              />
                            </label>

                            {customLogoPreview && (
                              <button
                                type="button"
                                onClick={handleRemoveLogo}
                                className="py-1.5 px-4 bg-red-50 text-red-700 hover:bg-red-100 rounded text-xs font-bold uppercase tracking-wider border border-red-200 transition cursor-pointer"
                              >
                                Remove Custom Logo
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* WEEKLY CLASS SCHEDULE EDITOR */}
                    <div className="border-t border-slate-150 pt-6">
                      <h4 className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wider flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-amber-500" /> Class Schedule Manager
                      </h4>
                      <p className="text-slate-500 text-xs mb-4">
                        Update the active batches, days, timings, focus areas, and mentors displayed on the landing page's Weekly Schedule table.
                      </p>

                      {/* Current Schedules List */}
                      {settings.schedules && settings.schedules.length > 0 ? (
                        <div className="overflow-x-auto rounded-xl border border-slate-200 mb-4 bg-white">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider">
                              <tr>
                                <th className="py-2 px-3">Class/Batch</th>
                                <th className="py-2 px-3">Subject Focus</th>
                                <th className="py-2 px-3">Days</th>
                                <th className="py-2 px-3">Timing</th>
                                <th className="py-2 px-3">Instructor</th>
                                <th className="py-2 px-3 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {settings.schedules.map((item, index) => (
                                <tr key={item.id || index} className="hover:bg-slate-50">
                                  <td className="py-2.5 px-3 font-semibold text-blue-950">{item.className}</td>
                                  <td className="py-2.5 px-3 text-slate-600">{item.subject}</td>
                                  <td className="py-2.5 px-3 text-slate-700">{item.days}</td>
                                  <td className="py-2.5 px-3 text-slate-700 font-mono text-[11px]">{item.timing}</td>
                                  <td className="py-2.5 px-3 text-slate-600">{item.instructor}</td>
                                  <td className="py-2.5 px-3 text-right">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updatedList = settings.schedules?.filter((_, idx) => idx !== index) || [];
                                        setSettings({ ...settings, schedules: updatedList });
                                      }}
                                      className="text-red-500 hover:text-red-700 font-bold uppercase tracking-wider text-[10px] cursor-pointer font-sans"
                                    >
                                      Delete
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="p-4 bg-white rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500 mb-4 font-sans">
                          No customized batches configured. The website is currently displaying the default 5 batches.
                        </div>
                      )}

                      {/* Add New Schedule Form */}
                      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Add a New Schedule Row</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Class/Batch Name</label>
                            <input
                              type="text"
                              placeholder="e.g. Spoken English (Basic)"
                              value={newSchClassName}
                              onChange={(e) => setNewSchClassName(e.target.value)}
                              className="w-full p-2 border border-slate-200 rounded text-xs bg-white text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Subject / Focus</label>
                            <input
                              type="text"
                              placeholder="e.g. Conversational Skills"
                              value={newSchSubject}
                              onChange={(e) => setNewSchSubject(e.target.value)}
                              className="w-full p-2 border border-slate-200 rounded text-xs bg-white text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Days Offered</label>
                            <input
                              type="text"
                              placeholder="e.g. Mon, Wed, Fri"
                              value={newSchDays}
                              onChange={(e) => setNewSchDays(e.target.value)}
                              className="w-full p-2 border border-slate-200 rounded text-xs bg-white text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Timing Slot</label>
                            <input
                              type="text"
                              placeholder="e.g. 08:00 AM - 09:30 AM"
                              value={newSchTiming}
                              onChange={(e) => setNewSchTiming(e.target.value)}
                              className="w-full p-2 border border-slate-200 rounded text-xs bg-white text-slate-800"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Mentor / Instructor</label>
                            <input
                              type="text"
                              placeholder="e.g. Mr. Imran Ansari"
                              value={newSchInstructor}
                              onChange={(e) => setNewSchInstructor(e.target.value)}
                              className="w-full p-2 border border-slate-200 rounded text-xs bg-white text-slate-800"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!newSchClassName || !newSchSubject || !newSchDays || !newSchTiming || !newSchInstructor) {
                                alert("Please fill in all 5 schedule fields (Class Name, Subject, Days, Timing, and Instructor) before adding.");
                                return;
                              }
                              const newItem = {
                                id: "sch_" + Date.now(),
                                className: newSchClassName.trim(),
                                subject: newSchSubject.trim(),
                                days: newSchDays.trim(),
                                timing: newSchTiming.trim(),
                                instructor: newSchInstructor.trim()
                              };
                              const currentList = settings.schedules || [];
                              setSettings({
                                ...settings,
                                schedules: [...currentList, newItem]
                              });
                              setNewSchClassName("");
                              setNewSchSubject("");
                              setNewSchDays("");
                              setNewSchTiming("");
                              setNewSchInstructor("");
                            }}
                            className="py-1.5 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer transition font-sans"
                          >
                            + Add Schedule Row
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* FAQ ACCORDION MANAGER */}
                    <div className="border-t border-slate-150 pt-6">
                      <h4 className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wider flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-blue-500" /> FAQ Accordion Editor
                      </h4>
                      <p className="text-slate-500 text-xs mb-4">
                        Manage the Frequently Asked Questions accordion displayed on the landing page for prospective students.
                      </p>

                      {/* Current FAQs list */}
                      {settings.faqs && settings.faqs.length > 0 ? (
                        <div className="space-y-3 mb-4">
                          {settings.faqs.map((faq, index) => (
                            <div key={index} className="p-3 bg-white border border-slate-200 rounded-xl">
                              {editingFaqIdx === index ? (
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Edit Question</label>
                                    <input
                                      type="text"
                                      value={editFaqQuestion}
                                      onChange={(e) => setEditFaqQuestion(e.target.value)}
                                      className="w-full p-2 border border-slate-200 rounded text-xs bg-slate-50 text-slate-800"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Edit Answer</label>
                                    <textarea
                                      value={editFaqAnswer}
                                      onChange={(e) => setEditFaqAnswer(e.target.value)}
                                      rows={3}
                                      className="w-full p-2 border border-slate-200 rounded text-xs bg-slate-50 text-slate-800"
                                    />
                                  </div>
                                  <div className="flex justify-end gap-2 font-sans">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingFaqIdx(null);
                                        setEditFaqQuestion("");
                                        setEditFaqAnswer("");
                                      }}
                                      className="py-1 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!editFaqQuestion.trim() || !editFaqAnswer.trim()) {
                                          alert("Both question and answer are required.");
                                          return;
                                        }
                                        const updatedFaqs = [...(settings.faqs || [])];
                                        updatedFaqs[index] = {
                                          question: editFaqQuestion.trim(),
                                          answer: editFaqAnswer.trim(),
                                        };
                                        setSettings({ ...settings, faqs: updatedFaqs });
                                        setEditingFaqIdx(null);
                                        setEditFaqQuestion("");
                                        setEditFaqAnswer("");
                                      }}
                                      className="py-1 px-3 bg-blue-900 hover:bg-blue-950 text-white rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                                    >
                                      Save Edit
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1.5 flex-1">
                                    <p className="text-xs font-bold text-blue-950 flex items-center gap-1.5 font-sans">
                                      <span className="text-amber-500 font-bold">Q{index + 1}:</span> {faq.question}
                                    </p>
                                    <p className="text-xs text-slate-600 leading-relaxed pl-5 font-sans">{faq.answer}</p>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0 pt-0.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingFaqIdx(index);
                                        setEditFaqQuestion(faq.question);
                                        setEditFaqAnswer(faq.answer);
                                      }}
                                      className="text-blue-600 hover:text-blue-800 font-bold uppercase tracking-wider text-[10px] cursor-pointer font-sans"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updatedList = settings.faqs?.filter((_, idx) => idx !== index) || [];
                                        setSettings({ ...settings, faqs: updatedList });
                                      }}
                                      className="text-red-500 hover:text-red-700 font-bold uppercase tracking-wider text-[10px] cursor-pointer font-sans"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-5 bg-white rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500 mb-4 font-sans space-y-3">
                          <p>No customized FAQs configured. The website is currently displaying default admissions questions.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setSettings({
                                ...settings,
                                faqs: [...DEFAULT_FAQS]
                              });
                            }}
                            className="py-1.5 px-4 bg-blue-900 hover:bg-blue-950 text-white rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer transition shadow-sm font-sans"
                          >
                            📥 Load 5 Default FAQs to Edit/Delete
                          </button>
                        </div>
                      )}

                      {/* Add New FAQ Form */}
                      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Add a New FAQ Item</span>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Student Question</label>
                            <input
                              type="text"
                              placeholder="e.g. What are the batch timings?"
                              value={newFaqQuestion}
                              onChange={(e) => setNewFaqQuestion(e.target.value)}
                              className="w-full p-2 border border-slate-200 rounded text-xs bg-white text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Detailed Answer</label>
                            <textarea
                              placeholder="Provide a helpful, complete answer for students..."
                              value={newFaqAnswer}
                              onChange={(e) => setNewFaqAnswer(e.target.value)}
                              rows={3}
                              className="w-full p-2 border border-slate-200 rounded text-xs bg-white text-slate-800"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end font-sans">
                          <button
                            type="button"
                            onClick={() => {
                              if (!newFaqQuestion || !newFaqAnswer) {
                                alert("Please enter both the Question and the Answer fields before adding.");
                                return;
                              }
                              const newItem = {
                                question: newFaqQuestion.trim(),
                                answer: newFaqAnswer.trim()
                              };
                              const currentList = settings.faqs || [];
                              setSettings({
                                ...settings,
                                faqs: [...currentList, newItem]
                              });
                              setNewFaqQuestion("");
                              setNewFaqAnswer("");
                            }}
                            className="py-1.5 px-4 bg-blue-900 hover:bg-blue-950 text-white rounded text-[10px] font-bold uppercase tracking-wider cursor-pointer transition font-sans"
                          >
                            + Add FAQ Accordion
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* SECURITY CREDENTIALS PANEL */}
                    <div className="border-t border-slate-200 pt-6 bg-slate-50 p-4 rounded-xl border border-slate-150">
                      <h4 className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wider flex items-center gap-2 text-red-700">
                        <Lock className="w-4 h-4" /> Secure Administrative Credentials
                      </h4>
                      <p className="text-slate-500 text-xs mb-4">
                        Modify the core Administrator Gateway details. Changing the password will update the cycle timestamp automatically, requiring another update in exactly 90 days.
                      </p>

                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                              Login ID
                            </label>
                            <input
                              type="text"
                              value={settings.adminId || "SBWGOZ"}
                              onChange={(e) => setSettings({ ...settings, adminId: e.target.value })}
                              required
                              className="w-full p-2 border border-slate-250 rounded bg-white text-slate-800 font-mono text-xs uppercase"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                              Admin Security PIN (6-Digits)
                            </label>
                            <input
                              type="text"
                              value={settings.adminPin || "232326"}
                              onChange={(e) => setSettings({ ...settings, adminPin: e.target.value })}
                              maxLength={6}
                              required
                              className="w-full p-2 border border-slate-250 rounded bg-white text-slate-800 font-mono text-xs text-center tracking-widest"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Secure Password (90-Day Change Policy Enforced)
                          </label>
                          <input
                            type="text"
                            value={settings.adminPassword || "Royal@2026"}
                            onChange={(e) => {
                              setSettings({
                                ...settings,
                                adminPassword: e.target.value,
                                passwordLastUpdated: new Date().toISOString()
                              });
                            }}
                            required
                            className="w-full p-2 border border-slate-250 rounded bg-white text-slate-800 text-xs font-mono"
                          />
                          <p className="text-[10px] text-slate-400 mt-1 block">
                            Last Updated Timestamp: <span className="font-semibold text-slate-600 font-mono">{settings.passwordLastUpdated ? new Date(settings.passwordLastUpdated).toLocaleString() : "2026-07-01 12:00:00 (Original Defs)"}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Save Button */}
                    <div className="pt-4 border-t border-slate-100 flex justify-end">
                      <button
                        type="submit"
                        disabled={settingsLoading}
                        className="bg-slate-900 hover:bg-black text-white font-bold py-2.5 px-6 rounded-lg shadow-sm flex items-center gap-2 cursor-pointer transition text-xs uppercase tracking-widest"
                      >
                        {settingsLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" /> Save Content Changes
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === "students" && (
                <div className="flex-1 overflow-auto p-6 md:p-8 bg-slate-50 flex flex-col lg:flex-row gap-8 animate-fadeIn text-left">
                  {/* Left Column: Approved Students List */}
                  <div className="w-full lg:w-5/12 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-[500px]">
                    <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-base font-bold text-slate-900 tracking-tight">Approved Students Directory</h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Active &amp; exited coaching scholars list
                          </p>
                        </div>
                        <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-full">
                          {registrations.filter(r => r.status === "Approved").length} Registered
                        </span>
                      </div>
                      
                      {/* Search Bar & Export Button */}
                      <div className="mt-4 flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            placeholder="Search name, phone, or father's name..."
                            value={searchManagedStudent}
                            onChange={(e) => setSearchManagedStudent(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-slate-800 transition"
                          />
                          <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
                        </div>
                        <button
                          onClick={exportStudentsWithFeesToCSV}
                          title="Export all approved students along with their monthly fees history"
                          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold uppercase tracking-wider cursor-pointer transition flex items-center justify-center gap-1.5 shadow-sm shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" /> Export with Fees
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-[600px] lg:max-h-[700px]">
                      {registrations
                        .filter(r => r.status === "Approved")
                        .filter(r => {
                          if (!searchManagedStudent) return true;
                          const term = searchManagedStudent.toLowerCase();
                          const studentName = (r.name || r.fullName || "").toLowerCase();
                          const studentMobile = r.mobile || r.mobileNo || "";
                          const studentFather = (r.fatherName || "").toLowerCase();
                          return (
                            studentName.includes(term) ||
                            studentMobile.includes(term) ||
                            studentFather.includes(term)
                          );
                        })
                        .map((student) => {
                          const isSelected = selectedManagedStudent?.id === student.id;
                          const isExited = student.exitStatus === "Exited";
                          const studentName = student.name || student.fullName || "Unnamed Student";
                          const studentMobile = student.mobile || student.mobileNo || "N/A";
                          const studentFather = student.fatherName || "N/A";
                          
                          // Calculate initials for the avatar badge
                          const initials = studentName
                            .split(" ")
                            .map(n => n[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase();
                          
                          // Calculate fee totals
                          const feesList = student.fees || [];
                          const totalPaid = feesList.reduce((sum, f) => sum + (f.amountPaid || 0), 0);
                          const totalDue = feesList.reduce((sum, f) => sum + (f.totalDue || 0), 0);

                          return (
                            <div
                              key={student.id}
                              onClick={() => {
                                setSelectedManagedStudent(student);
                                setIsAddingFee(false);
                                setEditingFeeRecord(null);
                                setIsEditingStudent(false);
                              }}
                              className={`p-4 cursor-pointer transition-all flex items-start justify-between gap-3 ${
                                isSelected ? "bg-slate-100 border-l-4 border-slate-900" : "hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex gap-3">
                                {/* Letter Avatar Badge */}
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 select-none ${
                                  isExited 
                                    ? "bg-slate-100 text-slate-500 border border-slate-200" 
                                    : isSelected 
                                    ? "bg-indigo-600 text-white" 
                                    : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                                }`}>
                                  {initials || "?"}
                                </div>

                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="text-xs font-bold text-slate-900 leading-none">{studentName}</h4>
                                    {isExited ? (
                                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[8px] font-bold rounded uppercase">Exited</span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[8px] font-bold rounded uppercase flex items-center gap-0.5">
                                        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-medium">Father: {studentFather}</p>
                                  <p className="text-[10px] text-slate-400 font-mono">Ph: {studentMobile}</p>
                                  
                                  <div className="pt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-[9px] text-slate-400 font-medium">
                                    <span>Join: {student.joiningDate ? new Date(student.joiningDate).toLocaleDateString() : "Not specified"}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-right flex flex-col items-end justify-between self-stretch gap-1">
                                <span className="text-[9px] bg-slate-100 px-2 py-0.5 rounded font-bold font-mono text-slate-700">
                                  Class {student.className || "N/A"}
                                </span>
                                <span className="text-[9px] text-slate-500 font-semibold font-mono">
                                  Paid: ₹{totalPaid} | Due: ₹{totalDue}
                                </span>
                              </div>
                            </div>
                          );
                        })}

                      {registrations.filter(r => r.status === "Approved").length === 0 && (
                        <div className="p-8 text-center text-slate-400 text-xs">
                          No approved students in database yet. Move pending admission applications to Approved status to manage them here.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Student Management Profile, Enrollment Settings & Fee Manager */}
                  <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
                    {selectedManagedStudent ? (
                      <div className="h-full flex flex-col divide-y divide-slate-150">
                        
                        {isEditingStudent ? (
                          /* STUDENT EDITING MODE FORM */
                          <form onSubmit={handleSaveStudentDetails} className="p-6 space-y-5 animate-fadeIn">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                              <div>
                                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Modify Record</span>
                                <h3 className="text-base font-bold text-slate-900">Edit Scholar Profile</h3>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setIsEditingStudent(false)}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
                                >
                                  Save Changes
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Student Name</label>
                                <input
                                  type="text"
                                  required
                                  value={studentForm.name}
                                  onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Mobile Number</label>
                                <input
                                  type="text"
                                  required
                                  value={studentForm.mobile}
                                  onChange={(e) => setStudentForm({ ...studentForm, mobile: e.target.value })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Email ID</label>
                                <input
                                  type="email"
                                  value={studentForm.email}
                                  onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Age (Years)</label>
                                <input
                                  type="number"
                                  required
                                  value={studentForm.age || ""}
                                  onChange={(e) => setStudentForm({ ...studentForm, age: Number(e.target.value) })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Father's Name</label>
                                <input
                                  type="text"
                                  value={studentForm.fatherName}
                                  onChange={(e) => setStudentForm({ ...studentForm, fatherName: e.target.value })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Class/Std</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. 10th, 12th"
                                    value={studentForm.className}
                                    onChange={(e) => setStudentForm({ ...studentForm, className: e.target.value })}
                                    className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Stream</label>
                                  <input
                                    type="text"
                                    placeholder="PCM, Arts, Science"
                                    value={studentForm.stream}
                                    onChange={(e) => setStudentForm({ ...studentForm, stream: e.target.value })}
                                    className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Preferred Batch</label>
                                <select
                                  value={studentForm.preferredBatch}
                                  onChange={(e) => setStudentForm({ ...studentForm, preferredBatch: e.target.value })}
                                  className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                                >
                                  <option value="">Select Batch</option>
                                  <option value="morning">Morning Batch</option>
                                  <option value="noon">Noon Batch</option>
                                  <option value="evening">Evening Batch</option>
                                </select>
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Physical Address</label>
                                <textarea
                                  rows={4}
                                  value={studentForm.address}
                                  onChange={(e) => setStudentForm({ ...studentForm, address: e.target.value })}
                                  className="w-full p-3 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono resize-y min-h-[96px] bg-slate-50/50"
                                  placeholder="Enter complete physical address details..."
                                />
                              </div>
                            </div>
                          </form>
                        ) : (
                          /* STANDARD SCHOLAR PROFILE VIEW */
                          <div className="p-6 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Coaching Scholar Profile</span>
                              <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                                {selectedManagedStudent.name || selectedManagedStudent.fullName || "Unnamed Student"}
                              </h2>
                              <p className="text-xs text-slate-500 font-medium mt-0.5">
                                Mobile: {selectedManagedStudent.mobile || selectedManagedStudent.mobileNo || "N/A"} | Email: {selectedManagedStudent.email || selectedManagedStudent.emailId || "N/A"}
                              </p>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={handleStartEditStudent}
                                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer transition flex items-center gap-1 shadow-sm"
                              >
                                ✏️ Edit Profile
                              </button>

                              <button
                                onClick={() => {
                                  setSelectedIdCardStudent(selectedManagedStudent);
                                  setIsIdCardModalOpen(true);
                                }}
                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer transition flex items-center gap-1.5 shadow-sm"
                                title="Print Student Identity Card"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Print ID Card</span>
                              </button>

                              {selectedManagedStudent.exitStatus === "Exited" ? (
                                <button
                                  onClick={() => handleUpdateEnrollment(selectedManagedStudent.id!, selectedManagedStudent.joiningDate || "", "", "Active")}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer transition shadow-sm"
                                >
                                  Re-Enroll (Make Active)
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    const today = new Date().toISOString().substring(0, 10);
                                    handleUpdateEnrollment(selectedManagedStudent.id!, selectedManagedStudent.joiningDate || today, today, "Exited");
                                  }}
                                  className="px-3 py-1.5 bg-slate-800 hover:bg-black text-white rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer transition shadow-sm"
                                >
                                  Exit Coaching Program
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Scholar Full Particulars Grid Panel */}
                        {!isEditingStudent && (
                          <div className="p-6">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Academic &amp; Personal Particulars</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-150">
                              <div>
                                <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Father's Name</span>
                                <span className="text-xs font-semibold text-slate-800">{selectedManagedStudent.fatherName || "N/A"}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Class &amp; Stream</span>
                                <span className="text-xs font-semibold text-slate-800">
                                  Class {selectedManagedStudent.className || "N/A"} {selectedManagedStudent.stream ? `(${selectedManagedStudent.stream})` : ""}
                                </span>
                              </div>
                              <div>
                                <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Age</span>
                                <span className="text-xs font-semibold text-slate-800">{selectedManagedStudent.age || "N/A"} Years Old</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Preferred Batch</span>
                                <span className="text-xs font-semibold text-slate-800 capitalize">{selectedManagedStudent.preferredBatch || "N/A"} Batch</span>
                              </div>
                              <div className="col-span-2 md:col-span-4 border-t border-slate-200 pt-3 mt-1">
                                <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold mb-1">Physical Address</span>
                                <div className="w-full min-h-[64px] max-h-[120px] overflow-y-auto p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-mono whitespace-pre-wrap leading-relaxed shadow-inner">
                                  {selectedManagedStudent.address || "N/A"}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Enrollment Settings: Dates Config */}
                        <div className="p-6">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Enrollment Dates Configuration</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Joining Date</label>
                              <input
                                type="date"
                                value={selectedManagedStudent.joiningDate || ""}
                                onChange={(e) => handleUpdateEnrollment(
                                  selectedManagedStudent.id!, 
                                  e.target.value, 
                                  selectedManagedStudent.exitDate || "", 
                                  selectedManagedStudent.exitStatus || "Active"
                                )}
                                className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Coaching Exit Date</label>
                              <input
                                type="date"
                                disabled={selectedManagedStudent.exitStatus !== "Exited"}
                                value={selectedManagedStudent.exitDate || ""}
                                onChange={(e) => handleUpdateEnrollment(
                                  selectedManagedStudent.id!, 
                                  selectedManagedStudent.joiningDate || "", 
                                  e.target.value, 
                                  "Exited"
                                )}
                                className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block mb-1 font-bold uppercase tracking-wider">Current Status</span>
                              <div className="py-2 px-3 bg-slate-50 border border-slate-150 rounded-lg text-xs font-bold flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${selectedManagedStudent.exitStatus === "Exited" ? "bg-slate-400" : "bg-emerald-500 animate-pulse"}`}></span>
                                {selectedManagedStudent.exitStatus === "Exited" ? "Exited Coaching Program" : "Currently Active"}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Fee Tracker System */}
                        <div className="p-6 flex-1 overflow-auto bg-slate-50/30 text-left">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Student Fee Records & Ledger</h4>
                              <p className="text-[10px] text-slate-500">Log monthly tuition payments, track remaining dues, and manage receipt details.</p>
                            </div>
                            
                            {!isAddingFee && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingFeeRecord(null);
                                  setFeeForm({
                                    month: "",
                                    amountPaid: 0,
                                    totalDue: 0,
                                    paymentDate: new Date().toISOString().substring(0, 10),
                                    paymentStatus: "Paid",
                                    remarks: ""
                                  });
                                  setIsAddingFee(true);
                                }}
                                className="px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-[10px] font-bold rounded uppercase tracking-wider transition cursor-pointer flex items-center gap-1"
                              >
                                <span>+ Add Fee Record</span>
                              </button>
                            )}
                          </div>

                          {/* Fee Logging Form */}
                          {isAddingFee && (
                            <form 
                              onSubmit={(e) => handleSaveFeeRecord(selectedManagedStudent.id, e)}
                              className="mb-6 p-4 bg-white border border-slate-250 rounded-xl space-y-4 shadow-sm text-left animate-slideDown"
                            >
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                                  {editingFeeRecord ? "Edit Fee Receipt Ledger" : "New Fee Receipt Entry"}
                                </h5>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsAddingFee(false);
                                    setEditingFeeRecord(null);
                                  }}
                                  className="text-[10px] text-slate-400 hover:text-slate-600 font-bold"
                                >
                                  Cancel
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                  <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Fee Period (e.g., July 2026)</label>
                                  <input
                                    type="text"
                                    required
                                    placeholder="Month and Year"
                                    value={feeForm.month}
                                    onChange={(e) => setFeeForm({ ...feeForm, month: e.target.value })}
                                    className="w-full p-2 border border-slate-200 rounded text-xs bg-white text-slate-800"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Amount Paid (₹)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    required
                                    value={feeForm.amountPaid || ""}
                                    onChange={(e) => setFeeForm({ ...feeForm, amountPaid: Number(e.target.value) })}
                                    className="w-full p-2 border border-slate-200 rounded text-xs bg-white text-slate-800 font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Dues Outstanding (₹)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={feeForm.totalDue || ""}
                                    onChange={(e) => setFeeForm({ ...feeForm, totalDue: Number(e.target.value) })}
                                    className="w-full p-2 border border-slate-200 rounded text-xs bg-white text-slate-800 font-mono"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Payment Date</label>
                                  <input
                                    type="date"
                                    required
                                    value={feeForm.paymentDate}
                                    onChange={(e) => setFeeForm({ ...feeForm, paymentDate: e.target.value })}
                                    className="w-full p-2 border border-slate-200 rounded text-xs bg-white text-slate-800"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Payment Status</label>
                                  <select
                                    value={feeForm.paymentStatus}
                                    onChange={(e) => setFeeForm({ ...feeForm, paymentStatus: e.target.value as any })}
                                    className="w-full p-2 border border-slate-200 rounded text-xs bg-white text-slate-800 font-bold"
                                  >
                                    <option value="Paid">Fully Paid</option>
                                    <option value="Partially Paid">Partially Paid</option>
                                    <option value="Unpaid">Unpaid / Dues Due</option>
                                  </select>
                                </div>
                              </div>

                              <div>
                                <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Remarks / Note</label>
                                <input
                                  type="text"
                                  placeholder="E.g., paid cash via Father, receipt #1204"
                                  value={feeForm.remarks}
                                  onChange={(e) => setFeeForm({ ...feeForm, remarks: e.target.value })}
                                  className="w-full p-2 border border-slate-200 rounded text-xs bg-white text-slate-800"
                                />
                              </div>

                              <div className="pt-2 flex justify-end gap-2">
                                <button
                                  type="submit"
                                  className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded uppercase tracking-wider shadow transition"
                                >
                                  {editingFeeRecord ? "Update Fee Record" : "Save Fee Record"}
                                </button>
                              </div>
                            </form>
                          )}

                          {/* Fee Ledger Table */}
                          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-100 text-slate-600 font-bold uppercase border-b border-slate-200">
                                  <th className="p-3">Fee Period</th>
                                  <th className="p-3">Payment Date</th>
                                  <th className="p-3 text-right">Amount Paid</th>
                                  <th className="p-3 text-right">Dues Left</th>
                                  <th className="p-3 text-center">Status</th>
                                  <th className="p-3">Remarks</th>
                                  <th className="p-3 text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {(selectedManagedStudent.fees || []).length > 0 ? (
                                  (selectedManagedStudent.fees || []).map((fee) => (
                                    <tr key={fee.id} className="hover:bg-slate-50 text-left">
                                      <td className="p-3 font-bold text-slate-900">{fee.month}</td>
                                      <td className="p-3 text-slate-500 font-mono">
                                        {fee.paymentDate ? new Date(fee.paymentDate).toLocaleDateString() : "N/A"}
                                      </td>
                                      <td className="p-3 text-right font-mono font-semibold text-emerald-600">₹{fee.amountPaid}</td>
                                      <td className="p-3 text-right font-mono font-semibold text-red-500">₹{fee.totalDue}</td>
                                      <td className="p-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                          fee.paymentStatus === "Paid"
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                            : fee.paymentStatus === "Partially Paid"
                                            ? "bg-amber-50 text-amber-700 border border-amber-100"
                                            : "bg-red-50 text-red-700 border border-red-100"
                                        }`}>
                                          {fee.paymentStatus}
                                        </span>
                                      </td>
                                      <td className="p-3 text-slate-600 truncate max-w-[150px]" title={fee.remarks}>{fee.remarks || "—"}</td>
                                      <td className="p-3 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingFeeRecord(fee);
                                              setFeeForm({
                                                month: fee.month,
                                                amountPaid: fee.amountPaid,
                                                totalDue: fee.totalDue || 0,
                                                paymentDate: fee.paymentDate || new Date().toISOString().substring(0, 10),
                                                paymentStatus: fee.paymentStatus,
                                                remarks: fee.remarks || ""
                                              });
                                              setIsAddingFee(true);
                                            }}
                                            className="p-1 text-slate-400 hover:text-slate-800 transition cursor-pointer"
                                            title="Edit Fee Record"
                                          >
                                            ✏️
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteFeeRecord(selectedManagedStudent.id, fee.id)}
                                            className="p-1 text-slate-400 hover:text-red-600 transition cursor-pointer"
                                            title="Delete Fee Record"
                                          >
                                            🗑️
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                                      No fee records logged yet. Use "+ Add Fee Record" to log the student's first tuition payment.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 min-h-[400px]">
                        <Users className="w-16 h-16 text-slate-200 mb-3" />
                        <h3 className="text-sm font-bold text-slate-700">No Student Selected</h3>
                        <p className="text-xs text-slate-400 max-w-sm mt-1 mx-auto">
                          Select an approved student from the Scholar Directory sidebar on the left to inspect detailed enrollment, configure joining/exit dates, and manage fee records.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

          </main>

        </div>
      )}
      {isIdCardModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="text-xl">🪪</span>
                <div className="text-left">
                  <h3 className="text-base font-bold text-slate-900 leading-tight">Student ID Card Printer &amp; Editor</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Customize student parameters, upload official assets, and generate a printable CR80 identity card.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsIdCardModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition p-1 hover:bg-slate-100 rounded-full cursor-pointer"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-50/30">
              {/* Left Column: Form & Asset Uploads */}
              <div className="space-y-5 text-left">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">Edit ID Card Details</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Student Name</label>
                    <input 
                      type="text"
                      value={idCardForm.name}
                      onChange={(e) => setIdCardForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Roll No</label>
                    <input 
                      type="text"
                      value={idCardForm.id}
                      onChange={(e) => setIdCardForm(prev => ({ ...prev, id: e.target.value }))}
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Class / Std</label>
                    <input 
                      type="text"
                      value={idCardForm.className}
                      onChange={(e) => setIdCardForm(prev => ({ ...prev, className: e.target.value }))}
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Physical Address</label>
                    <input 
                      type="text"
                      placeholder="e.g. Dildar Nagar, Ghazipur"
                      value={idCardForm.address || ""}
                      onChange={(e) => setIdCardForm(prev => ({ ...prev, address: e.target.value }))}
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Father's Name</label>
                    <input 
                      type="text"
                      value={idCardForm.fatherName}
                      onChange={(e) => setIdCardForm(prev => ({ ...prev, fatherName: e.target.value }))}
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Mobile No</label>
                    <input 
                      type="text"
                      value={idCardForm.mobile}
                      onChange={(e) => setIdCardForm(prev => ({ ...prev, mobile: e.target.value }))}
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Joining Date</label>
                    <input 
                      type="date"
                      value={idCardForm.joiningDate}
                      onChange={(e) => setIdCardForm(prev => ({ ...prev, joiningDate: e.target.value }))}
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">ID Valid Until</label>
                    <input 
                      type="date"
                      value={idCardForm.validUntil}
                      onChange={(e) => setIdCardForm(prev => ({ ...prev, validUntil: e.target.value }))}
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>

                {/* Upload Section */}
                <div className="space-y-4 pt-3 border-t border-slate-100">
                  <h5 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Asset Credentials</h5>
                  
                  {/* Student Photo */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-[10px] font-bold uppercase text-indigo-600 mb-1">Upload Student Photograph (Max 30KB)</label>
                    <p className="text-[10px] text-slate-400 mb-2">Ideal proportions: 3:4 aspect ratio portrait cut.</p>
                    <input 
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 30 * 1024) {
                          setPhotoSizeWarning(`⚠️ Warning: Selected image size (${(file.size / 1024).toFixed(1)}KB) exceeds the 30KB limit! Please select a smaller photo.`);
                          alert("❌ Image size exceeds the maximum 30KB limit. Please optimize or select a smaller photograph.");
                          return;
                        }
                        setPhotoSizeWarning(null);
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setIdCardForm(prev => ({ ...prev, studentPhoto: reader.result as string }));
                        };
                        reader.readAsDataURL(file);
                      }}
                      className="w-full text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                    />
                    {photoSizeWarning && (
                      <div className="mt-2 text-[10px] font-bold text-rose-500 bg-rose-50 border border-rose-200 p-2 rounded-lg">
                        {photoSizeWarning}
                      </div>
                    )}
                  </div>

                  {/* Admin Signature */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-[10px] font-bold uppercase text-emerald-600 mb-1">Upload Authorized Signature</label>
                    <p className="text-[10px] text-slate-400 mb-2">Saved automatically for future ID printings. Transparent background preferred.</p>
                    <input 
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setIdCardForm(prev => ({ ...prev, adminSignature: reader.result as string }));
                          saveFile("admin_signature", file).catch(err => console.warn("Failed to persist signature:", err));
                        };
                        reader.readAsDataURL(file);
                      }}
                      className="w-full text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:uppercase file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Live ID Preview */}
              <div className="flex flex-col items-center justify-center p-6 border-l border-dashed border-slate-200 bg-slate-50/50 rounded-2xl relative min-h-[400px]">
                <h4 className="absolute top-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Live ID Card Preview</h4>

                {/* ID Card Box Container */}
                <div className="w-[245px] h-[375px] rounded-[18px] bg-white border border-slate-200 shadow-xl overflow-hidden flex flex-col relative select-none animate-fadeIn mt-6">
                  {/* Top Header */}
                  <div className="bg-gradient-to-br from-indigo-900 to-blue-700 text-white text-center py-3.5 px-2 border-b-2 border-amber-400">
                    <h5 className="text-[10px] font-black uppercase tracking-wider leading-none">Royal Coaching Centre</h5>
                    <span className="text-[6px] text-amber-300 font-extrabold uppercase tracking-widest block mt-0.5">Quality Spoken English</span>
                    <span className="text-[5px] text-slate-300 font-medium block mt-0.5">Dildar Nagar, Ghazipur, UP</span>
                  </div>

                  {/* Photograph Frame */}
                  <div className="flex justify-center mt-3 mb-2">
                    <div className="w-[65px] h-[80px] rounded-md border-2 border-slate-100 shadow-md bg-slate-50 overflow-hidden flex items-center justify-center">
                      {idCardForm.studentPhoto ? (
                        <img src={idCardForm.studentPhoto} className="w-full h-full object-cover" alt="Student" />
                      ) : (
                        <span className="text-[6px] font-bold text-slate-400 uppercase text-center p-1 leading-tight">No Photo<br/>Selected</span>
                      )}
                    </div>
                  </div>

                  {/* Student Name */}
                  <h6 className="text-[10px] font-black text-slate-900 text-center uppercase tracking-wide border-b border-slate-100 pb-1 mx-3 mb-2.5">
                    {idCardForm.name || "SCHOLAR NAME"}
                  </h6>

                  {/* Fields */}
                  <div className="flex-1 px-4 flex flex-col gap-1 text-[7px] leading-none text-left">
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-slate-400 uppercase">Roll No</span>
                      <span className="font-bold text-indigo-700 font-mono">{idCardForm.id || "PENDING"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-slate-400 uppercase">Class / Std</span>
                      <span className="font-bold text-slate-800">Class {idCardForm.className || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-slate-400 uppercase">Father's Name</span>
                      <span className="font-bold text-slate-800 capitalize truncate max-w-[90px]">{idCardForm.fatherName || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-slate-400 uppercase">Mobile No</span>
                      <span className="font-bold text-slate-800 font-mono">{idCardForm.mobile || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-slate-400 uppercase">Address</span>
                      <span className="font-bold text-slate-800 truncate max-w-[95px]">{idCardForm.address || "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-slate-400 uppercase">Joining Date</span>
                      <span className="font-bold text-slate-800 font-mono">{idCardForm.joiningDate ? new Date(idCardForm.joiningDate).toLocaleDateString() : "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-extrabold text-slate-400 uppercase">Valid Until</span>
                      <span className="font-bold text-slate-800 font-mono">{idCardForm.validUntil ? new Date(idCardForm.validUntil).toLocaleDateString() : "N/A"}</span>
                    </div>
                  </div>

                  {/* Footer wave and content */}
                  <div className="flex flex-col w-full mt-auto select-none">
                    {/* SVG Wave */}
                    <svg viewBox="0 0 120 20" preserveAspectRatio="none" className="w-full h-4 block -mb-[1px] pointer-events-none">
                      <path d="M0 8 C 30 18, 40 2, 80 10 C 100 14, 110 6, 120 12 L120 20 L0 20 Z" fill="#1e3a8a" />
                      <path d="M0 12 C 20 4, 40 16, 70 8 C 90 4, 105 12, 120 6 L120 20 L0 20 Z" fill="#3b82f6" opacity="0.4" />
                    </svg>
                    {/* Footer Body */}
                    <div className="bg-[#1e3a8a] text-white p-2 px-3 pb-3 flex justify-between items-center">
                      {/* Barcode box with white bg */}
                      <div className="bg-white p-1 rounded flex flex-col items-center shadow-md">
                        <div className="flex items-center h-2.5 w-12 opacity-95 gap-[0.5px]">
                          {[2, 1, 3, 1, 2, 1, 4, 1, 2, 1, 3, 1].map((w, i) => (
                            <div key={i} className="bg-black h-full" style={{ flex: w }}></div>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col items-center">
                        {idCardForm.adminSignature ? (
                          <img src={idCardForm.adminSignature} className="max-h-4 max-w-[40px] object-contain mb-0.5 brightness-110" alt="Sig" />
                        ) : (
                          <div className="h-2.5 w-10 border-b border-dashed border-blue-300/40 mb-0.5"></div>
                        )}
                        <span className="text-[5px] font-black text-blue-300 uppercase tracking-widest leading-none">Principal</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button 
                onClick={() => setIsIdCardModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition uppercase tracking-wider"
              >
                Close
              </button>
              <button 
                onClick={handlePrintStudentIdCard}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-lg transition uppercase tracking-wider shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print ID Card</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
