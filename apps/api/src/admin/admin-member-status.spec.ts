import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const serviceUrl = new URL('./admin.service.ts', import.meta.url);
const controllerUrl = new URL('./admin.controller.ts', import.meta.url);

test('the existing suspend route carries both valid membership transitions', async () => {
  const [service, controller] = await Promise.all([readFile(serviceUrl, 'utf8'), readFile(controllerUrl, 'utf8')]);
  assert.match(controller, /@Patch\('members\/:memberId\/suspend'\)/);
  assert.match(controller, /body: \{ status\?: unknown \}/);
  assert.match(service, /nextStatus !== 'ACTIVE' && nextStatus !== 'SUSPENDED'/);
  assert.match(service, /member\.status !== 'ACTIVE'/);
  assert.match(service, /member\.status !== 'SUSPENDED'/);
  assert.doesNotMatch(controller, /members\/:memberId\/reactivate/);
});

test('status changes remain scoped, protected, role-preserving, and audited', async () => {
  const service = await readFile(serviceUrl, 'utf8');
  const method = service.slice(service.indexOf('async suspendMember('), service.indexOf('async removeMember('));
  assert.match(method, /findFirst\(\{ where: \{ id: memberId, communityId \}/);
  assert.match(method, /member\.userId === actorUserId/);
  assert.match(method, /assertCanModifyMembership/);
  assert.match(method, /removesActiveOwner: nextStatus === 'SUSPENDED'/);
  assert.match(method, /action = nextStatus === 'ACTIVE' \? 'member\.reactivated' : 'member\.suspended'/);
  assert.match(method, /data: \{ status: nextStatus \}/);
  assert.doesNotMatch(method, /roleId|permissions/);
});
