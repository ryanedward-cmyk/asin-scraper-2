import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const genAI    = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);

async function scrapeAmazon(url, country, lang) {
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`
    },
    body: JSON.stringify({
      url,
      formats: ['markdown', 'images'],
      onlyMainContent: false,
      maxAge: 0,
      waitFor: 2000,
      location: { country, languages: [lang] },
      actions: [
        { type: 'wait', milliseconds: 2000 },
        { type: 'screenshot', fullPage: false },
        { type: 'scroll', y: 700 },
        { type: 'wait', milliseconds: 1000 },
        { type: 'screenshot', fullPage: false },
        { type: 'scroll', y: 2500 },
        { type: 'wait', milliseconds: 1200 },
        { type: 'screenshot', fullPage: false }
      ]
    })
  });
  return res.json();
}

async function extractSnapshot(markdownText) {
  const model  = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const prompt = `
You are an Amazon listing data extractor.
From the product page text below return ONLY a valid JSON object with exactly these keys:
{
  "title": "string",
  "brand": "string",
  "price": 0,
  "currency": "GBP",
  "availability": "string",
  "seller": "string",
  "coupon": "string",
  "rating": 0,
  "review_count": 0,
  "delivery": "string",
  "bullets": ["bullet 1","bullet 2","bullet 3","bullet 4","bullet 5"],
  "aplus_text": "all A+ content text concatenated"
}
Use null for any missing field. Return ONLY the JSON with no markdown fences.

PAGE TEXT:
${markdownText.slice(0, 14000)}
`;
  const result  = await model.generateContent(prompt);
  const rawText = result.response.text().trim().replace(/```json|```/g, '').trim();
  return JSON.parse(rawText);
}

function detectChanges(old, nw, threshold) {
  const changes = [];
  if (!old) { changes.push('🆕 First snapshot captured'); return changes; }
  if (old.price !== null && nw.price !== null && nw.price < old.price)
    changes.push(`💰 Price dropped: ${nw.currency} ${old.price} → ${nw.currency} ${nw.price}`);
  if (threshold > 0 && nw.price !== null && nw.price <= threshold)
    changes.push(`🎯 Price ${nw.currency} ${nw.price} is below your threshold of ${threshold}`);
  if ((old.availability || '') !== (nw.availability || ''))
    changes.push(`📦 Availability: "${old.availability}" → "${nw.availability}"`);
  if ((old.seller || '') !== (nw.seller || ''))
    changes.push(`🏪 Seller: "${old.seller}" → "${nw.seller}"`);
  if ((old.title || '') !== (nw.title || ''))
    changes.push(`✏️ Title was edited`);
  if (JSON.stringify(old.bullets || []) !== JSON.stringify(nw.bullets || []))
    changes.push(`📝 Bullet points changed`);
  if ((old.aplus_text || '') !== (nw.aplus_text || ''))
    changes.push(`✨ A+ content was updated`);
  if (!old.coupon && nw.coupon)
    changes.push(`🎟️ New coupon: "${nw.coupon}"`);
  return changes;
}

function buildEmail(snap, changes, asin, marketplace, shots) {
  const url = `https://www.${marketplace}/dp/${asin}`;
  const changesHtml  = changes.map(c => `<li style="margin:0 0 8px;font-weight:600">${c}</li>`).join('');
  const bulletsHtml  = (snap.bullets||[]).map(b => `<li style="margin:0 0 6px;color:#555">${b}</li>`).join('');
  const shotLabels   = ['Main image area', 'Gallery area', 'A+ content area'];
  const screenshotBlocks = (shots||[]).filter(s=>!!s).map((src, i) => `
    <div style="margin:0 0 16px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#999;margin:0 0 6px">${shotLabels[i]||'Screenshot'}</div>
      <img src="${src}" alt="${shotLabels[i]||'screenshot'}" width="520"
           style="max-width:100%;border:1px solid #e5e5e5;border-radius:8px;display:block" />
    </div>`).join('');

  return `
  <div style="font-family:sans-serif;max-width:620px;margin:0 auto;color:#222">
    <div style="background:#01696f;color:white;padding:18px 22px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:18px">🔔 Amazon ASIN Alert</h1>
      <p style="margin:4px 0 0;font-size:12px;opacity:.8">${asin} · ${marketplace}</p>
    </div>
    <div style="border:1px solid #e5e5e5;border-top:none;padding:20px 22px;border-radius:0 0 12px 12px">
      <h2 style="font-size:15px;margin:0 0 6px;line-height:1.4">${snap.title||'Title unavailable'}</h2>
      <p style="font-size:22px;font-weight:700;color:#437a22;margin:0 0 4px">${snap.currency||''} ${snap.price||'—'}</p>
      <p style="font-size:12px;color:#666;margin:0 0 16px">
        Seller: ${snap.seller||'—'} · ${snap.availability||'—'}
        ${snap.coupon ? ` · <strong>Coupon: ${snap.coupon}</strong>` : ''}
      </p>
      <div style="background:#f3f0ec;border-radius:8px;padding:14px 16px;margin:0 0 18px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#999;margin:0 0 8px">Changes detected</div>
        <ul style="margin:0;padding-left:18px">${changesHtml}</ul>
      </div>
      ${screenshotBlocks}
      ${bulletsHtml ? `<div style="margin:0 0 16px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#999;margin:0 0 8px">Feature bullets</div><ul style="margin:0;padding-left:18px">${bulletsHtml}</ul></div>` : ''}
      ${snap.aplus_text ? `<div style="background:#f9f8f5;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#999;margin:0 0 8px">A+ content excerpt</div><p style="margin:0;font-size:12px;color:#666;line-height:1.6">${snap.aplus_text.slice(0,500)}...</p></div>` : ''}
      <a href="${url}" style="display:inline-block;background:#01696f;color:white;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px;font-weight:600">View on Amazon ↗</a>
    </div>
  </div>`;
}

export async function GET(req) {
  const secret = req.headers.get('authorization') || new URL(req.url).searchParams.get('secret');
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}` && secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const {  watches, error } = await supabase
    .from('watches')
    .select('*')
    .eq('active', true);

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const results = [];

  for (const watch of watches) {
    try {
      const url      = `https://www.${watch.marketplace}/dp/${watch.asin}`;
      const fcData   = await scrapeAmazon(url, watch.marketplace_country, watch.marketplace_lang);
      const markdown = fcData?.data?.markdown || '';
      const shots    = fcData?.data?.actions?.screenshots || [];
      const images   = fcData?.data?.images || [];

      const snapshot = await extractSnapshot(markdown);
      snapshot.main_image_url          = images[0] || null;
      snapshot.main_image_screenshot   = shots[0]  || null;
      snapshot.gallery_screenshot      = shots[1]  || null;
      snapshot.aplus_screenshot        = shots[2]  || null;
      snapshot.captured_at             = new Date().toISOString();

      const oldSnap = watch.last_snapshot;
      const changes = detectChanges(oldSnap, snapshot, watch.price_threshold || 0);
      const changed = changes.length > 0;

      if (changed) {
        const emailHtml = buildEmail(
          snapshot, changes, watch.asin, watch.marketplace,
          [snapshot.main_image_screenshot, snapshot.gallery_screenshot, snapshot.aplus_screenshot]
        );
        await resend.emails.send({
          from: 'onboarding@resend.dev',
          to: watch.alert_email,
          subject: `🔔 ASIN Alert — ${watch.asin} changed (${changes.length} update${changes.length !== 1 ? 's' : ''})`,
          html: emailHtml
        });
      }

      await supabase.from('watches').update({
        last_snapshot:   snapshot,
        last_alerted_at: changed ? new Date().toISOString() : watch.last_alerted_at,
        updated_at:      new Date().toISOString()
      }).eq('id', watch.id);

      results.push({ asin: watch.asin, changes, alerted: changed });

    } catch (err) {
      console.error(`Error processing ${watch.asin}:`, err.message);
      results.push({ asin: watch.asin, error: err.message });
    }
  }

  return Response.json({ ok: true, processed: results.length, results });
}
