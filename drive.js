import { google } from "googleapis";
import { Readable } from "node:stream";

let driveClient = null;

function isDriveConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
  );
}

function getDriveClient() {
  if (driveClient) return driveClient;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "urn:ietf:wg:oauth:2.0:oob"
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  driveClient = google.drive({ version: "v3", auth: oauth2Client });
  return driveClient;
}

function guessMimeType(url) {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  const map = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    aac: "audio/aac",
  };
  return map[ext] || "audio/mpeg";
}

/**
 * מעלה קובץ אודיו מכתובת נתונה ל-Google Drive של המשתמש (בזרימה, ללא טעינה מלאה לזיכרון).
 * מחזיר { link } בהצלחה, או זורק שגיאה אם ההעלאה נכשלה / לא מוגדרת.
 */
export async function uploadEpisodeToDrive({ audioUrl, filename }) {
  if (!isDriveConfigured()) {
    throw new Error(
      "העלאה ל-Drive לא מוגדרת (חסרים GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN)"
    );
  }

  const response = await fetch(audioUrl);
  if (!response.ok || !response.body) {
    throw new Error(`שגיאה בשליפת קובץ האודיו להעלאה: HTTP ${response.status}`);
  }

  const nodeStream = Readable.fromWeb(response.body);
  const drive = getDriveClient();

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || null;

  const file = await drive.files.create({
    requestBody: {
      name: filename,
      ...(folderId ? { parents: [folderId] } : {}),
    },
    media: {
      mimeType: guessMimeType(audioUrl),
      body: nodeStream,
    },
    fields: "id, webViewLink",
  });

  return { link: file.data.webViewLink, fileId: file.data.id };
}

export { isDriveConfigured };
