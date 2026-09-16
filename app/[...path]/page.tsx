import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {getStore} from '@/lib/db';
import {requireAdmin} from '@/lib/auth';
import {ShopView} from '@/components/store/shop';
import {ProductView} from '@/components/store/product';
import {CartView,CheckoutView,OrderView,PaymentSuccess} from '@/components/store/checkout';
import {AccountView,AuthView} from '@/components/store/account';
import {InformationView} from '@/components/store/information';
import {AdminView} from '@/components/store/admin';
export const dynamic='force-dynamic';
type Props={params:Promise<{path:string[]}>;searchParams:Promise<Record<string,string|undefined>>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const {path}=await params;const route=path.join('/');if(path[0]==='product'){const product=(await getStore()).products.find(p=>p.slug===path[1]);if(product)return{title:product.name,description:product.description.slice(0,160),alternates:{canonical:'/product/'+product.slug},openGraph:{title:product.name,description:product.description.slice(0,160),images:product.images[0]?.url?[{url:product.images[0].url}]:[]},twitter:{card:'summary_large_image',title:product.name,images:product.images[0]?.url?[product.images[0].url]:[]}}}
 const titles:Record<string,string>={shop:'The Collection',cart:'Your Shopping Bag',checkout:'Checkout',account:'Your Account',about:'Our Story',contact:'Contact',faq:'Frequently Asked Questions',shipping:'Shipping',returns:'Returns & Exchanges',privacy:'Privacy Policy',terms:'Terms & Conditions',admin:'Store Management'};
 return{title:titles[path[0]]||'Dress to Impress',alternates:{canonical:'/'+route},...(['admin','account','checkout','cart','order'].includes(path[0])?{robots:{index:false,follow:false}}:{})}}
export default async function Page({params,searchParams}:Props){const {path}=await params,query=await searchParams;const route=path.join('/');
 if(route==='shop')return <ShopView query={query}/>;
 if(path[0]==='product'&&path.length===2){const p=(await getStore()).products.find(p=>p.slug===path[1]);if(!p)notFound();return <ProductView product={p}/>}
 if(route==='cart')return <CartView/>;
 if(route==='checkout')return <CheckoutView cancelled={query.cancelled==='1'}/>;
 if(route==='checkout/success')return <PaymentSuccess sessionId={query.session_id||''}/>;
 if(path[0]==='order'&&path.length===2)return <OrderView id={path[1]}/>;
 if(route==='account')return <AccountView/>;
 if(route==='account/reset')return <AuthView initialMode="reset" resetToken={query.token||''}/>;
 if(['about','contact','faq','shipping','returns','privacy','terms'].includes(route))return <InformationView page={route}/>;
 if(route==='admin/login')return <AuthView admin/>;
 if(path[0]==='admin'&&path.length<=2){if(!['overview','products','inventory','orders','customers','categories','homepage','settings'].includes(path[1]||'overview'))notFound();try{await requireAdmin()}catch{redirect('/admin/login')}return <AdminView section={path[1]||'overview'}/>}
 notFound();
}

