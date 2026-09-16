export type Product = {id:string;name:string;slug:string;description:string;price:number;salePrice:number|null;sku:string;categoryId:string;category:string;materials:string;care:string;featured:number;isNew:number;bestSeller:number;published:number;demo:number;createdAt:string;images:ProductImage[];variants:Variant[]};
export type ProductImage={id:string;url:string;alt:string;position:number};
export type Variant={id:string;productId:string;size:string;color:string;stock:number;threshold:number};
export type Category={id:string;name:string;slug:string;description:string;image:string;position:number};
export type Settings={name:string;logo:string;favicon:string;currency:string;email:string;phone:string;instagram:string;tiktok:string;otherSocial:string;shippingFee:number;taxRate:number;shippingPolicy:string;returnPolicy:string;privacyPolicy:string;terms:string;shippingCountries:string;liveSales:boolean;primaryColor:string;font:string};
export type Homepage={heroImage:string;heading:string;description:string;ctaText:string;ctaLink:string;promoText:string;promoLink:string;promoActive:boolean;aboutHeading:string;aboutDescription:string;aboutImage:string;instagramCaption:string;gallery:string[]};
export type StoreData={products:Product[];categories:Category[];settings:Settings;home:Homepage};
export type Viewer={id:string;name:string;email:string;role:string}|null;
export type CartLine={id:string;variantId:string;quantity:number;productId:string;name:string;slug:string;image:string;size:string;color:string;price:number;stock:number;published:number;demo:number};
export const money=(amount:number,currency='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(amount/100);

