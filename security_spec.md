# Security Specification — BillingFast Multi-Tenant Retail POS

## 1. Data Invariants

1. **Strict Multi-Tenant Isolation (`/users/{userId}/...`)**: Every document in `/users/{userId}` and its subcollections (`products`, `orders`, `purchases`, `returns`, `suppliers`, `customers`, `expenses`, `staff`) belongs exclusively to `userId`. No user may read, list, create, update, or delete another user's records.
2. **Master Gate Relational Sync**: Every subcollection document (`products`, `orders`, `purchases`, `returns`, `suppliers`, `customers`, `expenses`, `staff`) requires the parent `/users/{userId}` document to exist and have `ownerId == request.auth.uid`.
3. **Immutable Ownership & Creation Timestamps**: `ownerId` must equal `request.auth.uid` on creation and can never be modified on update (`incoming().ownerId == existing().ownerId`). `createdAt` must equal `request.time` on creation and remain immutable on update (`incoming().createdAt == existing().createdAt`). `updatedAt` must equal `request.time` on every write.
4. **Strict Key Allowlisting & Volumetric Bounds**: Every `create` validates `hasAll` and `hasOnly` allowed keys. Every `update` validates `isValid[Entity](incoming())` and `affectedKeys().hasOnly(...)`. Every string has explicit `.size()` bounds.

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Cross-Tenant Profile Read/Write)**: Authenticated user `uid_attacker` attempts to write to `/users/uid_victim` with `{ ownerId: "uid_victim", shopName: "Hacked" }`.
2. **Payload 2 (Identity Spoofing on Product Creation)**: User `uid_A` writes to `/users/uid_A/products/prod_1` with `{ ownerId: "uid_B", name: "Item" }`.
3. **Payload 3 (Shadow Field Injection on Create)**: User `uid_A` creates `/users/uid_A/products/prod_1` with an undeclared field `{ isAdmin: true, role: "superuser" }`.
4. **Payload 4 (Shadow Field Injection on Update)**: User `uid_A` updates `/users/uid_A/products/prod_1` adding `{ isVerified: true }`.
5. **Payload 5 (Orphaned Subcollection Write)**: User `uid_A` attempts to create `/users/uid_A/products/prod_1` before `/users/uid_A` profile document exists.
6. **Payload 6 (Immutable Field Mutation - `ownerId`)**: User `uid_A` updates `/users/uid_A/orders/ord_1` changing `ownerId` from `"uid_A"` to `"uid_B"`.
7. **Payload 7 (Immutable Field Mutation - `createdAt`)**: User `uid_A` updates `/users/uid_A/expenses/exp_1` mutating `createdAt` to a past timestamp.
8. **Payload 8 (Client Timestamp Forgery)**: User `uid_A` creates `/users/uid_A/orders/ord_1` with a forged client timestamp `createdAt` not matching `request.time`.
9. **Payload 9 (Denial of Wallet / Oversized String)**: User `uid_A` creates `/users/uid_A/products/prod_1` with a 500KB `name` string exceeding `maxLength: 200`.
10. **Payload 10 (ID Poisoning)**: User `uid_A` creates a document with invalid characters or >128 chars in document ID.
11. **Payload 11 (Value Poisoning on Update)**: User `uid_A` updates `/users/uid_A/suppliers/sup_1` changing `balance` from a `number` to a `string` `"1000000"`.
12. **Payload 12 (Unauthorized List Query Scraping)**: User `uid_attacker` executes a `list` query against `/users/uid_victim/customers`.
