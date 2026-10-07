# Guangzhou QLever RC startup verification

Date: 2026-08-30

## Scope

- Workspace: Guangzhou `undefineds`
- Namespace: `ns-iknkxtc8`
- Singapore resources were not changed.
- Standalone `discovery` remained scaled to zero.

## Final datastore topology

- QLever identity and RDF data use the existing `xpod-rdf-postgres` StatefulSet.
- QLever is isolated in its own `xpod_qlever_rc` database and login role.
- The PostgreSQL StatefulSet uses the existing 20Gi
  `postgres-data-xpod-rdf-postgres-0` PVC.
- QLever queue state uses logical database 1 of the existing managed
  `undefineds-gz-redis` service.
- `xpod-qlever-rc` and `xpod-qlever-rc-inngest` remain separate application
  workloads and both became Ready with zero restarts.

The following duplicate resources were removed after dependency and runtime
verification:

- `deployment/redis` and `service/redis`
- `deployment/xpod-qlever-rc-redis` and `service/xpod-qlever-rc-redis`
- `statefulset/xpod-qlever-rc-postgres` and `service/xpod-qlever-rc-postgres`
- orphaned `service/xpod-qlever-pg-6a5127cb`
- unused `service/xpod-rc-postgres` alias
- the unused migration Job and newly requested 20Gi PVC

## Verification

- PostgreSQL extensions `xpod_rdf` and `xpod_qlever` are installed.
- `xpod_rdf.native_sparql_capabilities()` reports ready with ABI version 1.
- A real native `SELECT * WHERE { ?s ?p ?o } LIMIT 1` query completed through
  `xpod_rdf.native_sparql_query`; the response identified the native QLever tree
  and PostgreSQL extension backend.
- Public routes returned HTTP 200:
  - `https://xpod-qlever-rc-id.sealosgzg.site/service/status`
  - `https://xpod-qlever-rc-api.sealosgzg.site/service/status`
  - `https://xpod-qlever-rc-pods.sealosgzg.site/service/status`
  - `https://xpod-qlever-rc-api.sealosgzg.site/v1/chatkit/health`
- Xpod supervisor reports both `css` and `api` running with zero restarts.
- ChatKit health reports `status: ok`.
- No application fatal/error/exception entries were found after readiness.
- A real persistence test scaled `xpod-rdf-postgres` to zero and back to one.
  The PVC identity was unchanged and the following data survived exactly:
  - `identity_store=10`
  - `rdf_quads=178`
  - `rdf_sources=10`
- Native capability and SPARQL query checks still passed after the database Pod
  was recreated.

## Startup observations

- The first start spent about one minute loading CSS components and creating the
  two configured seed accounts/pods. During this window the startup probe returned
  503. It recovered without intervention and is not a persistent failure.
- Initial steady observation for the Xpod container was about 385m CPU and 682Mi
  memory against limits of 500m CPU and 1Gi memory. This is acceptable for RC
  verification but leaves limited burst headroom.

## Remaining notes

1. Managed `undefineds-gz-postgresql` cannot host the native QLever database
   because its PostgreSQL image does not provide the `xpod_rdf` or `xpod_qlever`
   extensions. The single persistent `xpod-rdf-postgres` instance is therefore
   still required; databases provide isolation without another PostgreSQL Pod.
2. Managed Redis's primary and Sentinel Pods belong to the same managed Redis
   resource. Sentinel is not a duplicate application Redis instance.
3. `xpod-qlever-rc` intentionally uses a different image digest from the active
   `xpod-cloud` and `xpod-rc` deployments. The running image is QLever-compatible
   and passed verification; update it only after validating the enterprise config
   and native extension contract with the newer build.
4. This is a separate QLever RC endpoint. Existing LinX/Xpod Cloud traffic is not
   automatically redirected to it.
