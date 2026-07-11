import React, { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType, isFirestoreQuotaExceeded } from "../lib/firebase";
import { collection, addDoc, doc, getDoc } from "firebase/firestore";
import { Student } from "../types";
import { CheckCircle2, User, Phone, Mail, MapPin, Calendar, Loader2, Printer, AlertCircle, Download } from "lucide-react";
// @ts-ignore
import html2pdf from "html2pdf.js";

export default function RegistrationForm() {
  const [formData, setFormData] = useState({
    name: "",
    mobile: "",
    email: "",
    address: "",
    age: "",
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submittedDetails, setSubmittedDetails] = useState<Student | null>(null);
  const [error, setError] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [emailSendError, setEmailSendError] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  useEffect(() => {
    const fetchAdminEmail = async () => {
      if (isFirestoreQuotaExceeded()) {
        console.log("Firestore quota exceeded. Skipping admin email fetch.");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "settings", "main"));
        if (snap.exists()) {
          const data = snap.data();
          if (data.adminEmailForNotifications) {
            setAdminEmail(data.adminEmailForNotifications);
          }
        }
      } catch (err) {
        console.warn("Could not fetch admin email for notifications:", err);
        const errStr = String(err);
        if (
          errStr.includes("resource-exhausted") ||
          errStr.includes("quota") ||
          errStr.includes("Quota") ||
          errStr.includes("exhausted")
        ) {
          if (typeof window !== "undefined") {
            localStorage.setItem("firestore_quota_exceeded", "true");
          }
        }
      }
    };
    fetchAdminEmail();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === "mobile") {
      const numericValue = value.replace(/\D/g, "").slice(0, 10);
      setFormData((prev) => ({ ...prev, [name]: numericValue }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setEmailSendError("");
    setEmailSent(false);

    // Front-end Validations
    if (!formData.name.trim()) {
      setError("Please enter student's full name");
      setLoading(false);
      return;
    }

    const mobileClean = formData.mobile.replace(/\D/g, "");
    if (mobileClean.length !== 10) {
      setError("Please enter a valid 10-digit mobile number");
      setLoading(false);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      setError("Please enter a valid email address");
      setLoading(false);
      return;
    }

    const ageNum = parseInt(formData.age);
    if (isNaN(ageNum) || ageNum < 4 || ageNum > 100) {
      setError("Please enter a valid age between 4 and 100");
      setLoading(false);
      return;
    }

    if (!formData.address.trim()) {
      setError("Please enter student's complete address");
      setLoading(false);
      return;
    }

    try {
      const studentData: Student = {
        name: formData.name.trim(),
        mobile: mobileClean, // Save cleaned 10-15 digit phone number strictly to avoid violating Firestore validation rules
        email: formData.email.trim().toLowerCase(),
        address: formData.address.trim(),
        age: ageNum,
        status: "Pending",
        timestamp: new Date().toISOString(),
        viewed: false,
      };

      let docRefId = "";
      if (isFirestoreQuotaExceeded()) {
        console.log("Firestore quota exceeded. Directly registering student locally.");
      } else {
        try {
          const docRef = await addDoc(collection(db, "registrations"), studentData);
          docRefId = docRef.id;
        } catch (dbErr: any) {
          console.warn("Firestore save failed, falling back to local sync:", dbErr);
          const errStr = String(dbErr);
          if (
            dbErr?.code === "resource-exhausted" ||
            dbErr?.code === "quota-exceeded" ||
            errStr.includes("Quota") ||
            errStr.includes("quota") ||
            errStr.includes("exhausted")
          ) {
            if (typeof window !== "undefined") {
              localStorage.setItem("firestore_quota_exceeded", "true");
            }
          }
        }
      }

      // Sync with localStorage so that if the administrator is in Offline/Demo mode, they instantly receive the new registration
      const finalStudent: Student = {
        ...studentData,
        id: docRefId || `local_${Date.now()}`
      };
      setSubmittedDetails(finalStudent);

      try {
        const saved = localStorage.getItem("demo_registrations");
        const localList: Student[] = saved ? JSON.parse(saved) : [];
        localList.unshift(finalStudent);
        localStorage.setItem("demo_registrations", JSON.stringify(localList));
      } catch (localErr) {
        console.error("Local storage sync error:", localErr);
      }

      setSuccess(true);
      setFormData({ name: "", mobile: "", email: "", address: "", age: "" });
    } catch (err) {
      console.error("Registration error:", err);
      setError("Failed to submit registration. Please try again later.");
      handleFirestoreError(err, OperationType.CREATE, "registrations");
    } finally {
      setLoading(false);
    }
  };

  const getReceiptHtml = (details: Student) => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Admission Slip - Royal Coaching Centre</title>
        </head>
        <body>
          <div class="slip-card">
            <style id="receipt-styles">
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              color: #1e293b;
              background-color: #ffffff;
              padding: 24px;
              margin: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .slip-card {
              max-width: 650px;
              margin: 0 auto;
              border: 1px solid #e2e8f0;
              border-radius: 20px;
              padding: 40px;
              box-shadow: 0 4px 20px rgba(0,0,0,0.03);
              position: relative;
              background: #ffffff;
              overflow: hidden;
              box-sizing: border-box;
            }
            .watermark {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-12deg);
              font-size: 68px;
              font-weight: 900;
              color: rgba(148, 163, 184, 0.06);
              letter-spacing: 5px;
              white-space: nowrap;
              pointer-events: none;
              z-index: 0;
              text-transform: uppercase;
              font-family: 'Inter', sans-serif;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
              z-index: 1;
              position: relative;
            }
            .logo {
              font-size: 30px;
              font-weight: 800;
              color: #2563eb;
              margin: 0 0 6px 0;
              letter-spacing: -0.5px;
            }
            .subtitle {
              font-size: 13px;
              color: #475569;
              margin: 0;
              font-weight: 500;
            }
            .divider-dashed {
              border-bottom: 1px dashed #cbd5e1;
              margin: 20px 0;
              width: 100%;
            }
            .slip-title {
              font-size: 15px;
              font-weight: 700;
              text-align: center;
              background: #eff6ff;
              color: #1e40af;
              padding: 12px;
              border-radius: 8px;
              margin: 0 auto 28px auto;
              text-transform: uppercase;
              letter-spacing: 1.2px;
              border: 1px solid #dbeafe;
              max-width: 100%;
              box-sizing: border-box;
            }
            .barcode-box {
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              background-color: #f8fafc;
              padding: 12px;
              margin: 0 auto 32px auto;
              max-width: 320px;
              text-align: center;
              box-sizing: border-box;
              z-index: 1;
              position: relative;
            }
            .barcode-title {
              font-size: 9px;
              font-weight: 700;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              margin-bottom: 8px;
            }
            .barcode-lines {
              display: flex;
              align-items: center;
              justify-content: center;
              height: 32px;
              margin-bottom: 8px;
            }
            .barcode-bar {
              background-color: #000000 !important;
              height: 100%;
              display: inline-block;
            }
            .barcode-text {
              font-family: monospace;
              font-size: 11px;
              font-weight: 700;
              color: #1e293b;
              letter-spacing: 3px;
              text-transform: uppercase;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 24px 32px;
              z-index: 1;
              position: relative;
              margin-bottom: 40px;
            }
            .full-row {
              grid-column: span 2;
            }
            .label {
              font-size: 10px;
              font-weight: 700;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.8px;
              margin-bottom: 4px;
            }
            .value {
              font-size: 15px;
              font-weight: 700;
              color: #0f172a;
              word-break: break-word;
            }
            .temp-id-box {
              display: inline-block;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 4px 12px;
              background-color: #ffffff;
              font-family: monospace;
              font-size: 13px;
              font-weight: 700;
              color: #0f172a;
            }
            .status-badge {
              display: inline-block;
              background-color: #fef3c7;
              color: #d97706;
              border: 1px solid #fde68a;
              font-size: 10px;
              font-weight: 700;
              padding: 4px 12px;
              border-radius: 9999px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .stamp-area {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              margin-top: 48px;
              margin-bottom: 20px;
              z-index: 1;
              position: relative;
            }
            .receipt-gen {
              font-size: 12px;
              color: #64748b;
            }
            .signature-area {
              text-align: center;
            }
            .sig-line {
              border-top: 1px solid #cbd5e1;
              width: 160px;
              margin-bottom: 6px;
            }
            .sig-text {
              font-size: 12px;
              color: #64748b;
            }
            .footer-divider {
              border: 0;
              border-top: 1px solid #f1f5f9;
              margin: 24px 0 16px 0;
            }
            .footer-text {
              text-align: center;
              font-size: 11px;
              color: #94a3b8;
              line-height: 1.6;
              margin: 0;
              z-index: 1;
              position: relative;
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
          <div class="watermark">ROYAL COACHING</div>
            
            <div class="header">
              <h1 class="logo">Royal Coaching Centre</h1>
              <p class="subtitle">Quality Education for Spoken English & Academic Excellence</p>
            </div>
            
            <div class="divider-dashed"></div>
            
            <div class="slip-title">Admission Registration Receipt</div>

            <div class="barcode-box">
              <div class="barcode-title">Registration Slip ID</div>
              <div class="barcode-lines">
                ${[2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 4, 1, 2, 1, 3, 1, 2, 1, 4, 1, 3, 2, 1, 3, 2, 1, 4, 1].map((w, i) => `<div class="barcode-bar" style="width: ${w}px; margin-right: ${i % 2 === 0 ? '1px' : '2px'};"></div>`).join("")}
              </div>
              <div class="barcode-text">${(details.id || "REG-PENDING").toUpperCase()}</div>
            </div>
            
            <div class="info-grid">
              <div>
                <div class="label">Student Name</div>
                <div class="value">${details.name}</div>
              </div>
              <div>
                <div class="label">Admission Temp ID</div>
                <div class="value">
                  <div class="temp-id-box">${details.id || "N/A"}</div>
                </div>
              </div>
              
              <div>
                <div class="label">Mobile Number</div>
                <div class="value">${details.mobile}</div>
              </div>
              <div>
                <div class="label">Age</div>
                <div class="value">${details.age} Years</div>
              </div>
              
              <div class="full-row">
                <div class="label">Email Address</div>
                <div class="value">${details.email}</div>
              </div>
              
              <div class="full-row">
                <div class="label">Residential Address</div>
                <div class="value">${details.address}</div>
              </div>
              
              <div>
                <div class="label">Registration Status</div>
                <div class="value">
                  <span class="status-badge">${details.status || "PENDING"}</span>
                </div>
              </div>
              <div>
                <div class="label">Date of Registration</div>
                <div class="value">
                  ${details.timestamp ? new Date(details.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : new Date().toLocaleString()}
                </div>
              </div>
            </div>
            
            <div class="stamp-area">
              <div class="receipt-gen">
                Receipt Generated Electronically
              </div>
              <div class="signature-area">
                <div class="sig-line"></div>
                <div class="sig-text">Authorized Signatory</div>
              </div>
            </div>
            
            <hr class="footer-divider" />
            
            <div class="footer-text">
              <p style="margin: 0 0 6px 0;">Please keep this receipt safe for reference during batch allotment and fee payment.</p>
              <p style="margin: 0;">© ${new Date().getFullYear()} Royal Coaching Centre. All rights reserved.</p>
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
  };

  const handlePrint = () => {
    if (!submittedDetails) return;
    const printHtml = getReceiptHtml(submittedDetails);

    // 1. Try to open a beautiful standalone popup/tab for printing
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(printHtml);
      printWindow.document.close();

      // Automatically trigger the standard browser print dialog once loaded
      printWindow.onload = function () {
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 300);
      };
    } else {
      // 2. Fallback to an iframe helper if popup blockers are active
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

        // Remove iframe after print dialog resolves
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 6000);
      }
    }
  };

  const handleDownloadReceipt = () => {
    if (!submittedDetails) return;
    setPdfDownloading(true);

    const printHtml = getReceiptHtml(submittedDetails);

    // Create an off-screen iframe to load the complete styled HTML document safely
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "-9999px";
    iframe.style.width = "650px";
    iframe.style.height = "900px";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(printHtml);
      iframeDoc.close();

      // Wait briefly for CSS, Google fonts and assets to parse and layout fully
      setTimeout(() => {
        const elementToRender = (iframeDoc.querySelector(".slip-card") || iframeDoc.body) as HTMLElement;

        const opt = {
          margin:       0.3,
          filename:     `Royal_Coaching_Receipt_${submittedDetails.id || "Admission"}.pdf`,
          image:        { type: "jpeg" as const, quality: 0.98 },
          html2canvas:  { 
            scale: 2.2, 
            useCORS: true,
            letterRendering: true,
            logging: false
          },
          jsPDF:        { unit: "in" as const, format: "letter" as const, orientation: "portrait" as const }
        };
        // Temporarily override getComputedStyle and Document.prototype.styleSheets in both the parent
        // context and the iframe context to filter out/fallback modern Tailwind CSS v4 "oklch" colors.
        // This prevents the legacy html2canvas color parser (used by html2pdf) from crashing.
        const patches: { target: any; prop: string; original: any; isDescriptor: boolean }[] = [];

        const applyMocksToWindowContext = (win: any) => {
          if (!win) return;
          try {
            const winProto = win.Window?.prototype || win;
            const originalGCS = winProto.getComputedStyle || win.getComputedStyle;
            
            if (originalGCS) {
              const patchedGCS = function(this: any, elt: Element, pseudoElt?: string) {
                // Safely determine the receiver for getComputedStyle
                const receiver = (this && (this instanceof win.Window || this === win)) ? this : win;
                let style;
                try {
                  style = originalGCS.call(receiver, elt, pseudoElt);
                } catch (e) {
                  try {
                    style = originalGCS(elt, pseudoElt);
                  } catch (err) {
                    return null;
                  }
                }
                if (!style) return style;

                return new Proxy(style, {
                  get(target, prop) {
                    if (prop === "getPropertyValue") {
                      return function(propertyName: string) {
                        const val = target.getPropertyValue(propertyName);
                        if (typeof val === "string" && val.includes("oklch")) {
                          return "rgba(0, 0, 0, 0)";
                        }
                        return val;
                      };
                    }
                    const value = Reflect.get(target, prop);
                    if (typeof prop === "string" && typeof value === "string" && value.includes("oklch")) {
                      return "rgba(0, 0, 0, 0)";
                    }
                    if (typeof value === "function") {
                      return value.bind(target);
                    }
                    return value;
                  }
                });
              };

              // Overwrite both on prototype and the instance to be absolutely sure
              try {
                if (winProto.getComputedStyle) {
                  winProto.getComputedStyle = patchedGCS;
                  patches.push({ target: winProto, prop: "getComputedStyle", original: originalGCS, isDescriptor: false });
                }
              } catch (e) {}
              try {
                if (win.getComputedStyle !== patchedGCS) {
                  win.getComputedStyle = patchedGCS;
                  patches.push({ target: win, prop: "getComputedStyle", original: originalGCS, isDescriptor: false });
                }
              } catch (e) {}
            }
          } catch (err) {
            console.warn("Failed to patch getComputedStyle for window context:", err);
          }

          try {
            const docProto = win.Document?.prototype || win.document;
            const desc = Object.getOwnPropertyDescriptor(docProto, "styleSheets") || 
                         Object.getOwnPropertyDescriptor(win.document, "styleSheets");
            
            if (desc) {
              const patchedStyleSheets = {
                get: function(this: any) {
                  const sheets = desc.get?.call(this);
                  if (!sheets) return sheets;
                  try {
                    const filtered = Array.from(sheets).filter((sheet: any) => {
                      try {
                        return sheet.ownerNode && (
                          sheet.ownerNode.id === "receipt-styles" || 
                          sheet.ownerNode.getAttribute?.("id") === "receipt-styles"
                        );
                      } catch (e) {
                        return false;
                      }
                    });

                    return new Proxy(sheets, {
                      get(target, prop) {
                        if (prop === "length") {
                          return filtered.length;
                        }
                        if (prop === "item") {
                          return (idx: number) => filtered[idx] || null;
                        }
                        if (typeof prop === "string" && !isNaN(Number(prop))) {
                          return filtered[Number(prop)];
                        }
                        const val = Reflect.get(target, prop);
                        if (typeof val === "function") {
                          return val.bind(target);
                        }
                        return val;
                      }
                    });
                  } catch (e) {
                    return sheets;
                  }
                },
                configurable: true
              };

              try {
                if (Object.getOwnPropertyDescriptor(docProto, "styleSheets")) {
                  Object.defineProperty(docProto, "styleSheets", patchedStyleSheets);
                  patches.push({ target: docProto, prop: "styleSheets", original: desc, isDescriptor: true });
                }
              } catch (e) {}
              try {
                if (Object.getOwnPropertyDescriptor(win.document, "styleSheets")) {
                  Object.defineProperty(win.document, "styleSheets", patchedStyleSheets);
                  patches.push({ target: win.document, prop: "styleSheets", original: desc, isDescriptor: true });
                }
              } catch (e) {}
            }
          } catch (err) {
            console.warn("Failed to patch styleSheets for document context:", err);
          }
        };

        // Apply mocks to parent window context
        applyMocksToWindowContext(window);

        // Apply mocks to iframe window context
        if (iframe.contentWindow) {
          applyMocksToWindowContext(iframe.contentWindow);
        }

        const restoreMocks = () => {
          patches.forEach(({ target, prop, original, isDescriptor }) => {
            try {
              if (isDescriptor) {
                Object.defineProperty(target, prop, original);
              } else {
                target[prop] = original;
              }
            } catch (err) {
              console.warn(`Failed to restore ${prop}:`, err);
            }
          });
        };

        // @ts-ignore
        html2pdf()
          .set(opt)
          .from(elementToRender)
          .save()
          .then(() => {
            restoreMocks();
            setPdfDownloading(false);
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          })
          .catch((err: any) => {
            restoreMocks();
            console.error("PDF generation failed:", err);
            setPdfDownloading(false);
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          });
      }, 500);
    } else {
      setPdfDownloading(false);
    }
  };

  if (success && submittedDetails) {
    return (
      <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 md:p-8 border border-white/10 text-center text-white shadow-2xl max-w-xl mx-auto transition-all duration-500 animate-fadeIn scale-100">
        <div className="flex justify-center mb-3">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 animate-bounce" />
        </div>
        <h3 className="text-2xl font-bold font-serif mb-1 text-white">Registration Successful!</h3>
        <p className="text-slate-300 mb-6 text-xs leading-relaxed max-w-md mx-auto">
          Your admission request has been logged. Print, download, or keep a copy of your verified registration receipt below.
        </p>

        {/* Realistic Printable Admission Receipt Voucher */}
        <div className="bg-[#fdfdfc] text-slate-900 rounded-3xl p-6 md:p-8 shadow-2xl text-left mb-6 border-2 border-slate-200 relative overflow-hidden font-sans">
          {/* Subtle side circular ticket punch notches for realistic voucher feeling */}
          <div className="absolute top-[45%] -left-4 w-8 h-8 bg-slate-950 rounded-full border-r-2 border-slate-200"></div>
          <div className="absolute top-[45%] -right-4 w-8 h-8 bg-slate-950 rounded-full border-l-2 border-slate-200"></div>
          
          {/* Top header decoration line */}
          <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500"></div>

          {/* Receipt Watermark Logo */}
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.02] pointer-events-none select-none z-0">
            <span className="text-8xl font-black tracking-widest text-blue-900 rotate-12">ROYAL</span>
          </div>

          <div className="relative z-10">
            {/* Header */}
            <div className="text-center border-b-2 border-slate-100 pb-5 mb-5">
              <h4 className="text-xl font-black tracking-tight text-slate-950 uppercase font-serif">Royal Coaching Centre</h4>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Dildar Nagar, Ghazipur, Uttar Pradesh</p>
              <span className="inline-block mt-3 px-3 py-1 bg-blue-50 border border-blue-100 text-blue-700 font-extrabold text-[10px] rounded-full uppercase tracking-wider">
                Official Admission Receipt
              </span>
            </div>

            {/* Simulated Barcode block with registration ID */}
            <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-6">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Registration Slip ID</span>
              <div className="flex items-center gap-0.5 h-7 w-48 mb-1 overflow-hidden select-none opacity-85">
                {/* Dynamically draw a premium looking simulated barcode using CSS bars */}
                {[2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 4, 1, 2, 1, 3, 1, 2, 1, 4, 1, 3, 2, 1, 3].map((w, i) => (
                  <div key={i} className="bg-slate-950 h-full flex-1" style={{ width: `${w}px` }}></div>
                ))}
              </div>
              <span className="font-mono text-xs font-bold text-slate-800 tracking-widest select-all uppercase">
                {submittedDetails.id || "REG-PENDING"}
              </span>
            </div>

            {/* Student Metadata Table */}
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-4">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Student Name</span>
                  <span className="text-sm font-extrabold text-slate-950 font-serif capitalize">{submittedDetails.name}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Mobile Number</span>
                  <span className="text-sm font-bold text-slate-950 font-mono">{submittedDetails.mobile}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-4">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Age Limit / Age</span>
                  <span className="text-sm font-bold text-slate-950">{submittedDetails.age} Years Old</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Registration Date</span>
                  <span className="text-sm font-bold text-slate-950 font-mono">
                    {submittedDetails.timestamp ? new Date(submittedDetails.timestamp).toLocaleDateString("en-US", { dateStyle: "medium" }) : new Date().toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="border-b border-slate-100 pb-4">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Primary Email Address</span>
                <span className="text-xs font-semibold text-slate-800 font-mono break-all">{submittedDetails.email}</span>
              </div>

              <div className="pb-2">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Residential Address</span>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-slate-700 leading-relaxed font-mono whitespace-pre-wrap shadow-inner text-xs">
                  {submittedDetails.address}
                </div>
              </div>
            </div>

            {/* Perforated Separator dashed line */}
            <div className="relative my-6 border-t-2 border-dashed border-slate-200">
              <div className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-white px-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 select-none">
                ✂️ Tear Receipt Line
              </div>
            </div>

            {/* Signature Area & Simulated Verification Stamp */}
            <div className="flex items-center justify-between mt-4">
              {/* Custom realistic circular Stamp */}
              <div className="border-4 border-double border-blue-600/30 text-blue-600/70 rounded-full w-20 h-20 flex flex-col items-center justify-center -rotate-12 select-none pointer-events-none scale-90">
                <span className="text-[7px] font-black tracking-widest uppercase">ROYAL</span>
                <span className="text-[10px] font-extrabold uppercase my-0.5">VERIFIED</span>
                <span className="text-[7px] font-black tracking-widest uppercase">COACHING</span>
              </div>

              <div className="text-right">
                <div className="h-10 w-28 border-b-2 border-slate-200 ml-auto flex items-end justify-center select-none opacity-40">
                  {/* Subtle vector signature flow */}
                  <span className="text-[10px] italic text-slate-400">Electronic Seal</span>
                </div>
                <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">Authorized Signature</span>
              </div>
            </div>

            {/* Footer terms */}
            <div className="mt-6 border-t border-slate-100 pt-4 text-center">
              <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                Thank you for choosing Royal Coaching Centre. Your application is marked as <strong className="text-amber-600">Pending</strong> verification. An administrator will contact you shortly regarding batches, syllabi, and fee schedules.
              </p>
            </div>
          </div>
        </div>

        {/* SMTP Warning Callout if Email Failed */}
        {emailSendError && (
          <div className="bg-amber-950/40 border border-amber-500/20 rounded-2xl p-5 text-left text-xs mb-6 max-w-xl mx-auto space-y-3">
            <div className="flex items-start gap-2 text-amber-400 font-extrabold uppercase tracking-wider text-[10px]">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>Admin Email Notification Failed: SMTP Authentication Alert</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              The registration details have been securely saved, but our system could not deliver the automatic email alert to the administrator due to an SMTP login rejection:
            </p>
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 font-mono text-[10px] text-amber-300 select-all overflow-x-auto whitespace-pre-wrap leading-normal">
              {emailSendError}
            </div>
            {(emailSendError.includes("535") || emailSendError.toLowerCase().includes("username") || emailSendError.toLowerCase().includes("login") || emailSendError.toLowerCase().includes("accepted")) && (
              <div className="pt-2 text-[11px] text-slate-300 border-t border-amber-500/10 space-y-2">
                <p className="font-bold text-amber-400">💡 How to resolve this for Gmail (smtp.gmail.com):</p>
                <ol className="list-decimal list-inside space-y-1.5 pl-1 text-slate-400 font-medium">
                  <li>Visit your <a href="https://myaccount.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline font-semibold">Google Account settings</a>.</li>
                  <li>Enable <strong>2-Step Verification</strong> under the Security tab.</li>
                  <li>Search for or go directly to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline font-semibold">App Passwords</a>.</li>
                  <li>Create a new App Password (e.g. named <em>"Royal Coaching"</em>) and copy the 16-character code.</li>
                  <li>Update your <strong className="text-slate-200 font-mono">EMAIL_SMTP_PASS</strong> environment variable in AI Studio Settings.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Interactive Buttons */}
        <p className="text-[11px] text-slate-400 mb-4 max-w-md mx-auto leading-normal">
          💡 <strong>Tip:</strong> If the <strong>Print Receipt</strong> button does not open due to browser sandbox restrictions, click <strong>Download Receipt</strong> to save a beautiful, print-ready offline copy.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handlePrint}
            disabled={pdfDownloading}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg hover:shadow-indigo-600/20 transition-all duration-300 transform hover:-translate-y-0.5 disabled:hover:translate-y-0 flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer font-sans"
          >
            <Printer className="w-4 h-4" /> Print Receipt
          </button>

          <button
            onClick={handleDownloadReceipt}
            disabled={pdfDownloading}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg hover:shadow-emerald-600/20 transition-all duration-300 transform hover:-translate-y-0.5 disabled:hover:translate-y-0 flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer font-sans"
          >
            {pdfDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Preparing PDF...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" /> Download Receipt (PDF)
              </>
            )}
          </button>
          
          <button
            onClick={() => {
              setSuccess(false);
              setSubmittedDetails(null);
            }}
            disabled={pdfDownloading}
            className="px-5 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold rounded-xl border border-slate-700 hover:text-white transition-all duration-300 flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer font-sans"
          >
            Register Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 backdrop-blur-lg rounded-2xl p-6 md:p-8 border border-white/10 shadow-2xl max-w-xl mx-auto">
      <h3 className="text-2xl font-bold font-serif text-white mb-2 text-center">
        Online <span className="text-blue-400">Student Admission</span> Form
      </h3>
      <p className="text-slate-300 text-xs text-center mb-6 leading-relaxed">
        Submit student details to apply for Spoken English or Academic Courses.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-xs text-center font-medium">
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full Name */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1" htmlFor="name">
            Student Full Name
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
              <User className="w-4 h-4 text-blue-500" />
            </span>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter your name"
              required
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg text-white placeholder-slate-600 outline-none transition-all text-sm"
            />
          </div>
        </div>

        {/* Mobile & Age Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1" htmlFor="mobile">
              Mobile Number
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                <Phone className="w-4 h-4 text-blue-500" />
              </span>
              <input
                type="tel"
                id="mobile"
                name="mobile"
                value={formData.mobile}
                onChange={handleChange}
                placeholder="e.g. 9532462057"
                maxLength={10}
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg text-white placeholder-slate-600 outline-none transition-all text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1" htmlFor="age">
              Student Age
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                <Calendar className="w-4 h-4 text-blue-500" />
              </span>
              <input
                type="number"
                id="age"
                name="age"
                value={formData.age}
                onChange={handleChange}
                placeholder="e.g. 18"
                min="4"
                max="100"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg text-white placeholder-slate-600 outline-none transition-all text-sm"
              />
            </div>
          </div>
        </div>

        {/* Email Address */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1" htmlFor="email">
            Email Address
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
              <Mail className="w-4 h-4 text-blue-500" />
            </span>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="e.g. name@example.com"
              required
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg text-white placeholder-slate-600 outline-none transition-all text-sm"
            />
          </div>
        </div>

        {/* Home Address */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1" htmlFor="address">
            Full Address
          </label>
          <div className="relative">
            <span className="absolute top-2.5 left-0 pl-3 flex items-start text-slate-400 pointer-events-none">
              <MapPin className="w-4 h-4 text-blue-500" />
            </span>
            <textarea
              id="address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Full physical address, e.g. Saraila Road, Dildar Nagar, Ghazipur"
              rows={3}
              required
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg text-white placeholder-slate-600 outline-none transition-all text-sm resize-none"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg hover:shadow-blue-500/20 active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed text-xs uppercase tracking-wider"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Submitting Details...
            </>
          ) : (
            "Complete Student Registration"
          )}
        </button>
      </form>
    </div>
  );
}
