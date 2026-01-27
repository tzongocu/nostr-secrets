
# Plan: Secrete exclusiv din Nostr Relays

## Rezumat
Refactorizez aplicația pentru ca secretele să fie gestionate exclusiv prin Nostr relays. Secretele nu vor mai fi stocate local - vor fi încărcate din relay la pornire și salvate doar dacă relay-ul confirmă primirea.

## Modificări principale

### 1. Eliminare stocare locală pentru secrete
**Fișiere afectate**: `src/lib/vault.ts`, `src/context/VaultContext.tsx`

- Eliminăm câmpul `secrets` din `VaultData` interface
- Vault-ul va stoca doar: `keys`, `logs`, `defaultKeyId`
- Secretele vor fi gestionate separat prin relay

### 2. Creare serviciu pentru încărcare secrete din relay
**Fișier nou**: `src/lib/relaySecrets.ts`

- Funcție `fetchSecretsFromRelay(keys: NostrKey[])`
  - Conectare la relay-uri
  - Fetch self-addressed DMs (kind 4) unde `author = recipient`
  - Parsare JSON pentru a extrage: `type: 'nostr-secret'`, `title`, `tags`, `content`
  - Decriptare cu cheia corespunzătoare
  - Returnare listă de secrete

### 3. Hook pentru managementul secretelor
**Fișier nou**: `src/hooks/useRelaySecrets.ts`

Acest hook va:
- Încărca secretele automat când cheile sunt disponibile
- Expune stare: `secrets`, `isLoading`, `error`, `isConnected`
- Funcții: `refresh()`, `deleteSecret(eventId)`

```text
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   UI/App    │────▶│ useRelay     │────▶│   Nostr     │
│             │     │ Secrets      │     │   Relays    │
│             │◀────│ (hook)       │◀────│             │
└─────────────┘     └──────────────┘     └─────────────┘
       │                   │
       │                   ▼
       │         ┌──────────────┐
       └────────▶│ VaultContext │ (doar keys, logs)
                 └──────────────┘
```

### 4. Modificare flow de salvare secret
**Fișier**: `src/components/AddSecretSheet.tsx`

- Eliminăm `addSecret()` din vault
- Salvarea eșuează complet dacă niciun relay nu confirmă
- Toast de eroare: "Cannot save - no relay connection"
- Toast de succes doar după confirmare relay

### 5. Implementare ștergere din relay (NIP-09)
**Fișier**: `src/lib/nostrRelay.ts`

Adăugăm funcție `deleteEvent(key, eventId)`:
- Creează event kind 5 (NIP-09 Event Deletion)
- Tags: `['e', eventId]`
- Semnează și trimite pe toate relay-urile

### 6. Actualizare SecretsScreen
**Fișier**: `src/components/SecretsScreen.tsx`

- Folosește noul hook `useRelaySecrets` în loc de `secrets` din vault
- Afișează loader în timp ce se încarcă de pe relay
- Afișează mesaj când relay-ul nu răspunde
- Eliminăm secțiunea "Orphaned Secrets" (nu mai există secrete locale)
- Butonul de ștergere va chema `deleteSecret(eventId)`

### 7. Curățare date legacy
**Fișier**: `src/components/SettingsScreen.tsx`

- Adăugăm buton "Clear local secrets cache" pentru a șterge orice secrete vechi din storage
- Migrație automată la prima rulare

## Detalii tehnice

### Format DM pentru secret (existent)
```json
{
  "type": "nostr-secret",
  "version": 1,
  "title": "My Secret",
  "tags": ["passwords"],
  "content": "encrypted_content_base64?iv=..."
}
```

### Filter pentru fetch secrete proprii
```json
{
  "kinds": [4],
  "authors": ["my_pubkey_hex"],
  "#p": ["my_pubkey_hex"]
}
```

### NIP-09 Deletion Event
```json
{
  "kind": 5,
  "pubkey": "my_pubkey",
  "tags": [["e", "event_id_to_delete"]],
  "content": "secret deleted",
  "created_at": 1234567890,
  "id": "...",
  "sig": "..."
}
```

## Ordinea implementării

1. Creare `relaySecrets.ts` cu funcții de fetch și delete
2. Creare hook `useRelaySecrets.ts`
3. Actualizare `AddSecretSheet.tsx` - save strict pe relay
4. Actualizare `SecretsScreen.tsx` - încărcare din relay
5. Actualizare `vault.ts` și `VaultContext.tsx` - eliminare secrets
6. Curățare date legacy în `SettingsScreen.tsx`

## Comportament așteptat

| Acțiune | Comportament |
|---------|--------------|
| Deschidere app | Fetch secrete de pe relay pentru cheile disponibile |
| Salvare secret | Trimite DM pe relay → succes doar dacă confirmat |
| Ștergere secret | Trimite event kind 5 pe relay |
| Offline | Afișează mesaj "Cannot connect to relays" |
| Cheie ștearsă | Secretele asociate nu mai pot fi decriptate |
