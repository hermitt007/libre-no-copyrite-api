import express from 'express';
import axios from 'axios';
import xml2js from 'xml2js';
import NodeCache from 'node-cache';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();
const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const YT_API_KEY = process.env.YOUTUBE_API_KEY || null;

const cache = new NodeCache({ stdTTL: 60 * 5 }); // cache 5 minutos

// ----------------------
// LEER RSS POR channelId
// ----------------------
async function fetchRssByChannelId(channelId) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  const cached = cache.get(url);
  if (cached) return cached;

  const res = await axios.get(url, { timeout: 10000 });
  const parsed = await xml2js.parseStringPromise(res.data, { explicitArray: false });

  const entries = parsed.feed.entry || [];
  const items = (Array.isArray(entries) ? entries : [entries]).map(e => ({
    id: e['yt:videoId'],
    title: e.title,
    published: e.published,
    link: e.link?.['$']?.href,
    author: e.author?.name
  }));

  cache.set(url, items);
  return items;
}

// ----------------------
// Resolver handle → channelId
// ----------------------
async function resolveHandleToChannelId(handle) {
  let h = handle.startsWith("@") ? handle : `@${handle}`;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/${h}&format=json`;
    const data = await axios.get(oembedUrl);
    const match = data.data.author_url.match(/channel\/(.+)$/);
    if (match) return match[1];
  } catch {}

  // Fallback: page scraping
  try {
    const page = await axios.get(`https://www.youtube.com/${h}`);
    const match = page.data.match(/"channelId":"([^"]+)"/);
    if (match) return match[1];
  } catch {}

  throw new Error("No se pudo resolver el handle a channelId.");
}

// ----------------------
// RUTAS API
// ----------------------

app.get('/videos', async (req, res) => {
  const { channelId, max = 10 } = req.query;
  if (!channelId) return res.status(400).json({ error: "Falta channelId" });

  try {
    const data = await fetchRssByChannelId(channelId);
    res.json({ source: "rss", items: data.slice(0, Number(max)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/videosByHandle', async (req, res) => {
  const { handle, max = 10 } = req.query;
  if (!handle) return res.status(400).json({ error: "Falta handle" });

  try {
    const channelId = await resolveHandleToChannelId(handle);
    const data = await fetchRssByChannelId(channelId);
    res.json({ source: "rss", channelId, items: data.slice(0, Number(max)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/video/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const r = await axios.get("https://www.youtube.com/oembed", {
      params: { url: `https://www.youtube.com/watch?v=${id}`, format: "json" },
      timeout: 8000
    });
    res.json({ source: "oembed", item: r.data });
  } catch (err) {
    res.status(500).json({ error: "No se pudo obtener el video" });
  }
});

app.get('/', (req, res) => {
  res.send({
    ok: true,
    endpoints: [
      "/videos?channelId=ID",
      "/videosByHandle?handle=OrbitalNCG",
      "/video/:id"
    ]
  });
});

// ----------------------
// INICIAR SERVIDOR
// ----------------------
app.listen(PORT, () =>
  console.log(`API Libre No Copyrite activa en http://localhost:${PORT}`)
);
