'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main id="main" className="empty-state"><span className="eyebrow">LET’S TRY THAT AGAIN</span><h1>A moment, please.</h1><p>We couldn’t load this page. Your saved bag is still here.</p><button className="button" onClick={reset}>Try again</button><a href="/">Return home</a></main>}

