import { ZakatAssets, ZakatLiabilities } from "../types";

export interface SavedZakatData {
  version: string;
  savedAt: string;
  currency: string;
  nisabStandard: "gold" | "silver";
  assets: ZakatAssets;
  liabilities: ZakatLiabilities;
  summary: {
    netAssets: number;
    zakatOwed: number;
    nisabThreshold: number;
  };
}

export interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
  size?: string;
}

/**
 * Lists JSON files in the user's Google Drive that have "zakat_calc_" in their name.
 */
export async function listZakatFiles(accessToken: string): Promise<DriveFile[]> {
  const query = "name contains 'zakat_calc_' and mimeType = 'application/json' and trashed = false";
  const fields = "files(id, name, createdTime, size)";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&orderBy=createdTime+desc`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || "Failed to list files from Google Drive");
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Saves a new Zakat calculation file to Google Drive.
 */
export async function saveZakatFile(
  accessToken: string,
  fileName: string,
  content: SavedZakatData
): Promise<DriveFile> {
  // 1. Create file metadata
  const metadataUrl = "https://www.googleapis.com/drive/v3/files";
  const metadataRes = await fetch(metadataUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: fileName.endsWith(".json") ? fileName : `${fileName}.json`,
      mimeType: "application/json",
      description: "Saved Zakat Calculation Report",
    }),
  });

  if (!metadataRes.ok) {
    const errData = await metadataRes.json().catch(() => ({}));
    throw new Error(errData?.error?.message || "Failed to create Google Drive file metadata");
  }

  const fileMetadata = await metadataRes.json();
  const fileId = fileMetadata.id;

  // 2. Upload file content
  const contentUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  const contentRes = await fetch(contentUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(content, null, 2),
  });

  if (!contentRes.ok) {
    const errData = await contentRes.json().catch(() => ({}));
    throw new Error(errData?.error?.message || "Failed to upload Zakat data to Google Drive");
  }

  return {
    id: fileId,
    name: fileMetadata.name || fileName,
    createdTime: new Date().toISOString(),
  };
}

/**
 * Downloads a Zakat file's JSON content from Google Drive.
 */
export async function loadZakatFileContent(
  accessToken: string,
  fileId: string
): Promise<SavedZakatData> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || "Failed to download file from Google Drive");
  }

  return await res.json();
}

/**
 * Deletes a file from Google Drive.
 */
export async function deleteZakatFile(accessToken: string, fileId: string): Promise<void> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || "Failed to delete file from Google Drive");
  }
}
