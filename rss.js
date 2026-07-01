import { XMLParser } from "fast-xml-parser";

/**
 * שולף פיד RSS מכתובת נתונה ומחזיר רשימת פרקים מנורמלת.
 * כל פרק: { title, audioUrl, pubDate, guid }
 */
export async function fetchPodcastEpisodes(rssUrl) {
  const response = await fetch(rssUrl, {
    headers: { "User-Agent": "podcast-mailer/1.0" },
  });

  if (!response.ok) {
    throw new Error(`שגיאה בשליפת ה-RSS: HTTP ${response.status}`);
  }

  const xml = await response.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const parsed = parser.parse(xml);

  const channel = parsed?.rss?.channel;
  if (!channel) {
    throw new Error("הקישור שסופק אינו פיד RSS תקין של פודקאסט");
  }

  const podcastTitle = channel.title || "פודקאסט ללא שם";

  let items = channel.item || [];
  if (!Array.isArray(items)) {
    items = [items];
  }

  const episodes = items
    .map((item) => {
      const enclosure = item.enclosure;
      const audioUrl = enclosure?.["@_url"];
      if (!audioUrl) return null;

      return {
        title: cleanText(item.title) || "פרק ללא כותרת",
        audioUrl,
        pubDate: item.pubDate || null,
        guid:
          (typeof item.guid === "string" ? item.guid : item.guid?.["#text"]) ||
          audioUrl,
      };
    })
    .filter(Boolean);

  return { podcastTitle: cleanText(podcastTitle), episodes };
}

function cleanText(value) {
  if (typeof value !== "string") return value;
  return value.trim();
}
