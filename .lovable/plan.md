
# Plan: Criptare Soft-Delete Store cu Vault Key

## Obiectiv
Mută lista de ID-uri ale secretelor șterse din `localStorage` plain-text în vault-ul criptat, astfel încât să fie protejată de aceeași criptare AES-256-GCM folosită pentru chei.

## De ce este important?
În acest moment, ID-urile secretelor șterse sunt vizibile în browser pentru oricine are acces la dispozitiv. Deși nu conțin datele secretelor, ele expun metadate care pot fi corelate cu activitatea pe relay-uri Nostr.

---

## Pași de Implementare

### Pasul 1: Extindere VaultData
Adaugă un câmp nou pentru ID-urile șterse în structura vault-ului.

**Fișier:** `src/lib/vault.ts`
- Adaugă `deletedSecretIds?: string[]` în interfața `VaultData`
- Actualizează funcțiile `encrypt`/`decrypt` pentru a include noul câmp

### Pasul 2: Actualizare VaultContext
Adaugă metode pentru gestionarea ID-urilor șterse în context.

**Fișier:** `src/context/VaultContext.tsx`
- Adaugă `deletedSecretIds: string[]` în state
- Adaugă funcții: `markDeleted(eventId)`, `unmarkDeleted(eventId)`, `clearDeleted()`
- Persistă automat în vault când se modifică lista

### Pasul 3: Migrare deletedSecretsStore
Actualizează modulul existent pentru a folosi vault-ul în loc de localStorage direct.

**Fișier:** `src/lib/deletedSecretsStore.ts`
- Păstrează funcțiile ca wrapper-e pentru compatibilitate
- Adaugă logică de migrare: la prima încărcare, mută datele din localStorage în vault
- Șterge cheia veche din localStorage după migrare

### Pasul 4: Actualizare SecretsScreen
Conectează UI-ul la noul sistem.

**Fișier:** `src/components/SecretsScreen.tsx`
- Înlocuiește `getDeletedSecretIds()` cu `deletedSecretIds` din context
- Înlocuiește `markSecretAsDeleted()` cu `markDeleted()` din context
- Înlocuiește `unmarkSecretAsDeleted()` cu `unmarkDeleted()` din context

---

## Diagrama Arhitecturală

```text
┌─────────────────────────────────────────────────────────────┐
│                      VaultData                              │
├─────────────────────────────────────────────────────────────┤
│  keys: NostrKey[]           ← Cheile private (criptat)     │
│  logs: SignLog[]            ← Jurnalul de semnări (criptat)│
│  defaultKeyId?: string      ← Cheie implicită (criptat)    │
│  deletedSecretIds?: string[] ← NOU: ID-uri șterse (criptat)│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    AES-256-GCM + PBKDF2
                              │
                              ▼
              localStorage['nostr-vault-encrypted']
```

---

## Comportament PIN Enabled vs Disabled

| Scenariul | Comportament |
|-----------|--------------|
| **PIN activat** | ID-urile șterse sunt criptate în vault |
| **PIN dezactivat** | ID-urile șterse sunt în JSON necriptat (același nivel de securitate ca restul vault-ului) |

---

## Migrare Automată

La prima încărcare după actualizare:
1. Verifică dacă există date în vechiul `localStorage['nostr-secrets-deleted']`
2. Dacă da, le mută în `VaultData.deletedSecretIds`
3. Șterge cheia veche din localStorage
4. Utilizatorul nu observă nimic - totul este automat

---

## Detalii Tehnice

### Modificări în `vault.ts`:
```typescript
export interface VaultData {
  keys: NostrKey[];
  logs: SignLog[];
  defaultKeyId?: string;
  deletedSecretIds?: string[]; // NOU
}
```

### Modificări în `VaultContext.tsx`:
```typescript
interface VaultContextValue {
  // ... existing fields ...
  deletedSecretIds: string[];
  markDeleted: (eventId: string) => Promise<void>;
  unmarkDeleted: (eventId: string) => Promise<void>;
  clearDeletedSecrets: () => Promise<void>;
}
```

### Funcție de migrare în `deletedSecretsStore.ts`:
```typescript
export const migrateToVault = (): string[] => {
  const legacy = localStorage.getItem('nostr-secrets-deleted');
  if (!legacy) return [];
  const ids = JSON.parse(legacy);
  localStorage.removeItem('nostr-secrets-deleted');
  return ids;
};
```

---

## Impactul Schimbării

| Aspect | Înainte | După |
|--------|---------|------|
| **Stocare** | Plain-text în localStorage | Criptat în vault |
| **Vizibilitate** | Oricine cu acces la browser | Doar cu PIN corect |
| **Dependențe** | Independent | Parte din VaultContext |
| **Migrare** | N/A | Automată, transparentă |

## Riscuri și Mitigări

1. **Risc:** Dacă vault-ul este blocat, nu poți accesa lista de șterse
   **Mitigare:** Secretele șterse oricum nu sunt vizibile fără PIN (cheile sunt în vault)

2. **Risc:** Pierdere date la migrare
   **Mitigare:** Migrarea se face atomic - citim din vechi, salvăm în vault, apoi ștergem vechi
