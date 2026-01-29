
# Show Relay Status in Secret Card

## Overview

When you open a secret card, you'll see a list of all configured relays with visual indicators showing which ones have the secret and which ones don't.

## What You'll See

When you tap on a secret card to expand it, a new "Relay Status" section will appear showing:

- **Green checkmark** - relay has the secret
- **Gray X** - relay doesn't have the secret
- A summary line like "Saved on 4 of 9 relays"

## Visual Layout

```text
┌─────────────────────────────────────┐
│ Secret Title                 📡 4   │
│ [tags]                              │
│ Created 2d ago                      │
├─────────────────────────────────────┤
│ Content: [encrypted...]      👁️    │
│                                     │
│ ─── Relay Status (4/9) ───────────  │
│ ✓ nos.lol                           │
│ ✓ relay.damus.io                    │
│ ✓ relay.primal.net                  │
│ ✓ nostr.bitcoiner.social            │
│ ✗ nostr.wine                        │
│ ✗ offchain.pub                      │
│ ✗ purplepag.es                      │
│ ✗ relay.snort.social                │
│ ✗ relay.nostr.band                  │
│                                     │
│                      [Delete]       │
└─────────────────────────────────────┘
```

## Technical Details

### File to Modify
`src/components/SecretsScreen.tsx`

### Implementation
1. Import `getRelays` from `@/lib/relayStore` to get all configured relays
2. Add a new section in the expanded card view (after line 749, before the delete button)
3. For each configured relay, check if it exists in `secret.relays` array
4. Display with appropriate icon and styling:
   - Found: green checkmark, white text
   - Missing: gray X, muted text

### Code Changes
Insert after the encrypted content section and before the delete button:
- A divider line with "Relay Status (X/Y)"
- A list of all relays with checkmark or X icons
- Each relay URL displayed in a compact format (domain only for readability)

### Helper Function
Add a simple function to extract domain from relay URL:
```
wss://nos.lol/ → nos.lol
wss://relay.damus.io/ → relay.damus.io
```
