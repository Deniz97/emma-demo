import { SseDemoClient } from "./sse-demo-client";

export default function SseDemoPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">SSE Demo</h1>
      <p className="text-muted-foreground mb-8">
        Test Server-Sent Events (SSE) implementation for real-time chat updates
      </p>
      <SseDemoClient />
    </div>
  );
}
