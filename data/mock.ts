// Demo fixtures have been removed. These empty exports remain for UI code that
// still uses the shared types while all visible content comes from Supabase.
export type Person={id:number,name:string,role:string,school:string,avatar:string,coverUrl?:string,tag?:string,profileId?:string,bio?:string,isRegistered?:boolean,department?:string,studyYear?:string,interests?:string[],universityId?:string};
export type FeedPost={id:number|string,author:Person,time:string,body:string,image:string,likes:number,comments:number,tag:string,university?:string};
export type UniversityGroup={id?:string,name:string,members:string,category:string,image:string,description?:string,iconUrl?:string,rules?:string,ownerId?:string,createdAt?:string,memberCount?:number,joinMode?:"open"|"approval"};
export type Opportunity={id?:string,title:string,company:string,type:string,location:string,detail:string,time:string};
export const people:Person[]=[];
export const posts:FeedPost[]=[];
export const universityPosts:FeedPost[]=[];
export const groups:UniversityGroup[]=[];
export const opportunities:Opportunity[]=[];
export const conversations:{person:Person,last:string,time:string}[]=[];