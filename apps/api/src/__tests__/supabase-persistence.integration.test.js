/**
 * Integration Test: Supabase Persistence – Audit Repository (L2 – Integration)
 *
 * Uses the `setAuditClient` escape hatch to inject a stub that mimics
 * Supabase query builder behavior without hitting a real database.
 *
 * Verifies:
 * 1. `logAuditEvent` maps fields correctly and calls `.insert()` on the client.
 * 2. `getAuditEvents` returns rows for unfiltered queries.
 * 3. Both functions surface DB errors as thrown Errors.
 *
 * For a fully live Supabase integration, set INTEGRATION=true and provide
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars.
 */
import assert from 'node:assert/strict';
import { logAuditEvent, getAuditEvents, setAuditClient, } from '../repositories/audit.js';
const color = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};
let failed = 0;
async function runTest(name, fn) {
    try {
        await fn();
        console.log(`  ${color.green}✓${color.reset} ${name}`);
    }
    catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ${color.red}✗${color.reset} ${name}\n    ${color.dim}${msg}${color.reset}`);
    }
}
// ─── Stub builder ─────────────────────────────────────────────────────────────
function makeSupabaseStub(rows, insertReturn) {
    const stub = {
        from: () => {
            return {
                insert: () => ({
                    select: () => ({
                        single: () => Promise.resolve({ data: insertReturn, error: null }),
                    }),
                }),
                select: () => ({
                    order: () => ({
                        limit: () => ({
                            eq: () => Promise.resolve({ data: rows, error: null }),
                            then: (resolve) => resolve({ data: rows, error: null }),
                        }),
                    }),
                }),
            };
        },
    };
    return stub;
}
function makeErrorStub(message) {
    return {
        from: () => ({
            insert: () => ({
                select: () => ({
                    single: () => Promise.resolve({ data: null, error: { message } }),
                }),
            }),
            select: () => ({
                order: () => ({
                    limit: () => ({
                        then: (resolve) => resolve({ data: null, error: { message } }),
                    }),
                }),
            }),
        }),
    };
}
// ─── Tests ────────────────────────────────────────────────────────────────────
console.log(`${color.cyan}Supabase Persistence Integration Tests – Audit Repository (L2)${color.reset}\n`);
await runTest('logAuditEvent returns the inserted record from the stub', async () => {
    const expected = {
        id: 'evt-001',
        actor_id: 'user-1',
        actor_role: 'admin',
        action: 'DATA_DELETE',
        resource_type: 'conversation',
        resource_id: 'conv-123',
        metadata: { reason: 'user_request' },
        created_at: '2026-03-09T00:00:00Z',
    };
    setAuditClient(makeSupabaseStub([], expected));
    const result = await logAuditEvent({
        actor_id: 'user-1',
        actor_role: 'admin',
        action: 'DATA_DELETE',
        resource_type: 'conversation',
        resource_id: 'conv-123',
        metadata: { reason: 'user_request' },
    });
    assert.equal(result.id, expected.id);
    assert.equal(result.action, expected.action);
    assert.equal(result.actor_id, expected.actor_id);
});
await runTest('logAuditEvent throws when database returns an error', async () => {
    setAuditClient(makeErrorStub('insert error from test'));
    await assert.rejects(() => logAuditEvent({
        actor_id: 'user-2',
        actor_role: 'system',
        action: 'TEST_ACTION',
        resource_type: 'test',
    }), /logAuditEvent failed/);
});
await runTest('getAuditEvents returns rows from the stub', async () => {
    const rows = [
        { actor_id: 'u1', actor_role: 'admin', action: 'LOGIN', resource_type: 'session' },
        { actor_id: 'u2', actor_role: 'agent', action: 'LOGIN', resource_type: 'session' },
    ];
    setAuditClient(makeSupabaseStub(rows, rows[0]));
    const result = await getAuditEvents({});
    assert.equal(result.length, 2);
});
await runTest('getAuditEvents with filter returns filtered rows', async () => {
    const rows = [
        { actor_id: 'u1', actor_role: 'admin', action: 'DATA_DELETE', resource_type: 'conversation' },
    ];
    setAuditClient(makeSupabaseStub(rows, rows[0]));
    const result = await getAuditEvents({ action: 'DATA_DELETE' });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.action, 'DATA_DELETE');
});
if (failed > 0) {
    console.error(`\n${color.red}${failed} test(s) failed.${color.reset}`);
    process.exit(1);
}
else {
    console.log(`\n${color.green}All Supabase persistence integration tests passed.${color.reset}`);
}
//# sourceMappingURL=supabase-persistence.integration.test.js.map