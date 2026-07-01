// סקריפט להרצה חד-פעמית מהמחשב שלכם, כדי לקבל GOOGLE_REFRESH_TOKEN.
// שימוש: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-refresh-token.js

import { google } from "googleapis";
import readline from "node:readline";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "urn:ietf:wg:oauth:2.0:oob";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("יש להריץ עם GOOGLE_CLIENT_ID ו-GOOGLE_CLIENT_SECRET כמשתני סביבה");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // מבטיח קבלת refresh_token גם אם כבר אישרתם בעבר
  scope: ["https://www.googleapis.com/auth/drive.file"],
});

console.log("\n1. פתחו את הקישור הבא בדפדפן, התחברו וְאשרו גישה:\n");
console.log(authUrl);
console.log("\n2. לאחר האישור תקבלו קוד - הדביקו אותו כאן:\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("קוד: ", async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log("\n✅ הצלחה! שמרו את הערכים הבאים כמשתני סביבה בשרת (Render):\n");
    console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
  } catch (err) {
    console.error("שגיאה בהנפקת הטוקן:", err.message);
  } finally {
    rl.close();
  }
});
