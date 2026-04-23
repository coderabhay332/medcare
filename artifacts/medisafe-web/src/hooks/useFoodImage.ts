/**
 * useFoodImage — fetches a photo for a given food name.
 *
 * Strategy (in priority order):
 * 1. Curated static URLs for known Indian foods — instant, always accurate
 * 2. Module-level Map cache — no duplicate network requests
 * 3. Pexels API with specific query overrides — for unknown foods
 * 4. Emoji fallback — when Pexels is unavailable or fails
 */

import { useState, useEffect } from "react";

// ── Module-level cache (persists for the whole session) ─────────────────────
const imageCache = new Map<string, string | null>();
const pendingRequests = new Map<string, Promise<string | null>>();

const PEXELS_KEY = import.meta.env.VITE_PEXELS_API_KEY as string | undefined;

// ── Emoji fallback for common Indian foods ──────────────────────────────────
const EMOJI_MAP: Record<string, string> = {
  alcohol: "🍺",
  beer: "🍺",
  wine: "🍷",
  pickle: "🫙",
  achar: "🫙",
  salt: "🧂",
  grapefruit: "🍊",
  papaya: "🍈",
  banana: "🍌",
  milk: "🥛",
  dairy: "🥛",
  curd: "🥣",
  coffee: "☕",
  tea: "🍵",
  chai: "🍵",
  spinach: "🥬",
  palak: "🥬",
  karela: "🥒",
  "bitter gourd": "🥒",
  amla: "🫐",
  tulsi: "🌿",
  ashwagandha: "🌿",
  methi: "🌾",
  fenugreek: "🌾",
  calcium: "💊",
  iron: "💊",
  potassium: "🍋",
  vitamin: "💊",
  dal: "🍲",
  roti: "🫓",
  rice: "🍚",
  khichdi: "🍲",
  idli: "🍡",
  poha: "🍛",
  lassi: "🥛",
  coconut: "🥥",
  "coconut water": "🥥",
  bread: "🍞",
  oats: "🌾",
  apple: "🍎",
  default: "🥗",
};

// ── Curated, browser-verified Pexels image URLs for common Indian foods ──────
// Each URL was individually verified by browsing Pexels to ensure correctness.
const CURATED_IMAGE_MAP: Record<string, string> = {
  // Safe foods — verified correct images
  "dal": "https://images.pexels.com/photos/28674557/pexels-photo-28674557.jpeg?auto=compress&cs=tinysrgb&w=400",
  "dal (lentils)": "https://images.pexels.com/photos/28674557/pexels-photo-28674557.jpeg?auto=compress&cs=tinysrgb&w=400",
  "lentils": "https://images.pexels.com/photos/28674557/pexels-photo-28674557.jpeg?auto=compress&cs=tinysrgb&w=400",
  "roti": "https://images.pexels.com/photos/9797029/pexels-photo-9797029.jpeg?auto=compress&cs=tinysrgb&w=400",
  "roti or chapati": "https://images.pexels.com/photos/9797029/pexels-photo-9797029.jpeg?auto=compress&cs=tinysrgb&w=400",
  "chapati": "https://images.pexels.com/photos/9797029/pexels-photo-9797029.jpeg?auto=compress&cs=tinysrgb&w=400",
  "plain steamed rice": "https://images.pexels.com/photos/8423376/pexels-photo-8423376.jpeg?auto=compress&cs=tinysrgb&w=400",
  "steamed rice": "https://images.pexels.com/photos/8423376/pexels-photo-8423376.jpeg?auto=compress&cs=tinysrgb&w=400",
  "rice": "https://images.pexels.com/photos/8423376/pexels-photo-8423376.jpeg?auto=compress&cs=tinysrgb&w=400",
  "curd": "https://images.pexels.com/photos/20379659/pexels-photo-20379659.jpeg?auto=compress&cs=tinysrgb&w=400",
  "curd or yoghurt": "https://images.pexels.com/photos/20379659/pexels-photo-20379659.jpeg?auto=compress&cs=tinysrgb&w=400",
  "yoghurt": "https://images.pexels.com/photos/20379659/pexels-photo-20379659.jpeg?auto=compress&cs=tinysrgb&w=400",
  "yogurt": "https://images.pexels.com/photos/20379659/pexels-photo-20379659.jpeg?auto=compress&cs=tinysrgb&w=400",
  "idli": "https://images.pexels.com/photos/36854501/pexels-photo-36854501.jpeg?auto=compress&cs=tinysrgb&w=400",
  "poha": "https://images.pexels.com/photos/36971466/pexels-photo-36971466.jpeg?auto=compress&cs=tinysrgb&w=400",
  "khichdi": "https://images.pexels.com/photos/6363501/pexels-photo-6363501.jpeg?auto=compress&cs=tinysrgb&w=400",
  "banana": "https://images.pexels.com/photos/2872755/pexels-photo-2872755.jpeg?auto=compress&cs=tinysrgb&w=400",
  "apple": "https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg?auto=compress&cs=tinysrgb&w=400",
  "coconut water": "https://images.pexels.com/photos/1353930/pexels-photo-1353930.jpeg?auto=compress&cs=tinysrgb&w=400",
  "coconut": "https://images.pexels.com/photos/1353930/pexels-photo-1353930.jpeg?auto=compress&cs=tinysrgb&w=400",
  "oats": "https://images.pexels.com/photos/704569/pexels-photo-704569.jpeg?auto=compress&cs=tinysrgb&w=400",
  "oatmeal": "https://images.pexels.com/photos/704569/pexels-photo-704569.jpeg?auto=compress&cs=tinysrgb&w=400",
  "bread": "https://images.pexels.com/photos/1775043/pexels-photo-1775043.jpeg?auto=compress&cs=tinysrgb&w=400",
  "lassi": "https://images.pexels.com/photos/6808666/pexels-photo-6808666.jpeg?auto=compress&cs=tinysrgb&w=400",
  "upma": "https://images.pexels.com/photos/20408455/pexels-photo-20408455.jpeg?auto=compress&cs=tinysrgb&w=400",
  "dosa": "https://images.pexels.com/photos/20422121/pexels-photo-20422121.jpeg?auto=compress&cs=tinysrgb&w=400",
  "sambar": "https://images.pexels.com/photos/35041658/pexels-photo-35041658.jpeg?auto=compress&cs=tinysrgb&w=400",
  "vegetables": "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=400",
  // Avoid foods
  "alcohol": "https://images.pexels.com/photos/1283219/pexels-photo-1283219.jpeg?auto=compress&cs=tinysrgb&w=400",
  "beer": "https://images.pexels.com/photos/1283219/pexels-photo-1283219.jpeg?auto=compress&cs=tinysrgb&w=400",
  "wine": "https://images.pexels.com/photos/66636/pexels-photo-66636.jpeg?auto=compress&cs=tinysrgb&w=400",
  "coffee": "https://images.pexels.com/photos/312418/pexels-photo-312418.jpeg?auto=compress&cs=tinysrgb&w=400",
  "tea": "https://images.pexels.com/photos/1417945/pexels-photo-1417945.jpeg?auto=compress&cs=tinysrgb&w=400",
  "chai": "https://images.pexels.com/photos/1417945/pexels-photo-1417945.jpeg?auto=compress&cs=tinysrgb&w=400",
  "milk": "https://images.pexels.com/photos/248412/pexels-photo-248412.jpeg?auto=compress&cs=tinysrgb&w=400",
  "grapefruit": "https://images.pexels.com/photos/1132047/pexels-photo-1132047.jpeg?auto=compress&cs=tinysrgb&w=400",
  "papaya": "https://images.pexels.com/photos/5945755/pexels-photo-5945755.jpeg?auto=compress&cs=tinysrgb&w=400",
  "spinach": "https://images.pexels.com/photos/2325843/pexels-photo-2325843.jpeg?auto=compress&cs=tinysrgb&w=400",
  "palak": "https://images.pexels.com/photos/2325843/pexels-photo-2325843.jpeg?auto=compress&cs=tinysrgb&w=400",
  "pickle": "https://images.pexels.com/photos/5945623/pexels-photo-5945623.jpeg?auto=compress&cs=tinysrgb&w=400",
  "achar": "https://images.pexels.com/photos/5945623/pexels-photo-5945623.jpeg?auto=compress&cs=tinysrgb&w=400",
  "karela": "https://images.pexels.com/photos/9222278/pexels-photo-9222278.jpeg?auto=compress&cs=tinysrgb&w=400",
  "bitter gourd": "https://images.pexels.com/photos/9222278/pexels-photo-9222278.jpeg?auto=compress&cs=tinysrgb&w=400",
  "methi": "https://images.pexels.com/photos/3338677/pexels-photo-3338677.jpeg?auto=compress&cs=tinysrgb&w=400",
  "fenugreek": "https://images.pexels.com/photos/3338677/pexels-photo-3338677.jpeg?auto=compress&cs=tinysrgb&w=400",
};

// ── Specific Pexels search overrides for accuracy on unknown foods ─────────
const PEXELS_QUERY_OVERRIDES: Record<string, string> = {
  "dal": "dal tadka lentil curry india",
  "khichdi": "khichdi rice lentil indian dish",
  "idli": "idli south indian steamed rice cake",
  "poha": "poha indian flattened rice breakfast",
  "roti": "roti chapati indian flatbread",
  "dosa": "dosa south indian crispy crepe",
  "upma": "upma indian semolina breakfast",
  "banana": "fresh yellow banana fruit",
  "papaya": "papaya tropical fruit sliced",
  "karela": "bitter gourd karela green vegetable",
  "methi": "fenugreek methi green leaves herb",
  "palak": "fresh spinach palak leaves",
  "lassi": "lassi indian yogurt drink glass",
  "sambar": "sambar south indian lentil soup",
};

function getCuratedImage(name: string): string | null {
  const lower = name.toLowerCase().trim();
  if (CURATED_IMAGE_MAP[lower]) return CURATED_IMAGE_MAP[lower];
  // Partial key match — e.g. "dal tadka" matches "dal"
  for (const [key, url] of Object.entries(CURATED_IMAGE_MAP)) {
    if (lower.includes(key)) return url;
  }
  return null;
}

function getEmoji(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(EMOJI_MAP)) {
    if (lower.includes(key)) return emoji;
  }
  return EMOJI_MAP.default;
}

function buildPexelsQuery(foodName: string): string {
  const lower = foodName.toLowerCase().trim();
  for (const [key, query] of Object.entries(PEXELS_QUERY_OVERRIDES)) {
    if (lower.includes(key)) return query;
  }
  return `${foodName} food dish close up`;
}

async function fetchPexelsImage(foodName: string): Promise<string | null> {
  if (!PEXELS_KEY) return null;
  const query = encodeURIComponent(buildPexelsQuery(foodName));
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${query}&per_page=5&orientation=square`,
      { headers: { Authorization: PEXELS_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json() as { photos: { src: { medium: string } }[] };
    return data.photos?.[0]?.src?.medium ?? null;
  } catch {
    return null;
  }
}

// ── Main hook ───────────────────────────────────────────────────────────────
export function useFoodImage(foodName: string) {
  const key = foodName.toLowerCase().trim();

  // Priority 1: curated static image (instant, zero network, always correct)
  const curated = getCuratedImage(foodName);
  const initialUrl = curated ?? (imageCache.has(key) ? imageCache.get(key)! : null);

  const [url, setUrl] = useState<string | null>(initialUrl);
  const [loading, setLoading] = useState(!curated && !imageCache.has(key));
  const emoji = getEmoji(foodName);

  useEffect(() => {
    if (curated) {
      setUrl(curated);
      setLoading(false);
      return;
    }

    if (imageCache.has(key)) {
      setUrl(imageCache.get(key)!);
      setLoading(false);
      return;
    }

    // De-duplicate concurrent requests for the same food
    let req = pendingRequests.get(key);
    if (!req) {
      req = fetchPexelsImage(foodName).then((result) => {
        imageCache.set(key, result);
        pendingRequests.delete(key);
        return result;
      });
      pendingRequests.set(key, req);
    }

    let cancelled = false;
    req.then((result) => {
      if (!cancelled) {
        setUrl(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [key, foodName, curated]);

  return { url, loading, emoji };
}
