import { google, drive_v3 } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import logger from '../lib/logger';

const GDRIVE_KEY_FILE = process.env.GDRIVE_KEY_FILE || '';
const GDRIVE_FOLDER_ID = process.env.GDRIVE_FOLDER_ID || '';
const GDRIVE_IMPERSONATE = process.env.GDRIVE_IMPERSONATE || '';
const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'uploads');

let driveClient: drive_v3.Drive | null = null;

function useGoogleDrive(): boolean {
  return !!(GDRIVE_KEY_FILE && GDRIVE_FOLDER_ID);
}

/**
 * Returns a prefix for storage paths based on environment.
 * Production: '' (no prefix)
 * Non-production: 'dev/' — creates a separate folder tree in Google Drive.
 */
function getStoragePrefix(): string {
  return process.env.NODE_ENV === 'production' ? '' : 'dev/';
}

function getDrive(): drive_v3.Drive {
  if (!driveClient) {
    const auth = new google.auth.GoogleAuth({
      keyFile: GDRIVE_KEY_FILE,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
      ...(GDRIVE_IMPERSONATE ? { clientOptions: { subject: GDRIVE_IMPERSONATE } } : {}),
    });
    driveClient = google.drive({ version: 'v3', auth });
  }
  return driveClient;
}

/**
 * Find or create a subfolder inside the root receipts folder.
 * Used to organize by date, e.g. "2026-04-07".
 */
async function getOrCreateSubfolder(parentId: string, folderName: string): Promise<string> {
  const drive = getDrive();
  const query = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({ q: query, fields: 'files(id)', spaces: 'drive' });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return folder.data.id!;
}

/**
 * Upload a buffer to storage. Returns the object path (relative key).
 * Google Drive: uploads to GDRIVE_FOLDER_ID/{date-subfolder}/{filename}
 * Local: writes to uploads/{objectPath}
 */
export async function uploadFile(
  objectPath: string,
  buffer: Buffer,
  contentType: string = 'image/jpeg'
): Promise<string> {
  if (useGoogleDrive()) {
    const drive = getDrive();
    const prefixedPath = getStoragePrefix() + objectPath;
    const parts = prefixedPath.split('/');
    const fileName = parts.pop()!;

    // Navigate/create subfolders (e.g. receipts/2026-04-07)
    let parentId = GDRIVE_FOLDER_ID;
    for (const part of parts) {
      parentId = await getOrCreateSubfolder(parentId, part);
    }

    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [parentId],
      },
      media: { mimeType: contentType, body: stream },
      fields: 'id',
    });

    logger.info({ objectPath, folderId: GDRIVE_FOLDER_ID }, 'Uploaded to Google Drive');
  } else {
    const prefixedPath = getStoragePrefix() + objectPath;
    const fullPath = path.join(LOCAL_UPLOADS_DIR, prefixedPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, buffer);
    logger.info({ objectPath, fullPath }, 'Uploaded to local filesystem');
  }
  return objectPath;
}

/**
 * Find a file by its objectPath in Google Drive.
 * Traverses the folder structure to locate the file.
 */
async function findFileByPath(objectPath: string): Promise<string | null> {
  const drive = getDrive();
  const prefixedPath = getStoragePrefix() + objectPath;
  const parts = prefixedPath.split('/');
  const fileName = parts.pop()!;

  let parentId = GDRIVE_FOLDER_ID;
  for (const part of parts) {
    const q = `name='${part}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' });
    if (!res.data.files || res.data.files.length === 0) return null;
    parentId = res.data.files[0].id!;
  }

  const q = `name='${fileName}' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' });
  if (!res.data.files || res.data.files.length === 0) return null;
  return res.data.files[0].id!;
}

/**
 * Get a URL to access the file.
 * Local: returns the full local file path for res.sendFile.
 * Google Drive: not used for serving — use downloadFile instead.
 */
export async function getFileUrl(objectPath: string): Promise<string> {
  if (useGoogleDrive()) {
    const fileId = await findFileByPath(objectPath);
    if (!fileId) throw new Error(`File not found in Google Drive: ${objectPath}`);
    return fileId;
  } else {
    return path.join(LOCAL_UPLOADS_DIR, getStoragePrefix() + objectPath);
  }
}

/**
 * Download file content as a Buffer from storage.
 * Used to serve images directly through the backend.
 */
export async function downloadFile(objectPath: string): Promise<Buffer> {
  if (useGoogleDrive()) {
    logger.info({ objectPath }, 'Downloading from Google Drive');
    const fileId = await findFileByPath(objectPath);
    if (!fileId) {
      logger.error({ objectPath }, 'File not found in Google Drive');
      throw new Error(`File not found in Google Drive: ${objectPath}`);
    }

    const drive = getDrive();
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    const buffer = Buffer.from(res.data as ArrayBuffer);
    logger.info({ objectPath, fileId, size: buffer.length }, 'Downloaded from Google Drive');
    return buffer;
  } else {
    const fullPath = path.join(LOCAL_UPLOADS_DIR, getStoragePrefix() + objectPath);
    logger.info({ objectPath, fullPath }, 'Reading from local filesystem');
    return fs.readFileSync(fullPath);
  }
}

/**
 * Check if we're using local storage (changes how the serve endpoint works).
 */
export function isLocalStorage(): boolean {
  return !useGoogleDrive();
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(objectPath: string): Promise<void> {
  if (useGoogleDrive()) {
    const fileId = await findFileByPath(objectPath);
    if (fileId) {
      const drive = getDrive();
      await drive.files.delete({ fileId });
      logger.info({ objectPath, fileId }, 'Deleted from Google Drive');
    }
  } else {
    const fullPath = path.join(LOCAL_UPLOADS_DIR, getStoragePrefix() + objectPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      logger.info({ objectPath, fullPath }, 'Deleted from local filesystem');
    }
  }
}

/**
 * Check if a file exists in storage.
 */
export async function fileExists(objectPath: string): Promise<boolean> {
  if (useGoogleDrive()) {
    const fileId = await findFileByPath(objectPath);
    return !!fileId;
  } else {
    return fs.existsSync(path.join(LOCAL_UPLOADS_DIR, getStoragePrefix() + objectPath));
  }
}
