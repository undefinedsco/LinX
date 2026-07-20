import { describe, expect, it } from 'vitest'

import {
  parseMarkdownishImage,
  parseMarkdownishReference,
  parseMarkdownishTable,
  parseMarkdownishTask,
  serializeMarkdownishImage,
  serializeMarkdownishReference,
  serializeMarkdownishTable,
  serializeMarkdownishTask,
} from './markdownish-blocks'

describe('rich text markdownish block helpers', () => {
  it('serializes and parses task lines', () => {
    expect(serializeMarkdownishTask({ checked: false, text: 'Follow up with design' })).toBe(
      '- [ ] Follow up with design',
    )
    expect(serializeMarkdownishTask({ checked: true, text: 'Ship parser' })).toBe('- [x] Ship parser')

    expect(parseMarkdownishTask('- [ ] Follow up with design')).toEqual({
      checked: false,
      text: 'Follow up with design',
    })
    expect(parseMarkdownishTask('- [X] Ship parser')).toEqual({
      checked: true,
      text: 'Ship parser',
    })
    expect(parseMarkdownishTask('- ordinary bullet')).toBeNull()
  })

  it('serializes and parses markdown tables with padded separator columns', () => {
    const markdown = serializeMarkdownishTable({
      headers: ['Name', 'Status'],
      rows: [
        ['Spec', 'Ready'],
        ['Parser', 'In progress'],
      ],
    })

    expect(markdown).toBe([
      '| Name | Status |',
      '| --- | --- |',
      '| Spec | Ready |',
      '| Parser | In progress |',
    ].join('\n'))
    expect(parseMarkdownishTable(markdown)).toEqual({
      headers: ['Name', 'Status'],
      rows: [
        ['Spec', 'Ready'],
        ['Parser', 'In progress'],
      ],
    })
  })

  it('normalizes sparse table rows to the header width', () => {
    expect(parseMarkdownishTable([
      '| Field | Value | Notes |',
      '| --- | --- | --- |',
      '| title | Roadmap |',
    ].join('\n'))).toEqual({
      headers: ['Field', 'Value', 'Notes'],
      rows: [['title', 'Roadmap', '']],
    })
  })

  it('serializes and parses images with optional titles', () => {
    expect(serializeMarkdownishImage({
      alt: 'Architecture diagram',
      src: 'https://pod.example/diagram.png',
      title: 'System map',
    })).toBe('![Architecture diagram](https://pod.example/diagram.png "System map")')

    expect(parseMarkdownishImage('![Architecture diagram](https://pod.example/diagram.png "System map")')).toEqual({
      alt: 'Architecture diagram',
      src: 'https://pod.example/diagram.png',
      title: 'System map',
    })
    expect(parseMarkdownishImage('[Architecture diagram](https://pod.example/diagram.png)')).toBeNull()
  })

  it('serializes and parses reference chips with optional notes', () => {
    expect(serializeMarkdownishReference({
      label: 'Source report',
      href: 'https://source.example/report',
      note: 'external',
    })).toBe('@[Source report](https://source.example/report "external")')

    expect(parseMarkdownishReference('@[Source report](https://source.example/report "external")')).toEqual({
      label: 'Source report',
      href: 'https://source.example/report',
      note: 'external',
    })
    expect(parseMarkdownishReference('[Source report](https://source.example/report)')).toBeNull()
  })
})
