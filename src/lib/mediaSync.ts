import { db, isFirestoreQuotaExceeded, markFirestoreQuotaExceeded } from "./firebase";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { saveFile, deleteFile, getFile } from "./indexedDb";

// Helper function to compress images using HTML5 Canvas
function compressImage(file: Blob, maxWidth: number = 800, maxHeight: number = 800, quality: number = 0.7): Promise<Blob> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/") || file.type === "image/gif") {
      resolve(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                resolve(file);
              }
            },
            "image/jpeg",
            quality
          );
        } else {
          resolve(file);
        }
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// Split string into chunks of given size (characters)
function chunkString(str: string, size: number): string[] {
  const chunks = [];
  let offset = 0;
  while (offset < str.length) {
    chunks.push(str.substring(offset, offset + size));
    offset += size;
  }
  return chunks;
}

export async function uploadMedia(
  id: string, 
  file: Blob, 
  onProgress?: (percent: number) => void
): Promise<{ localOnly: boolean }> {
  // Compress image if applicable to save tons of database writes & space!
  let uploadFile = file;
  if (file.type.startsWith("image/") && file.type !== "image/gif") {
    try {
      uploadFile = await compressImage(file);
      console.log(`[mediaSync] Optimized image size: ${(file.size / 1024).toFixed(1)}KB -> ${(uploadFile.size / 1024).toFixed(1)}KB`);
    } catch (err) {
      console.warn("[mediaSync] Failed to compress image, using original:", err);
    }
  }

  return new Promise((resolve, reject) => {
    onProgress?.(0);
    
    // Set up a smooth simulated progress ticker to prevent staying at 0%
    let currentProgress = 0;
    const updateProgress = (target: number) => {
      if (target > currentProgress) {
        currentProgress = target;
        onProgress?.(currentProgress);
      }
    };

    // Ticker smoothly advances progress from 0 to 90% over ~3.5 seconds
    const progressInterval = setInterval(() => {
      if (currentProgress < 90) {
        const increment = Math.max(1, Math.round((90 - currentProgress) / 8));
        updateProgress(currentProgress + increment);
      }
    }, 150);

    const cleanupAndComplete = (percent: number) => {
      clearInterval(progressInterval);
      onProgress?.(percent);
    };

    const reader = new FileReader();
    reader.onerror = () => {
      cleanupAndComplete(0);
      reject(reader.error);
    };
    reader.onload = async () => {
      try {
        const base64String = reader.result as string;
        const mimeType = uploadFile.type;
        const chunkSize = 500000; // ~500KB character chunks
        const chunks = chunkString(base64String, chunkSize);
        const updatedAt = Date.now();
        let localOnly = false;

        if (isFirestoreQuotaExceeded()) {
          localOnly = true;
          localStorage.setItem(`local_only_media_${id}`, "true");
          cleanupAndComplete(100);
        } else {
          try {
            // Helper function to race a promise with a timeout
            const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> => {
              return Promise.race([
                promise,
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
                )
              ]);
            };

            // 1. Save chunks FIRST in batches of 4 to avoid overwhelming the Firestore write stream
            const batchSize = 4;
            let completedChunks = 0;
            for (let i = 0; i < chunks.length; i += batchSize) {
              const batch = chunks.slice(i, i + batchSize);
              const promises = batch.map((chunk, index) => {
                const chunkIndex = i + index;
                const chunkDocRef = doc(db, "media", id, "chunks", String(chunkIndex));
                
                // Set a 4-second timeout on each write to avoid hanging if offline or quota-exceeded
                return withTimeout(
                  setDoc(chunkDocRef, { data: chunk }),
                  4000,
                  "Timeout: Firestore write is taking too long (possibly offline or quota reached)"
                );
              });
              await Promise.all(promises);
              completedChunks += batch.length;
              const actualPercent = Math.round((completedChunks / chunks.length) * 90);
              updateProgress(actualPercent);
            }

            // 2. Commit metadata LAST
            const mediaDocRef = doc(db, "media", id);
            await withTimeout(
              setDoc(mediaDocRef, {
                id,
                mimeType,
                totalChunks: chunks.length,
                updatedAt
              }),
              4000,
              "Timeout: Firestore metadata write is taking too long"
            );
            
            // Clear any stale local-only flag if we successfully uploaded to the cloud
            localStorage.removeItem(`local_only_media_${id}`);
            cleanupAndComplete(100);
          } catch (serverErr: any) {
            console.warn("Firestore upload failed (possibly due to quota limit exceeded). Falling back to local-only persistence:", serverErr);
            const errStr = String(serverErr);
            const isQuotaError = 
              serverErr.code === "resource-exhausted" ||
              serverErr.code === "quota-exceeded" ||
              errStr.includes("Quota") ||
              errStr.includes("quota") ||
              errStr.includes("exhausted") ||
              errStr.includes("permission") ||
              errStr.includes("Permission") ||
              errStr.includes("Timeout");

            if (isQuotaError) {
              localOnly = true;
              localStorage.setItem(`local_only_media_${id}`, "true");
              markFirestoreQuotaExceeded();
            } else {
              throw serverErr;
            }
            cleanupAndComplete(100);
          }
        }

        // 3. Save locally to IndexedDB for instant preview/local cache
        await saveFile(id, uploadFile);
        localStorage.setItem(`cached_media_time_${id}`, String(updatedAt));

        resolve({ localOnly });
      } catch (err) {
        cleanupAndComplete(0);
        reject(err);
      }
    };
    reader.readAsDataURL(uploadFile);
  });
}

export async function syncMedia(id: string): Promise<Blob | null> {
  // Check if media is marked as local-only or if general Firestore quota is exceeded
  if (localStorage.getItem(`local_only_media_${id}`) === "true" || isFirestoreQuotaExceeded()) {
    return await getFile(id);
  }

  try {
    // 1. Get Firestore metadata
    const mediaDocRef = doc(db, "media", id);
    const mediaSnap = await getDoc(mediaDocRef);

    if (!mediaSnap.exists()) {
      // If media doesn't exist on server, check if we have it locally.
      // If deleted on server, we clean it up locally too.
      const localFile = await getFile(id);
      if (localFile) {
        await deleteFile(id);
        localStorage.removeItem(`cached_media_time_${id}`);
      }
      return null;
    }

    const { mimeType, totalChunks, updatedAt } = mediaSnap.data() as {
      mimeType: string;
      totalChunks: number;
      updatedAt: number;
    };

    // 2. Check local cache
    const cachedTimeStr = localStorage.getItem(`cached_media_time_${id}`);
    const cachedTime = cachedTimeStr ? parseInt(cachedTimeStr, 10) : 0;
    const localFile = await getFile(id);

    if (localFile && cachedTime >= updatedAt) {
      // Local cache is up-to-date!
      return localFile;
    }

    // 3. Cache is missing or outdated. Download chunks in parallel!
    const chunkPromises = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkDocRef = doc(db, "media", id, "chunks", String(i));
      chunkPromises.push(getDoc(chunkDocRef));
    }

    const chunkSnaps = await Promise.all(chunkPromises);
    const base64Parts = [];
    for (const snap of chunkSnaps) {
      if (!snap.exists()) {
        console.warn(`Chunk ${snap.id} of media ${id} is missing on the server! Sync incomplete.`);
        // Fallback to local if we have it, otherwise return null gracefully
        return localFile || null;
      }
      base64Parts.push(snap.data()?.data as string);
    }

    const fullBase64 = base64Parts.join("");

    // Convert Base64 back to Blob
    const arr = fullBase64.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || mimeType || "";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mime });

    // 4. Save to local IndexedDB and update cache timestamp
    await saveFile(id, blob);
    localStorage.setItem(`cached_media_time_${id}`, String(updatedAt));

    return blob;
  } catch (err) {
    console.warn(`Error syncing media ${id} from Firestore:`, err);
    const errStr = String(err);
    if (
      errStr.includes("resource-exhausted") ||
      errStr.includes("quota") ||
      errStr.includes("Quota") ||
      errStr.includes("exhausted")
    ) {
      markFirestoreQuotaExceeded();
    }
    // Fallback to local if server sync fails
    const localFile = await getFile(id);
    return localFile || null;
  }
}

export async function deleteMedia(id: string): Promise<void> {
  try {
    // 1. Get metadata to find total chunks
    const mediaDocRef = doc(db, "media", id);
    const mediaSnap = await getDoc(mediaDocRef);

    if (mediaSnap.exists()) {
      const { totalChunks } = mediaSnap.data() as { totalChunks: number };
      
      // Delete all chunks in batches of 5 to avoid overwhelming the Firestore write stream
      const batchSize = 5;
      for (let i = 0; i < totalChunks; i += batchSize) {
        const batchPromises = [];
        const limit = Math.min(i + batchSize, totalChunks);
        for (let j = i; j < limit; j++) {
          const chunkDocRef = doc(db, "media", id, "chunks", String(j));
          batchPromises.push(deleteDoc(chunkDocRef));
        }
        await Promise.all(batchPromises);
      }
      
      // Delete metadata
      await deleteDoc(mediaDocRef);
    }

    // 2. Delete local file
    await deleteFile(id);
    localStorage.removeItem(`cached_media_time_${id}`);
  } catch (err) {
    console.error(`Error deleting media ${id}:`, err);
    const errStr = String(err);
    if (
      errStr.includes("resource-exhausted") ||
      errStr.includes("quota") ||
      errStr.includes("Quota") ||
      errStr.includes("exhausted")
    ) {
      markFirestoreQuotaExceeded();
    }
    // Ensure we delete locally even if server delete fails
    await deleteFile(id);
    localStorage.removeItem(`cached_media_time_${id}`);
  }
}
