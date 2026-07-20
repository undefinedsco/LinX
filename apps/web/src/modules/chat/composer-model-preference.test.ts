import { describe, expect, it } from 'vitest'
import {
  readThreadComposerModel,
  THREAD_COMPOSER_MODEL_METADATA_KEY,
  withThreadComposerModel,
} from './composer-model-preference'

describe('Thread composer model preference', () => {
  it('reads a persisted provider-qualified model', () => {
    expect(readThreadComposerModel({
      [THREAD_COMPOSER_MODEL_METADATA_KEY]: 'timecc::gpt-5.5',
    })).toBe('timecc::gpt-5.5')
  })

  it('preserves unrelated Thread metadata while updating the model', () => {
    expect(withThreadComposerModel({ chat_id: 'chat-1', roomId: '!room' }, ' timecc::gpt-5.5 ')).toEqual({
      chat_id: 'chat-1',
      roomId: '!room',
      [THREAD_COMPOSER_MODEL_METADATA_KEY]: 'timecc::gpt-5.5',
    })
  })

  it('does not write an empty model selection', () => {
    const metadata = { chat_id: 'chat-1' }
    expect(withThreadComposerModel(metadata, '  ')).toBe(metadata)
  })
})
