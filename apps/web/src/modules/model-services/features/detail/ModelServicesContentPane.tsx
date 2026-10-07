import { useMountedModelServices } from '../../xpod/ModelServicesProvider'

export function ModelServicesContentPane() {
  const { slots } = useMountedModelServices()
  return <div className="h-full min-h-0 min-w-0 w-full max-w-full overflow-auto">{slots.main}</div>
}
