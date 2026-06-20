export function resolveRuntimeProviderLabel(interactive: any): string {
  const bridge = interactive?.runtimeHost?.linxAuthBridge ?? interactive?.linxAuthBridge
  if (bridge?.providerLabel) {
    return bridge.providerLabel
  }
  return 'LinX Cloud'
}
