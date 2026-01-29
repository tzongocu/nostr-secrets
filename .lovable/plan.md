
# Relay Sync Bug Fix Plan

## Problem Identified

The relay sync functionality is **creating duplicate secrets** instead of republishing the original event. This is a critical bug in how secrets are distributed across relays.

### Current (Broken) Behavior
When you click "Sync" to distribute a secret from 3 relays to all 9 configured relays:
1. The code creates a **brand new Nostr event** with current timestamp
2. Re-encrypts the content (different ciphertext each time)
3. Generates a new event ID and signature
4. Publishes this as a **separate secret**

**Result**: You end up with duplicate secrets on your relays instead of the same secret on more relays.

### Root Cause
In `src/lib/relaySync.ts`, the `republishToRelays` function:
- Line 138: Uses `Date.now()` for timestamp instead of original
- Lines 132-133: Re-encrypts content instead of using original encrypted DM
- The original signed event is never stored or fetched

---

## Proposed Fix

### Strategy: Fetch Original Event from Existing Relay

Since we know which relays already have the secret, we can:
1. Connect to one of those relays
2. Fetch the **exact original signed event** by its event ID
3. Forward that identical event to the missing relays

This preserves:
- Original event ID (deduplication works)
- Original timestamp
- Original signature
- Original encrypted content

---

## Implementation Steps

### Step 1: Add Event Fetching Function
Create a new function `fetchEventFromRelay` in `relaySync.ts` that:
- Connects to a relay that has the secret
- Requests the event by ID using `["REQ", subId, {"ids": [eventId]}]`
- Returns the complete signed event object

### Step 2: Modify `republishToRelays` Function
Update the sync logic to:
1. Take the secret's `eventId` and `relays` list (relays that have it)
2. Fetch the original event from one of the existing relays
3. Forward that exact event to the target (missing) relays
4. No re-encryption or re-signing needed

### Step 3: Update RelaySecret Interface (Optional)
Consider caching the original event data when first fetched to avoid re-fetching during sync:
- Add optional `originalEvent` field to store the full signed event
- Populate during initial relay fetch

---

## Technical Details

### New Function: `fetchEventFromRelay`
```text
Input:  eventId (string), relayUrl (string)
Output: Promise<NostrEvent | null>

Process:
1. Open WebSocket to relay
2. Send: ["REQ", subId, {"ids": [eventId]}]
3. Wait for EVENT message with matching ID
4. Return the complete event object
5. Timeout after 5 seconds with null
```

### Modified `republishToRelays` Function
```text
Input:  secret (RelaySecret), targetRelays (string[])
Output: Promise<{ success: string[]; failed: string[] }>

Process:
1. Pick first relay from secret.relays
2. Fetch original event: fetchEventFromRelay(secret.eventId, sourceRelay)
3. If fetch fails, try next relay in list
4. If all fetches fail, return { success: [], failed: targetRelays }
5. Send original event to each target relay
6. Return success/failed lists
```

### Files to Modify
| File | Changes |
|------|---------|
| `src/lib/relaySync.ts` | Add `fetchEventFromRelay`, rewrite `republishToRelays` |

---

## Testing Plan

After implementing the fix:

1. **Create a test secret** with a unique title
2. **Note the event ID** shown in console or card
3. **Remove some relays**, save, re-add them
4. **Click Sync** to redistribute
5. **Verify**:
   - Toast shows "Synced to X new relay(s)"
   - Secret still shows as single entry (no duplicates)
   - Relay count increases on the secret card

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Source relay offline during fetch | Try multiple relays from `secret.relays` list |
| Event no longer exists on any relay | Fall back to current behavior (recreate) with warning |
| Network timeouts | Use 5-second timeout per relay with retry |

---

## Summary

This fix changes the sync from "create duplicate" to "republish original", ensuring secrets are properly distributed across all relays without creating confusion or data duplication.
