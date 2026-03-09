import { describe, it, expect, beforeEach } from 'vitest';
import { deleteUserData, deleteUserDataByPhone, setDataDeletionClient } from './data-deletion.js';
// ---- Mock data store ----
const userStore = {};
const deletionLog = [];
const auditLog = [];
function resetStore() {
    Object.keys(userStore).forEach((k) => delete userStore[k]);
    userStore['user-uuid-1'] = { id: 'user-uuid-1', phone_number: '+628111111111' };
    userStore['user-uuid-2'] = { id: 'user-uuid-2', phone_number: '+628222222222' };
    deletionLog.length = 0;
    auditLog.length = 0;
}
const mockRpc = (fn, params) => {
    if (fn !== 'delete_user_data') {
        return Promise.resolve({ data: null, error: { message: 'unknown function' } });
    }
    const userId = params['target_user_id'];
    if (!(userId in userStore)) {
        return Promise.resolve({ data: null, error: { message: `User ${userId} not found` } });
    }
    deletionLog.push(userId);
    auditLog.push({ action: 'user.data_deleted', actor: params['actor'], userId });
    const counts = {
        success: true,
        deleted_users: 1,
        deleted_conversations: 2,
        deleted_messages: 10,
        deleted_agent_events: 3,
        deleted_tool_calls: 4,
        deleted_tickets: 1,
    };
    delete userStore[userId];
    return Promise.resolve({ data: counts, error: null });
};
const mockFrom = (table) => {
    if (table === 'users') {
        return {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            select: (_sel) => ({
                eq: (_field, phone) => ({
                    single: () => {
                        const found = Object.values(userStore).find((u) => u.phone_number === phone);
                        return Promise.resolve(found
                            ? { data: found, error: null }
                            : { data: null, error: { message: 'not found' } });
                    },
                }),
            }),
        };
    }
    return {};
};
// Cast via unknown to bypass strict SupabaseClient interface check in tests
const mockClient = {
    rpc: (fn, params) => mockRpc(fn, params),
    from: (t) => mockFrom(t),
};
beforeEach(() => {
    resetStore();
    setDataDeletionClient(mockClient);
});
describe('deleteUserData', () => {
    it('successfully deletes a user by UUID and returns counts', async () => {
        const result = await deleteUserData('user-uuid-1', 'admin-op', 'admin');
        expect(result.success).toBe(true);
        expect(result.deleted_users).toBe(1);
        expect(result.deleted_messages).toBe(10);
        expect(deletionLog).toContain('user-uuid-1');
    });
    it('throws if user UUID does not exist', async () => {
        await expect(deleteUserData('nonexistent-uuid', 'admin-op', 'admin')).rejects.toThrow();
    });
    it('records an audit log entry', async () => {
        await deleteUserData('user-uuid-1', 'admin-op', 'admin');
        expect(auditLog.length).toBeGreaterThan(0);
        expect(auditLog[0]['action']).toBe('user.data_deleted');
        expect(auditLog[0]['actor']).toBe('admin-op');
    });
});
describe('deleteUserDataByPhone', () => {
    it('resolves user from phone number and deletes', async () => {
        const result = await deleteUserDataByPhone('+628111111111', 'admin-op', 'admin');
        expect(result.success).toBe(true);
        expect(deletionLog).toContain('user-uuid-1');
    });
    it('throws if phone number is not found', async () => {
        await expect(deleteUserDataByPhone('+60000000000', 'admin-op', 'admin')).rejects.toThrow(/not found/);
    });
});
//# sourceMappingURL=data-deletion.test.js.map