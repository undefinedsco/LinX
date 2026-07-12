export interface ContactDetailNotifier {
  success(description: string): void
  info(description: string): void
  error(description: string): void
}
