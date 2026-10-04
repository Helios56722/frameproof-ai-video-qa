import "./globals.css";

export const metadata = {
  title: "FrameProof — AI Video Release QA",
  description: "Private, browser-local release screening for generated video.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
