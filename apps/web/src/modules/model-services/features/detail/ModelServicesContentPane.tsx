import { useMountedModelServices } from '../../xpod/ModelServicesProvider'

export function ModelServicesContentPane() {
  const { slots } = useMountedModelServices()
  return <div className="h-full min-h-0 overflow-auto">{slots.main}</div>
}
