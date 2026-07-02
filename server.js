import express from "express";
import { fetchPodcastEpisodes } from "./lib/rss.js";
import { sendEpisodeEmail, sendSummaryEmail } from "./lib/mailer.js";
import { Agent, setGlobalDispatcher } from 'undici';

// פתרון שגיאת ה-Timeout: הגדרת זמן ההמתנה ל-0 (ללא הגבלה) עבור הורדת קבצים גדולים
setGlobalDispatcher(new Agent({ bodyTimeout: 0, headersTimeout: 0 }));

const app = express();
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const ACCESS_KEY = process.env.ACCESS_KEY || null; // אם מוגדר, נדרש שדה תואם בטופס
const FROM_EMAIL = process.env.SMTP_FROM || process.env.SMTP_USER;
const DEFAULT_TO = process.env.DEFAULT_TO_EMAIL || "";

app.get("/", (req, res) => {
  res.send(renderForm());
});

app.post("/send", async (req, res) => {
  const { rssUrl, toEmail, maxEpisodes, accessKey } = req.body;

  if (ACCESS_KEY && accessKey !== ACCESS_KEY) {
    console.warn(`[אבטחה] ניסיון גישה נדחה: מפתח שגוי מכתובת ה-IP של המבקש.`);
    return res.status(403).send(renderForm("מפתח הגישה שגוי."));
  }

  if (!rssUrl || !toEmail) {
    return res.status(400).send(renderForm("יש למלא קישור RSS וכתובת מייל."));
  }

  const limit = Math.max(1, Math.min(200, Number(maxEpisodes) || 10));

  // מגיבים מיד למשתמש ומעבדים ברקע כדי לא להיתקע על timeout של הדפדפן
  res.send(renderStarted(toEmail));

  // הפעלת תהליך העיבוד ברקע עם לוג ייעודי להתחלה
  console.log(`\n[התחלת תהליך] התקבלה בקשה עבור הפיד: ${rssUrl} | יעד: ${toEmail} | הגבלה: ${limit} פרקים.`);
  
  processFeed({ rssUrl, toEmail, limit }).catch((err) => {
    console.error("[שגיאה קריטית] שגיאה שלא נתפסה בעיבוד הפיד ברקע:", err);
  });
});

async function processFeed({ rssUrl, toEmail, limit }) {
  let podcastTitle = "פודקאסט ללא שם";
  
  try {
    console.log(`[RSS] מנסה למשוך ולפענח את הפיד...`);
    const { podcastTitle: title, episodes } = await fetchPodcastEpisodes(rssUrl);
    podcastTitle = title;
    
    console.log(`[RSS] הפיד פוענח בהצלחה! שם הפודקאסט: "${podcastTitle}". נמצאו ${episodes.length} פרקים סה"כ.`);

    const episodesToSend = episodes.slice(0, limit);
    console.log(`[עיבוד] מתוכם, נשלחים כעת ${episodesToSend.length} פרקים (לפי ההגבלה שנקבעה).`);
    
    const results = [];
    let count = 1;

    for (const episode of episodesToSend) {
      console.log(`[פרק ${count}/${episodesToSend.length}] מתחיל לעבד ולשלוח: "${episode.title}"`);
      
      try {
        const result = await sendEpisodeEmail({
          to: toEmail,
          from: FROM_EMAIL,
          podcastTitle,
          episode,
        });
        
        console.log(`[פרק ${count}/${episodesToSend.length}] המייל נשלח בהצלחה!`);
        results.push(result);
      } catch (err) {
        console.error(`[פרק ${count}/${episodesToSend.length}] נכשל בשל שגיאה: ${err.message}`);
        results.push({ title: episode.title, status: "failed", error: err.message });
      }
      count++;
    }

    console.log(`[סיכום] כל הפרקים עובדו. מכין ושולח מייל סיכום סופי ל-${toEmail}...`);
    await sendSummaryEmail({ to: toEmail, from: FROM_EMAIL, podcastTitle, results });
    console.log(`[סיום בהצלחה] תהליך הפיד עבור "${podcastTitle}" הסתיים ומייל הסיכום נשלח.\n`);

  } catch (err) {
    console.error(`[שגיאה כללית] תהליך העיבוד נכשל בשלב ה-RSS או הסיכום הכללי:`, err.message);
    
    try {
      console.log(`[סיכום] מנסה לשלוח מייל עדכון על השגיאה הכללית...`);
      await sendSummaryEmail({ to: toEmail, from: FROM_EMAIL, podcastTitle, error: err.message });
      console.log(`[סיכום] מייל עדכון שגיאה נשלח בהצלחה.\n`);
    } catch (summaryErr) {
      console.error(`[שגיאה] כשל קריטי בשליחת מייל הסיכום עצמו:`, summaryErr.message);
    }
  }
}

function renderForm(errorMessage = "") {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>שליחת פרקי פודקאסט למייל</title>
<style>
  body {
    font-family: 'Heebo', Arial, sans-serif;
    background: #f4f1ea;
    display: flex;
    justify-content: center;
    padding: 40px 16px;
    margin: 0;
  }
  .card {
    background: #fff;
    border-radius: 12px;
    padding: 32px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  }
  h1 { font-size: 22px; margin-top: 0; }
  label { display: block; margin: 16px 0 6px; font-weight: 600; font-size: 14px; }
  input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #ccc;
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
  }
  button {
    margin-top: 24px;
    width: 100%;
    padding: 12px;
    background: #b6862c;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
  }
  button:hover { background: #98701f; }
  .error { color: #c0392b; margin-top: 12px; font-size: 14px; }
  .hint { color: #777; font-size: 13px; margin-top: 4px; }
</style>
</head>
<body>
  <div class="card">
    <h1>שליחת פרקי פודקאסט למייל</h1>
    <p>הזינו קישור לפיד RSS של פודקאסט, וכל הפרקים (עד למספר שתגדירו) יישלחו כקבצים מצורפים למייל שציינתם.</p>
    <form method="POST" action="/send">
      <label>קישור ל-RSS</label>
      <input type="url" name="rssUrl" placeholder="https://example.com/feed.xml" required>

      <label>כתובת מייל לשליחה</label>
      <input type="email" name="toEmail" value="${DEFAULT_TO}" required>

      <label>מספר פרקים מקסימלי</label>
      <input type="number" name="maxEpisodes" value="10" min="1" max="200">
      <div class="hint">פרק שגודלו חורג מהמגבלה (${process.env.MAX_ATTACHMENT_MB || 25}MB) יועלה ל-Google Drive (אם מוגדר) ותקבלו קישור אליו, במקום קובץ מצורף.</div>

      ${ACCESS_KEY ? `<label>מפתח גישה</label><input type="password" name="accessKey" required>` : ""}

      <button type="submit">שלח פרקים למייל</button>
    </form>
    ${errorMessage ? `<div class="error">${errorMessage}</div>` : ""}
  </div>
</body>
</html>`;
}

function renderStarted(toEmail) {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><title>התהליך התחיל</title>
<style>body{font-family:Arial,sans-serif;text-align:center;padding:60px 20px;background:#f4f1ea;}</style>
</head>
<body>
  <h2>התהליך התחיל 🎧</h2>
  <p>הפרקים נשלחים כעת ל-${toEmail}, אחד אחרי השני.</p>
  <p>בסיום תקבלו מייל סיכום עם רשימת כל הפרקים שנשלחו.</p>
  <p><a href="/">חזרה</a></p>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`[שרת המערכת] השרת עלה בהצלחה ופועל כעת על פורט ${PORT}`);
});  processFeed({ rssUrl, toEmail, limit }).catch((err) => {
    console.error("שגיאה בעיבוד הפיד:", err);
  });
});

async function processFeed({ rssUrl, toEmail, limit }) {
  let podcastTitle = "";
  try {
    const { podcastTitle: title, episodes } = await fetchPodcastEpisodes(rssUrl);
    podcastTitle = title;

    const episodesToSend = episodes.slice(0, limit);
    const results = [];

    for (const episode of episodesToSend) {
      try {
        const result = await sendEpisodeEmail({
          to: toEmail,
          from: FROM_EMAIL,
          podcastTitle,
          episode,
        });
        results.push(result);
      } catch (err) {
        results.push({ title: episode.title, status: "failed", error: err.message });
      }
    }

    await sendSummaryEmail({ to: toEmail, from: FROM_EMAIL, podcastTitle, results });
  } catch (err) {
    await sendSummaryEmail({ to: toEmail, from: FROM_EMAIL, podcastTitle, error: err });
  }
}

function renderForm(errorMessage = "") {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>שליחת פרקי פודקאסט למייל</title>
<style>
  body {
    font-family: 'Heebo', Arial, sans-serif;
    background: #f4f1ea;
    display: flex;
    justify-content: center;
    padding: 40px 16px;
    margin: 0;
  }
  .card {
    background: #fff;
    border-radius: 12px;
    padding: 32px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  }
  h1 { font-size: 22px; margin-top: 0; }
  label { display: block; margin: 16px 0 6px; font-weight: 600; font-size: 14px; }
  input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #ccc;
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
  }
  button {
    margin-top: 24px;
    width: 100%;
    padding: 12px;
    background: #b6862c;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
  }
  button:hover { background: #98701f; }
  .error { color: #c0392b; margin-top: 12px; font-size: 14px; }
  .hint { color: #777; font-size: 13px; margin-top: 4px; }
</style>
</head>
<body>
  <div class="card">
    <h1>שליחת פרקי פודקאסט למייל</h1>
    <p>הזינו קישור לפיד RSS של פודקאסט, וכל הפרקים (עד למספר שתגדירו) יישלחו כקבצים מצורפים למייל שציינתם.</p>
    <form method="POST" action="/send">
      <label>קישור ל-RSS</label>
      <input type="url" name="rssUrl" placeholder="https://example.com/feed.xml" required>

      <label>כתובת מייל לשליחה</label>
      <input type="email" name="toEmail" value="${DEFAULT_TO}" required>

      <label>מספר פרקים מקסימלי</label>
      <input type="number" name="maxEpisodes" value="10" min="1" max="200">
      <div class="hint">פרק שגודלו חורג מהמגבלה (${process.env.MAX_ATTACHMENT_MB || 25}MB) יועלה ל-Google Drive (אם מוגדר) ותקבלו קישור אליו, במקום קובץ מצורף.</div>

      ${ACCESS_KEY ? `<label>מפתח גישה</label><input type="password" name="accessKey" required>` : ""}

      <button type="submit">שלח פרקים למייל</button>
    </form>
    ${errorMessage ? `<div class="error">${errorMessage}</div>` : ""}
  </div>
</body>
</html>`;
}

function renderStarted(toEmail) {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><title>התהליך התחיל</title>
<style>body{font-family:Arial,sans-serif;text-align:center;padding:60px 20px;background:#f4f1ea;}</style>
</head>
<body>
  <h2>התהליך התחיל 🎧</h2>
  <p>הפרקים נשלחים כעת ל-${toEmail}, אחד אחרי השני.</p>
  <p>בסיום תקבלו מייל סיכום עם רשימת כל הפרקים שנשלחו.</p>
  <p><a href="/">חזרה</a></p>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`השרת פועל על פורט ${PORT}`);
});
