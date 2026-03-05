import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase, dbLoad, dbUpsert, dbDelete, signOut } from './supabase';
import AuthScreen from './components/AuthScreen';

// ── Constants ─────────────────────────────────────────────────────────────────
const TIME_SLOTS = ['2:00 PM – 4:00 PM','4:00 PM – 6:00 PM','6:00 PM – 8:00 PM','8:00 PM – 10:00 PM','10:00 PM – 12:00 AM'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const EXPENSE_CATS = ['Food','Transport','Education','Utilities','Entertainment','Health','Clothing','Other'];
const PALETTE = ['#FF6B6B','#4ECDC4','#FFE66D','#A8E6CF','#F7B731','#5F27CD','#00D2D3','#FF9F43','#EE5A24','#009432'];
const CAT_COLORS = { Food:'#f87171',Transport:'#fbbf24',Education:'#818cf8',Utilities:'#22c55e',Entertainment:'#f472b6',Health:'#34d399',Clothing:'#60a5fa',Other:'#9ca3af' };
const NON_ESSENTIAL = ['Food','Entertainment','Clothing','Transport'];
const ESSENTIAL = ['Utilities','Health','Education'];

// ── Shared styles ─────────────────────────────────────────────────────────────
const inp = { background:'#0d0f14',border:'1px solid #2d3148',borderRadius:10,padding:'12px 14px',color:'#e8eaf0',fontFamily:'inherit',fontSize:14,outline:'none',width:'100%' };
const btn = (bg='#818cf8',color='#fff') => ({ background:bg,border:'none',borderRadius:10,padding:'11px 20px',color,fontWeight:700,fontSize:14,cursor:'pointer',fontFamily:'inherit' });

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTuitionMeta(t) {
  const cycle = Number(t.classes_per_month) || 12;
  const feePerClass = t.fee_mode === 'month' ? (Number(t.fee_amount)||0)/cycle : (Number(t.fee_amount)||0);
  return { cycle, feePerClass };
}

const KEYWORDS = {
  Food:['food','rice','dal','bread','snack','lunch','dinner','breakfast','restaurant','meal','tea','coffee','biryani','chicken','fish','egg','vegetable','fruit','grocery','market','bazar'],
  Transport:['rickshaw','cng','bus','uber','pathao','train','ride','fare','fuel','petrol','ticket','ferry'],
  Education:['book','tuition','course','pen','pencil','notebook','stationery','class','exam','fee','library','printing'],
  Utilities:['electricity','gas','water','internet','wifi','phone','recharge','bill','rent'],
  Entertainment:['cinema','movie','game','streaming','netflix','youtube','concert','event','fun','outing'],
  Health:['medicine','doctor','hospital','pharmacy','health','vitamin','mask','sanitizer','clinic'],
  Clothing:['shirt','pant','dress','shoe','sandal','bag','clothes','fabric','tailor'],
};
function guessCategory(product) {
  const lower = product.toLowerCase();
  for (const [cat,kws] of Object.entries(KEYWORDS)) { if (kws.some(k=>lower.includes(k))) return cat; }
  return 'Other';
}

// ── UI Atoms ──────────────────────────────────────────────────────────────────
function Input({ style, ...p }) { return <input style={{...inp,...style}} {...p} />; }
function Btn({ bg, color, style, ...p }) { return <button style={{...btn(bg,color),...style}} {...p} />; }

function MiniBar({ pct, color }) {
  return (
    <div style={{background:'#1e2030',borderRadius:99,height:7,overflow:'hidden',flex:1}}>
      <div style={{width:`${Math.min(100,Math.max(0,pct))}%`,height:'100%',background:color,borderRadius:99,transition:'width .4s'}}/>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type==='success'?'#22c55e':toast.type==='info'?'#818cf8':'#f87171';
  return (
    <div style={{position:'fixed',bottom:80,left:'50%',transform:'translateX(-50%)',background:bg,color:'#fff',padding:'12px 22px',borderRadius:14,fontWeight:700,fontSize:14,zIndex:9999,boxShadow:'0 8px 30px rgba(0,0,0,.5)',whiteSpace:'nowrap'}}>
      {toast.msg}
    </div>
  );
}

function Modal({ onClose, children }) {
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9000,padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'#1a1d27',borderRadius:20,padding:28,maxWidth:440,width:'100%',border:'1px solid #2d3148',maxHeight:'80vh',overflowY:'auto'}}>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div style={{textAlign:'center',padding:'60px 20px',color:'#4b5563'}}>
      <div style={{fontSize:48,marginBottom:12}}>{icon}</div>
      <div style={{fontSize:14}}>{text}</div>
    </div>
  );
}

function SectionTitle({ children }) {
  return <div style={{fontSize:17,fontWeight:800,marginBottom:18,color:'#e8eaf0'}}>{children}</div>;
}

// ══════════════════════════════════════════════════════════════════════════════
//  TODAY TAB
// ══════════════════════════════════════════════════════════════════════════════
function TodayTab({ tuitions, sessions, onLog }) {
  const today = new Date().toISOString().split('T')[0];
  if (!tuitions.length) return <EmptyState icon="📚" text="No tuitions yet. Add one in the Tuitions tab." />;
  return (
    <div style={{paddingBottom:20}}>
      <SectionTitle>Mark Today's Sessions</SectionTitle>
      <div style={{display:'flex',flexDirection:'column',gap:16}}>
        {tuitions.map(t => {
          const { cycle, feePerClass } = getTuitionMeta(t);
          const cnt = sessions.filter(s=>s.tuition_id===t.id).length;
          const pos = cnt % cycle;
          const logged = slot => sessions.some(s=>s.tuition_id===t.id&&s.date===today&&s.time_slot===slot);
          return (
            <div key={t.id} style={{background:'#1a1d27',borderRadius:16,padding:18,border:`1px solid ${t.color}44`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                <div>
                  <div style={{fontSize:16,fontWeight:700,color:t.color}}>{t.name}</div>
                  <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{t.subject} · ৳{feePerClass.toFixed(0)}/class</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:11,color:'#9ca3af'}}>Cycle {Math.floor(cnt/cycle)+1}</div>
                  <div style={{fontSize:13,fontWeight:700,color:pos>=cycle*0.8?'#f87171':'#22c55e'}}>{pos}/{cycle}</div>
                </div>
              </div>
              <div style={{background:'#0d0f14',borderRadius:6,height:5,marginBottom:14,overflow:'hidden'}}>
                <div style={{width:`${(pos/cycle)*100}%`,height:'100%',background:t.color,borderRadius:6}}/>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                {TIME_SLOTS.map(slot => {
                  const on = logged(slot);
                  return (
                    <button key={slot} onClick={() => onLog(t.id, slot, today, on)} style={{
                      padding:'8px 14px',borderRadius:8,border:`1.5px solid ${on?t.color:'#2d3148'}`,
                      background:on?t.color+'22':'transparent',color:on?t.color:'#6b7280',
                      fontWeight:600,fontSize:12,cursor:'pointer',fontFamily:'inherit',
                    }}>{on?'✓ ':''}{slot}</button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  TUITIONS TAB
// ══════════════════════════════════════════════════════════════════════════════
function TuitionsTab({ tuitions, sessions, onSave, onDelete, onBackfill }) {
  const blank = { name:'',subject:'',fee_mode:'class',fee_amount:'',classes_per_month:'12',color:PALETTE[0] };
  const [form, setForm] = useState(blank);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const [bfId, setBfId] = useState(null);
  const [bfRows, setBfRows] = useState([]);
  const [bfTab, setBfTab] = useState('add');

  const openEdit = t => { setForm({name:t.name,subject:t.subject,fee_mode:t.fee_mode||'class',fee_amount:t.fee_amount||'',classes_per_month:t.classes_per_month||12,color:t.color}); setEditId(t.id); setAdding(true); setBfId(null); };
  const openBf = tid => { setBfId(tid===bfId?null:tid); setBfRows([{date:new Date().toISOString().split('T')[0],note:''}]); setBfTab('add'); setAdding(false); };

  const save = () => {
    if (!form.name.trim()) return;
    onSave({ ...form, id: editId||undefined, fee_amount:Number(form.fee_amount)||0, classes_per_month:Number(form.classes_per_month)||12 });
    setForm(blank); setAdding(false); setEditId(null);
  };

  const doBackfill = tuitionId => {
    const rows = bfRows.filter(r=>r.date);
    if (!rows.length) return;
    onBackfill(tuitionId, rows);
    setBfId(null);
  };

  const preview = () => {
    const c = Number(form.classes_per_month)||12, a = Number(form.fee_amount)||0;
    return form.fee_mode==='month' ? `= ৳${(a/c).toFixed(0)}/class` : `= ৳${(a*c).toLocaleString()}/month`;
  };

  // Backfill past sessions for this tuition
  const pastSessions = id => sessions.filter(s=>s.tuition_id===id&&s.backfilled);

  return (
    <div style={{paddingBottom:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
        <SectionTitle>Your Tuitions</SectionTitle>
        <Btn onClick={()=>{setForm(blank);setEditId(null);setAdding(v=>!v);setBfId(null);}}>+ Add</Btn>
      </div>

      {adding && (
        <div style={{background:'#1a1d27',borderRadius:16,padding:20,marginBottom:20,border:'1px solid #818cf855'}}>
          <div style={{fontSize:14,fontWeight:700,color:'#818cf8',marginBottom:14}}>{editId?'Edit Tuition':'New Tuition'}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            <Input placeholder="Name *" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} />
            <Input placeholder="Subject" value={form.subject} onChange={e=>setForm(p=>({...p,subject:e.target.value}))} />
          </div>
          <div style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr',gap:12,marginBottom:8,alignItems:'end'}}>
            <div>
              <div style={{fontSize:11,color:'#6b7280',marginBottom:6}}>Fee Type</div>
              <div style={{display:'flex',border:'1px solid #2d3148',borderRadius:10,overflow:'hidden'}}>
                {['class','month'].map(m=>(
                  <button key={m} onClick={()=>setForm(p=>({...p,fee_mode:m}))} style={{padding:'10px 16px',border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,background:form.fee_mode===m?'#818cf8':'#0d0f14',color:form.fee_mode===m?'#fff':'#6b7280'}}>Per {m==='class'?'Class':'Month'}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:11,color:'#6b7280',marginBottom:6}}>{form.fee_mode==='class'?'Fee/Class (BDT)':'Monthly Fee (BDT)'}</div>
              <Input type="number" placeholder="e.g. 500" value={form.fee_amount} onChange={e=>setForm(p=>({...p,fee_amount:e.target.value}))} />
            </div>
            <div>
              <div style={{fontSize:11,color:'#6b7280',marginBottom:6}}>Classes/Month</div>
              <Input type="number" placeholder="12" value={form.classes_per_month} onChange={e=>setForm(p=>({...p,classes_per_month:e.target.value}))} />
            </div>
          </div>
          {form.fee_amount && <div style={{fontSize:12,color:'#fbbf24',marginBottom:12}}>💡 {preview()} · Cycle: {form.classes_per_month||12} classes</div>}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:'#6b7280',marginBottom:6}}>Colour</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {PALETTE.map(c=><div key={c} onClick={()=>setForm(p=>({...p,color:c}))} style={{width:26,height:26,borderRadius:6,background:c,cursor:'pointer',border:form.color===c?'2px solid #fff':'2px solid transparent'}}/>)}
            </div>
          </div>
          <div style={{display:'flex',gap:10}}>
            <Btn bg="#22c55e" onClick={save}>{editId?'Update':'Save'}</Btn>
            <Btn bg="#2d3148" color="#9ca3af" onClick={()=>{setAdding(false);setEditId(null);}}>Cancel</Btn>
          </div>
        </div>
      )}

      {!tuitions.length && <EmptyState icon="📚" text="No tuitions yet!" />}

      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        {tuitions.map(t => {
          const { cycle, feePerClass } = getTuitionMeta(t);
          const cnt = sessions.filter(s=>s.tuition_id===t.id).length;
          const pos = cnt % cycle;
          const isOpen = bfId===t.id;
          return (
            <div key={t.id}>
              <div style={{background:'#1a1d27',borderRadius:isOpen?'16px 16px 0 0':16,padding:'18px 18px 18px 22px',border:`1px solid ${t.color}44`,position:'relative'}}>
                <div style={{width:4,height:'100%',background:t.color,position:'absolute',left:0,top:0,borderRadius:isOpen?'16px 0 0 0':'16px 0 0 16px'}}/>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontSize:16,fontWeight:700,color:t.color}}>{t.name}</div>
                    <div style={{fontSize:12,color:'#9ca3af',marginTop:2}}>{t.subject}</div>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>openBf(t.id)} style={{background:isOpen?'#f59e0b22':'#2d3148',border:isOpen?'1px solid #f59e0b55':'none',borderRadius:8,padding:'5px 10px',color:isOpen?'#f59e0b':'#9ca3af',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                      {isOpen?'✕':'＋ Past'}
                    </button>
                    <button onClick={()=>openEdit(t)} style={{background:'#2d3148',border:'none',borderRadius:8,padding:'5px 10px',color:'#9ca3af',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>✏</button>
                    <button onClick={()=>onDelete(t.id)} style={{background:'transparent',border:'none',color:'#4b5563',fontSize:18,cursor:'pointer',padding:'2px 6px'}}>✕</button>
                  </div>
                </div>
                <div style={{background:'#0d0f14',borderRadius:8,padding:'8px 12px',margin:'12px 0 10px',display:'flex',gap:16,flexWrap:'wrap'}}>
                  <div><div style={{fontSize:10,color:'#4b5563'}}>{t.fee_mode==='month'?'Monthly Fee':'Per Class'}</div><div style={{fontSize:15,fontWeight:800,color:'#fbbf24'}}>৳{Number(t.fee_amount||0).toLocaleString()}</div></div>
                  <div><div style={{fontSize:10,color:'#4b5563'}}>Per Class</div><div style={{fontSize:13,fontWeight:700,color:'#9ca3af'}}>৳{feePerClass.toFixed(0)}</div></div>
                  <div><div style={{fontSize:10,color:'#4b5563'}}>Cycle</div><div style={{fontSize:13,fontWeight:700,color:'#818cf8'}}>{cycle} classes</div></div>
                  <div><div style={{fontSize:10,color:'#4b5563'}}>Total</div><div style={{fontSize:13,fontWeight:700,color:'#e8eaf0'}}>{cnt}</div></div>
                  <div><div style={{fontSize:10,color:'#4b5563'}}>Cycle #</div><div style={{fontSize:13,fontWeight:700,color:'#22c55e'}}>#{Math.floor(cnt/cycle)+1}</div></div>
                </div>
                <MiniBar pct={(pos/cycle)*100} color={t.color}/>
                <div style={{fontSize:11,color:'#4b5563',marginTop:4}}>{pos}/{cycle} in current cycle</div>
              </div>

              {/* BACKFILL PANEL */}
              {isOpen && (
                <div style={{background:'#12141c',border:`1px solid ${t.color}44`,borderTop:'1px solid #1e2030',borderRadius:'0 0 16px 16px',padding:18}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                    <div><div style={{fontSize:14,fontWeight:700,color:'#f59e0b'}}>Past Classes — {t.name}</div><div style={{fontSize:12,color:'#6b7280'}}>Each row = one class with its own date</div></div>
                    <div style={{fontSize:12,color:'#6b7280',textAlign:'right'}}><div>Adding: {bfRows.length}</div><div style={{color:'#22c55e',fontWeight:700}}>Total → {cnt+bfRows.length}</div></div>
                  </div>
                  {/* Tab */}
                  <div style={{display:'flex',border:'1px solid #2d3148',borderRadius:10,overflow:'hidden',marginBottom:14,width:'fit-content'}}>
                    {[['add','＋ Add'],['edit','✏ Edit/Delete']].map(([id,lbl])=>(
                      <button key={id} onClick={()=>setBfTab(id)} style={{padding:'7px 16px',border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700,background:bfTab===id?'#f59e0b':'#0d0f14',color:bfTab===id?'#000':'#6b7280'}}>{lbl}</button>
                    ))}
                  </div>

                  {bfTab==='add' && (
                    <div>
                      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
                        {bfRows.map((row,i)=>(
                          <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr 32px',gap:8,alignItems:'center'}}>
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <span style={{fontSize:11,color:'#4b5563',fontWeight:700,minWidth:20}}>#{i+1}</span>
                              <input type="date" value={row.date} onChange={e=>setBfRows(p=>p.map((r,j)=>j===i?{...r,date:e.target.value}:r))} style={{...inp,flex:1}}/>
                            </div>
                            <Input placeholder="Note (optional)" value={row.note} onChange={e=>setBfRows(p=>p.map((r,j)=>j===i?{...r,note:e.target.value}:r))}/>
                            <button onClick={()=>setBfRows(p=>p.filter((_,j)=>j!==i))} disabled={bfRows.length===1} style={{background:'transparent',border:'1px solid #2d3148',borderRadius:6,color:bfRows.length===1?'#2d3148':'#f87171',cursor:bfRows.length===1?'default':'pointer',fontSize:16,width:32,height:42,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
                          </div>
                        ))}
                      </div>
                      <button onClick={()=>setBfRows(p=>[...p,{date:new Date().toISOString().split('T')[0],note:''}])} style={{background:'transparent',border:'1px dashed #f59e0b55',borderRadius:10,padding:'8px 16px',color:'#f59e0b',fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:13,width:'100%',marginBottom:14}}>+ Add Another Class</button>
                      <div style={{display:'flex',gap:10}}>
                        <Btn bg="#f59e0b" color="#000" onClick={()=>doBackfill(t.id)}>✓ Save {bfRows.length} Past Class{bfRows.length!==1?'es':''}</Btn>
                        <Btn bg="#2d3148" color="#9ca3af" onClick={()=>setBfId(null)}>Cancel</Btn>
                      </div>
                    </div>
                  )}

                  {bfTab==='edit' && (
                    <div>
                      {!pastSessions(t.id).length ? (
                        <div style={{textAlign:'center',padding:'20px 0',color:'#4b5563',fontSize:13}}>No past classes logged yet.</div>
                      ) : (
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                          {pastSessions(t.id).sort((a,b)=>a.date.localeCompare(b.date)).map((s,i)=>(
                            <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#0d0f14',borderRadius:10,padding:'10px 14px',border:'1px solid #1e2030'}}>
                              <div>
                                <div style={{fontSize:13,fontWeight:600,color:'#e8eaf0'}}>#{i+1} — {new Date(s.date+'T12:00:00').toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'})}</div>
                                {s.note&&<div style={{fontSize:11,color:'#6b7280',marginTop:2}}>{s.note}</div>}
                              </div>
                              <button onClick={()=>onDelete('session',s.id)} style={{background:'#f8717122',border:'1px solid #f8717144',borderRadius:8,padding:'5px 10px',color:'#f87171',fontWeight:700,cursor:'pointer',fontFamily:'inherit',fontSize:12}}>🗑</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{marginTop:14}}><Btn bg="#2d3148" color="#9ca3af" onClick={()=>setBfId(null)}>Close</Btn></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  HISTORY TAB
// ══════════════════════════════════════════════════════════════════════════════
function HistoryTab({ sessions, tuitions }) {
  const grouped = sessions.reduce((acc,s)=>{ acc[s.date]=acc[s.date]||[]; acc[s.date].push(s); return acc; },{});
  const dates = Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
  if (!sessions.length) return <EmptyState icon="🗂" text="No sessions logged yet." />;
  return (
    <div style={{paddingBottom:20}}>
      <SectionTitle>Session History</SectionTitle>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        {dates.map(date=>(
          <div key={date} style={{background:'#1a1d27',borderRadius:14,padding:16,border:'1px solid #1e2030'}}>
            <div style={{fontSize:13,fontWeight:700,color:'#9ca3af',marginBottom:10}}>
              {new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
              {grouped[date].map(s=>{
                const t = tuitions.find(x=>x.id===s.tuition_id);
                return (
                  <div key={s.id} style={{background:t?t.color+'22':'#2d3148',border:`1px solid ${t?t.color+'55':'#3d4168'}`,borderRadius:8,padding:'6px 12px',fontSize:12}}>
                    <span style={{color:t?t.color:'#9ca3af',fontWeight:700}}>{t?t.name:'Deleted'}</span>
                    <span style={{color:'#6b7280',marginLeft:6}}>{s.time_slot}{s.backfilled?' (past)':''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  EARNINGS TAB
// ══════════════════════════════════════════════════════════════════════════════
function EarningsTab({ earnings, tuitions, onAdd, onDelete }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ date:today, tuition_name:'', amount:'', notes:'' });
  const total = earnings.reduce((a,e)=>a+Number(e.amount),0);
  const byMonth = earnings.reduce((acc,e)=>{ const m=e.date.slice(0,7); acc[m]=(acc[m]||0)+Number(e.amount); return acc; },{});

  const add = () => {
    if (!form.amount||!form.tuition_name) return;
    onAdd({...form, amount:Number(form.amount)});
    setForm(p=>({...p,tuition_name:'',amount:'',notes:''}));
  };

  return (
    <div style={{paddingBottom:20}}>
      <SectionTitle>Earnings</SectionTitle>
      <div style={{background:'#1a1d27',borderRadius:16,padding:18,marginBottom:16,border:'1px solid #22c55e33'}}>
        <div style={{fontSize:12,color:'#6b7280',marginBottom:4}}>Total Earned (All Time)</div>
        <div style={{fontSize:30,fontWeight:800,color:'#22c55e'}}>৳{total.toLocaleString()}</div>
      </div>
      {Object.keys(byMonth).length>0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:10,marginBottom:16}}>
          {Object.entries(byMonth).sort((a,b)=>b[0].localeCompare(a[0])).map(([m,amt])=>(
            <div key={m} style={{background:'#1a1d27',borderRadius:12,padding:12,border:'1px solid #1e2030',textAlign:'center'}}>
              <div style={{fontSize:11,color:'#6b7280'}}>{MONTH_NAMES[parseInt(m.split('-')[1])-1]} {m.split('-')[0]}</div>
              <div style={{fontSize:18,fontWeight:800,color:'#22c55e',marginTop:4}}>৳{amt.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{background:'#1a1d27',borderRadius:14,padding:16,marginBottom:14,border:'1px solid #1e2030'}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Log Earning</div>
        <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:10}}>
          <input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} style={inp}/>
          <select value={form.tuition_name} onChange={e=>setForm(p=>({...p,tuition_name:e.target.value}))} style={inp}>
            <option value="">Select tuition</option>
            {tuitions.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
            <option value="Other">Other</option>
          </select>
          <Input type="number" placeholder="Amount (BDT)" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))}/>
          <div style={{display:'flex',gap:10}}>
            <Input placeholder="Notes (optional)" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} style={{flex:1}}/>
            <Btn bg="#22c55e" onClick={add} style={{whiteSpace:'nowrap'}}>+ Log</Btn>
          </div>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {earnings.slice().reverse().map(e=>(
          <div key={e.id} style={{background:'#1a1d27',borderRadius:12,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid #1e2030'}}>
            <div>
              <div style={{fontWeight:700,color:'#22c55e'}}>{e.tuition_name}</div>
              <div style={{fontSize:12,color:'#6b7280'}}>{e.date}{e.notes?` · ${e.notes}`:''}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <span style={{fontSize:17,fontWeight:800,color:'#22c55e'}}>৳{Number(e.amount).toLocaleString()}</span>
              <button onClick={()=>onDelete(e.id)} style={{background:'none',border:'none',color:'#4b5563',cursor:'pointer',fontSize:18}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXPENSES TAB
// ══════════════════════════════════════════════════════════════════════════════
function ExpensesTab({ expenses, onAdd, onDelete }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ date:today, product:'', amount:'', category:'', notes:'' });
  const total = expenses.reduce((a,e)=>a+Number(e.amount),0);

  const handleProduct = e => {
    const val = e.target.value;
    setForm(p=>({...p,product:val,category:val.length>2?guessCategory(val):p.category}));
  };

  const add = () => {
    if (!form.amount||!form.product) return;
    const cat = form.category||guessCategory(form.product);
    onAdd({...form,category:cat,amount:Number(form.amount)});
    setForm(p=>({...p,product:'',amount:'',category:'',notes:''}));
  };

  const catTotals = EXPENSE_CATS.map(c=>({cat:c,total:expenses.filter(e=>e.category===c).reduce((a,e)=>a+Number(e.amount),0)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  return (
    <div style={{paddingBottom:20}}>
      <SectionTitle>Expenses</SectionTitle>
      <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:140,background:'#1a1d27',borderRadius:14,padding:16,border:'1px solid #f8717133'}}>
          <div style={{fontSize:12,color:'#6b7280',marginBottom:4}}>Total Spent</div>
          <div style={{fontSize:26,fontWeight:800,color:'#f87171'}}>৳{total.toLocaleString()}</div>
        </div>
        {catTotals.slice(0,2).map(c=>(
          <div key={c.cat} style={{flex:1,minWidth:110,background:'#1a1d27',borderRadius:14,padding:16,border:`1px solid ${CAT_COLORS[c.cat]}33`}}>
            <div style={{fontSize:12,color:'#6b7280',marginBottom:4}}>{c.cat}</div>
            <div style={{fontSize:20,fontWeight:800,color:CAT_COLORS[c.cat]}}>৳{c.total.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div style={{background:'#1a1d27',borderRadius:14,padding:16,marginBottom:14,border:'1px solid #1e2030'}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Log Expense</div>
        <div style={{fontSize:11,color:'#6b7280',marginBottom:12}}>Auto-categorizes as you type</div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} style={inp}/>
            <Input type="number" placeholder="Amount (BDT)" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))}/>
          </div>
          <Input placeholder="Product / Item name" value={form.product} onChange={handleProduct}/>
          <select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))} style={inp}>
            <option value="">Category (auto-detect)</option>
            {EXPENSE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          {form.category&&<div style={{fontSize:12,color:CAT_COLORS[form.category]||'#9ca3af'}}>🏷 Auto-detected: <strong>{form.category}</strong></div>}
          <Btn bg="#f87171" onClick={add}>+ Add Expense</Btn>
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {expenses.slice().reverse().map(e=>(
          <div key={e.id} style={{background:'#1a1d27',borderRadius:12,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid #1e2030'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:9,height:9,borderRadius:'50%',background:CAT_COLORS[e.category]||'#9ca3af',flexShrink:0}}/>
              <div>
                <div style={{fontWeight:600,color:'#e8eaf0',fontSize:14}}>{e.product}</div>
                <div style={{fontSize:12,color:'#6b7280'}}>{e.date} · <span style={{color:CAT_COLORS[e.category]||'#9ca3af'}}>{e.category}</span></div>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <span style={{fontSize:16,fontWeight:800,color:'#f87171'}}>৳{Number(e.amount).toLocaleString()}</span>
              <button onClick={()=>onDelete(e.id)} style={{background:'none',border:'none',color:'#4b5563',cursor:'pointer',fontSize:18}}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  ANALYTICS TAB
// ══════════════════════════════════════════════════════════════════════════════
function AnalyticsTab({ earnings, expenses, tuitions, sessions, settings, setSettings }) {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.slice(0,7);
  const lastMonth = (() => { const d=new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); })();

  const mIncome  = earnings.filter(e=>e.date.startsWith(thisMonth)).reduce((a,e)=>a+Number(e.amount),0);
  const mExpense = expenses.filter(e=>e.date.startsWith(thisMonth)).reduce((a,e)=>a+Number(e.amount),0);
  const mNet     = mIncome - mExpense;
  const mSaveRate = mIncome > 0 ? (mNet/mIncome)*100 : 0;
  const lmIncome  = earnings.filter(e=>e.date.startsWith(lastMonth)).reduce((a,e)=>a+Number(e.amount),0);

  const target60 = mIncome * 0.40;
  const target80 = mIncome * 0.20;
  const gap60 = mExpense - target60;
  const gap80 = mExpense - target80;

  const catBreakdown = EXPENSE_CATS.map(cat=>({
    cat, amount:expenses.filter(e=>e.category===cat&&e.date.startsWith(thisMonth)).reduce((a,e)=>a+Number(e.amount),0),
  })).filter(c=>c.amount>0).sort((a,b)=>b.amount-a.amount);

  const nonEss = catBreakdown.filter(c=>NON_ESSENTIAL.includes(c.cat));
  const totalNE = nonEss.reduce((a,c)=>a+c.amount,0);
  const buildCuts = gap => gap<=0?[]:nonEss.map(c=>{ const cut=Math.round(gap*(totalNE>0?c.amount/totalNE:0)); return {...c,cut,pct:c.amount>0?Math.round((cut/c.amount)*100):0,after:Math.max(0,c.amount-cut)}; }).filter(c=>c.cut>0).sort((a,b)=>b.cut-a.cut);
  const cuts60 = buildCuts(gap60);
  const cuts80 = buildCuts(gap80);

  const last6 = Array.from({length:6},(_,i)=>{ const d=new Date(); d.setMonth(d.getMonth()-i); const m=d.toISOString().slice(0,7); return { label:MONTH_NAMES[parseInt(m.slice(5,7))-1], income:earnings.filter(e=>e.date.startsWith(m)).reduce((a,e)=>a+Number(e.amount),0), expense:expenses.filter(e=>e.date.startsWith(m)).reduce((a,e)=>a+Number(e.amount),0) }; }).reverse();
  const maxBar = Math.max(...last6.map(m=>Math.max(m.income,m.expense)),1);

  const tuitionStats = tuitions.map(t=>{ const {cycle,feePerClass}=getTuitionMeta(t); const cnt=sessions.filter(s=>s.tuition_id===t.id).length; const earned=Math.round(cnt*feePerClass); const paid=earnings.filter(e=>e.tuition_name===t.name).reduce((a,e)=>a+Number(e.amount),0); return {...t,cnt,earned,paid,pending:earned-paid}; });

  const statusColor = mSaveRate>=80?'#22c55e':mSaveRate>=60?'#fbbf24':'#f87171';
  const statusLabel = mSaveRate>=80?'🎯 Optimal — Saving 80%+':mSaveRate>=60?'✅ Good — Hitting 60% target':mSaveRate>=40?'⚠️ Moderate — Below 60% target':'🚨 Critical — Overspending';

  if (!mIncome && !mExpense && !earnings.length) return <EmptyState icon="📊" text="Add earnings and expenses to see analytics." />;

  return (
    <div style={{paddingBottom:20}}>
      <SectionTitle>Analytics</SectionTitle>

      {/* Status */}
      <div style={{background:`${statusColor}18`,border:`1px solid ${statusColor}55`,borderRadius:14,padding:'14px 18px',marginBottom:16}}>
        <div style={{fontSize:15,fontWeight:800,color:statusColor}}>{statusLabel}</div>
        <div style={{fontSize:12,color:'#9ca3af',marginTop:3}}>Saving <strong style={{color:statusColor}}>{Math.max(0,mSaveRate).toFixed(1)}%</strong> this month · ৳{Math.abs(mNet).toLocaleString()} {mNet>=0?'saved':'deficit'}</div>
      </div>

      {/* This month */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
        {[{l:'Income',v:mIncome,c:'#22c55e'},{l:'Spent',v:mExpense,c:'#f87171'},{l:'Saved',v:mNet,c:mNet>=0?'#fbbf24':'#f87171'}].map(s=>(
          <div key={s.l} style={{background:'#1a1d27',borderRadius:12,padding:14,border:'1px solid #1e2030'}}>
            <div style={{fontSize:11,color:'#6b7280'}}>{s.l}</div>
            <div style={{fontSize:20,fontWeight:800,color:s.c,marginTop:3}}>৳{Math.abs(s.v).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Targets */}
      {mIncome>0&&(
        <div style={{background:'#1a1d27',borderRadius:14,padding:16,marginBottom:16,border:'1px solid #1e2030'}}>
          <div style={{fontSize:14,fontWeight:800,marginBottom:14}}>🎯 Saving Targets</div>
          {[{label:'Save 60%',target:target60,gap:gap60,color:'#fbbf24'},{label:'Save 80%',target:target80,gap:gap80,color:'#22c55e'}].map(t=>(
            <div key={t.label} style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontWeight:700,color:t.color,fontSize:13}}>{t.label} <span style={{fontSize:11,color:'#6b7280',fontWeight:400}}>— spend ≤ ৳{Math.round(t.target).toLocaleString()}</span></span>
                <span style={{fontSize:12,fontWeight:700,color:t.gap<=0?'#22c55e':'#f87171'}}>{t.gap<=0?`✓ under by ৳${Math.abs(Math.round(t.gap)).toLocaleString()}`:`over by ৳${Math.round(t.gap).toLocaleString()}`}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <MiniBar pct={mIncome>0?(mExpense/t.target)*100:0} color={t.gap<=0?'#22c55e':'#f87171'}/>
                <span style={{fontSize:11,color:'#6b7280',whiteSpace:'nowrap'}}>{mIncome>0?Math.round((mExpense/t.target)*100):0}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cut recommendations */}
      {mIncome>0&&(gap60>0||gap80>0)&&(
        <div style={{background:'#1a1d27',borderRadius:14,padding:16,marginBottom:16,border:'1px solid #f8717133'}}>
          <div style={{fontSize:14,fontWeight:800,marginBottom:4}}>✂️ Where to Cut</div>
          <div style={{fontSize:12,color:'#6b7280',marginBottom:14}}>Cuts spread across non-essential categories proportionally.</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {(gap80>0?cuts80:cuts60).map(c=>(
              <div key={c.cat} style={{background:'#0d0f14',borderRadius:10,padding:'10px 14px'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:13,fontWeight:700,color:CAT_COLORS[c.cat]}}>{c.cat}</span>
                  <span style={{fontSize:12,color:'#f87171'}}>cut ৳{c.cut.toLocaleString()} ({c.pct}%) → ৳{c.after.toLocaleString()}</span>
                </div>
                <MiniBar pct={(c.after/c.amount)*100} color={CAT_COLORS[c.cat]}/>
              </div>
            ))}
          </div>
          {/* Plain-language tips */}
          <div style={{marginTop:14,display:'flex',flexDirection:'column',gap:8}}>
            {(gap80>0?cuts80:cuts60).slice(0,3).map((c,i)=>{
              const tips = { Food:'Cook at home, pack meals.',Transport:'Use public transport or walk short distances.',Entertainment:'Limit outings, cancel unused subscriptions.',Clothing:'Avoid impulse buys — shop only when needed.',Other:'Review and eliminate unnecessary spending.' };
              return <div key={i} style={{background:`${CAT_COLORS[c.cat]}11`,border:`1px solid ${CAT_COLORS[c.cat]}33`,borderRadius:10,padding:'10px 14px',fontSize:12,color:'#9ca3af'}}><strong style={{color:CAT_COLORS[c.cat]}}>💡 {c.cat}:</strong> {tips[c.cat]||tips.Other} Save ৳{c.cut.toLocaleString()} here.</div>;
            })}
          </div>
        </div>
      )}

      {/* Good job banner */}
      {mIncome>0&&gap60<=0&&(
        <div style={{background:'#22c55e18',border:'1px solid #22c55e44',borderRadius:14,padding:'14px 18px',marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:800,color:'#22c55e'}}>🎉 {gap80<=0?'Saving 80%+!':'Hitting 60% target!'}</div>
          <div style={{fontSize:12,color:'#9ca3af',marginTop:4}}>{gap80<=0?'Excellent! Keep it up.':`Cut ৳${Math.round(gap80).toLocaleString()} more in non-essentials to reach 80%.`}</div>
        </div>
      )}

      {/* Spending breakdown */}
      {catBreakdown.length>0&&(
        <div style={{background:'#1a1d27',borderRadius:14,padding:16,marginBottom:16,border:'1px solid #1e2030'}}>
          <div style={{fontSize:14,fontWeight:800,marginBottom:14}}>🗂 This Month by Category</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {catBreakdown.map(c=>{
              const pct = mExpense>0?(c.amount/mExpense)*100:0;
              return (
                <div key={c.cat}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:CAT_COLORS[c.cat]}}/>
                      <span style={{fontSize:13,fontWeight:600,color:CAT_COLORS[c.cat]}}>{c.cat}</span>
                      {ESSENTIAL.includes(c.cat)&&<span style={{fontSize:10,color:'#4b5563',background:'#1e2030',borderRadius:4,padding:'1px 6px'}}>essential</span>}
                    </div>
                    <span style={{fontSize:13,fontWeight:700,color:'#e8eaf0'}}>৳{c.amount.toLocaleString()} <span style={{color:'#4b5563',fontWeight:400}}>({pct.toFixed(0)}%)</span></span>
                  </div>
                  <MiniBar pct={pct} color={CAT_COLORS[c.cat]}/>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6-month chart */}
      <div style={{background:'#1a1d27',borderRadius:14,padding:16,marginBottom:16,border:'1px solid #1e2030'}}>
        <div style={{fontSize:14,fontWeight:800,marginBottom:14}}>📈 6-Month Trend</div>
        <div style={{display:'flex',gap:6,alignItems:'flex-end',height:110}}>
          {last6.map((m,i)=>(
            <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
              <div style={{display:'flex',gap:3,alignItems:'flex-end',height:90}}>
                <div style={{width:12,background:'#22c55e',borderRadius:'4px 4px 0 0',height:`${(m.income/maxBar)*90}px`,minHeight:m.income>0?3:0}}/>
                <div style={{width:12,background:'#f87171',borderRadius:'4px 4px 0 0',height:`${(m.expense/maxBar)*90}px`,minHeight:m.expense>0?3:0}}/>
              </div>
              <div style={{fontSize:10,color:'#6b7280'}}>{m.label}</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:14,marginTop:8}}>
          {[['#22c55e','Income'],['#f87171','Expense']].map(([c,l])=>(
            <div key={l} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#6b7280'}}>
              <div style={{width:10,height:10,background:c,borderRadius:2}}/>{l}
            </div>
          ))}
        </div>
      </div>

      {/* Smart suggestions */}
      {(()=>{
        const suggs = [];
        const bigCat = catBreakdown[0];
        if (bigCat&&mExpense>0&&(bigCat.amount/mExpense)*100>40&&!ESSENTIAL.includes(bigCat.cat)) suggs.push({icon:'💸',color:'#f87171',title:`${bigCat.cat} is ${Math.round((bigCat.amount/mExpense)*100)}% of spending`,body:`৳${bigCat.amount.toLocaleString()} spent. Cut 30% to free up ৳${Math.round(bigCat.amount*0.3).toLocaleString()}.`});
        const lmExp = expenses.filter(e=>e.date.startsWith(lastMonth)).reduce((a,e)=>a+Number(e.amount),0);
        if (lmExp>0&&mExpense>lmExp*1.15) suggs.push({icon:'📈',color:'#f87171',title:`Spending up ${Math.round(((mExpense-lmExp)/lmExp)*100)}% vs last month`,body:`Last month ৳${lmExp.toLocaleString()}, this month ৳${mExpense.toLocaleString()}. Watch non-essentials.`});
        const uncol = tuitionStats.filter(t=>t.pending>0);
        if (uncol.length) suggs.push({icon:'💰',color:'#fbbf24',title:`৳${uncol.reduce((a,t)=>a+t.pending,0).toLocaleString()} uncollected tuition fees`,body:`${uncol.map(t=>t.name).join(', ')} ha${uncol.length===1?'s':'ve'} unpaid balances.`});
        if (mIncome>0&&mSaveRate<60) suggs.push({icon:'🎯',color:'#818cf8',title:`Cut ৳${Math.round(gap60).toLocaleString()} to hit 60% savings`,body:`Currently saving ${mSaveRate.toFixed(0)}%. Reduce non-essentials.`});
        else if (mIncome>0&&mSaveRate<80) suggs.push({icon:'⭐',color:'#22c55e',title:`৳${Math.round(gap80).toLocaleString()} away from 80% savings`,body:`At ${mSaveRate.toFixed(0)}% — almost there!`});
        if (mIncome>0&&mSaveRate>=80) suggs.push({icon:'🏆',color:'#22c55e',title:'Excellent financial health!',body:`Saving ${mSaveRate.toFixed(0)}%. Projected annual savings: ৳${Math.round((mIncome-mExpense)*12).toLocaleString()}.`});
        if (!suggs.length) return null;
        return (
          <div style={{background:'#1a1d27',borderRadius:14,padding:16,marginBottom:16,border:'1px solid #818cf833'}}>
            <div style={{fontSize:14,fontWeight:800,marginBottom:14}}>💡 Smart Suggestions</div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {suggs.map((s,i)=>(
                <div key={i} style={{background:`${s.color}0d`,border:`1px solid ${s.color}33`,borderRadius:12,padding:'12px 14px',display:'flex',gap:10}}>
                  <span style={{fontSize:20,flexShrink:0}}>{s.icon}</span>
                  <div><div style={{fontSize:13,fontWeight:700,color:s.color,marginBottom:3}}>{s.title}</div><div style={{fontSize:12,color:'#9ca3af',lineHeight:1.6}}>{s.body}</div></div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Alert settings */}
      <div style={{background:'#1a1d27',borderRadius:14,padding:16,border:'1px solid #f8717133'}}>
        <div style={{fontSize:14,fontWeight:800,marginBottom:4}}>🔔 Expense Alert</div>
        <div style={{fontSize:12,color:'#6b7280',marginBottom:14}}>Get a popup when spending crosses % of projected income.</div>
        <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
          <div onClick={()=>setSettings(p=>({...p,expenseAlert:!p.expenseAlert}))} style={{width:44,height:24,borderRadius:99,cursor:'pointer',position:'relative',background:settings.expenseAlert?'#f87171':'#2d3148',flexShrink:0}}>
            <div style={{position:'absolute',top:3,left:settings.expenseAlert?22:3,width:18,height:18,borderRadius:'50%',background:'#fff',transition:'left .2s'}}/>
          </div>
          <span style={{fontSize:13,color:settings.expenseAlert?'#f87171':'#6b7280',fontWeight:600}}>{settings.expenseAlert?'Alert ON':'Alert OFF'}</span>
          {settings.expenseAlert&&(
            <div style={{display:'flex',alignItems:'center',gap:10,flex:1,minWidth:200}}>
              <input type="range" min={30} max={90} step={5} value={settings.alertThreshold} onChange={e=>setSettings(p=>({...p,alertThreshold:Number(e.target.value)}))} style={{flex:1,accentColor:'#f87171'}}/>
              <span style={{fontSize:15,fontWeight:800,color:'#f87171',minWidth:36}}>{settings.alertThreshold}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('today');
  const [tuitions, setTuitions]   = useState([]);
  const [sessions, setSessions]   = useState([]);
  const [earnings, setEarnings]   = useState([]);
  const [expenses, setExpenses]   = useState([]);
  const [settings, setSettings]   = useState({ expenseAlert:true, alertThreshold:60 });
  const [modal, setModal]         = useState(null);
  const [reminderList, setReminderList] = useState([]);
  const [alertShown, setAlertShown] = useState(false);
  const [toast, setToast]         = useState(null);
  const [syncing, setSyncing]     = useState(false);

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  // ── Auth listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null); setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load data from Supabase ───────────────────────────────────────────────
  const loadAll = useCallback(async (uid) => {
    setSyncing(true);
    const [t,s,e,x] = await Promise.all([
      dbLoad('tuitions',uid), dbLoad('sessions',uid),
      dbLoad('earnings',uid), dbLoad('expenses',uid),
    ]);
    setTuitions(t); setSessions(s); setEarnings(e); setExpenses(x);
    setSyncing(false);
  }, []);

  useEffect(() => { if (user) loadAll(user.id); }, [user, loadAll]);

  // ── Cycle reminder ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tuitions.length) return;
    const reminders = tuitions.filter(t => {
      const { cycle } = getTuitionMeta(t);
      const cnt = sessions.filter(s=>s.tuition_id===t.id).length;
      return cnt>0 && cnt%cycle===0;
    });
    if (reminders.length) { setReminderList(reminders); setModal('reminder'); }
  }, [sessions, tuitions]);

  // ── Expense alert ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!settings.expenseAlert||alertShown||!user) return;
    const m = new Date().toISOString().slice(0,7);
    const mInc  = earnings.filter(e=>e.date.startsWith(m)).reduce((a,e)=>a+Number(e.amount),0);
    const proj  = mInc || (() => { const avgs=[1,2,3].map(i=>{ const d=new Date(); d.setMonth(d.getMonth()-i); const mm=d.toISOString().slice(0,7); return earnings.filter(e=>e.date.startsWith(mm)).reduce((a,e)=>a+Number(e.amount),0); }); const nz=avgs.filter(v=>v>0); return nz.length?nz.reduce((a,v)=>a+v,0)/nz.length:0; })();
    if (proj<=0) return;
    const mExp  = expenses.filter(e=>e.date.startsWith(m)).reduce((a,e)=>a+Number(e.amount),0);
    if ((mExp/proj)*100 >= settings.alertThreshold) { setAlertShown(true); setModal('expenseAlert'); }
  }, [expenses, earnings, settings, alertShown, user]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];

  const handleLogSession = async (tuitionId, timeSlot, date, alreadyLogged) => {
    if (alreadyLogged) {
      const s = sessions.find(s=>s.tuition_id===tuitionId&&s.date===date&&s.time_slot===timeSlot);
      if (s) { setSessions(p=>p.filter(x=>x.id!==s.id)); await dbDelete('sessions',s.id); showToast('Session removed','info'); }
    } else {
      const row = { id:Date.now().toString(), user_id:user.id, tuition_id:tuitionId, time_slot:timeSlot, date, backfilled:false, note:'' };
      setSessions(p=>[...p,row]); await dbUpsert('sessions',row); showToast('Session logged ✓');
    }
  };

  const handleSaveTuition = async (data) => {
    const row = { ...data, user_id:user.id, id:data.id||Date.now().toString() };
    setTuitions(p=>data.id?p.map(t=>t.id===data.id?row:t):[...p,row]);
    await dbUpsert('tuitions',row);
    showToast(data.id?'Tuition updated':'Tuition added');
  };

  const handleDeleteTuition = async (id) => {
    setTuitions(p=>p.filter(t=>t.id!==id)); await dbDelete('tuitions',id);
  };

  const handleDeleteSession = async (_, id) => {
    setSessions(p=>p.filter(s=>s.id!==id)); await dbDelete('sessions',id);
  };

  const handleBackfill = async (tuitionId, rows) => {
    const newSessions = rows.map((r,i)=>({ id:(Date.now()+i).toString(), user_id:user.id, tuition_id:tuitionId, time_slot:'Manual entry', date:r.date, note:r.note||'Past class', backfilled:true }));
    setSessions(p=>[...p,...newSessions]);
    await Promise.all(newSessions.map(s=>dbUpsert('sessions',s)));
    showToast(`${rows.length} past class${rows.length!==1?'es':''} added`);
  };

  const handleAddEarning = async (data) => {
    const row = { ...data, id:Date.now().toString(), user_id:user.id };
    setEarnings(p=>[...p,row]); await dbUpsert('earnings',row); showToast('Earning logged ৳'+data.amount);
  };

  const handleDeleteEarning = async (id) => {
    setEarnings(p=>p.filter(e=>e.id!==id)); await dbDelete('earnings',id);
  };

  const handleAddExpense = async (data) => {
    const row = { ...data, id:Date.now().toString(), user_id:user.id };
    setExpenses(p=>[...p,row]); await dbUpsert('expenses',row); showToast('Expense added ✓');
  };

  const handleDeleteExpense = async (id) => {
    setExpenses(p=>p.filter(e=>e.id!==id)); await dbDelete('expenses',id);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessions.map(s=>{ const t=tuitions.find(x=>x.id===s.tuition_id); return { Date:s.date, Day:DAYS[new Date(s.date+'T12:00:00').getDay()], Tuition:t?t.name:'Deleted', 'Time Slot':s.time_slot, Subject:t?t.subject:'', Backfilled:s.backfilled?'Yes':'No' }; })), 'Sessions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tuitions.map(t=>{ const {cycle,feePerClass}=getTuitionMeta(t); const cnt=sessions.filter(s=>s.tuition_id===t.id).length; return { Tuition:t.name, Subject:t.subject, 'Fee Mode':t.fee_mode, 'Fee Amount':t.fee_amount, 'Cycle Length':cycle, 'Total Sessions':cnt, 'Cycles Done':Math.floor(cnt/cycle), 'Per Class':feePerClass.toFixed(0), 'Total Earned':Math.round(cnt*feePerClass) }; })), 'Progress');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(earnings.map(e=>({ Date:e.date, Tuition:e.tuition_name, 'Amount (BDT)':e.amount, Notes:e.notes }))), 'Earnings');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenses.map(e=>({ Date:e.date, Category:e.category, Product:e.product, 'Amount (BDT)':e.amount }))), 'Expenses');
    XLSX.writeFile(wb, `TuitionDesk_${today}.xlsx`);
    showToast('Exported! 📊');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{minHeight:'100vh',background:'#0d0f14',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}><div style={{fontSize:48,marginBottom:12}}>📚</div><div style={{color:'#6b7280',fontSize:14}}>Loading...</div></div>
    </div>
  );

  if (!user) return <AuthScreen onAuth={u=>setUser(u)} />;

  const thisMonth = today.slice(0,7);
  const mInc = earnings.filter(e=>e.date.startsWith(thisMonth)).reduce((a,e)=>a+Number(e.amount),0);
  const mExp = expenses.filter(e=>e.date.startsWith(thisMonth)).reduce((a,e)=>a+Number(e.amount),0);

  const TABS = [
    { id:'today',    icon:'📅', label:'Today' },
    { id:'tuitions', icon:'📚', label:'Tuitions' },
    { id:'history',  icon:'🗂',  label:'History' },
    { id:'earnings', icon:'💰', label:'Earnings' },
    { id:'expenses', icon:'🛒', label:'Expenses' },
    { id:'analytics',icon:'📊', label:'Analytics' },
  ];

  return (
    <div style={{fontFamily:"'Sora',sans-serif",minHeight:'100vh',background:'#0d0f14',color:'#e8eaf0',maxWidth:600,margin:'0 auto',position:'relative'}}>

      {/* HEADER */}
      <div style={{background:'linear-gradient(135deg,#1a1d27,#12141c)',borderBottom:'1px solid #1e2030',padding:'14px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,zIndex:100}}>
        <div>
          <div style={{fontSize:20,fontWeight:800,color:'#fff'}}>📚 TuitionDesk {syncing&&<span style={{fontSize:11,color:'#6b7280',fontWeight:400,marginLeft:6}}>syncing…</span>}</div>
          <div style={{fontSize:11,color:'#6b7280',marginTop:1}}>{new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={exportExcel} style={{background:'#22c55e22',border:'1px solid #22c55e44',borderRadius:8,padding:'7px 12px',color:'#22c55e',fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>⬇ Excel</button>
          <button onClick={()=>signOut()} style={{background:'#2d3148',border:'none',borderRadius:8,padding:'7px 12px',color:'#6b7280',fontWeight:700,fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>Out</button>
        </div>
      </div>

      {/* STAT BAR */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,padding:'12px 14px 0'}}>
        {[
          {l:'Earned',v:`৳${mInc.toLocaleString()}`,c:'#22c55e'},
          {l:'Spent', v:`৳${mExp.toLocaleString()}`,c:'#f87171'},
          {l:'Tuitions',v:tuitions.length,c:'#818cf8'},
          {l:'Sessions',v:sessions.length,c:'#fbbf24'},
        ].map(s=>(
          <div key={s.l} style={{background:'#1a1d27',borderRadius:12,padding:'10px 12px',border:'1px solid #1e2030'}}>
            <div style={{fontSize:10,color:'#6b7280'}}>{s.l}</div>
            <div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{padding:'16px 14px',paddingBottom:80}}>
        {tab==='today'    && <TodayTab tuitions={tuitions} sessions={sessions} onLog={handleLogSession}/>}
        {tab==='tuitions' && <TuitionsTab tuitions={tuitions} sessions={sessions} onSave={handleSaveTuition} onDelete={handleDeleteTuition} onBackfill={handleBackfill}/>}
        {tab==='history'  && <HistoryTab sessions={sessions} tuitions={tuitions}/>}
        {tab==='earnings' && <EarningsTab earnings={earnings} tuitions={tuitions} onAdd={handleAddEarning} onDelete={handleDeleteEarning}/>}
        {tab==='expenses' && <ExpensesTab expenses={expenses} onAdd={handleAddExpense} onDelete={handleDeleteExpense}/>}
        {tab==='analytics'&& <AnalyticsTab earnings={earnings} expenses={expenses} tuitions={tuitions} sessions={sessions} settings={settings} setSettings={setSettings}/>}
      </div>

      {/* BOTTOM NAV */}
      <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:600,background:'#12141c',borderTop:'1px solid #1e2030',display:'flex',zIndex:200}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:'10px 0 12px',border:'none',background:'transparent',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
            <span style={{fontSize:18}}>{t.icon}</span>
            <span style={{fontSize:10,fontWeight:600,fontFamily:'inherit',color:tab===t.id?'#818cf8':'#4b5563'}}>{t.label}</span>
            {tab===t.id&&<div style={{width:18,height:2,background:'#818cf8',borderRadius:99}}/>}
          </button>
        ))}
      </div>

      {/* MODALS */}
      {modal==='reminder'&&(
        <Modal onClose={()=>setModal(null)}>
          <div style={{textAlign:'center',padding:8}}>
            <div style={{fontSize:44}}>🎉</div>
            <div style={{fontSize:19,fontWeight:800,margin:'12px 0 8px'}}>Cycle Complete!</div>
            {reminderList.map(t=>{ const {cycle}=getTuitionMeta(t); const cnt=sessions.filter(s=>s.tuition_id===t.id).length; return <div key={t.id} style={{background:'#0d0f14',borderRadius:10,padding:'10px 14px',margin:'6px 0',color:'#22c55e',fontWeight:700}}>{t.name} — {cnt} classes ({Math.floor(cnt/cycle)} cycles done)</div>; })}
            <p style={{color:'#9ca3af',fontSize:13,marginTop:10}}>Time to collect payment!</p>
            <Btn bg="#818cf8" onClick={()=>setModal(null)} style={{marginTop:14,width:'100%'}}>Got it!</Btn>
          </div>
        </Modal>
      )}

      {modal==='expenseAlert'&&(()=>{
        const m=today.slice(0,7);
        const mInc2=earnings.filter(e=>e.date.startsWith(m)).reduce((a,e)=>a+Number(e.amount),0);
        const proj=mInc2||(() => { const avgs=[1,2,3].map(i=>{const d=new Date();d.setMonth(d.getMonth()-i);const mm=d.toISOString().slice(0,7);return earnings.filter(e=>e.date.startsWith(mm)).reduce((a,e)=>a+Number(e.amount),0);}); const nz=avgs.filter(v=>v>0); return nz.length?nz.reduce((a,v)=>a+v,0)/nz.length:0; })();
        const mExp2=expenses.filter(e=>e.date.startsWith(m)).reduce((a,e)=>a+Number(e.amount),0);
        const pct=proj>0?Math.round((mExp2/proj)*100):0;
        return (
          <Modal onClose={()=>setModal(null)}>
            <div style={{textAlign:'center',padding:8}}>
              <div style={{fontSize:44}}>🚨</div>
              <div style={{fontSize:18,fontWeight:800,margin:'10px 0 6px',color:'#f87171'}}>Expense Alert!</div>
              <div style={{fontSize:13,color:'#9ca3af',marginBottom:14}}>Spending crossed <strong style={{color:'#f87171'}}>{settings.alertThreshold}%</strong> of projected income.</div>
              <div style={{background:'#0d0f14',borderRadius:12,padding:14,marginBottom:14,textAlign:'left'}}>
                {[['Projected Income',`৳${Math.round(proj).toLocaleString()}`,'#22c55e'],['Spent So Far',`৳${mExp2.toLocaleString()}`,'#f87171'],['Spend %',`${pct}%`,'#f87171']].map(([l,v,c])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',marginBottom:8}}><span style={{fontSize:12,color:'#6b7280'}}>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span></div>
                ))}
                <div style={{background:'#1a1d27',borderRadius:6,height:8,overflow:'hidden',marginTop:4}}><div style={{width:`${Math.min(100,pct)}%`,height:'100%',background:'#f87171',borderRadius:6}}/></div>
              </div>
              <div style={{display:'flex',gap:10}}>
                <Btn bg="#818cf8" onClick={()=>{ setModal(null); setTab('analytics'); }} style={{flex:1}}>View Analytics</Btn>
                <Btn bg="#2d3148" color="#9ca3af" onClick={()=>setModal(null)} style={{flex:1}}>Dismiss</Btn>
              </div>
            </div>
          </Modal>
        );
      })()}

      <Toast toast={toast}/>
      <style>{`* { box-sizing:border-box; } input[type=date]::-webkit-calendar-picker-indicator { filter:invert(1); } ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#2d3148;border-radius:2px}`}</style>
    </div>
  );
}
