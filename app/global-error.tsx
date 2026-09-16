'use client';
export default function GlobalError({reset}:{reset:()=>void}){return <html lang="en"><body style={{fontFamily:'Georgia,serif',padding:'15vh 10%',background:'#fbfaf7',color:'#592d35'}}><h1>Dress to Impress</h1><h2>We’ll be right back.</h2><p>The store is temporarily unavailable. Please try again in a moment.</p><button onClick={reset} style={{padding:'14px 22px',background:'#592d35',color:'white',border:0}}>Try again</button></body></html>}

