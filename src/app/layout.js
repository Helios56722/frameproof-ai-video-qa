import "./globals.css";

export const metadata = {
  title: "FrameProof — ComfyUI Workflow Inspector",
  description: "Browser-local ComfyUI workflow diagnostics with prioritized findings and clear repair guidance.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
