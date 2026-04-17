import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const { data: watches } = await supabase
    .from('watches')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2rem' }}>
        <h1 style={{ fontFamily: 'Georgia,serif', fontSize: '2rem' }}>ASIN Alert Dashboard</h1>
        <span style={{ fontSize: '.8rem', color: '#9c9a93' }}>Watches auto-refresh hourly</span>
      </div>
      {!watches?.length && (
        <div style={{ padding:'3rem', textAlign:'center', color:'#9c9a93', background:'#f9f8f5', borderRadius:12, border:'1px solid #d4d1ca' }}>
          <p style={{ fontSize:'1.25rem', marginBottom:'1rem' }}>No watches yet.</p>
          <p>Insert a row directly in Supabase to start tracking an ASIN.</p>
        </div>
      )}
      <div style={{ display:'grid', gap:'1rem' }}>
        {(watches || []).map(w => {
          const snap = w.last_snapshot || {};
          return (
            <div key={w.id} style={{ background:'#f9f8f5', border:'1px solid #d4d1ca', borderRadius:12, padding:'1.25rem 1.5rem', display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:'1rem' }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:'.5rem', marginBottom:'.4rem' }}>
                  <code style={{ background:'#f3f0ec', padding:'.2rem .5rem', borderRadius:6, fontSize:'.8rem' }}>{w.asin}</code>
                  <span style={{ fontSize:'.75rem', color:'#9c9a93' }}>{w.marketplace}</span>
                  <span style={{ fontSize:'.7rem', padding:'.15rem .55rem', borderRadius:99, background: w.active ? '#d4dfcc' : '#ddcfc6', color: w.active ? '#437a22' : '#964219', fontWeight:700 }}>{w.active ? 'Active' : 'Paused'}</span>
                </div>
                <div style={{ fontWeight:700, fontSize:'1.05rem', marginBottom:'.25rem' }}>{snap.title || '—'}</div>
                <div style={{ fontSize:'.9rem', color:'#6d6b65' }}>
                  <span style={{ fontWeight:700, color:'#437a22', marginRight:'.75rem' }}>{snap.currency} {snap.price || '—'}</span>
                  {snap.availability && <span style={{ marginRight:'.75rem' }}>{snap.availability}</span>}
                  {snap.seller && <span>Seller: {snap.seller}</span>}
                </div>
              </div>
              <div style={{ textAlign:'right', fontSize:'.75rem', color:'#9c9a93', lineHeight:1.7 }}>
                <div>Threshold: {w.price_threshold || 'any drop'}</div>
                <div>Email: {w.alert_email}</div>
                {w.updated_at && <div>Updated: {new Date(w.updated_at).toLocaleString()}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
