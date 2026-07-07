import { FileCode2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { AccessPolicyDialog } from './ResourceSidecars'
import { AccessIconButton, FilePageHeader } from './files-ui'

export function ResourceDeniedMain() {
  const [accessOpen, setAccessOpen] = useState(false)

  return (
    <main className="work-pane files-work file-open-work">
      <FilePageHeader title="restricted.ttl" subtitle="RDF resource · /.data/restricted.ttl">
        <AccessIconButton onClick={() => setAccessOpen(true)} />
      </FilePageHeader>
      <section className="resource-error" data-error-kind="permission-denied" aria-label="Restricted resource">
        <span className="resource-error-icon"><LockKeyhole size={22} /></span>
        <em>Permission denied</em>
        <h2>No access to this resource</h2>
        <p>The Pod exposes the resource path, but the current session cannot read its body or metadata.</p>
        <div className="resource-error-actions">
          <button onClick={() => setAccessOpen(true)}><ShieldCheck size={15} /> Request access</button>
          <button><FileCode2 size={15} /> View policy source</button>
        </div>
      </section>
      <footer className="table-status">/.data/restricted.ttl · access required · no preview rendered</footer>
      {accessOpen ? <AccessPolicyDialog scope="File" onClose={() => setAccessOpen(false)} /> : null}
    </main>
  )
}
