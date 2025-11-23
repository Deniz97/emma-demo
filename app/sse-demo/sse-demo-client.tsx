"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { triggerTestEvent, getUserChats } from "./actions";
import { testEventBus } from "./test-action";
import { useAuth } from "@/lib/auth-context";

interface SseEvent {
  type: string;
  timestamp: string;
  data: unknown;
}

interface UserChat {
  id: string;
  title: string | null;
  messageCount: number;
  lastStatus: string | null;
}

export function SseDemoClient() {
  // Get userId from AuthContext (single source of truth)
  const { userId, isLoading: isAuthLoading } = useAuth();

  const [userChats, setUserChats] = useState<UserChat[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<SseEvent[]>([]);
  const [eventSourceRef, setEventSourceRef] = useState<EventSource | null>(
    null
  );

  // Test event form
  const [testChatId, setTestChatId] = useState("test-chat-123");
  const [testEventType, setTestEventType] = useState<
    "status" | "title" | "message" | "step"
  >("status");

  // Load user's chats
  const loadUserChats = useCallback(async (userIdToLoad: string) => {
    setIsLoadingChats(true);
    try {
      const chats = await getUserChats(userIdToLoad);
      setUserChats(chats);

      // Auto-select first chat if available
      if (chats.length > 0) {
        setTestChatId(chats[0].id);
      }
    } catch (error) {
      console.error("[SSE Demo] Error loading chats:", error);
    } finally {
      setIsLoadingChats(false);
    }
  }, []);

  // Load user's chats when userId is available
  useEffect(() => {
    if (userId) {
      loadUserChats(userId);
    }
  }, [userId, loadUserChats]);

  // Connect to SSE
  const connect = useCallback(() => {
    if (!userId) {
      alert("Please enter a User ID");
      return;
    }

    // Close existing connection
    if (eventSourceRef) {
      console.log("[SSE Demo] Closing existing connection");
      eventSourceRef.close();
    }

    console.log("[SSE Demo] 🔌 Connecting to SSE with userId:", userId);
    console.log(
      "[SSE Demo] SSE URL:",
      `/api/chat-events?userId=${encodeURIComponent(userId)}`
    );

    const eventSource = new EventSource(
      `/api/chat-events?userId=${encodeURIComponent(userId)}`
    );

    eventSource.onopen = () => {
      console.log("[SSE Demo] ✅ Connection opened successfully");
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      console.log("[SSE Demo] 📨 RAW Event received:", event.data);

      try {
        const data = JSON.parse(event.data);
        console.log("[SSE Demo] 📦 Parsed event data:", data);

        // Ignore "connected" message
        if (data.type === "connected") {
          console.log("[SSE Demo] Ignoring connection message");
          return;
        }

        const newEvent: SseEvent = {
          type: data.type || "unknown",
          timestamp: new Date().toISOString(),
          data,
        };

        console.log("[SSE Demo] 📝 Adding event to log:", newEvent);
        setEvents((prev) => {
          const updated = [newEvent, ...prev].slice(0, 50);
          console.log("[SSE Demo] 📊 Total events in log:", updated.length);
          return updated;
        });
      } catch (error) {
        console.error("[SSE Demo] ❌ Error parsing event:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("[SSE Demo] ❌ Connection error:", error);
      console.error(
        "[SSE Demo] EventSource readyState:",
        eventSource.readyState
      );
      setIsConnected(false);
    };

    setEventSourceRef(eventSource);
  }, [userId, eventSourceRef]);

  // Disconnect from SSE
  const disconnect = useCallback(() => {
    if (eventSourceRef) {
      eventSourceRef.close();
      setEventSourceRef(null);
      setIsConnected(false);
      console.log("[SSE Demo] Disconnected");
    }
  }, [eventSourceRef]);

  // Run diagnostic
  const handleDiagnostic = async () => {
    if (!userId) {
      alert("No user ID available");
      return;
    }

    console.log("\n[SSE Demo] 🔬 Running diagnostic...");
    try {
      const result = await testEventBus(userId);
      console.log("[SSE Demo] 📊 Diagnostic result:", result);
      alert(
        `Diagnostic complete!\nActive listeners: ${result.listeners}\n\nCheck console and terminal for logs.`
      );
    } catch (error) {
      console.error("[SSE Demo] ❌ Diagnostic failed:", error);
    }
  };

  // Trigger test event
  const handleTriggerEvent = async () => {
    if (!userId || !testChatId) {
      alert("Please enter User ID and Chat ID");
      return;
    }

    console.log("[SSE Demo] 🔔 Triggering event:", {
      userId,
      chatId: testChatId,
      eventType: testEventType,
    });

    try {
      await triggerTestEvent(userId, testChatId, testEventType);
      console.log("[SSE Demo] ✅ Test event triggered successfully");
    } catch (error) {
      console.error("[SSE Demo] ❌ Error triggering event:", error);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef) {
        eventSourceRef.close();
      }
    };
  }, [eventSourceRef]);

  return (
    <div className="grid gap-6">
      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle>Your Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Your User ID</Label>
            {isAuthLoading ? (
              <div className="mt-1 p-3 bg-muted rounded font-mono text-sm">
                Loading...
              </div>
            ) : userId ? (
              <div className="mt-1 p-3 bg-muted rounded font-mono text-sm break-all">
                {userId}
              </div>
            ) : (
              <div className="mt-1 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm">
                <p className="font-semibold text-yellow-600 dark:text-yellow-500 mb-1">
                  No user found
                </p>
                <p className="text-muted-foreground text-xs">
                  Something went wrong. Please refresh the page.
                </p>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Your Chats ({userChats.length})</Label>
              {userId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadUserChats(userId)}
                  disabled={isLoadingChats}
                >
                  {isLoadingChats ? "Loading..." : "Refresh"}
                </Button>
              )}
            </div>

            {userChats.length === 0 ? (
              <p className="text-sm text-muted-foreground p-3 bg-muted rounded">
                No chats found. Create a chat in the main app first.
              </p>
            ) : (
              <ScrollArea className="h-[200px] border rounded">
                <div className="p-3 space-y-2">
                  {userChats.map((chat) => (
                    <div
                      key={chat.id}
                      className="p-2 rounded border bg-card hover:bg-accent cursor-pointer"
                      onClick={() => setTestChatId(chat.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {chat.title || "New Chat"}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono truncate">
                            {chat.id}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {chat.messageCount} msgs
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Connection Controls */}
      <Card>
        <CardHeader>
          <CardTitle>SSE Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="userId">User ID (from AuthContext)</Label>
              <Input
                id="userId"
                value={userId || ""}
                placeholder="Loading from auth..."
                disabled
                readOnly
                className="font-mono text-sm"
              />
            </div>
            <div className="flex gap-2">
              {!isConnected ? (
                <Button onClick={connect} disabled={!userId || isAuthLoading}>
                  {isAuthLoading ? "Loading..." : "Connect"}
                </Button>
              ) : (
                <Button onClick={disconnect} variant="destructive">
                  Disconnect
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-sm text-muted-foreground">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Test Event Trigger */}
      <Card>
        <CardHeader>
          <CardTitle>Trigger Test Event</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="chatId">Chat ID</Label>
              <Input
                id="chatId"
                value={testChatId}
                onChange={(e) => setTestChatId(e.target.value)}
                placeholder="e.g., chat-123"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Click a chat above to auto-fill, or enter custom ID
              </p>
            </div>

            <div>
              <Label htmlFor="eventType">Event Type</Label>
              <select
                id="eventType"
                value={testEventType}
                onChange={(e) =>
                  setTestEventType(
                    e.target.value as "status" | "title" | "message" | "step"
                  )
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="status">Status Change</option>
                <option value="title">Title Update</option>
                <option value="message">New Message</option>
                <option value="step">Processing Step</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleTriggerEvent} disabled={!isConnected}>
              Trigger Event
            </Button>
            <Button
              onClick={handleDiagnostic}
              disabled={!isConnected}
              variant="outline"
            >
              🔬 Run Diagnostic
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Debug Info */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-sm">Debug Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs font-mono">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground">Auth Loading:</span>{" "}
              <span className="font-semibold">
                {isAuthLoading ? "Yes" : "No"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">SSE Connected:</span>{" "}
              <span className="font-semibold">
                {isConnected ? "Yes ✅" : "No ❌"}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">User ID:</span>{" "}
              <span className="font-semibold break-all">
                {userId || "null"}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Test Chat ID:</span>{" "}
              <span className="font-semibold break-all">{testChatId}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Events Received:</span>{" "}
              <span className="font-semibold">{events.length}</span>
            </div>
          </div>
          <div className="pt-2 border-t text-yellow-600 dark:text-yellow-500">
            💡 Open browser console (F12) to see detailed logs
          </div>
        </CardContent>
      </Card>

      {/* Event Log */}
      <Card>
        <CardHeader>
          <CardTitle>Event Log ({events.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] w-full rounded border p-4">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No events received yet. Connect and trigger test events to see
                them here.
              </p>
            ) : (
              <div className="space-y-3">
                {events.map((event, idx) => (
                  <div
                    key={idx}
                    className="rounded border p-3 bg-muted/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono font-semibold">
                        {event.type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="text-xs overflow-x-auto">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {events.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEvents([])}
              className="mt-4"
            >
              Clear Log
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
