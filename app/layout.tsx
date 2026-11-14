import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"CONNECT — Your University. Your Network. Your Future.",description:"A network built around your university community."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
