import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDocFromServer, setLogLevel } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Suppress benign Firestore transport warning logs in sandboxed environments
setLogLevel("error");

// Read configuration directly from our provisioned values
const firebaseConfig = {
  apiKey: "AIzaSyATJWyUxexZnL89AlvCdMsfMV2pZSB8BUc",
  authDomain: "smooth-firmament-l18qq.firebaseapp.com",
  projectId: "smooth-firmament-l18qq",
  storageBucket: "smooth-firmament-l18qq.firebasestorage.app",
  messagingSenderId: "399315913165",
  appId: "1:399315913165:web:3ee3b67088dc93e5b2dc84"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the custom database ID provisioned for this applet
export const db = getFirestore(app, "ai-studio-ea58b777-f24e-48ff-98cc-1e0e0369395f");

// Initialize Firebase Authentication
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function isFirestoreQuotaExceeded(): boolean {
  return typeof window !== "undefined" && localStorage.getItem("firestore_quota_exceeded") === "true";
}

export function markFirestoreQuotaExceeded() {
  if (typeof window !== "undefined") {
    localStorage.setItem("firestore_quota_exceeded", "true");
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  if (
    errMsg.includes("resource-exhausted") ||
    errMsg.includes("quota") ||
    errMsg.includes("Quota") ||
    errMsg.includes("exhausted")
  ) {
    markFirestoreQuotaExceeded();
  }
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// MANDATORY Validate Connection Check
async function testConnection() {
  try {
    // Try to read a test document directly from the server to check live connectivity
    await getDocFromServer(doc(db, "test", "connection"));
    
    // If successful, we have live connection and no quota issue! Clear quota mode.
    if (typeof window !== "undefined" && localStorage.getItem("firestore_quota_exceeded") === "true") {
      console.log("Firebase connection recovered! Clearing local fallback mode.");
      localStorage.removeItem("firestore_quota_exceeded");
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("local_only_media_")) {
          localStorage.removeItem(key);
        }
      }
      // Force reload to let components reconnect to the live Firestore listeners
      window.location.reload();
    } else {
      console.log("Firebase connection verified.");
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const isQuota = 
      errMsg.includes("resource-exhausted") ||
      errMsg.includes("quota") ||
      errMsg.includes("Quota") ||
      errMsg.includes("exhausted");

    if (isQuota) {
      markFirestoreQuotaExceeded();
    } else if (typeof window !== "undefined" && localStorage.getItem("firestore_quota_exceeded") === "true") {
      // If it's a non-quota error (like document-not-found), but we had a quota-exceeded flag,
      // it means the server is actually responding and we are NOT blocked by quota anymore.
      console.log("Firebase server responded (non-quota error). Restoring live connection.");
      localStorage.removeItem("firestore_quota_exceeded");
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("local_only_media_")) {
          localStorage.removeItem(key);
        }
      }
      window.location.reload();
    }

    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Please check your Firebase configuration or internet connection. Connection test failed.");
    }
  }
}

export async function resetFirestoreQuotaCheck(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  
  // Temporarily remove quota flag to run a live test
  localStorage.removeItem("firestore_quota_exceeded");
  
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("Database connection verified successfully.");
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("local_only_media_")) {
        localStorage.removeItem(key);
      }
    }
    return true;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const isQuota = 
      errMsg.includes("resource-exhausted") ||
      errMsg.includes("quota") ||
      errMsg.includes("Quota") ||
      errMsg.includes("exhausted");

    if (isQuota) {
      console.warn("Database connection test: Quota is still exhausted.");
      localStorage.setItem("firestore_quota_exceeded", "true");
      return false;
    }
    
    // A non-quota error (like document-not-found) implies that the database is fully online and responsive!
    console.log("Database connection test: Responsive (non-quota response).");
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("local_only_media_")) {
        localStorage.removeItem(key);
      }
    }
    return true;
  }
}

testConnection();
export default app;
