import React, { useState, useEffect, useRef } from "react";
import { db, handleFirestoreError, OperationType, isFirestoreQuotaExceeded } from "./lib/firebase";
import { doc, onSnapshot, getDoc, setDoc } from "firebase/firestore";
import { getFile } from "./lib/indexedDb";
import { syncMedia } from "./lib/mediaSync";
import { WebsiteSettings } from "./types";
import RegistrationForm from "./components/RegistrationForm";
import AdminDashboard from "./components/AdminDashboard";
import LogoIcon from "./components/LogoIcon";
import { 
  Phone, MessageSquare, Award, Star, BookOpen, Users, 
  MapPin, CheckCircle, ChevronRight, Menu, X, Lock, Play, 
  VolumeX, Volume2, ShieldCheck, Heart, Instagram, Facebook, Globe,
  Calendar, Clock, HelpCircle, ChevronDown, ChevronUp
} from "lucide-react";

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

export default function App() {
  const [isAdminView, setIsAdminView] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(null);
  
  // Real-time Settings State
  const [settings, setSettings] = useState<WebsiteSettings>({
    slogan: "★ A Course That Can Change The Course of Your Life ★",
    experienceYears: 12,
    studentsTrained: 500,
    successRate: 95,
    contactPhone1: "9532462057",
    contactPhone2: "9918833932",
    faqs: DEFAULT_FAQS,
    schedules: DEFAULT_SCHEDULES,
  });

  // Load Settings dynamically from Firestore with Exponential Backoff Retry for transient issues
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;
    let retryTimeoutId: NodeJS.Timeout | null = null;

    const loadLocalCachedSettings = () => {
      const saved = localStorage.getItem("demo_settings");
      if (saved) {
        try {
          const data = JSON.parse(saved);
          setSettings({
            ...data,
            faqs: data.faqs || DEFAULT_FAQS,
            schedules: data.schedules || DEFAULT_SCHEDULES,
          });
        } catch (jsonErr) {
          console.error("Failed to parse cached local settings:", jsonErr);
        }
      }
    };

    if (isFirestoreQuotaExceeded()) {
      console.log("Firestore quota exceeded. Loading cached website settings from localStorage.");
      loadLocalCachedSettings();
      return;
    }

    const startListening = (attemptDelay = 1000) => {
      if (!active) return;
      
      console.log(`Attempting to subscribe to Firestore settings (delay: ${attemptDelay}ms)...`);
      const docRef = doc(db, "settings", "main");
      
      try {
        unsubscribe = onSnapshot(docRef, (docSnap) => {
          if (!active) return;
          if (docSnap.exists()) {
            const data = docSnap.data() as WebsiteSettings;
            setSettings({
              ...data,
              faqs: data.faqs || DEFAULT_FAQS,
              schedules: data.schedules || DEFAULT_SCHEDULES,
            });
            // Cache settings locally in case quota is reached later
            localStorage.setItem("demo_settings", JSON.stringify(data));
          } else {
            console.log("Settings document not found in DB. Using defaults.");
          }
        }, (error) => {
          if (!active) return;
          console.warn(`Could not load settings from Firestore (attempt delay: ${attemptDelay}ms):`, error);
          
          const errMsg = error instanceof Error ? error.message : String(error);
          const isQuota = errMsg.includes("resource-exhausted") ||
                          errMsg.includes("quota") ||
                          errMsg.includes("Quota") ||
                          errMsg.includes("exhausted");
                          
          if (isQuota) {
            if (typeof window !== "undefined") {
              localStorage.setItem("firestore_quota_exceeded", "true");
            }
            // Do NOT retry or reschedule if the Firebase daily quota is exhausted
            console.log("Firestore quota exceeded. Stopping listener retries.");
            if (unsubscribe) {
              unsubscribe();
              unsubscribe = null;
            }
            return;
          }
          
          // Load local fallback immediately so the UI remains operational
          loadLocalCachedSettings();
          
          // Cleanup current broken subscription before retrying
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
          
          // Calculate exponential backoff delay (max 30 seconds)
          const nextDelay = Math.min(attemptDelay * 2, 30000);
          console.log(`Scheduling Firestore retry in ${nextDelay}ms due to transient error.`);
          
          retryTimeoutId = setTimeout(() => {
            startListening(nextDelay);
          }, attemptDelay);
        });
      } catch (err) {
        if (!active) return;
        console.error("Error setting up onSnapshot listener:", err);
        loadLocalCachedSettings();
        
        const errMsg = err instanceof Error ? err.message : String(err);
        const isQuota = errMsg.includes("resource-exhausted") ||
                        errMsg.includes("quota") ||
                        errMsg.includes("Quota") ||
                        errMsg.includes("exhausted");
                        
        if (isQuota) {
          if (typeof window !== "undefined") {
            localStorage.setItem("firestore_quota_exceeded", "true");
          }
          console.log("Firestore quota exceeded during setup. Stopping retry loop.");
          return;
        }
        
        const nextDelay = Math.min(attemptDelay * 2, 30000);
        retryTimeoutId = setTimeout(() => {
          startListening(nextDelay);
        }, attemptDelay);
      }
    };

    startListening();

    return () => {
      active = false;
      if (unsubscribe) {
        unsubscribe();
      }
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, []);

  // Slogan Typewriter effect
  const fullText = "Royal Coaching Centre";
  const [typedText, setTypedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [loopNum, setLoopNum] = useState(0);
  const [typingSpeed, setTypingSpeed] = useState(120);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const handleType = () => {
      if (!isDeleting) {
        setTypedText(fullText.substring(0, typedText.length + 1));
        if (typedText === fullText) {
          // Pause at peak
          timer = setTimeout(() => setIsDeleting(true), 2500);
          return;
        }
      } else {
        setTypedText(fullText.substring(0, typedText.length - 1));
        if (typedText === "") {
          setIsDeleting(false);
          setLoopNum(loopNum + 1);
          setTypingSpeed(150);
          return;
        }
      }
      setTypingSpeed(isDeleting ? 60 : 120);
      timer = setTimeout(handleType, typingSpeed);
    };

    timer = setTimeout(handleType, typingSpeed);
    return () => clearTimeout(timer);
  }, [typedText, isDeleting, typingSpeed, loopNum]);

  // Video control refs
  const videoRefA = useRef<HTMLVideoElement | null>(null);
  const videoRefB = useRef<HTMLVideoElement | null>(null);
  const videoRefC = useRef<HTMLVideoElement | null>(null);

  const [mutedState, setMutedState] = useState({ A: true, B: true, C: true });
  const [localVideos, setLocalVideos] = useState<(string | null)[]>([null, null, null]);
  const [localImages, setLocalImages] = useState<string[]>([]);

  useEffect(() => {
    const loadIndexedDBFiles = async () => {
      try {
        const videos = [null, null, null];
        for (let i = 0; i < 3; i++) {
          const blob = await syncMedia(`video_${i}`);
          if (blob) {
            videos[i] = URL.createObjectURL(blob);
          }
        }
        setLocalVideos(videos);

        const images: string[] = [];
        for (let i = 0; i < 15; i++) {
          const blob = await syncMedia(`image_${i}`);
          if (blob) {
            images.push(URL.createObjectURL(blob));
          }
        }
        setLocalImages(images);
      } catch (err) {
        console.error("Error loading local files in App:", err);
      }
    };
    loadIndexedDBFiles();
  }, [settings]);

  const handleVideoHover = (ref: React.RefObject<HTMLVideoElement | null>, key: "A" | "B" | "C", hoverIn: boolean) => {
    if (!ref.current) return;
    if (hoverIn) {
      ref.current.muted = false;
      setMutedState(prev => ({ ...prev, [key]: false }));
      // Ensure it is playing
      ref.current.play().catch(() => {});
      
      // Pause others
      const refs = [videoRefA, videoRefB, videoRefC];
      refs.forEach(otherRef => {
        if (otherRef !== ref && otherRef.current) {
          otherRef.current.pause();
        }
      });
    } else {
      ref.current.muted = true;
      setMutedState(prev => ({ ...prev, [key]: true }));
    }
  };

  // Listen to scrolls for sticky header and active links
  useEffect(() => {
    const handleScroll = () => {
      const sections = ["home", "highlights", "experience", "about", "faq", "register", "contact"];
      const scrollPos = window.scrollY + 120;
      
      for (const section of sections) {
        const el = document.getElementById(section);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveSection(section);
            break;
          }
        }
      }
    };
    
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const currentYear = new Date().getFullYear();

  // Load default/custom values for Highlights
  const defaultHighlights = [
    {
      title: "Fluent Spoken English",
      desc: "Students transition from hesitant speakers to highly fluent, confident English communicators in just weeks.",
    },
    {
      title: "Academic Improvement",
      desc: "Consistent performance and grade boosts in school exams through structured guidance and concept development.",
    },
    {
      title: "Confidence & Persona",
      desc: "Specialized training in self-confidence, body language, and personality building to prepare for public speaking.",
    },
    {
      title: "Proven Track Record",
      desc: "Hundreds of our trained students have successfully qualified in exams and reached leading educational stages.",
    },
  ];

  const displayHighlights = settings.highlights && settings.highlights.length === 4
    ? settings.highlights
    : defaultHighlights;

  const getHighlightIcon = (index: number) => {
    switch (index) {
      case 0: return <MessageSquare className="w-8 h-8 text-amber-500" />;
      case 1: return <BookOpen className="w-8 h-8 text-amber-500" />;
      case 2: return <Award className="w-8 h-8 text-amber-500" />;
      case 3: return <Star className="w-8 h-8 text-amber-500" />;
      default: return <Star className="w-8 h-8 text-amber-500" />;
    }
  };

  // If Admin control mode is enabled
  if (isAdminView) {
    return <AdminDashboard onClose={() => setIsAdminView(false)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 font-sans selection:bg-amber-400 selection:text-slate-900 overflow-x-hidden">
      
      {/* 1. Header / Navbar */}
      <header className="fixed top-0 left-0 w-full bg-white/95 backdrop-blur-md shadow-sm z-40 border-b border-slate-100 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex justify-between items-center">
          
          <div className="flex items-center gap-3">
            <LogoIcon className="w-12 h-12 shrink-0" />
            <div>
              <span className="text-lg font-bold font-serif text-blue-950 block leading-tight">
                Royal Coaching Centre
              </span>
              <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-widest block mt-0.5">
                Change the Course of Your Life
              </span>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {[
              { id: "home", label: "Home" },
              { id: "highlights", label: "Highlights" },
              { id: "experience", label: "Experience" },
              { id: "about", label: "About Us" },
              { id: "faq", label: "FAQ" },
              { id: "register", label: "Admission" },
              { id: "contact", label: "Contact" },
            ].map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                className={`text-xs font-semibold uppercase tracking-wider relative py-1.5 transition-all duration-300 ${
                  activeSection === link.id 
                    ? "text-amber-500 font-bold" 
                    : "text-slate-600 hover:text-amber-500"
                }`}
              >
                {link.label}
                {activeSection === link.id && (
                  <span className="absolute bottom-0 left-0 w-full h-[2px] bg-amber-500 rounded-full" />
                )}
              </a>
            ))}

            {/* Admin trigger button */}
            <button
              onClick={() => setIsAdminView(true)}
              className="ml-2 px-3 py-1.5 bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs rounded-full shadow-md flex items-center gap-1.5 cursor-pointer transition transform hover:-translate-y-0.5"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" /> Admin Access
            </button>
          </nav>

          {/* Mobile menu toggle */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => setIsAdminView(true)}
              className="p-1.5 bg-blue-900 text-white rounded-full flex items-center justify-center cursor-pointer"
              title="Admin Portal"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-blue-950 hover:text-amber-500 transition cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 shadow-xl absolute top-20 left-0 w-full py-4 px-6 flex flex-col gap-3 animate-fadeIn">
            {[
              { id: "home", label: "Home" },
              { id: "highlights", label: "Highlights" },
              { id: "experience", label: "Our Experience" },
              { id: "about", label: "About Us" },
              { id: "faq", label: "Frequently Asked Questions" },
              { id: "register", label: "Online Admission" },
              { id: "contact", label: "Get In Touch" },
            ].map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={() => setMobileMenuOpen(false)}
                className={`text-sm font-semibold py-2 px-3 rounded-lg transition-all ${
                  activeSection === link.id
                    ? "bg-amber-400/10 text-amber-600 font-bold"
                    : "text-slate-700 hover:bg-slate-50 hover:text-amber-500"
                }`}
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </header>

      {/* 2. Hero Section */}
      <section id="home" className="pt-32 pb-20 md:py-40 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 text-white relative overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-400/10 via-transparent to-transparent pointer-events-none"></div>
        
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center relative z-10">
          
          {/* Animated Typewriter Slogan */}
          <div className="min-h-[100px] flex items-center justify-center mb-6">
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-extrabold font-serif tracking-tight leading-tight">
              {typedText.split("").map((char, index) => {
                // Mimic the color coding matching character length of the original layout
                const isSpecial = index === 0 || index === 6 || index === 15;
                return (
                  <span key={index} className={isSpecial ? "text-amber-400 text-glow" : "text-white"}>
                    {char}
                  </span>
                );
              })}
              <span className="inline-block w-[3px] h-[1em] bg-amber-400 ml-1.5 animate-pulse rounded-sm shadow-lg shadow-amber-400/50" />
            </h2>
          </div>

          {/* Marquee Slogan */}
          <div className="w-full overflow-hidden bg-white/10 backdrop-blur-md rounded-full border border-white/20 py-2.5 px-4 mb-10 max-w-2xl mx-auto">
            <div className="relative flex items-center overflow-x-hidden">
              <div className="animate-marquee whitespace-nowrap flex gap-8">
                <span className="text-xs md:text-sm font-semibold tracking-wide font-serif italic text-amber-300">
                  {settings.slogan}
                </span>
                <span className="text-xs md:text-sm font-semibold tracking-wide font-serif italic text-white">
                  ★ Quality Education with Fluent Spoken English Program ★
                </span>
                <span className="text-xs md:text-sm font-semibold tracking-wide font-serif italic text-amber-300">
                  {settings.slogan}
                </span>
              </div>
            </div>
          </div>

          {/* CTA Action Buttons */}
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href={`tel:+91${settings.contactPhone1}`}
              className="px-8 py-3 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-full shadow-lg shadow-amber-400/20 hover:shadow-amber-400/40 active:scale-[0.98] transition-all duration-300 flex items-center gap-2 text-sm cursor-pointer"
            >
              <Phone className="w-4 h-4" /> Call Admissions Now
            </a>
            <a
              href={`https://wa.me/91${settings.contactPhone1}?text=Hello%20Royal%20Coaching%20Centre,%20I%20am%20interested%20in%20taking%20admission.`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3 bg-transparent hover:bg-white text-white hover:text-blue-900 border-2 border-white rounded-full font-bold active:scale-[0.98] transition-all duration-300 flex items-center gap-2 text-sm cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" /> Enquire on WhatsApp
            </a>
          </div>

        </div>

        {/* Custom Marquee CSS Injection */}
        <style>{`
          @keyframes marquee {
            0% { transform: translateX(0%); }
            100% { transform: translateX(-50%); }
          }
          .animate-marquee {
            animation: marquee 16s linear infinite;
            display: inline-flex;
            width: max-content;
          }
          .animate-marquee:hover {
            animation-play-state: paused;
          }
        `}</style>
      </section>

      {/* 3. Highlights Section */}
      <section id="highlights" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold font-serif text-blue-950 relative inline-block">
              Student Success Highlights
              <span className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-12 h-1 bg-amber-400 rounded-full" />
            </h2>
            <p className="text-slate-500 text-sm mt-4 leading-relaxed">
              Real transformations. Real confidence. Real academic results. We empower students with critical Spoken English fluency, practical confidence, and high academic performance.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {displayHighlights.map((card, i) => (
              <div
                key={i}
                className="bg-slate-50 hover:bg-white rounded-2xl p-6 border border-slate-100 hover:border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
              >
                <div className="mb-4 p-3 bg-amber-500/10 rounded-xl w-fit">{getHighlightIcon(i)}</div>
                <h3 className="text-base font-bold text-blue-950 mb-2">{card.title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* 4. Experience Section */}
      <section id="experience" className="py-20 bg-slate-50 border-y border-slate-100 relative">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center relative z-10">
          
          <h2 className="text-3xl font-bold font-serif text-blue-950 relative inline-block mb-10">
            Our Experience
            <span className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-12 h-1 bg-amber-400 rounded-full" />
          </h2>

          <div className="bg-white rounded-3xl p-8 md:p-10 border border-slate-100 shadow-xl border-l-4 border-l-amber-400 hover:shadow-2xl transition duration-500">
            <div className="w-16 h-16 bg-blue-900/10 border border-blue-900/10 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-900">
              <Award className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-blue-950 mb-4">Years of Excellence in Quality Education</h3>
            <p className="text-slate-600 text-sm leading-relaxed max-w-2xl mx-auto mb-8 whitespace-pre-line">
              {settings.experienceText || "With several years of intensive coaching experience, Royal Coaching Centre has helped numerous students improve their English speaking skills, confidence, and academic scores. We combine personalized individual attention with modern interactive sessions to yield exceptional results."}
            </p>

            {/* Stats count loaded from live Firebase setting document */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-8 border-t border-slate-100">
              <div>
                <span className="text-3xl font-extrabold text-amber-500 block font-mono">
                  {settings.experienceYears}+
                </span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mt-1">
                  Years of Experience
                </span>
              </div>
              <div>
                <span className="text-3xl font-extrabold text-amber-500 block font-mono">
                  {settings.studentsTrained}+
                </span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mt-1">
                  Students Trained
                </span>
              </div>
              <div>
                <span className="text-3xl font-extrabold text-amber-500 block font-mono">
                  {settings.successRate}%
                </span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mt-1">
                  Success Rate
                </span>
              </div>
              <div>
                <span className="text-3xl font-extrabold text-amber-500 block font-mono">
                  10+
                </span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mt-1">
                  Expert Trainers
                </span>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* Campus Spotlight Section (Requested: Right above About Us) */}
      <section className="py-16 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <h2 className="text-3xl font-bold font-serif text-blue-950 relative inline-block">
              Campus Spotlight
              <span className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-12 h-1 bg-amber-400 rounded-full" />
            </h2>
            <p className="text-slate-500 text-sm mt-4">
              Visual snapshots from our coaching sessions, interactive seminars, and vibrant educational activities.
            </p>
          </div>
          
          <div>
            {localImages.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {localImages.map((src, idx) => (
                  <div key={idx} className="relative rounded-2xl overflow-hidden shadow-md border border-slate-100 group aspect-square bg-slate-55 animate-fade-in shine-effect">
                    <img 
                      src={src} 
                      alt={`Campus snapshot ${idx + 1}`} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <p className="text-white font-bold text-[10px] uppercase tracking-wider">Memory #{idx + 1}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : settings.aboutUsImage ? (
              <div className="max-w-3xl mx-auto relative rounded-3xl overflow-hidden shadow-xl border border-slate-100 group shine-effect">
                <img 
                  src={settings.aboutUsImage} 
                  alt="Coaching Center Spotlight" 
                  className="w-full h-auto max-h-[480px] object-cover mx-auto"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent flex items-end p-6">
                  <p className="text-white font-bold text-sm tracking-wide">Empowering Student Fluency & Academic Success</p>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto relative rounded-2xl overflow-hidden bg-slate-50 border border-slate-200 border-dashed p-12 text-center flex flex-col items-center justify-center min-h-[250px]">
                <div className="w-14 h-14 rounded-full bg-amber-400/10 flex items-center justify-center text-amber-500 mb-4 shadow-sm">
                  <Award className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">No Spotlight Image Configured</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Log in to the Administrator Portal to upload an image of our coaching sessions or activities to display here.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 6. About Us Section */}
      <section id="about" className="py-20 bg-slate-50 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <h2 className="text-3xl font-bold font-serif text-blue-950 text-center relative inline-block mb-16 left-1/2 -translate-x-1/2">
            About Us
            <span className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-12 h-1 bg-amber-400 rounded-full" />
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 border border-slate-150 border-l-4 border-l-amber-400 shadow-md">
                <p className="text-slate-800 font-serif font-medium text-lg italic leading-relaxed whitespace-pre-line">
                  "{settings.aboutUsText || "Our absolute mission is to empower students with high-quality education, self-confidence, Spoken English fluency, and practical communication skills, so they can achieve success in every single stage of life."}"
                </p>
              </div>

              <p className="text-slate-600 text-sm leading-relaxed">
                At Royal Coaching Centre, we believe that education should go beyond memorization. We design programs that transform personalities, eliminate stage-fear, and train students to deliver elegant speeches and handle modern corporate interviews.
              </p>

              <div>
                <h3 className="text-lg font-bold text-blue-950 mb-3">Why Join Royal Coaching Centre?</h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700 font-semibold">
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> Spoken English Improvement</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> Personality Development</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> Stage Confidence Coaching</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> Experienced Expert Faculty</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> Small Personalized Batches</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> Concept-Focused Academic Aid</li>
                </ul>
              </div>
            </div>

            {/* Design element */}
            <div className="bg-white border border-slate-200 rounded-3xl flex items-center justify-center shadow-xl h-[420px] w-full max-w-[420px] mx-auto relative overflow-hidden group shine-effect">
              <div className="absolute inset-0 bg-black/5 group-hover:bg-black/10 transition duration-300 z-10 pointer-events-none"></div>
              <LogoIcon className="w-full h-full object-cover select-none transition-transform duration-700 group-hover:scale-103" rounded={false} />
            </div>

          </div>

        </div>
      </section>

      {/* Frequently Asked Questions Section */}
      <section id="faq" className="py-20 bg-slate-50 border-t border-slate-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold font-serif text-blue-950 relative inline-block">
              Frequently Asked Questions
              <span className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-12 h-1 bg-amber-400 rounded-full" />
            </h2>
            <p className="text-slate-500 text-sm mt-4">
              Common student queries and doubts about admissions, batch flexibility, and course materials.
            </p>
          </div>

          <div className="space-y-4">
            {(settings.faqs || DEFAULT_FAQS).map((faq, index) => {
              const isOpen = openFaqIdx === index;
              return (
                <div 
                  key={index} 
                  className={`bg-white rounded-2xl border transition-all duration-300 shadow-sm overflow-hidden ${
                    isOpen 
                      ? "border-amber-400 shadow-md ring-1 ring-amber-400/25" 
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <button
                    onClick={() => setOpenFaqIdx(isOpen ? null : index)}
                    className="w-full text-left px-6 py-5 flex justify-between items-center gap-4 cursor-pointer focus:outline-none"
                  >
                    <span className="font-bold text-slate-900 text-sm md:text-base flex items-center gap-2.5">
                      <HelpCircle className={`w-5 h-5 shrink-0 ${isOpen ? "text-amber-500" : "text-blue-600"}`} />
                      {faq.question}
                    </span>
                    <span className={`p-1.5 rounded-full transition-all duration-300 ${isOpen ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </button>
                  
                  {isOpen && (
                    <div className="px-6 pb-5 pt-1 text-slate-600 text-sm border-t border-slate-100 bg-slate-50/50 leading-relaxed animate-fadeIn">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-12 bg-white rounded-2xl p-6 border border-slate-200 text-center shadow-md">
            <p className="text-sm text-slate-600">
              Have another question not listed here? Our support lines are active 24/7.
            </p>
            <a 
              href="#contact" 
              className="inline-block mt-4 text-xs uppercase tracking-wider font-bold bg-blue-900 text-white px-5 py-2 rounded-full hover:bg-blue-950 transition duration-150"
            >
              Ask an Advisor Now
            </a>
          </div>
        </div>
      </section>

      {/* 7. Online Registration Section (The requested form) */}
      <section id="register" className="py-20 bg-gradient-to-br from-blue-950 via-slate-900 to-slate-950 text-white relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_var(--tw-gradient-stops))] from-amber-400/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <RegistrationForm />
        </div>
      </section>

      {/* 8. Contact Section */}
      <section id="contact" className="py-20 bg-slate-900 text-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold font-serif text-white relative inline-block">
              Get In Touch
              <span className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-12 h-1 bg-amber-400 rounded-full" />
            </h2>
            <p className="text-slate-400 text-sm mt-4">
              Ready to transform your communication and career? Get in touch with us today!
            </p>
          </div>

          <div className="max-w-2xl mx-auto bg-slate-800/40 backdrop-blur-md rounded-2xl p-8 border border-white/5 text-center relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-amber-400/5 rounded-full blur-2xl"></div>

            <div className="w-16 h-16 bg-amber-400/10 rounded-full flex items-center justify-center mx-auto mb-6 text-amber-400">
              <Phone className="w-8 h-8 animate-bounce" />
            </div>

            <h3 className="text-2xl md:text-3xl font-extrabold font-mono tracking-wider text-white mb-1">
              {settings.contactPhone1}, {settings.contactPhone2}
            </h3>
            <p className="text-xs text-slate-400 font-semibold mb-6 uppercase tracking-widest">Same numbers for Direct Voice Calls & WhatsApp Chat</p>

            {/* Location card */}
            <div className="bg-slate-950/40 p-5 rounded-xl border border-white/5 text-left mb-8 max-w-md mx-auto">
              <h4 className="font-bold text-xs uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 shrink-0" /> Our Location Coordinates
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed font-semibold">
                Anjum Apartment, Ward No. 9,<br />
                Saraila Road, Dildar Nagar, Ghazipur,<br />
                Uttar Pradesh - 232326, India
              </p>
            </div>

            {/* Quick access buttons */}
            <div className="flex flex-wrap justify-center gap-4">
              <a 
                href={`tel:+91${settings.contactPhone1}`}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-full shadow-lg transition-all transform hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer"
              >
                <Phone className="w-4 h-4" /> Call Advisor
              </a>
              <a 
                href={`https://wa.me/91${settings.contactPhone1}?text=Hello%20Royal%20Coaching%20Centre,%20please%20send%20me%20spoken%2520english%2520admission%2520details.`}
                target="_blank" 
                rel="noopener noreferrer"
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs rounded-full shadow-lg transition-all transform hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" /> Message WhatsApp
              </a>
              <a 
                href="https://www.instagram.com/royal_english_coaching?igsh=MWY5bm42c2E5d2Y%3D"
                target="_blank" 
                rel="noopener noreferrer"
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs rounded-full shadow-lg transition-all transform hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer"
              >
                <Instagram className="w-4 h-4" /> Instagram Page
              </a>
            </div>

          </div>

          {/* Large CTA Section */}
          <div className="mt-12 max-w-xl mx-auto bg-amber-400/5 border border-amber-400/20 rounded-2xl p-6 text-center">
            <h4 className="text-lg font-bold font-serif text-white mb-2">Join Thousands of Successful Fluent Speakers</h4>
            <p className="text-slate-400 text-xs mb-4 leading-relaxed">Submit the Admission Form above or text us on WhatsApp to lock in your enrollment batch today!</p>
            <a 
              href={`https://wa.me/91${settings.contactPhone1}?text=Hi%2C%20I%20want%20to%20enroll%20now`}
              target="_blank" 
              rel="noopener noreferrer"
              className="px-6 py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-full transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-lg hover:shadow-amber-400/20"
            >
              Enroll Now on WhatsApp
            </a>
          </div>

        </div>
      </section>

      {/* 9. Footer */}
      <footer className="bg-black text-slate-500 py-8 text-center text-xs border-t border-slate-900 shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="font-semibold text-slate-400">&copy; {currentYear} Royal Coaching Centre. All Rights Reserved.</p>
          <p className="mt-1 font-medium">Empowering students with Spoken English fluency, confidence, and academic competence.</p>
          <p className="mt-4 text-slate-500 font-mono text-[10px] flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
            <span>
              Developed with <Heart className="w-3 h-3 text-red-500 inline fill-red-500 animate-pulse" /> by{" "}
              <a 
                href="https://imran-protfolio-mine.netlify.app/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-amber-400 font-extrabold glitch-text uppercase tracking-widest hover:text-amber-300 transition-colors"
              >
                Imran Ansari
              </a>
            </span>
            <span className="hidden sm:inline text-slate-700">|</span>
            <span className="flex items-center gap-3">
              <a 
                href="https://imran-protfolio-mine.netlify.app/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-amber-400 transition-colors flex items-center gap-1"
              >
                <Globe className="w-3.5 h-3.5" /> <span className="text-[9px]">Website</span>
              </a>
              <a 
                href="https://www.facebook.com/imran.ansari.996903?rdid=pQDj3ODilc9uKdpp&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F19u6U4CPNy%2F#" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-blue-500 transition-colors flex items-center gap-1"
              >
                <Facebook className="w-3.5 h-3.5" /> <span className="text-[9px]">Facebook</span>
              </a>
              <a 
                href="https://instagram.com/imran_ansari000_?igsh=MTRqdGpuNDc2OHV1bA==" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-pink-500 transition-colors flex items-center gap-1"
              >
                <Instagram className="w-3.5 h-3.5" /> <span className="text-[9px]">Instagram</span>
              </a>
            </span>
          </p>
        </div>
      </footer>

    </div>
  );
}
