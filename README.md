# Podcast Mailer

שרת קטן שמקבל קישור לפיד RSS של פודקאסט, ושולח את כל הפרקים (או חלק מהם) כקבצים מצורפים במייל.

## איך זה עובד

1. נכנסים לדף הבית - טופס עם קישור RSS, כתובת מייל ומספר פרקים מקסימלי.
2. השרת שולף את הפיד, ולכל פרק שולח מייל נפרד עם קובץ האודיו מצורף.
3. אם קובץ גדול מדי (או שלא ניתן לדעת את גודלו מראש) - נשלח מייל עם קישור להאזנה/הורדה במקום קובץ מצורף.
4. בסיום נשלח מייל סיכום עם רשימת כל הפרקים וסטטוס השליחה של כל אחד.

## הרצה מקומית

```bash
npm install
cp .env.example .env
# ערכו את .env עם פרטי ה-SMTP שלכם
npm start
```

השרת יעלה על http://localhost:3000

## הגדרת SMTP (למשל Gmail)

1. הפעילו אימות דו-שלבי בחשבון ה-Gmail.
2. צרו "סיסמת אפליקציה" (App Password) בכתובת: https://myaccount.google.com/apppasswords
3. הזינו אותה כ-`SMTP_PASS`, ואת כתובת ה-Gmail כ-`SMTP_USER` ו-`SMTP_FROM`.
4. `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`.

אפשר גם להשתמש בכל ספק SMTP אחר (SendGrid, Mailgun, ספק דומיין וכו').

## הגדרת Google Drive (עבור פרקים גדולים)

כאשר פרק חורג מ-`MAX_ATTACHMENT_MB`, הוא יועלה אוטומטית ל-Google Drive שלכם, ובמייל יישלח קישור לקובץ ב-Drive במקום קישור למקור. אם לא תגדירו את זה, המערכת תיפול חזרה לשליחת קישור ישיר למקור המקורי (כמו קודם).

### שלב 1: יצירת Client ID ו-Client Secret

1. כנסו ל-[Google Cloud Console](https://console.cloud.google.com/) וצרו פרויקט חדש (או השתמשו בקיים).
2. הפעילו את **Google Drive API** (APIs & Services > Library > חפשו "Google Drive API" > Enable).
3. לכו ל-**APIs & Services > OAuth consent screen**, הגדירו אפליקציה מסוג "External" (או "Internal" אם יש לכם Google Workspace), ותוסיפו את עצמכם כ-Test User.
4. לכו ל-**APIs & Services > Credentials > Create Credentials > OAuth client ID**, בחרו **Desktop app**.
5. שמרו את ה-Client ID וה-Client Secret שנוצרו.

### שלב 2: הנפקת Refresh Token

הריצו מהמחשב שלכם (חד פעמי):

```bash
npm install
GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-refresh-token.js
```

עקבו אחרי ההוראות שיודפסו: פתחו את הקישור, אשרו גישה עם חשבון ה-Gmail שאליו תרצו להעלות קבצים, הדביקו את הקוד שתקבלו. הסקריפט ידפיס `GOOGLE_REFRESH_TOKEN` - שמרו אותו.

### שלב 3: הגדרת משתני הסביבה בשרת

הוסיפו ב-Render (או ב-`.env` המקומי):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_DRIVE_FOLDER_ID=...   # אופציונלי - אחרת יעלה ל-root של Drive
```

הקבצים יועלו לחשבון ה-Google שאישר את הגישה, ויהיו נגישים לכם דרך הקישור שיישלח במייל (וגם דרך Drive עצמו).

**הערת scope:** הסקריפט מבקש הרשאה מצומצמת (`drive.file`) - כלומר האפליקציה יכולה לגשת רק לקבצים שהיא עצמה יצרה, ולא לשאר הקבצים ב-Drive שלכם.



1. דחפו את הפרויקט ל-repo ב-GitHub.
2. ב-Render: **New > Web Service**, חברו את ה-repo.
3. הגדרות:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** הוסיפו את כל המשתנים מ-`.env.example` (כולל `SMTP_*` ו-`ACCESS_KEY`).
4. לחצו Deploy.

### ⚠️ הערה חשובה לגבי Render Free Tier

בטיר החינמי, השירות "נרדם" אחרי כ-15 דקות ללא בקשות HTTP נכנסות. מכיוון שהשליחה מתבצעת ברקע אחרי שהתגובה כבר נשלחה לדפדפן, אם התהליך אורך זמן רב (הרבה פרקים/קבצים גדולים) והשירות יירדם באמצע - התהליך ייעצר. המלצות:
- הגבילו את "מספר פרקים מקסימלי" לכמות סבירה (5-15) בכל הפעלה.
- אם יש הרבה פרקים לשלוח, הריצו כמה בקשות נפרדות.
- לשימוש כבד יותר, שקלו טיר בתשלום שלא נרדם.

### ⚠️ הערה לגבי מגבלות גודל מייל

גם אם `MAX_ATTACHMENT_MB` מוגדר לערך גבוה, לרוב ספקי ה-SMTP (כולל Gmail) יש מגבלה קשיחה של כ-25MB לצירוף. קובץ שחורג מהמגבלה שהגדרתם (או ממגבלת הספק בפועל) יועלה ל-Google Drive (אם הוגדר - ראו סעיף למעלה) או יישלח כקישור בלבד למקור, אם ההעלאה ל-Drive לא הוגדרה או נכשלה.

## אבטחה

אם השרת נגיש בכתובת ציבורית, מומלץ מאוד להגדיר `ACCESS_KEY` - כך שרק מי שמכיר את המפתח יוכל להפעיל שליחה (כדי שאף אחד לא ישתמש בשרת שלכם לספאם).

## מבנה הפרויקט

```
podcast-mailer/
├── server.js        # שרת Express + טופס + נקודת קצה /send
├── lib/
│   ├── rss.js         # שליפה ופענוח של פיד ה-RSS
│   ├── mailer.js       # שליחת מיילים ובדיקת גודל קבצים
│   └── drive.js         # העלאת קבצים גדולים ל-Google Drive
├── scripts/
│   └── get-refresh-token.js  # סקריפט חד-פעמי להנפקת Refresh Token
├── package.json
└── .env.example
```
