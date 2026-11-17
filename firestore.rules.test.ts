/**
 * Security Rules Dirty Dozen Verification Suite (Phase 0 TDD)
 * Validates all 12 adversarial payloads against the Eight Pillars invariants.
 */

export interface DirtyPayloadTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  authUid: string | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyPayloadTestCase[] = [
  {
    id: 1,
    name: 'Cross-Tenant Profile Write',
    collectionPath: '/users/uid_victim',
    operation: 'create',
    authUid: 'uid_attacker',
    payload: { ownerId: 'uid_victim', shopName: 'Hacked Shop', language: 'en', configPayload: '{}' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Identity Spoofing on Product Creation',
    collectionPath: '/users/uid_A/products/prod_1',
    operation: 'create',
    authUid: 'uid_A',
    payload: { ownerId: 'uid_B', name: 'Spoofed Item', unit: 'Piece', mrp: 100, retailPrice: 90, quantity: 10, archived: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Create',
    collectionPath: '/users/uid_A/products/prod_1',
    operation: 'create',
    authUid: 'uid_A',
    payload: { ownerId: 'uid_A', name: 'Item', unit: 'Piece', mrp: 100, retailPrice: 90, quantity: 10, archived: false, isAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow Field Injection on Update',
    collectionPath: '/users/uid_A/products/prod_1',
    operation: 'update',
    authUid: 'uid_A',
    payload: { ownerId: 'uid_A', name: 'Item', isVerified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Orphaned Subcollection Write Without Parent User Profile',
    collectionPath: '/users/uid_orphan/products/prod_1',
    operation: 'create',
    authUid: 'uid_orphan',
    payload: { ownerId: 'uid_orphan', name: 'Orphan Item', unit: 'Piece', mrp: 50, retailPrice: 50, quantity: 1, archived: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Immutable Field Mutation - ownerId',
    collectionPath: '/users/uid_A/orders/ord_1',
    operation: 'update',
    authUid: 'uid_A',
    payload: { ownerId: 'uid_B' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Immutable Field Mutation - createdAt',
    collectionPath: '/users/uid_A/expenses/exp_1',
    operation: 'update',
    authUid: 'uid_A',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Client Timestamp Forgery on Create',
    collectionPath: '/users/uid_A/orders/ord_1',
    operation: 'create',
    authUid: 'uid_A',
    payload: { ownerId: 'uid_A', createdAt: '1999-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Denial of Wallet - Oversized String Field',
    collectionPath: '/users/uid_A/products/prod_1',
    operation: 'create',
    authUid: 'uid_A',
    payload: { ownerId: 'uid_A', name: 'X'.repeat(5000), unit: 'Piece', mrp: 10, retailPrice: 10, quantity: 1, archived: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'ID Poisoning - Malformed Document ID',
    collectionPath: '/users/uid_A/products/invalid$id!@#',
    operation: 'create',
    authUid: 'uid_A',
    payload: { ownerId: 'uid_A', name: 'Valid Name', unit: 'Piece', mrp: 10, retailPrice: 10, quantity: 1, archived: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Value Poisoning on Update - Invalid Type for Balance',
    collectionPath: '/users/uid_A/suppliers/sup_1',
    operation: 'update',
    authUid: 'uid_A',
    payload: { balance: '1000000_STRING_INSTEAD_OF_NUMBER' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unauthorized Cross-Tenant List Query Scraping',
    collectionPath: '/users/uid_victim/customers',
    operation: 'list',
    authUid: 'uid_attacker',
    expectedResult: 'PERMISSION_DENIED',
  },
];
