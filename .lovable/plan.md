
# Plan: Upgrade la NIP-44 pentru Criptarea Secretelor

## Obiectiv
Înlocuiește NIP-04 (AES-256-CBC) cu NIP-44 v2 (ChaCha20 + HMAC-SHA256) pentru criptarea secretelor transmise pe relay-uri Nostr, oferind autentificare de mesaje (AEAD) și securitate îmbunătățită.

## De ce NIP-44 este mai sigur?

| Aspect | NIP-04 | NIP-44 v2 |
|--------|--------|-----------|
| **Algoritm** | AES-256-CBC | ChaCha20 + HMAC-SHA256 |
| **Autentificare** | ❌ Nu are MAC | ✅ HMAC-SHA256 (AEAD) |
| **Vulnerabilități** | Padding oracle attacks | Rezistent la atacuri cunoscute |
| **Key Derivation** | ECDH direct | ECDH + HKDF (mai sigur) |
| **Padding** | PKCS#7 standard | Custom power-of-2 (anti-traffic analysis) |
| **Status** | Deprecated | Recomandat |

---

## Pași de Implementare

### Pasul 1: Instalare Dependențe
Adaugă `nostr-tools` care include implementarea NIP-44.

```bash
npm install nostr-tools
```

### Pasul 2: Implementare funcții NIP-44
Creează funcții noi pentru NIP-44 encrypt/decrypt.

**Fișier:** `src/lib/nip44.ts` (nou)
- `encryptNIP44(content, privateKey, recipientPubkey)` 
- `decryptNIP44(encryptedContent, privateKey, senderPubkey)`
- Folosește `nostr-tools/nip44` API-ul

### Pasul 3: Actualizare nostrRelay.ts
Adaugă funcții NIP-44 și păstrează NIP-04 pentru compatibilitate.

**Fișier:** `src/lib/nostrRelay.ts`
- Adaugă export pentru `encryptNIP44`, `decryptNIP44`
- Păstrează `encryptNIP04`, `decryptNIP04` pentru secretele vechi

### Pasul 4: Actualizare payload versiune
Modifică formatul payloadului pentru a indica versiunea de criptare.

**Fișier:** `src/components/AddSecretSheet.tsx`
- Schimbă `version: 1` → `version: 2` pentru secretele noi
- Folosește `encryptNIP44` în loc de `encryptNIP04`

### Pasul 5: Decriptare hibridă
Actualizează decriptarea pentru a suporta ambele versiuni.

**Fișier:** `src/lib/relaySecrets.ts`
- Detectează versiunea din payload (1 = NIP-04, 2 = NIP-44)
- Apelează funcția corespunzătoare de decriptare

**Fișier:** `src/components/SecretsScreen.tsx`
- Actualizează `handleDecrypt` pentru a detecta versiunea

---

## Diagrama Arhitecturală

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Secret Payload (DM)                          │
├─────────────────────────────────────────────────────────────────┤
│  {                                                              │
│    type: 'nostr-secret',                                        │
│    version: 2,              ← Indică NIP-44                     │
│    title: 'My Secret',                                          │
│    tags: ['tag1'],                                              │
│    content: 'base64...'     ← Criptat cu NIP-44                 │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NIP-44 v2 Encryption                         │
├─────────────────────────────────────────────────────────────────┤
│  1. ECDH → shared_x (32 bytes)                                  │
│  2. HKDF-extract(shared_x, "nip44-v2") → conversation_key       │
│  3. HKDF-expand(conversation_key, nonce) → chacha + hmac keys   │
│  4. Pad plaintext (power-of-2 + 2-byte length prefix)           │
│  5. ChaCha20 encrypt                                            │
│  6. HMAC-SHA256(nonce || ciphertext)                            │
│  7. Output: 0x02 || nonce || ciphertext || mac                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Compatibilitate Inversă

| Versiune Payload | Algoritm Decriptare |
|------------------|---------------------|
| `version: 1` | NIP-04 (AES-256-CBC) |
| `version: 2` | NIP-44 (ChaCha20 + HMAC) |

Secretele vechi (version 1) vor continua să funcționeze - doar secretele **noi** vor folosi NIP-44.

---

## Detectare Automată

Dacă payloadul nu are câmp `version` explicit, verificăm formatul ciphertext:
- Conține `?iv=` → NIP-04
- Începe cu `0x02` (base64) → NIP-44

---

## Riscuri și Mitigări

1. **Risc:** Secretele vechi nu mai pot fi decriptate
   **Mitigare:** Păstrăm ambele funcții; detectăm versiunea și folosim algoritmul corect

2. **Risc:** Dependență nouă (nostr-tools)
   **Mitigare:** nostr-tools este biblioteca standard pentru Nostr, bine testată

3. **Risc:** Breaking change în format
   **Mitigare:** Versionare explicită în payload permite detectare sigură

---

## Detalii Tehnice

### Noul fișier `nip44.ts`:
```typescript
import { nip44 } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';

export const getConversationKey = (privateKeyHex: string, publicKeyHex: string): Uint8Array => {
  return nip44.v2.utils.getConversationKey(privateKeyHex, publicKeyHex);
};

export const encryptNIP44 = (content: string, conversationKey: Uint8Array): string => {
  return nip44.v2.encrypt(content, conversationKey);
};

export const decryptNIP44 = (ciphertext: string, conversationKey: Uint8Array): string => {
  return nip44.v2.decrypt(ciphertext, conversationKey);
};
```

### Actualizare AddSecretSheet.tsx:
```typescript
// Encrypt content using NIP-44 (version 2)
const pubkeyHex = npubToHex(key.publicKey);
const privHex = nsecToHex(key.privateKey);
const conversationKey = getConversationKey(privHex, pubkeyHex);
const encrypted = encryptNIP44(content, conversationKey);

const dmContent = JSON.stringify({
  type: 'nostr-secret',
  version: 2, // ← NIP-44
  title: title.trim(),
  tags: selectedTags,
  content: encrypted,
});
```

### Logica de decriptare hibridă:
```typescript
const decrypt = async (payload: NostrSecretPayload, key: NostrKey) => {
  if (payload.version === 2) {
    // NIP-44
    const conversationKey = getConversationKey(privHex, pubHex);
    return decryptNIP44(payload.content, conversationKey);
  } else {
    // NIP-04 (legacy)
    return decryptNIP04(payload.content, key.privateKey, pubHex);
  }
};
```
