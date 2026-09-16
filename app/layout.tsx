import type {Metadata} from 'next';
import {getStore,config} from '@/lib/db';
import {StoreProvider} from '@/components/store/provider';
import {Shell} from '@/components/store/shared';
import './globals.css';
export const dynamic='force-dynamic';
export function generateMetadata():Metadata{return{metadataBase:new URL(config('APP_URL')||'http://localhost:5173'),title:{default:'Dress to Impress | The Everyday Edit',template:'%s | Dress to Impress'},description:'Discover the Dress to Impress edit. Considered pieces, effortless combinations, and a wardrobe that feels like you. Preview collection with labeled demo content.',openGraph:{title:'Dress to Impress | The Everyday Edit',description:'Considered pieces. Effortless combinations. A wardrobe that feels like you.',type:'website'},twitter:{card:'summary',title:'Dress to Impress | The Everyday Edit'},icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}}}
export default async function RootLayout({children}:{children:React.ReactNode}){const data=await getStore();return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;450;500;550;600;700&family=Italiana&display=swap" rel="stylesheet"/>{data.settings.favicon&&<link rel="icon" href={data.settings.favicon}/>}</head><body style={{'--heading-font':data.settings.font+', Georgia, serif'} as React.CSSProperties}><a href="#main" className="skip-link">Skip to content</a><StoreProvider data={data}><Shell>{children}</Shell></StoreProvider></body></html>}

