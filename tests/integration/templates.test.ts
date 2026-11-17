import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { user } from '../../server/db/schema'
import { getUserPreferences, updateUserPreferences } from '../../server/db/user-preferences'
import { DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_ID } from '../../server/domain/template/default-template'
import {
  cloneTemplate,
  createTemplate,
  deleteTemplate,
  findUsableTemplate,
  listTemplates,
  updateTemplate,
} from '../../server/domain/templates'
import { startTestDatabase, type TestDatabase } from './support/database'

let testDb: TestDatabase

beforeAll(async () => {
  testDb = await startTestDatabase()
  await testDb.db.insert(user).values([
    { id: 'alice', name: 'alice', email: 'alice@example.com' },
    { id: 'bob', name: 'bob', email: 'bob@example.com' },
  ])
})

afterAll(async () => {
  await testDb?.stop()
})

const total = { key: 'total', label: 'Total', description: 'Amount payable', type: 'number', required: true }

describe('Templates', () => {
  it('lists the built-in default first, then only the User\'s own Templates', async () => {
    await createTemplate(testDb.db, 'bob', { name: 'Bob only', fields: [total] })
    const mine = await createTemplate(testDb.db, 'alice', { name: 'Receipts', fields: [total] })
    const list = await listTemplates(testDb.db, 'alice')
    expect(list[0]).toMatchObject({ id: DEFAULT_TEMPLATE_ID, builtIn: true })
    expect(list.map((t) => t.name)).toContain('Receipts')
    expect(list.map((t) => t.name)).not.toContain('Bob only')
    expect(mine).toMatchObject({ userId: 'alice', builtIn: false, name: 'Receipts', fields: [total] })
  })

  it('clones the default into an editable Template of the User\'s own', async () => {
    const copy = await cloneTemplate(testDb.db, 'alice', DEFAULT_TEMPLATE_ID)
    expect(copy).toMatchObject({ userId: 'alice', builtIn: false, name: 'Invoice (default) (copy)' })
    expect(copy!.id).not.toBe(DEFAULT_TEMPLATE_ID)
    expect(copy!.fields).toEqual(DEFAULT_TEMPLATE.fields)
  })

  it("cannot clone, read, edit or delete another User's Template", async () => {
    const theirs = await createTemplate(testDb.db, 'bob', { name: 'Private', fields: [total] })
    expect(await cloneTemplate(testDb.db, 'alice', theirs.id)).toBeNull()
    expect(await findUsableTemplate(testDb.db, 'alice', theirs.id)).toBeNull()
    expect(await updateTemplate(testDb.db, 'alice', theirs.id, { name: 'Mine now' })).toBeNull()
    expect(await deleteTemplate(testDb.db, 'alice', theirs.id)).toBe(false)
    expect((await findUsableTemplate(testDb.db, 'bob', theirs.id))!.name).toBe('Private')
  })

  it('renames and replaces Fields of an own Template', async () => {
    const t = await createTemplate(testDb.db, 'alice', { name: 'Draft', fields: [total] })
    const vendor = { key: 'vendor', label: 'Vendor', description: 'Seller name', type: 'text', required: false }
    const updated = await updateTemplate(testDb.db, 'alice', t.id, { name: 'Final', fields: [vendor, total] })
    expect(updated).toMatchObject({ name: 'Final', fields: [vendor, total] })
    expect((await findUsableTemplate(testDb.db, 'alice', t.id))!.fields.map((f) => f.key)).toEqual(['vendor', 'total'])
  })

  it('keeps the built-in default read-only', async () => {
    await expect(updateTemplate(testDb.db, 'alice', DEFAULT_TEMPLATE_ID, { name: 'Hacked' })).rejects.toThrow(/read-only/)
    await expect(deleteTemplate(testDb.db, 'alice', DEFAULT_TEMPLATE_ID)).rejects.toThrow(/read-only/)
    expect((await findUsableTemplate(testDb.db, 'alice', DEFAULT_TEMPLATE_ID))!.name).toBe('Invoice (default)')
  })

  it('refuses Fields nested deeper than two levels, on create and on update', async () => {
    const tooDeep = [
      { ...total, key: 'outer', type: 'list', fields: [{ ...total, key: 'inner', type: 'object', fields: [total] }] },
    ]
    await expect(createTemplate(testDb.db, 'alice', { name: 'Deep', fields: tooDeep })).rejects.toThrow(/nests too deeply/)
    const t = await createTemplate(testDb.db, 'alice', { name: 'Flat', fields: [total] })
    await expect(updateTemplate(testDb.db, 'alice', t.id, { fields: tooDeep })).rejects.toThrow(/nests too deeply/)
    expect((await findUsableTemplate(testDb.db, 'alice', t.id))!.fields).toEqual([total])
  })

  it('requires a name', async () => {
    await expect(createTemplate(testDb.db, 'alice', { name: '   ', fields: [total] })).rejects.toThrow(/name/i)
  })

  it('deletes an own Template, and a default pointing at it falls back to the built-in', async () => {
    const t = await createTemplate(testDb.db, 'alice', { name: 'Temporary', fields: [total] })
    await updateUserPreferences(testDb.db, 'alice', { defaultTemplateId: t.id })
    expect(await deleteTemplate(testDb.db, 'alice', t.id)).toBe(true)
    expect(await findUsableTemplate(testDb.db, 'alice', t.id)).toBeNull()
    expect((await getUserPreferences(testDb.db, 'alice')).defaultTemplateId).toBeNull()
  })
})
