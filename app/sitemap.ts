import type {MetadataRoute} from 'next';
import {getStore,config} from '@/lib/db';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{const origin=config('APP_URL')||'http://localhost:5173';const {products}=await getStore();return[...['','shop','about','contact','faq','shipping','returns','privacy','terms'].map(p=>({url:origin+'/'+p})),...products.map(p=>({url:origin+'/product/'+p.slug,lastModified:new Date(p.createdAt+'Z')}))]}

