
# Plan: Afișare Număr Relay-uri pe Card Secret

## Obiectiv
Afișează pe fiecare card de secret în câte relay-uri a fost găsit mesajul, adăugând un indicator vizual sub iconul de lacăt și badge-ul NIP.

## Modificări Necesare

### 1. Actualizare `RelaySecret` interface
**Fișier:** `src/lib/relaySecrets.ts`

Schimbă câmpul `relay: string` în `relays: string[]` pentru a stoca lista tuturor relay-urilor unde a fost găsit secretul.

```typescript
export interface RelaySecret {
  // ... alte câmpuri
  relays: string[];  // Array în loc de string singular
}
```

### 2. Modificare logică de agregare
**Fișier:** `src/lib/relaySecrets.ts`

În funcția `fetchSecretsFromRelays`, în loc să ignorăm duplicatele, adăugăm relay-ul la lista existentă:

```typescript
// Înainte (ignora duplicatele):
if (!seenIds.has(secret.id)) {
  seenIds.add(secret.id);
  allSecrets.push(secret);
}

// După (agregăm relay-urile):
if (seenIds.has(secret.id)) {
  // Găsim secretul existent și adăugăm relay-ul
  const existing = allSecrets.find(s => s.id === secret.id);
  if (existing && !existing.relays.includes(result.relayUrl)) {
    existing.relays.push(result.relayUrl);
  }
} else {
  seenIds.add(secret.id);
  allSecrets.push({ ...secret, relays: [result.relayUrl] });
}
```

### 3. Actualizare `parseSecretEvent`
**Fișier:** `src/lib/relaySecrets.ts`

Returnează secretul fără câmpul `relay` (va fi setat la agregare):

```typescript
return {
  // ... alte câmpuri
  relays: [relay],  // Inițializat cu relay-ul curent
};
```

### 4. Actualizare UI Card
**Fișier:** `src/components/SecretsScreen.tsx`

Adaugă un indicator sub badge-ul NIP care arată numărul de relay-uri:

```tsx
<div className="flex flex-col items-center gap-1 shrink-0 ml-3">
  <Lock className="w-5 h-5 text-muted-foreground" />
  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${...}`}>
    NIP-{secret.encryptionVersion === 2 ? '44' : '04'}
  </span>
  {/* Nou: indicator relay-uri */}
  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
    <Radio className="w-3 h-3" />
    {secret.relays.length}
  </span>
</div>
```

---

## Detalii Tehnice

### Structura Datelor Actualizată
```text
RelaySecret {
  id: string
  eventId: string
  title: string
  encryptedContent: string
  encryptionVersion: number  // 1 = NIP-04, 2 = NIP-44
  tags: string[]
  keyId: string
  keyName: string
  createdAt: Date
  relays: string[]  // ["wss://relay1.com", "wss://relay2.com"]
}
```

### Indicator Vizual
```text
┌─────────────────────────────────────────────────┐
│  My Secret Title                          🔒    │
│  [tag1] [tag2]                          NIP-44  │
│                                          📡 3   │
└─────────────────────────────────────────────────┘
                                            ↑
                                     Găsit în 3 relay-uri
```

### Fișiere Modificate
1. `src/lib/relaySecrets.ts` - Interface și logică agregare
2. `src/components/SecretsScreen.tsx` - UI indicator relay-uri
