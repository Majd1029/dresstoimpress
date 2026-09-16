'use client';
import {createContext,useContext,useEffect,useState,useCallback} from 'react';
import {Toaster,toast} from 'sonner';
import type {StoreData,Viewer,CartLine} from '@/lib/types';
type Context=StoreData&{user:Viewer;csrf:string;cart:CartLine[];ready:boolean;api:(path:string,body?:any)=>Promise<any>;add:(variantId:string,quantity:number)=>Promise<void>;update:(variantId:string,quantity:number)=>Promise<void>;refreshSession:()=>Promise<void>};
const StoreContext=createContext<Context|null>(null);
export function StoreProvider({data,children}:{data:StoreData;children:React.ReactNode}){
 const [user,setUser]=useState<Viewer>(null),[csrf,setCsrf]=useState(''),[cart,setCart]=useState<CartLine[]>([]),[ready,setReady]=useState(false);
 const refreshSession=useCallback(async()=>{const r=await fetch('/api/session');const d:any=await r.json();if(!r.ok)throw new Error(d.error||'Your shopping bag could not be loaded.');setUser(d.user);setCsrf(d.csrf);setCart(d.cart);setReady(true)},[]);
 useEffect(()=>{refreshSession().catch(e=>toast.error(e.message))},[refreshSession]);
 const api=useCallback(async(path:string,body?:any)=>{const isForm=body instanceof FormData;let r:Response;try{r=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'x-csrf-token':csrf,...(!isForm?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:isForm?body:JSON.stringify(body)})}catch{throw new Error('Connection interrupted. Your changes are still here; please try again.')}const content=await r.text();let d:any;try{d=JSON.parse(content)}catch{throw new Error(r.status===413?'This upload is too large. Choose a smaller image.':r.status===403?'This request was blocked. Refresh the page and try again.':'The store is temporarily unavailable. Please try again.')}if(!r.ok)throw new Error(d.error||'Please try again.');return d},[csrf]);
 const add=useCallback(async(variantId:string,quantity:number)=>{const d=await api('cart',{variantId,quantity,add:true});setCart(d.cart);toast.success('Added to your bag',{action:{label:'View bag',onClick:()=>window.location.assign('/cart')}})},[api]);
 const update=useCallback(async(variantId:string,quantity:number)=>{const d=await api('cart',{variantId,quantity});setCart(d.cart)},[api]);
 useEffect(()=>{const context=(document as any).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();Promise.resolve(context.registerTool({name:'search_collection',title:'Search the collection',description:'Read published products matching a name or category.',inputSchema:{type:'object',properties:{query:{type:'string',maxLength:100}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:({query}:any)=>{if(typeof query!=='string'||query.length>100)throw new Error('Provide a search query up to 100 characters.');return data.products.filter(p=>(p.name+' '+p.category).toLowerCase().includes(query.toLowerCase())).map(p=>({id:p.id,name:p.name,path:'/product/'+p.slug,price:p.salePrice??p.price,currency:data.settings.currency,variants:p.variants}))}},{signal:lifecycle.signal})).catch(()=>{});return()=>lifecycle.abort()},[data]);
 return <StoreContext.Provider value={{...data,user,csrf,cart,ready,api,add,update,refreshSession}}><div style={{'--primary':data.settings.primaryColor,'--primary-foreground':'#fff'} as React.CSSProperties}>{children}</div><Toaster richColors position="bottom-right"/></StoreContext.Provider>
}
export function useStore(){const c=useContext(StoreContext);if(!c)throw new Error('Store context unavailable');return c}
export const report=(error:unknown)=>toast.error(error instanceof Error?error.message:'Please try again.');

