import nodemailer from "nodemailer";
import { uploadEpisodeToDrive, isDriveConfigured } from "./drive.js";

const MAX_ATTACHMENT_MB = Number(process.env.MAX_ATTACHMENT_MB || 25);

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "חסרים משתני סביבה לשליחת מייל: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS"
    );
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // true עבור פורט 465, false עבור 587/25
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter;
}

/**
 * בודק את גודל הקובץ בכתובת נתונה באמצעות בקשת HEAD.
 * מחזיר גודל ב-MB, או null אם לא ניתן לדעת.
 */
async function getRemoteFileSizeMB(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const len = res.headers.get("content-length");
    if (!len) return null;
    return Number(len) / (1024 * 1024);
  } catch {
    return null;
  }
}

/**
 * שולח מייל עבור פרק בודד. אם הקובץ גדול מדי (או שהגודל לא ידוע),
 * נשלח מייל עם קישור בלבד במקום קובץ מצורף.
 */
export async function sendEpisodeEmail({ to, from, podcastTitle, episode }) {
  const sizeMB = await getRemoteFileSizeMB(episode.audioUrl);
  const tooLarge = sizeMB !== null && sizeMB > MAX_ATTACHMENT_MB;
  const unknownSize = sizeMB === null;

  const subject = `${podcastTitle} - ${episode.title}`;
  const dateLine = episode.pubDate ? `תאריך פרסום: ${episode.pubDate}\n` : "";

  if (tooLarge || unknownSize) {
    const reason = tooLarge
      ? `הקובץ גדול מדי לצירוף (${sizeMB.toFixed(1)}MB, מעל המגבלה של ${MAX_ATTACHMENT_MB}MB)`
      : "לא ניתן היה לוודא את גודל הקובץ מראש";

    if (isDriveConfigured()) {
      try {
        const filename = buildFileName(episode.title, episode.audioUrl);
        const { link } = await uploadEpisodeToDrive({
          audioUrl: episode.audioUrl,
          filename,
        });

        await getTransporter().sendMail({
          from,
          to,
          subject: `${subject} (קובץ ב-Drive)`,
          text: `${dateLine}${reason}, לכן הקובץ הועלה ל-Google Drive שלך:\n${link}`,
        });

        return { title: episode.title, status: "drive", reason, link };
      } catch (driveErr) {
        // אם ההעלאה ל-Drive נכשלת, נופלים חזרה לשליחת קישור ישיר לקובץ המקורי
        await getTransporter().sendMail({
          from,
          to,
          subject: `${subject} (קישור בלבד - העלאה ל-Drive נכשלה)`,
          text: `${dateLine}${reason}. ניסיון ההעלאה ל-Drive נכשל (${driveErr.message}), לכן נשלח קישור להאזנה/הורדה מהמקור:\n${episode.audioUrl}`,
        });

        return {
          title: episode.title,
          status: "link-only",
          reason: `${reason}; העלאה ל-Drive נכשלה: ${driveErr.message}`,
        };
      }
    }

    await getTransporter().sendMail({
      from,
      to,
      subject: `${subject} (קישור בלבד)`,
      text: `${dateLine}${reason}, לכן נשלח קישור להאזנה/הורדה במקום קובץ מצורף:\n${episode.audioUrl}`,
    });

    return { title: episode.title, status: "link-only", reason };
  }

  await getTransporter().sendMail({
    from,
    to,
    subject,
    text: `${dateLine}הפרק מצורף לקובץ.`,
    attachments: [
      {
        filename: buildFileName(episode.title, episode.audioUrl),
        path: episode.audioUrl, // nodemailer יזרים את הקובץ ישירות מהכתובת
      },
    ],
  });

  return { title: episode.title, status: "attached", sizeMB };
}

export async function sendSummaryEmail({ to, from, podcastTitle, results, error }) {
  let text;

  if (error) {
    text = `אירעה שגיאה בעיבוד הפיד "${podcastTitle || ""}":\n${error.message}`;
  } else {
    const lines = results.map((r) => {
      if (r.status === "attached") return `✔ ${r.title} - נשלח כקובץ מצורף`;
      if (r.status === "drive") return `☁ ${r.title} - הועלה ל-Drive: ${r.link}`;
      if (r.status === "link-only") return `↪ ${r.title} - נשלח כקישור (${r.reason})`;
      return `✘ ${r.title} - נכשל: ${r.error}`;
    });
    text = `סיכום עיבוד הפודקאסט "${podcastTitle}":\n\n${lines.join("\n")}`;
  }

  await getTransporter().sendMail({
    from,
    to,
    subject: `סיכום שליחת פרקים - ${podcastTitle || "פודקאסט"}`,
    text,
  });
}

function buildFileName(title, url) {
  const ext = url.split("?")[0].split(".").pop()?.slice(0, 4) || "mp3";
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "").slice(0, 80);
  return `${safeTitle}.${ext}`;
}
