import { useEffect } from 'react'
import { LockKeyhole, ShieldCheck, UsersRound, X } from 'lucide-react'
import { InfoRow } from './files-ui'

export type AccessScope = 'File' | 'Folder' | 'Vocab'
type AccessPolicyKind = 'ACL' | 'ACR'

const accessPolicyByScope: Record<AccessScope, {
  inheritedFrom: string
  kind: AccessPolicyKind
  sidecar: string
  summary: string
}> = {
  File: {
    kind: 'ACL',
    sidecar: '.acl',
    inheritedFrom: 'resource sidecar',
    summary: 'Web Access Control sidecar applies to this file resource.',
  },
  Folder: {
    kind: 'ACR',
    sidecar: '.acr',
    inheritedFrom: 'container policy',
    summary: 'Access Control Resource policy is inherited by folder children.',
  },
  Vocab: {
    kind: 'ACR',
    sidecar: '.acr',
    inheritedFrom: '.vocab container',
    summary: 'Published vocab terms are readonly; trusted apps can write proposals.',
  },
}

export function FileAccessPanel({ scope }: { scope: AccessScope }) {
  const policy = accessPolicyByScope[scope]

  return (
    <section className="file-access-panel" data-access-kind={policy.kind} data-access-sidecar={policy.sidecar}>
      <header>
        <span><ShieldCheck size={15} /> Access</span>
        <em>{policy.kind} · {policy.sidecar}</em>
      </header>
      <div className="access-grid">
        <button className={policy.kind === 'ACL' ? 'active' : ''} aria-pressed={policy.kind === 'ACL'}>
          <LockKeyhole size={15} />
          <span>
            <strong>ACL</strong>
            <small>{policy.kind === 'ACL' ? 'active sidecar' : 'not used here'}</small>
          </span>
        </button>
        <button className={policy.kind === 'ACR' ? 'active' : ''} aria-pressed={policy.kind === 'ACR'}>
          <UsersRound size={15} />
          <span>
            <strong>ACR</strong>
            <small>{policy.kind === 'ACR' ? 'active policy' : 'not used here'}</small>
          </span>
        </button>
      </div>
      <p className="access-policy-summary">{policy.summary}</p>
    </section>
  )
}

export function AccessPolicyDialog({ scope, onClose }: { scope: AccessScope; onClose: () => void }) {
  const policy = accessPolicyByScope[scope]

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div
      className="access-modal-layer"
      data-access-kind={policy.kind}
      data-access-sidecar={policy.sidecar}
      role="dialog"
      aria-label={`${scope} ACL and ACR`}
    >
      <div className="access-modal-backdrop" aria-hidden="true" onClick={onClose} />
      <section className="access-modal-panel">
        <header>
          <span>
            <em>{scope} access</em>
            <strong>ACL / ACR</strong>
          </span>
          <button aria-label="Close access policy" onClick={onClose}><X size={16} /></button>
        </header>
        <FileAccessPanel scope={scope} />
        <section className="access-policy-detail">
          <h3>Effective policy</h3>
          <InfoRow label="active model" value={policy.kind} />
          <InfoRow label="sidecar" value={policy.sidecar} />
          <InfoRow label="source" value={policy.inheritedFrom} />
          <InfoRow label="public" value="read terms only" />
          <InfoRow label="authenticated" value="read metadata" />
          <InfoRow label="trusted app" value="write proposals" />
          <InfoRow label="owner" value="write canonical resource" />
          <button className="policy-source-action">
            Open policy source
          </button>
        </section>
      </section>
    </div>
  )
}

export function FileMetaBlock({
  heading,
  kind,
  meta,
  path,
  metaName,
}: {
  heading: string
  kind: string
  meta: Array<[string, string]>
  path: string
  metaName: string
}) {
  return (
    <section className="file-detail-meta">
      <h3>{heading}</h3>
      <div className="file-meta-list">
        <InfoRow label="path" value={path} />
        <InfoRow label="kind" value={kind} />
        {meta.map(([label, value]) => (
          <InfoRow label={label} value={value} key={label} />
        ))}
        <InfoRow label="meta" value={metaName} />
      </div>
    </section>
  )
}
