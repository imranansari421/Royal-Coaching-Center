export interface FeeRecord {
  id: string;
  month: string;
  amountPaid: number;
  totalDue: number;
  paymentDate: string;
  paymentStatus: "Paid" | "Partially Paid" | "Unpaid";
  remarks?: string;
}

export interface Student {
  id?: string;
  name: string;
  mobile: string;
  email: string;
  address: string;
  age: number;
  status: "Pending" | "Approved" | "Rejected";
  timestamp: string; // ISO string representation of submission time
  viewed: boolean; // Tracking for unread admin notifications
  
  // Student Management & Fee fields
  joiningDate?: string;
  exitDate?: string;
  exitStatus?: "Active" | "Exited";
  fees?: FeeRecord[];
  
  // Additional fields for student details editing
  fatherName?: string;
  className?: string;
  stream?: string;
}

export interface HighlightItem {
  title: string;
  desc: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface BatchSchedule {
  id: string;
  className: string;
  days: string;
  timing: string;
  subject: string;
  instructor: string;
}

export interface WebsiteSettings {
  slogan: string;
  experienceYears: number;
  studentsTrained: number;
  successRate: number;
  contactPhone1: string;
  contactPhone2: string;
  
  // Custom Admin Credentials (persistent in settings/main)
  adminId?: string;
  adminPassword?: string;
  adminPin?: string;
  passwordLastUpdated?: string; // ISO string
  
  // Custom Sections content
  highlights?: HighlightItem[];
  experienceText?: string;
  aboutUsText?: string;
  aboutUsImage?: string; // base64 or URL
  videoAUrl?: string;
  videoBUrl?: string;
  videoCUrl?: string;
  
  // New customizable sections
  faqs?: FAQItem[];
  schedules?: BatchSchedule[];
  adminEmailForNotifications?: string;
}

