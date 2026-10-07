import { FileCode2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { AccessPolicyDialog } from './ResourceSidecars'
import { AccessIconButton, FilePageHeader } from './files-ui'

export function ResourceDeniedMain({
  notify,
}: {
  notify?: (title: string, kind?: 'ok' | 'err') => void
}) {
  const [accessOpen, setAccessOpen] = useState(false)

  return (
    <main className="work-pane files-work file-open-work">
      <FilePageHeader title="restricted.ttl" subtitle="RDF resource · /.data/restricted.ttl">
        <AccessIconButton onClick={() => setAccessOpen(true)} />
      </FilePageHeader>
      <section className="denied-state" data-error-kind="permission-denied" aria-label="Restricted resource">
        <span className="denied-icon"><LockKeyhole size={22} /></span>
        <h2>没有访问权限</h2>
        <p>Pod 暴露了这个资源的路径，但当前会话不能读取它的内容或元数据。</p>
        <div className="denied-facts">
          <div><small>路径</small><strong>/.data/restricted.ttl</strong></div>
          <div><small>状态</small><strong>403 Forbidden · 已认证，无读取权限</strong></div>
          <div><small>策略来源</small><strong>own .acl</strong></div>
        </div>
        <div className="denied-actions">
          <button className="primary" onClick={() => notify?.('已提交访问申请 · 等待所有者审批')}>
            <ShieldCheck size={15} /> 申请访问
          </button>
          <button onClick={() => setAccessOpen(true)}><FileCode2 size={15} /> 查看 Access 来源</button>
        </div>
        <p className="denied-note">401（未认证）与 403（无权限）是不同状态：这里按 403 展示，不会清除登录态。</p>
      </section>
      <footer className="table-status">/.data/restricted.ttl · 需要授权 · 未渲染预览</footer>
      {accessOpen ? <AccessPolicyDialog scope="File" onClose={() => setAccessOpen(false)} /> : null}
    </main>
  )
}
