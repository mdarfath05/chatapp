/**
 * Google Drive Integration for CipherChat Backups
 *
 * Uses Google Drive API v3 via gapi (Google API Client Library)
 * The backup file is stored in the user's OWN Google Drive
 * in a folder called "CipherChat Backups"
 *
 * Setup required:
 * 1. Create project at https://console.cloud.google.com
 * 2. Enable Google Drive API
 * 3. Create OAuth 2.0 credentials (Web application)
 * 4. Add your domain to authorized origins
 * 5. Set REACT_APP_GOOGLE_CLIENT_ID in .env
 */

const FOLDER_NAME = 'CipherChat Backups';
const FILE_NAME = 'cipherchat_backup.cipherchat';
const MIME_TYPE = 'application/json';
const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient = null;
let accessToken = null;

/**
 * Load the Google Identity Services script dynamically
 */
const loadGoogleScript = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });

const loadGapiScript = () =>
  new Promise((resolve, reject) => {
    if (window.gapi) return resolve();
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('client', async () => {
        await window.gapi.client.init({
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        });
        resolve();
      });
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });

/**
 * Authenticate with Google and get access token
 */
export const authenticateGoogle = async () => {
  if (!CLIENT_ID) {
    throw new Error(
      'Google Client ID not configured. Add REACT_APP_GOOGLE_CLIENT_ID to your .env file.'
    );
  }

  await Promise.all([loadGoogleScript(), loadGapiScript()]);

  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) return reject(new Error(response.error));
        accessToken = response.access_token;
        window.gapi.client.setToken({ access_token: accessToken });
        resolve(accessToken);
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
};

/**
 * Get or create the CipherChat Backups folder in Drive
 */
const getOrCreateFolder = async () => {
  // Search for existing folder
  const search = await window.gapi.client.drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
  });

  if (search.result.files.length > 0) {
    return search.result.files[0].id;
  }

  // Create folder
  const folder = await window.gapi.client.drive.files.create({
    resource: {
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  return folder.result.id;
};

/**
 * Upload encrypted backup to Google Drive
 * Returns the Drive file ID
 */
export const uploadToDrive = async (encryptedBackupContent, username) => {
  if (!accessToken) {
    throw new Error('Not authenticated with Google. Please sign in first.');
  }

  const folderId = await getOrCreateFolder();
  const fileName = `cipherchat_${username}_backup.cipherchat`;

  // Check if backup file already exists
  const search = await window.gapi.client.drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id, name)',
  });

  const blob = new Blob([encryptedBackupContent], { type: MIME_TYPE });

  if (search.result.files.length > 0) {
    // Update existing file
    const fileId = search.result.files[0].id;
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: fileName })], { type: 'application/json' }));
    form.append('file', blob);

    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
      {
        method: 'PATCH',
        headers: new Headers({ Authorization: `Bearer ${accessToken}` }),
        body: form,
      }
    );
    const data = await res.json();
    return data.id;
  } else {
    // Create new file
    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: MIME_TYPE,
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: new Headers({ Authorization: `Bearer ${accessToken}` }),
        body: form,
      }
    );
    const data = await res.json();
    return data.id;
  }
};

/**
 * Download backup file from Google Drive by file ID
 * Returns the file content as a string
 */
export const downloadFromDrive = async (fileId) => {
  if (!accessToken) {
    throw new Error('Not authenticated with Google. Please sign in first.');
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) throw new Error('Failed to download from Google Drive');
  return res.text();
};

/**
 * List CipherChat backup files in Drive
 */
export const listDriveBackups = async () => {
  if (!accessToken) return [];

  try {
    const res = await window.gapi.client.drive.files.list({
      q: `name contains 'cipherchat' and name contains '.cipherchat' and trashed=false`,
      fields: 'files(id, name, size, modifiedTime)',
      orderBy: 'modifiedTime desc',
    });
    return res.result.files;
  } catch {
    return [];
  }
};

export const isAuthenticated = () => !!accessToken;
