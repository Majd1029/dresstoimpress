import 'server-only';
import {env} from 'cloudflare:workers';
import {defaultHome,defaultSettings,images} from './brand';
import type {StoreData,Product} from './types';
export const db=()=>{if(!env.DB)throw new Error('The store database is unavailable. Please try again shortly.');return env.DB;};
export const one=async<T=any>(sql:string,...values:any[])=>db().prepare(sql).bind(...values).first<T>();
export const all=async<T=any>(sql:string,...values:any[])=>(await db().prepare(sql).bind(...values).all<T>()).results;
export const run=async(sql:string,...values:any[])=>db().prepare(sql).bind(...values).run();
export const stmt=(sql:string,...values:any[])=>db().prepare(sql).bind(...values);
export const uid=()=>crypto.randomUUID();
export const config=(key:string)=>String((env as unknown as Record<string,unknown>)[key]??process.env[key]??'');
// Fixed, internal identifiers only; values stay bound. One statement per table
// avoids exceeding Workers Free's 50-query limit during first-time setup.
function seedInsert(table:string,columns:string[],rows:unknown[][]){return stmt(
 'INSERT OR IGNORE INTO '+table+' ('+columns.join(',')+') SELECT '+columns.map((_,i)=>"json_extract(value,'$["+i+"]')").join(',')+' FROM json_each(?)',JSON.stringify(rows));}
export async function seedDemo(){
 if(await one("SELECT id FROM site_settings WHERE id='store'"))return;
 const categories=[['dresses','Dresses',images.silk],['tailoring','Tailoring',images.suit],['tops','Tops',images.blouse],['co-ords','Co-ords',images.detail]];
 const seeds=[['The Everyday Blazer','tailoring',9800,null,images.hero,'Oat',1,1,0],['The After Hours Dress','dresses',8900,null,images.black,'Black',1,1,1],['The Essential Blouse','tops',5900,null,images.blouse,'Ivory',1,1,0],['The Tailored Set','co-ords',12900,10900,images.suit,'Sand',1,0,1],['The Velvet Moment','dresses',11900,null,images.burgundy,'Burgundy',0,1,1],['The Garden Slip Dress','dresses',9500,null,images.silk,'Cream',0,1,0],['The Soft Structure Blazer','tailoring',10500,null,images.detail,'Beige',0,0,1],['The Evening Edit','dresses',7900,6500,images.black,'Black',0,0,0]];
 const products:unknown[][]=[],productImages:unknown[][]=[],variants:unknown[][]=[],inventory:unknown[][]=[];
 seeds.forEach(([name,cat,price,sale,image,color,featured,isNew,best],i)=>{
  const id='demo-'+(i+1),slug=String(name).toLowerCase().replaceAll(' ','-');
  products.push([id,name,slug,'An effortless addition to your everyday edit. This is a demo product with illustrative photography and pricing. Actual fit, materials and garment details must be confirmed by the owner.',price,sale,'DEMO-'+(i+1),cat,'Composition pending owner confirmation.','Care instructions pending owner confirmation.',featured,isNew,best,1,1]);
  [image,image].forEach((url,j)=>productImages.push([id+'-image-'+j,id,url,'Demo photography for '+name+(j?' — detail view':''),j]));
  ['XS','S','M','L','XL'].forEach((size,j)=>{const vid=id+'-'+size;variants.push([vid,id,size,color]);inventory.push([vid,i===7?0:j===4?2:8,3]);});
 });
 await db().batch([
  stmt("INSERT OR IGNORE INTO site_settings (id,data) VALUES ('store',?)",JSON.stringify(defaultSettings)),
  stmt("INSERT OR IGNORE INTO homepage_content (id,data) VALUES ('home',?)",JSON.stringify(defaultHome)),
  seedInsert('categories',['id','name','slug','image','position'],categories.map(([id,name,image],i)=>[id,name,id,image,i])),
  seedInsert('products',['id','name','slug','description','price','sale_price','sku','category_id','materials','care','featured','is_new','best_seller','published','demo'],products),
  seedInsert('product_images',['id','product_id','url','alt','position'],productImages),
  seedInsert('product_variants',['id','product_id','size','color'],variants),
  seedInsert('inventory',['variant_id','stock','threshold'],inventory),
 ]);
}
export async function getStore(admin=false):Promise<StoreData>{
 await seedDemo();
 const [rows,imgs,variants,categories,settings,home]=await Promise.all([all("SELECT p.*,c.name category FROM products p LEFT JOIN categories c ON c.id=p.category_id "+(admin?'':'WHERE p.published=1')+' ORDER BY p.created_at DESC,p.id'),all('SELECT * FROM product_images ORDER BY position'),all('SELECT v.*,i.stock,i.threshold FROM product_variants v JOIN inventory i ON i.variant_id=v.id'),all('SELECT * FROM categories ORDER BY position,name'),one("SELECT data FROM site_settings WHERE id='store'"),one("SELECT data FROM homepage_content WHERE id='home'")]);
 const products:Product[]=rows.map(r=>({...r,categoryId:r.category_id,salePrice:r.sale_price,isNew:r.is_new,bestSeller:r.best_seller,createdAt:r.created_at,images:imgs.filter(i=>i.product_id===r.id),variants:variants.filter(v=>v.product_id===r.id).map(v=>({...v,productId:v.product_id}))}));
 return {products,categories,settings:{...defaultSettings,...JSON.parse(settings.data)},home:{...defaultHome,...JSON.parse(home.data)}};
}

