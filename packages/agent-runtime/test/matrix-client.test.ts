import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MatrixClient,
  MatrixClientError,
  matrixChatResourceIdFromRoomId,
  matrixServerNameFromBaseUrl,
  matrixThreadResourceIdFromRoomId,
  matrixUserIdFromWebId,
} from '../src/matrix-client.ts'

test('MatrixClient sends Solid bearer auth and encodes Matrix path segments', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const client = new MatrixClient({
    baseUrl: 'https://node-0000.undefineds.co/',
    accessToken: 'solid-token',
    randomId: () => 'txn/1',
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify({ event_id: '$event:node-0000.undefineds.co' }), { status: 200 })
    },
  })

  const response = await client.sendMessage('!room:id', 'hello')

  assert.equal(response.event_id, '$event:node-0000.undefineds.co')
  assert.equal(calls[0].url, 'https://node-0000.undefineds.co/_matrix/client/v3/rooms/!room%3Aid/send/m.room.message/txn%2F1')
  assert.equal((calls[0].init.headers as Headers).get('Authorization'), 'Bearer solid-token')
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    msgtype: 'm.text',
    body: 'hello',
  })
})

test('MatrixClient supports createRoom and incremental sync', async () => {
  const calls: string[] = []
  const client = new MatrixClient({
    baseUrl: 'https://node-0000.undefineds.co',
    fetch: async (url, init = {}) => {
      calls.push(`${init.method ?? 'GET'} ${String(url)}`)
      if (String(url).endsWith('/createRoom')) {
        return new Response(JSON.stringify({ room_id: '!room:node-0000.undefineds.co' }), { status: 200 })
      }
      return new Response(JSON.stringify({ next_batch: 's2', rooms: { join: {} } }), { status: 200 })
    },
  })

  assert.deepEqual(await client.createRoom({ name: 'Group' }), { room_id: '!room:node-0000.undefineds.co' })
  assert.deepEqual(await client.sync({ since: 's1', limit: 10 }), { next_batch: 's2', rooms: { join: {} } })
  assert.deepEqual(calls, [
    'POST https://node-0000.undefineds.co/_matrix/client/v3/createRoom',
    'GET https://node-0000.undefineds.co/_matrix/client/v3/sync?since=s1&limit=10',
  ])
})

test('MatrixClient supports room membership and state endpoints', async () => {
  const calls: Array<{ method: string; url: string; body?: unknown }> = []
  const client = new MatrixClient({
    baseUrl: 'https://node-0000.undefineds.co/',
    fetch: async (url, init = {}) => {
      calls.push({
        method: init.method ?? 'GET',
        url: String(url),
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (String(url).endsWith('/joined_rooms')) {
        return new Response(JSON.stringify({ joined_rooms: ['!room:node-0000.undefineds.co'] }), { status: 200 })
      }
      if (String(url).includes('/members')) {
        return new Response(JSON.stringify({ chunk: [] }), { status: 200 })
      }
      if (String(url).includes('/join/')) {
        return new Response(JSON.stringify({ room_id: '!room:node-0000.undefineds.co' }), { status: 200 })
      }
      if (String(url).includes('/state/')) {
        return new Response(JSON.stringify({ event_id: '$state:node-0000.undefineds.co' }), { status: 200 })
      }
      return new Response(JSON.stringify({}), { status: 200 })
    },
  })

  assert.deepEqual(await client.joinedRooms(), { joined_rooms: ['!room:node-0000.undefineds.co'] })
  assert.deepEqual(await client.joinRoom('!room:node-0000.undefineds.co'), { room_id: '!room:node-0000.undefineds.co' })
  assert.deepEqual(await client.members('!room:node-0000.undefineds.co'), { chunk: [] })
  assert.deepEqual(await client.setState('!room:node-0000.undefineds.co', 'm.room.topic', '', { topic: 'hello' }), {
    event_id: '$state:node-0000.undefineds.co',
  })
  await client.inviteUser('!room:node-0000.undefineds.co', '@alice:node-0000.undefineds.co')
  await client.leaveRoom('!room:node-0000.undefineds.co')

  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), [
    'GET https://node-0000.undefineds.co/_matrix/client/v3/joined_rooms',
    'POST https://node-0000.undefineds.co/_matrix/client/v3/join/!room%3Anode-0000.undefineds.co',
    'GET https://node-0000.undefineds.co/_matrix/client/v3/rooms/!room%3Anode-0000.undefineds.co/members',
    'PUT https://node-0000.undefineds.co/_matrix/client/v3/rooms/!room%3Anode-0000.undefineds.co/state/m.room.topic',
    'POST https://node-0000.undefineds.co/_matrix/client/v3/rooms/!room%3Anode-0000.undefineds.co/invite',
    'POST https://node-0000.undefineds.co/_matrix/client/v3/rooms/!room%3Anode-0000.undefineds.co/leave',
  ])
  assert.deepEqual(calls[4].body, { user_id: '@alice:node-0000.undefineds.co' })
})

test('Matrix helpers match xpod room and user resource conventions', async () => {
  const roomId = '!room:node-0000.undefineds.co'
  assert.equal(matrixServerNameFromBaseUrl('https://node-0000.undefineds.co/'), 'node-0000.undefineds.co')
  assert.equal(
    matrixUserIdFromWebId('https://id.undefineds.co/alice/profile/card#me', 'node-0000.undefineds.co'),
    '@alice_profile_card_me:node-0000.undefineds.co',
  )
  assert.equal(await matrixChatResourceIdFromRoomId(roomId), 'matrix-dab780ed4920d00b/index.ttl#this')
  assert.equal(await matrixThreadResourceIdFromRoomId(roomId), 'chat/matrix-dab780ed4920d00b/index.ttl#thread')
})

test('MatrixClient surfaces Matrix error bodies', async () => {
  const client = new MatrixClient({
    baseUrl: 'https://node-0000.undefineds.co',
    fetch: async () => new Response(JSON.stringify({ errcode: 'M_NOT_FOUND', error: 'missing room' }), { status: 404 }),
  })

  await assert.rejects(
    () => client.getEvent('!room:id', '$event:id'),
    (error) => {
      assert.equal(error instanceof MatrixClientError, true)
      assert.equal((error as MatrixClientError).status, 404)
      assert.equal((error as MatrixClientError).errcode, 'M_NOT_FOUND')
      assert.equal((error as Error).message, 'missing room')
      return true
    },
  )
})
