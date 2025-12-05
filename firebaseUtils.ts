// ...existing imports...
import * as FileSystem from "expo-file-system/legacy";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc, // Ensure updateDoc is imported
  query,
  where,
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { db } from "./firebase";

/**
 * Upload a local image URI (expo) to Firebase Storage and return its download URL.
 * @param uri local file URI (e.g. from ImagePicker)
 * @param path storage path, e.g. `users/{uid}/items/{filename}.jpg`
 */
export async function uploadImageAsync(
  uri: string,
  path: string
): Promise<string> {
  try {
    // Primary attempt: fetch the file and convert to blob
    const response = await fetch(uri);
    const blob = await response.blob();

    const storage = getStorage();
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    return url;
  } catch (primaryErr: any) {
    // Surface more details in dev logs to help diagnose storage errors
    if (__DEV__) {
      try {
        console.error(
          "uploadImageAsync primary upload failed",
          primaryErr && primaryErr.code
            ? {
                code: primaryErr.code,
                message: primaryErr.message,
                serverResponse: primaryErr.serverResponse,
              }
            : primaryErr
        );
      } catch (logErr) {
        console.error(
          "uploadImageAsync failed (could not stringify error)",
          primaryErr
        );
      }
    }

    // Provide a helpful hint to developers and include the original error
    const hint =
      "Hint: verify your Firebase Storage bucket name, storage rules and that the app is authenticated. Check the value of FIREBASE_STORAGE_BUCKET in your environment and the bucket configuration in the Firebase Console.";
    const wrapped: any = new Error(
      `uploadImageAsync failed: ${primaryErr?.message ?? primaryErr}. ${hint}`
    );
    wrapped.code = primaryErr?.code ?? "storage/unknown";
    wrapped.original = primaryErr;
    throw wrapped;
  }
}

/**
 * Save an image locally inside the app document directory and return the local path (id).
 * The files will be stored under: FileSystem.documentDirectory + 'uploads/{uid}/{filename}'
 */
async function saveImageLocally(
  uid: string,
  uri: string,
  folder: string
): Promise<string> {
  try {
    const docDir = (FileSystem as any).documentDirectory || "";
    // Mirror the project's asset folder structure inside the app document directory so
    // saved files appear under: <documentDirectory>/assets/images/uploads/{folder}/{uid}/{filename}
    const uploadsRoot = `${docDir}assets/images/uploads`;
    const userFolder = `${uploadsRoot}/${folder}/${uid}`;
    // ensure directories exist
    await FileSystem.makeDirectoryAsync(userFolder, { intermediates: true });

    const extMatch = uri.match(/\.([^.?#]+)(?:[?#].*)?$/);
    const ext = extMatch ? extMatch[1] : "jpg";
    const filename = `${folder}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}.${ext}`;
    const dest = `${userFolder}/${filename}`;

    // Copy the file to the local app folder
    await FileSystem.copyAsync({ from: uri, to: dest });
    // Return a stable local path reference we can store in Firestore.
    return dest;
  } catch (e) {
    if (__DEV__) console.error("saveImageLocally failed", e);
    throw e;
  }
}

/**
 * Checks if a name (case-insensitive) already exists in a given collection.
 *
 * @param uid User ID
 * @param collectionName 'items' or 'recipes'
 * @param name The name to check for uniqueness
 * @param excludeId Optional ID of the document to exclude from the check (for updates)
 * @returns true if a duplicate name exists, false otherwise.
 */
async function checkIfNameExists(
  uid: string,
  collectionName: "items" | "recipes",
  name: string,
  excludeId?: string
): Promise<boolean> {
  const lowerCaseName = name.toLowerCase();
  const q = query(
    collection(db, "users", uid, collectionName),
    where("name_lower", "==", lowerCaseName)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) return false; // No item with this name

  // If there are documents with this name:
  if (excludeId) {
    // If an excludeId is provided (we are updating an existing document),
    // check if the found document is *not* the one we are excluding.
    // If it's the *same* document, it's not a duplicate.
    return snapshot.docs.some((doc) => doc.id !== excludeId);
  }

  // No excludeId, so any document with this name means a duplicate.
  return true;
}

/**
 * Add an item document for a user, optionally uploading a photo first.
 * @param uid user's uid
 * @param data item data (name required)
 */
export async function addItemForUser(
  uid: string,
  data: {
    name: string;
    quantity?: number;
    unit?: string;
    notes?: string;
    expiry?: Date | null;
    photoUri?: string | null;
  }
) {
  // Check for duplicate name before adding
  const isDuplicate = await checkIfNameExists(uid, "items", data.name);
  if (isDuplicate) {
    throw new Error(
      `An item named "${data.name}" already exists in your kitchen.`
    );
  }

  let photoURL: string | null = null;
  if (data.photoUri) {
    // Save a local copy and do NOT attempt cloud upload — app is running in local-only mode for images.
    try {
      const local = await saveImageLocally(uid, data.photoUri, "items");
      (data as any)._localPath = local;
      photoURL = null; // explicit: no cloud URL because uploads are disabled
    } catch (le) {
      // If local save fails, log and continue without photo
      console.error(
        "saveImageLocally failed for item; no image will be attached",
        le
      );
      photoURL = null;
    }
  }

  const docRef = await addDoc(collection(db, "users", uid, "items"), {
    name: data.name,
    // store a lowercase copy to help with duplicate checks (case-insensitive)
    name_lower: (data.name || "").toLowerCase(),
    quantity: data.quantity ?? 1,
    unit: data.unit ?? "pcs",
    notes: data.notes ?? "",
    photoURL: photoURL,
    localPath: (data as any)._localPath ?? null,
    expiry: data.expiry ?? null,
    addedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Add a recipe document for a user, optionally uploading a photo first.
 * Stored under `users/{uid}/recipes`.
 */
export async function addRecipeForUser(
  uid: string,
  data: {
    name: string;
    notes?: string;
    photoUri?: string | null;
    ingredients?: { name: string; qty?: number; unit?: string }[];
    steps?: string[];
    servings?: number;
    isFavorite?: boolean; // Added for favorite feature
  }
) {
  // Check for duplicate name before adding
  const isDuplicate = await checkIfNameExists(uid, "recipes", data.name);
  if (isDuplicate) {
    throw new Error(`A recipe named "${data.name}" already exists.`);
  }

  let photoURL: string | null = null;
  if (data.photoUri) {
    // Save a local copy and do NOT attempt cloud upload — keep localPath for UI rendering
    try {
      const local = await saveImageLocally(uid, data.photoUri, "recipes");
      (data as any)._localPath = local;
      photoURL = null;
    } catch (le) {
      console.error(
        "saveImageLocally failed for recipe; no image will be attached",
        le
      );
      photoURL = null;
    }
  }

  const docRef = await addDoc(collection(db, "users", uid, "recipes"), {
    name: data.name,
    // lowercase copy for duplicate checks
    name_lower: (data.name || "").toLowerCase(),
    notes: data.notes ?? "",
    photoURL: photoURL,
    localPath: (data as any)._localPath ?? null,
    ingredients: data.ingredients ?? [],
    steps: data.steps ?? [],
    servings: data.servings ?? null,
    isFavorite: data.isFavorite ?? false, // Initialize as false if not provided
    addedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Update an existing recipe document for a user.
 * @param uid user's uid
 * @param recipeId ID of the recipe document to update
 * @param data partial recipe data to update
 */
export async function updateRecipeForUser(
  uid: string,
  recipeId: string,
  data: {
    name?: string;
    notes?: string;
    ingredients?: { name: string; qty?: number; unit?: string }[];
    steps?: string[];
    servings?: number;
    isFavorite?: boolean; // Added for favorite feature
    // expiry?: Date | null; // Recipes generally don't have expiry, but if needed, add here
  }
) {
  const recipeRef = doc(db, "users", uid, "recipes", recipeId);

  if (data.name !== undefined) {
    // Only check for duplicates if name is being updated
    const isDuplicate = await checkIfNameExists(
      uid,
      "recipes",
      data.name,
      recipeId
    );
    if (isDuplicate) {
      throw new Error(`A recipe named "${data.name}" already exists.`);
    }
  }

  const payload: any = {
    updatedAt: serverTimestamp(),
  };

  if (data.name !== undefined) {
    payload.name = data.name;
    payload.name_lower = (data.name || "").toLowerCase();
  }
  if (data.notes !== undefined) payload.notes = data.notes;
  if (data.ingredients !== undefined) payload.ingredients = data.ingredients;
  if (data.steps !== undefined) payload.steps = data.steps;
  if (data.servings !== undefined) payload.servings = data.servings;
  if (data.isFavorite !== undefined) payload.isFavorite = data.isFavorite; // Add this
  // if (data.expiry !== undefined) payload.expiry = data.expiry; // If expiry is part of recipe

  await updateDoc(recipeRef, payload);
}

/**
 * Record a usage entry for a user.
 * Stored under `users/{uid}/usage`.
 */
export async function addUsageForUser(
  uid: string,
  data: {
    itemId?: string; // Added for linking usage to a kitchen item
    name: string;
    qty: number;
    unit?: string;
    type?: "consumption" | "note";
    note?: string | null;
    previousQuantity?: number | null; // Added for tracking quantity changes
    newQuantity?: number | null; // Added for tracking quantity changes
  }
) {
  const docRef = await addDoc(collection(db, "users", uid, "usage"), {
    itemId: data.itemId ?? null,
    name: data.name,
    qty: data.qty,
    unit: data.unit ?? null,
    type: data.type ?? "consumption",
    note: data.note ?? null,
    previousQuantity: data.previousQuantity ?? null,
    newQuantity: data.newQuantity ?? null,
    at: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Upload local images found in user's documents (items/recipes) to Firebase Storage and update docs.
 * Call this when Firebase Storage is available (billing/rules fixed).
 */
export async function syncLocalImagesForUser(uid: string) {
  const storage = getStorage();

  async function syncCollection(colName: string) {
    try {
      const collRef = collection(db, "users", uid, colName);
      const snap = await getDocs(collRef);
      for (const d of snap.docs) {
        const data = d.data() as any;
        const localPath = data.localPath;
        if (!localPath) continue;
        try {
          // Read local file and upload as blob
          const resp = await fetch(localPath);
          const blob = await resp.blob();
          const filename = `${colName}/${d.id}.jpg`;
          const storageRef = ref(storage, `users/${uid}/${filename}`);
          await uploadBytes(storageRef, blob);
          const url = await getDownloadURL(storageRef);
          const docRef = doc(db, "users", uid, colName, d.id);
          await updateDoc(docRef, { photoURL: url, localPath: null });
          // delete local file to save space
          try {
            await FileSystem.deleteAsync(localPath, { idempotent: true });
          } catch (e) {
            if (__DEV__)
              console.warn(
                "Failed to delete local file after sync",
                localPath,
                e
              );
          }
        } catch (e) {
          console.error("Failed to sync local image for doc", d.id, e);
        }
      }
    } catch (e) {
      console.error("syncCollection failed", colName, e);
    }
  }

  await syncCollection("items");
  await syncCollection("recipes");
  // optionally sync profile localPath (stored on users/{uid})
  try {
    const { getDoc } = await import("firebase/firestore");
    const profileRef = doc(db, "users", uid);
    const profileSnap = await getDoc(profileRef);
    if (profileSnap.exists()) {
      const pdata = profileSnap.data() as any;
      if (pdata?.localPath) {
        try {
          const resp = await fetch(pdata.localPath);
          const blob = await resp.blob();
          const filename = `profile/${uid}.jpg`;
          const storageRef = ref(storage, `users/${uid}/${filename}`);
          await uploadBytes(storageRef, blob);
          const url = await getDownloadURL(storageRef);
          await updateDoc(profileRef, { photoURL: url, localPath: null });
          try {
            await FileSystem.deleteAsync(pdata.localPath, { idempotent: true });
          } catch (e) {
            if (__DEV__) console.warn("Failed to delete local profile file", e);
          }
        } catch (e) {
          console.error("Failed to sync local profile image", e);
        }
      }
    }
  } catch (e) {
    if (__DEV__) console.warn("Profile sync step failed", e);
  }
}

/**
 * Get user's profile document stored at `users/{uid}/profile`.
 */
export async function getUserProfile(uid: string) {
  const { doc, getDoc } = await import("firebase/firestore");
  // store profile fields on the user document at `users/{uid}`
  const profileRef = doc(db, "users", uid);
  const snapshot = await getDoc(profileRef);
  if (!snapshot.exists()) return null;
  return snapshot.data();
}

/**
 * Update user's profile; if photoUri provided it will be uploaded.
 */
export async function updateUserProfile(
  uid: string,
  data: {
    username?: string;
    photoUri?: string | null;
    theme?: "light" | "dark" | "system" | null;
  }
) {
  const { doc, setDoc } = await import("firebase/firestore");
  let photoURL: string | null = null;
  let localPathForProfile: string | null = null;
  if (data.photoUri) {
    // Save locally and do not attempt cloud upload (local-only mode)
    try {
      const local = await saveImageLocally(uid, data.photoUri, "profile");
      localPathForProfile = local;
      photoURL = null;
    } catch (le) {
      console.error(
        "saveImageLocally failed for profile; no image will be attached",
        le
      );
      photoURL = null;
    }
  }

  const profileRef = doc(db, "users", uid);
  const payload: any = {
    username: data.username ?? null,
    photoURL: photoURL,
    updatedAt: serverTimestamp(),
  };
  if (localPathForProfile) payload.localPath = localPathForProfile;
  if (data.theme !== undefined) payload.theme = data.theme;

  await setDoc(profileRef, payload, { merge: true });
}