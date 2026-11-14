import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"CONNECT — Your University. Your Network. Your Future.",description:"A network built around your university community."};
export const viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#f2f2f1"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
