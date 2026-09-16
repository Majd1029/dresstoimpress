import type {MetadataRoute} from 'next';
import {config} from '@/lib/db';
export default function robots():MetadataRoute.Robots{return{rules:{userAgent:'*',allow:'/',disallow:['/admin','/api','/account','/cart','/checkout','/order']},sitemap:(config('APP_URL')||'http://localhost:5173')+'/sitemap.xml'}}

