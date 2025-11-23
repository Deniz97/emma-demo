# SSE Demo Page

Test the Server-Sent Events (SSE) implementation for real-time chat updates.

## Access

Navigate to: **http://localhost:3000/sse-demo**

## Features

### 1. Connection Testing

- Enter a User ID (e.g., `user-123`)
- Click "Connect" to establish SSE connection
- Watch the connection status indicator (green = connected, red = disconnected)

### 2. Event Triggering

- Choose a Chat ID
- Select event type:
  - **Status Change**: Emits PROCESSING → SUCCESS (2s delay)
  - **Title Update**: Emits new title with timestamp
  - **New Message**: Emits test assistant message
  - **Processing Step**: Emits step → clears after 2s
- Click "Trigger Event" to send

### 3. Real-time Event Log

- Shows all incoming SSE events in real-time
- Displays event type, timestamp, and full payload
- Keeps last 50 events
- Clear button to reset log

## How It Works

1. **Client**: Opens EventSource connection to `/api/chat-events?userId={userId}`
2. **Server**: SSE route streams events via ReadableStream
3. **Event Bus**: chatEvents.emit() broadcasts to all connected clients
4. **Client**: Receives events in real-time, displays in UI

## Testing Scenarios

### Scenario 1: Single User

1. Connect with `user-123`
2. Trigger events with `chat-123`
3. Verify events appear in log instantly

### Scenario 2: Multiple Tabs (Same User)

1. Open demo in two tabs
2. Connect both with same User ID
3. Trigger event in one tab
4. Verify both tabs receive the event

### Scenario 3: Multiple Users

1. Open demo in two tabs
2. Tab 1: Connect with `user-123`
3. Tab 2: Connect with `user-456`
4. Tab 1: Trigger event for `user-123`
5. Verify only Tab 1 receives the event (security filtering)

### Scenario 4: Reconnection

1. Connect with a User ID
2. Open browser DevTools → Network tab
3. Disconnect
4. Reconnect
5. Verify connection re-establishes successfully

## Expected Behavior

- ✅ Events appear within 100ms of triggering
- ✅ Keep-alive pings every 30s (visible in browser network inspector)
- ✅ Connection survives browser tab switches
- ✅ User filtering works (events only sent to correct user)
- ✅ Auto-reconnect on connection loss

## Troubleshooting

### Events Not Appearing

- Check browser console for errors
- Verify User ID matches between connection and trigger
- Check server logs for event emission

### Connection Drops

- Check browser DevTools → Network → EventStream
- Verify `runtime = "nodejs"` in route.ts
- Check nginx/proxy settings if deployed

### Multiple Events

- Expected for "Status" and "Step" types (they emit twice)
- First event starts, second event completes

## Integration with Real Chat

This demo uses the **same event system** as the real chat:

```typescript
// In processMessageAsync (app/actions/chat.ts)
chatEvents.emitStatusChange(userId, chatId, "PROCESSING", null);
// ... process message ...
chatEvents.emitStatusChange(userId, chatId, "SUCCESS", null);
```

Events flow:

1. Backend processes chat message
2. Emits events via chatEvents
3. SSE route broadcasts to connected clients
4. Chat UI updates in real-time

Same infrastructure powers both the demo and production chat!
