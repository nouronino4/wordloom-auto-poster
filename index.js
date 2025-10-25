import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import slugify from 'slugify';

dotenv.config();

// ------------ CONFIG (from env) ------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const BLOGGER_ID = process.env.BLOGGER_ID;
const BLOGGER_TOKEN = process.env.BLOGGER_TOKEN; // OAuth2 Bearer token
const REDDIT_USER = process.env.REDDIT_USER;
const REDDIT_PASS = process.env.REDDIT_PASS;
const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_SECRET = process.env.REDDIT_SECRET;
const REDDIT_SUBREDDIT = process.env.REDDIT_SUBREDDIT || 'test';

// data folder & posted log
const DATA_DIR = path.resolve('./data');
const POSTED_FILE = path.join(DATA_DIR, 'posted.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(POSTED_FILE)) fs.writeFileSync(POSTED_FILE, JSON.stringify([]));

function loadPosted() {
  try { return JSON.parse(fs.readFileSync(POSTED_FILE, 'utf-8')); }
  catch (e) { return []; }
}
function savePosted(list) { fs.writeFileSync(POSTED_FILE, JSON.stringify(list, null, 2)); }

// ------------ Helpers ------------
function pickTitle(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return lines[0] ? lines[0].slice(0, 120) : 'New Wordloom Article';
}

// ------------ Gemini content generation ------------
async function generateContent(topicPrompt) {
  // Prompt: ask for SEO blog post + Reddit summary
  const prompt = `Write an SEO-optimized English blog post (700-1000 words) about:\n${topicPrompt}\n\nProduce:\n1) Full blog post in HTML (with H2, H3, paragraphs and 3-5 suggested tags)\n2) A short Reddit-friendly summary (max 90 words) with one discussion question.`;

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-latest:generateText';

  const body = {
    "prompt": {
      "text": prompt
    },
    "maxOutputTokens": 900
  };

  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': GEMINI_API_KEY
  };

  try {
    const res = await axios.post(url, body, { headers });
    const text = res.data?.candidates?.[0]?.content || res.data?.output?.[0]?.content || '';
    return text || 'No content';
  } catch (err) {
    console.error('Gemini error', err?.response?.data || err.message);
    throw err;
  }
}

// ------------ Blogger posting ------------
async function postToBlogger(title, htmlContent, labels = []) {
  const url = `https://www.googleapis.com/blogger/v3/blogs/${BLOGGER_ID}/posts/`;
  try {
    const res = await axios.post(url, { kind: 'blogger#post', title, content: htmlContent, labels }, {
      headers: { Authorization: `Bearer ${BLOGGER_TOKEN}`, 'Content-Type': 'application/json' }
    });
    return res.data?.url || null;
  } catch (err) {
    console.error('Blogger error', err?.response?.data || err.message);
    throw err;
  }
}

// ------------ Reddit posting ------------
async function getRedditToken() {
  const auth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_SECRET}`).toString('base64');
  try {
    const res = await axios.post('https://www.reddit.com/api/v1/access_token', new URLSearchParams({ grant_type: 'password', username: REDDIT_USER, password: REDDIT_PASS }), { headers: { Authorization: `Basic ${auth}`, 'User-Agent': 'WordloomBot/1.0' } });
    return res.data.access_token;
  } catch (err) {
    console.error('Reddit token error', err?.response?.data || err.message);
    throw err;
  }
}

async function postToReddit(title, text) {
  const token = await getRedditToken();
  try {
    await axios.post('https://oauth.reddit.com/api/submit', new URLSearchParams({ sr: REDDIT_SUBREDDIT, kind: 'self', title, text }), { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'WordloomBot/1.0' } });
    return true;
  } catch (err) {
    console.error('Reddit post error', err?.response?.data || err.message);
    throw err;
  }
}

// ------------ Main flow ------------
async function main() {
  console.log('Starting Wordloom Auto Poster run...');

  // 1) Determine topic — you can change this logic to read from Wordloom API or a topics list
  const topics = [
    'AI writing tools to boost content creation for small businesses',
    'How Wordloom improves SEO and writer productivity',
    'Best practices for using AI content safely and ethically'
  ];
  // pick a random topic
  const topic = topics[Math.floor(Math.random() * topics.length)];

  // 2) Generate content
  const genText = await generateContent(topic);

  // Attempt to split generated output into blog HTML, tags, reddit summary
  // This uses simple heuristics — adapt if Gemini returns different format.
  const parts = genText.split('\n\n');
  const title = pickTitle(genText);
  const htmlContent = genText; // assume Gemini returned HTML-ready content

  // Extract tags naive
  const tags = [];
  // slug
  const slug = slugify(title, { lower: true, strict: true }).slice(0, 60);

  // check duplicates
  const posted = loadPosted();
  if (posted.find(p => p.title === title)) {
    console.log('Already posted this title, aborting.');
    return;
  }

  // 3) Post to Blogger
  const bloggerUrl = await postToBlogger(title, htmlContent, tags);
  console.log('Posted to Blogger:', bloggerUrl);

  // 4) Prepare reddit summary
  const redditSummary = `🔥 ${title}\n\nRead the full article: ${bloggerUrl}\n\nWhat do you think about this approach?`;
  await postToReddit(title, redditSummary);
  console.log('Posted to Reddit');

  // 5) Log posted
  posted.push({ title, url: bloggerUrl, slug, date: new Date().toISOString() });
  savePosted(posted);
  console.log('Saved posted log.');
}

if (import.meta.url === `file://${process.argv[1]}` || process.env.RUN_MAIN === '1') {
  main().catch(err => { console.error(err); process.exit(1); });
}

export default main;
